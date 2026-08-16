/**
 * dsh-canvas-preview — Host half (Node.js)
 *
 * Scans the active session's working directory for self-contained HTML files
 * and serves them to the Client half, plus headless-Chrome PNG/JPG export.
 *
 * Services used:
 *   ctx.get('fs')             — filesystem provider (hard dependency)
 *   ctx.get('sessionQuery')   — to resolve the latest session cwd (scan root)
 *   ctx.get('sessions')       — live session, to resolve the REAL per-session
 *                               sandbox policy for export execution
 *   ctx.get('sandboxPolicy')  — policy resolution + fallback scan root
 *   ctx.get('shell')          — preferred export executor (with session policy)
 *   ctx.get('subprocess')     — fallback export executor
 *
 * Export pipeline notes (hard-won lessons, keep them):
 *   1. Chrome headless NEVER EXITS when the page loads remote fonts
 *      (fonts.googleapis.com is blocked in some networks) — the screenshot
 *      file is still written. So: launch Chrome in the background, poll for
 *      the screenshot file with 0.2s granularity, and kill the process the
 *      moment the file size is stable twice in a row. Never `wait` on Chrome.
 *   2. Direct `shell` calls fall back to the DEPLOYMENT sandbox policy
 *      (workspace-write), which kills Chrome. Always resolve the calling
 *      session's real policy (`danger-full-access` etc.) and pass it
 *      explicitly via `sandboxPolicy` on the exec request.
 *   3. Every await has a hard deadline (Promise + timer race); subprocess
 *      handles are terminated on timeout. Nothing may hang forever.
 *
 * RPC seam: in the dynamic Cordis runtime the handlers are exposed via
 * `harness.handle(...)` and called with `host.call(...)`. When wiring this
 * file as a static installed package, register the same three handlers on the
 * package's own remote surface and keep the Client half's `rpc()` shim in
 * lib/client.js pointed at it.
 */

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor',
  '__pycache__', '.venv', 'venv', '.next', 'coverage',
])

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
]

/** Resolve the scan root: latest session cwd, else sandbox workspace root. */
async function resolveRoot(ctx) {
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery !== undefined) {
    try {
      const records = await sessionQuery.listSessions()
      const withCwd = []
      if (Array.isArray(records)) {
        for (const r of records) {
          if (r !== null && typeof r === 'object' && r.header !== null && typeof r.header === 'object'
            && typeof r.header.cwd === 'string' && r.header.cwd !== '') {
            withCwd.push({
              cwd: r.header.cwd,
              createdAt: typeof r.header.createdAt === 'number' ? r.header.createdAt : 0,
            })
          }
        }
      }
      if (withCwd.length > 0) {
        withCwd.sort((a, b) => b.createdAt - a.createdAt)
        return withCwd[0].cwd
      }
    } catch (e) {
      console.error('canvas: sessionQuery.listSessions failed', e)
    }
  }
  const sp = ctx.get('sandboxPolicy')
  if (sp !== undefined && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot !== '') {
    return sp.workspaceRoot
  }
  return '.'
}

/** Depth-bounded walk collecting *.html entries with change signatures. */
async function walk(fs, target, depth, relDir, out) {
  if (depth > 4 || out.length >= 200) return
  let entries
  try { entries = await fs.listDir(target) } catch (e) { return }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const rel = relDir === '' ? entry.name : relDir + '/' + entry.name
    if (entry.type === 'directory') {
      await walk(fs, entry.target, depth + 1, rel, out)
    } else if (entry.type === 'file' && /\.html?$/i.test(entry.name)) {
      const size = typeof entry.size === 'number' ? entry.size : null
      const ver = entry.version === undefined || entry.version === null ? '' : String(entry.version)
      out.push({ path: rel, name: entry.name, size, sig: String(size) + ':' + ver })
    }
  }
}

/** The newest live session, for resolving its real folded sandbox policy. */
function liveSession(ctx) {
  try {
    const sessions = ctx.get('sessions')
    if (sessions === undefined || sessions === null || typeof sessions.list !== 'function') return undefined
    const arr = sessions.list()
    if (!Array.isArray(arr) || arr.length === 0) return undefined
    let best = undefined
    let bestAt = -1
    for (const s of arr) {
      if (s === null || s === undefined) continue
      const h = s.header !== undefined && s.header !== null ? s.header : undefined
      const at = h !== undefined && typeof h.createdAt === 'number' ? h.createdAt : 0
      if (at >= bestAt) { bestAt = at; best = s }
    }
    return best
  } catch (e) {
    return undefined
  }
}

const shQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"

function readCollected(handle, name) {
  try {
    const reader = handle !== null && handle !== undefined && handle.collected !== undefined && handle.collected !== null
      ? handle.collected[name]
      : undefined
    if (reader === undefined || reader === null || typeof reader.readFrom !== 'function') return ''
    const r = reader.readFrom(0)
    if (r !== null && r !== undefined && typeof r.text === 'string') return r.text
    return ''
  } catch (e) { return '' }
}

/**
 * The export script: background Chrome + poll-and-kill (see file header).
 * Build it with all paths quoted; outAbs lives inside the workspace.
 */
function exportScript(srcAbs, outAbs, format, w, h) {
  return [
    'set -eu',
    'CHROME=""',
    "for c in '" + CHROME_CANDIDATES.join("' '") + "'; do",
    '  if [ -x "$c" ]; then CHROME="$c"; break; fi',
    'done',
    'if [ -z "$CHROME" ]; then echo NO_CHROME; exit 3; fi',
    'TMP="$(mktemp -d)"',
    'CPID=""',
    'cleanup() { if [ -n "$CPID" ]; then kill -9 "$CPID" 2>/dev/null || true; fi; rm -rf "$TMP" 2>/dev/null || true; }',
    'trap cleanup EXIT',
    '"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-networking --disable-sync --disable-component-update --user-data-dir="$TMP/profile" --hide-scrollbars --force-device-scale-factor=2 --window-size=' + w + ',' + h + ' --virtual-time-budget=2500 --screenshot="$TMP/shot.png" ' + shQuote('file://' + srcAbs) + ' >"$TMP/chrome.log" 2>&1 &',
    'CPID=$!',
    'OK=0; PREV=-1; STABLE=0; i=0',
    'while [ $i -lt 75 ]; do',
    '  if [ -f "$TMP/shot.png" ]; then',
    '    SZ=$(wc -c <"$TMP/shot.png" | tr -d " ")',
    '    if [ "$SZ" = "$PREV" ] && [ "$SZ" -gt 0 ]; then STABLE=$((STABLE+1)); else STABLE=0; fi',
    '    PREV=$SZ',
    '    if [ $STABLE -ge 2 ]; then OK=1; break; fi',
    '  fi',
    '  if ! kill -0 "$CPID" 2>/dev/null; then break; fi',
    '  sleep 0.2',
    '  i=$((i+1))',
    'done',
    'if [ -n "$CPID" ]; then kill -9 "$CPID" 2>/dev/null || true; wait "$CPID" 2>/dev/null || true; CPID=""; fi',
    'if [ "$OK" != "1" ]; then echo SHOT_FAIL; tail -4 "$TMP/chrome.log" 2>/dev/null; exit 4; fi',
    format === 'jpg'
      ? 'sips -s format jpeg -s formatOptions 85 "$TMP/shot.png" --out ' + shQuote(outAbs) + ' >/dev/null 2>&1 || { echo SIPS_FAIL; exit 5; }'
      : 'cp "$TMP/shot.png" ' + shQuote(outAbs) + ' || { echo WRITE_FAIL; exit 6; }',
    'echo DONE',
  ].join('\n')
}

/** Handlers as plain functions so any RPC seam can mount them. */
async function handleList(ctx, fs) {
  try {
    const rootPath = await resolveRoot(ctx)
    const root = await fs.resolve(rootPath)
    const out = []
    await walk(fs, root, 0, '', out)
    out.sort((a, b) => a.path.localeCompare(b.path))
    return { root: root.displayPath, files: out }
  } catch (e) {
    console.error('canvas/list failed', e)
    return { root: '', files: [], error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
  }
}

async function handleRead(fs, lastRoot, args) {
  const path = args !== null && typeof args === 'object' && typeof args.path === 'string' ? args.path : ''
  if (path === '') return { error: 'path required' }
  try {
    const target = lastRoot !== ''
      ? await fs.resolve(path, { cwd: lastRoot })
      : await fs.resolve(path)
    const content = await fs.readText(target)
    return { content }
  } catch (e) {
    console.error('canvas/read failed', e)
    return { error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
  }
}

function withDeadline(ctx, p, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false
    const d = ctx.timeout(() => {
      if (!settled) { settled = true; reject(new Error(label + ' timeout(' + ms + 'ms)')) }
    }, ms)
    p.then(
      (v) => { if (!settled) { settled = true; d(); resolve(v) } },
      (e) => { if (!settled) { settled = true; d(); reject(e) } },
    )
  })
}

/** Path A: shell service with the calling session's REAL sandbox policy. */
async function runViaShellSession(ctx, shell, script, cwd) {
  try {
    if (shell === undefined || shell === null) return { ok: false, error: 'shell unavailable' }
    const sandboxPolicySvc = ctx.get('sandboxPolicy')
    let policy = undefined
    if (sandboxPolicySvc !== undefined && sandboxPolicySvc !== null && typeof sandboxPolicySvc.resolve === 'function') {
      const sess = liveSession(ctx)
      policy = sess !== undefined
        ? sandboxPolicySvc.resolve({ session: sess })
        : sandboxPolicySvc.resolve({})
    }
    const req = { command: script, workdir: cwd !== '' ? cwd : undefined, timeoutMs: 30000, stdoutMaxBytes: 65536 }
    if (policy !== undefined) req.sandboxPolicy = policy
    const spec = await shell.resolve(req)
    const r = await withDeadline(ctx, shell.run(spec), 40000, 'shell.run')
    const outText = r !== null && r !== undefined && r.stdout !== null && r.stdout !== undefined && typeof r.stdout.text === 'string' ? r.stdout.text : ''
    if (r.exitCode === 0 && outText.indexOf('DONE') !== -1) return { ok: true }
    return { ok: false, error: 'exit=' + String(r.exitCode) + ' ' + outText.slice(0, 250) }
  } catch (e) {
    return { ok: false, error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
  }
}

/** Path B: direct subprocess spawn, terminated on timeout. */
async function runViaSubprocess(ctx, subprocess, script, cwd) {
  let handle = null
  try {
    if (subprocess === undefined || subprocess === null || typeof subprocess.spawn !== 'function') {
      return { ok: false, error: 'subprocess unavailable' }
    }
    handle = subprocess.spawn({
      argv: ['/bin/bash', '-c', script],
      cwd,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } },
      graceMs: 5000,
    })
    if (handle === undefined || handle === null) return { ok: false, error: 'spawn returned nothing' }
    let outcome
    try {
      outcome = await withDeadline(ctx, handle.done, 40000, 'subprocess.done')
    } catch (e) {
      try { handle.terminate() } catch (e2) { }
      throw e
    }
    const outText = readCollected(handle, 'stdout')
    const errText = readCollected(handle, 'stderr')
    const code = outcome !== null && outcome !== undefined ? outcome.exitCode : null
    if (code === 0 && outText.indexOf('DONE') !== -1) return { ok: true }
    const detail = errText !== '' ? errText : outText
    return { ok: false, error: 'exit=' + String(code) + ' ' + detail.slice(0, 250) }
  } catch (e) {
    return { ok: false, error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
  }
}

async function handleExport(ctx, fs, shell, subprocess, lastRoot, args) {
  const a = args !== null && typeof args === 'object' ? args : {}
  const path = typeof a.path === 'string' ? a.path : ''
  const format = a.format === 'jpg' ? 'jpg' : 'png'
  const dirArg = typeof a.dir === 'string' && a.dir !== '' ? a.dir : ''
  let w = typeof a.w === 'number' && isFinite(a.w) ? Math.round(a.w) : 1600
  let h = typeof a.h === 'number' && isFinite(a.h) ? Math.round(a.h) : 1200
  w = Math.min(4000, Math.max(400, w))
  h = Math.min(4000, Math.max(400, h))
  if (path === '') return { error: 'path required' }
  const t0 = Date.now()
  try {
    const target = lastRoot !== ''
      ? await fs.resolve(path, { cwd: lastRoot })
      : await fs.resolve(path)
    const srcAbs = target.displayPath
    const baseName = srcAbs.split('/').pop().replace(/\.html?$/i, '')
    let outAbs
    if (dirArg !== '') {
      const dirTarget = await fs.resolve(dirArg)
      const dirAbs = dirTarget.displayPath.replace(/\/$/, '')
      outAbs = dirAbs + '/' + baseName + '-canvas.' + format
    } else {
      outAbs = srcAbs.replace(/\.html?$/i, '') + '-canvas.' + format
    }
    const outName = outAbs.split('/').pop() || ('export.' + format)
    const script = exportScript(srcAbs, outAbs, format, w, h)
    const cwd = lastRoot !== '' ? lastRoot : '/tmp'

    const r1 = await runViaShellSession(ctx, shell, script, cwd)
    if (r1.ok) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      console.log('canvas/export ok via A in ' + secs + 's: ' + outName)
      return { ok: true, out: outName, outPath: outAbs, ms: secs }
    }

    const r2 = await runViaSubprocess(ctx, subprocess, script, cwd)
    if (r2.ok) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      console.log('canvas/export ok via B in ' + secs + 's: ' + outName)
      return { ok: true, out: outName, outPath: outAbs, ms: secs }
    }

    return { error: 'A[' + r1.error.slice(0, 140) + '] B[' + r2.error.slice(0, 140) + ']' }
  } catch (e) {
    console.error('canvas/export failed', e)
    return { error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
  }
}

export const name = 'dsh-canvas-preview'

export function apply(ctx) {
  const fs = ctx.get('fs')
  if (fs === undefined) {
    console.error('canvas: fs service unavailable')
    return
  }
  const shell = ctx.get('shell')
  const subprocess = ctx.get('subprocess')
  let lastRoot = ''

  // ── RPC seam (dynamic runtime: harness.handle; static: package remote) ──
  const disposers = []
  if (typeof harness !== 'undefined' && harness !== null && typeof harness.handle === 'function') {
    disposers.push(harness.handle('canvas/list', async () => {
      const r = await handleList(ctx, fs)
      if (typeof r.root === 'string' && r.root !== '') lastRoot = r.root
      return r
    }))
    disposers.push(harness.handle('canvas/read', (args) => handleRead(fs, lastRoot, args)))
    disposers.push(harness.handle('canvas/export', (args) => handleExport(ctx, fs, shell, subprocess, lastRoot, args)))
    disposers.push(harness.handle('canvas/reveal', async (args) => {
      const p = args !== null && typeof args === 'object' && typeof args.path === 'string' ? args.path : ''
      if (p === '') return { error: 'path required' }
      try {
        const target = lastRoot !== ''
          ? await fs.resolve(p, { cwd: lastRoot })
          : await fs.resolve(p)
        const abs = target.displayPath
        const script = [
          'set -eu',
          'if [ "$(uname)" = "Darwin" ]; then open -R ' + shQuote(abs) + '; else xdg-open ' + shQuote(abs) + ' >/dev/null 2>&1 || true; fi',
          'echo DONE',
        ].join('\n')
        const cwd = lastRoot !== '' ? lastRoot : '/tmp'
        const r1 = await runViaShellSession(ctx, shell, script, cwd)
        if (r1.ok) return { ok: true }
        const r2 = await runViaSubprocess(ctx, subprocess, script, cwd)
        if (r2.ok) return { ok: true }
        return { error: r1.error }
      } catch (e) {
        console.error('canvas/reveal failed', e)
        return { error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
      }
    }))
  }
  // ─────────────────────────────────────────────────────────────────────────

  ctx.effect(() => () => {
    for (const d of disposers) d()
  })
}
