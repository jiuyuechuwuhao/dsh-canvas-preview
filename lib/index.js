/**
 * dsh-canvas-preview — Host half (Node.js, static package)
 *
 * Static-package wiring for the DeepSeek Harness: registers a `/api`
 * interceptor that serves the plugin's four RPC endpoints, backed by the
 * same fs/shell/subprocess capabilities the dynamic version uses.
 *
 * Endpoints (all under the `canvas/` prefix):
 *   canvas/list    → { root, files[] }         workspace HTML scan
 *   canvas/read    → { content }               read one HTML file
 *   canvas/export  → { ok, out, outPath, ms }  PNG/JPG (Chrome) · SVG (direct)
 *   canvas/reveal  → { ok }                    open -R in Finder
 *
 * Hard-won pipeline rules kept from the dynamic version (see dynamic/README):
 *   1. Chrome headless never exits when remote fonts hang — launch in the
 *      background, poll for the screenshot file, kill once its size is stable.
 *   2. Direct shell calls fall back to the deployment sandbox policy which
 *      kills Chrome — always resolve the calling session's real policy and
 *      pass it on the exec request.
 *   3. Every await has a hard deadline; subprocess handles are terminated.
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

const RPC_OK = (value) => ({ ok: true, value })
const RPC_ERR = (message) => ({
  ok: false,
  error: { code: 'internal', details: { message: String(message) } },
})

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
            withCwd.push({ cwd: r.header.cwd, createdAt: typeof r.header.createdAt === 'number' ? r.header.createdAt : 0 })
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
  if (sp !== undefined && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot !== '') return sp.workspaceRoot
  return '.'
}

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
      ? handle.collected[name] : undefined
    if (reader === undefined || reader === null || typeof reader.readFrom !== 'function') return ''
    const r = reader.readFrom(0)
    if (r !== null && r !== undefined && typeof r.text === 'string') return r.text
    return ''
  } catch (e) { return '' }
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

async function exportSvg(fs, srcAbs, outAbs) {
  try {
    const srcTarget = await fs.resolve(srcAbs)
    const html = await fs.readText(srcTarget)
    const start = html.search(/<svg[\s>]/i)
    if (start === -1) return { ok: false, error: 'HTML 中未找到 <svg> 元素' }
    const end = html.toLowerCase().lastIndexOf('</svg>')
    if (end === -1 || end <= start) return { ok: false, error: 'SVG 块不完整' }
    let svg = html.slice(start, end + 6)
    if (svg.indexOf('xmlns=') === -1) {
      svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
    }
    if (svg.indexOf('<?xml') !== 0) {
      svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg
    }
    const outTarget = await fs.resolve(outAbs)
    await fs.writeText(outTarget, svg)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
  }
}

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

function createHost(ctx) {
  const fs = ctx.get('fs')
  const shell = ctx.get('shell')
  const subprocess = ctx.get('subprocess')
  let lastRoot = ''

  const handlers = {
    'canvas/list': async () => {
      const rootPath = await resolveRoot(ctx)
      const root = await fs.resolve(rootPath)
      lastRoot = root.displayPath
      const out = []
      await walk(fs, root, 0, '', out)
      out.sort((a, b) => a.path.localeCompare(b.path))
      return { root: root.displayPath, files: out }
    },
    'canvas/read': async (payload) => {
      const path = payload !== null && typeof payload === 'object' && typeof payload.path === 'string' ? payload.path : ''
      if (path === '') throw new Error('path required')
      const target = lastRoot !== '' ? await fs.resolve(path, { cwd: lastRoot }) : await fs.resolve(path)
      return { content: await fs.readText(target) }
    },
    'canvas/export': async (payload) => {
      const a = payload !== null && typeof payload === 'object' ? payload : {}
      const path = typeof a.path === 'string' ? a.path : ''
      const format = a.format === 'jpg' ? 'jpg' : (a.format === 'svg' ? 'svg' : 'png')
      const dirArg = typeof a.dir === 'string' && a.dir !== '' ? a.dir : ''
      let w = typeof a.w === 'number' && isFinite(a.w) ? Math.round(a.w) : 1600
      let h = typeof a.h === 'number' && isFinite(a.h) ? Math.round(a.h) : 1200
      w = Math.min(4000, Math.max(400, w))
      h = Math.min(4000, Math.max(400, h))
      if (path === '') throw new Error('path required')
      const t0 = Date.now()
      const target = lastRoot !== '' ? await fs.resolve(path, { cwd: lastRoot }) : await fs.resolve(path)
      const srcAbs = target.displayPath
      const baseName = srcAbs.split('/').pop().replace(/\.html?$/i, '')
      let outAbs
      if (dirArg !== '') {
        const dirTarget = await fs.resolve(dirArg)
        outAbs = dirTarget.displayPath.replace(/\/$/, '') + '/' + baseName + '-canvas.' + format
      } else {
        outAbs = srcAbs.replace(/\.html?$/i, '') + '-canvas.' + format
      }
      const outName = outAbs.split('/').pop() || ('export.' + format)

      if (format === 'svg') {
        const rs = await exportSvg(fs, srcAbs, outAbs)
        if (!rs.ok) throw new Error('SVG: ' + rs.error)
        return { ok: true, out: outName, outPath: outAbs, ms: ((Date.now() - t0) / 1000).toFixed(1) }
      }

      const script = exportScript(srcAbs, outAbs, format, w, h)
      const cwd = lastRoot !== '' ? lastRoot : '/tmp'
      const r1 = await runViaShellSession(ctx, shell, script, cwd)
      const r = r1.ok ? r1 : await runViaSubprocess(ctx, subprocess, script, cwd)
      if (!r.ok) throw new Error(r.error.slice(0, 300))
      return { ok: true, out: outName, outPath: outAbs, ms: ((Date.now() - t0) / 1000).toFixed(1) }
    },
    'canvas/reveal': async (payload) => {
      const p = payload !== null && typeof payload === 'object' && typeof payload.path === 'string' ? payload.path : ''
      if (p === '') throw new Error('path required')
      const target = lastRoot !== '' ? await fs.resolve(p, { cwd: lastRoot }) : await fs.resolve(p)
      const abs = target.displayPath
      const script = [
        'set -eu',
        'if [ "$(uname)" = "Darwin" ]; then open -R ' + shQuote(abs) + '; else xdg-open ' + shQuote(abs) + ' >/dev/null 2>&1 || true; fi',
        'echo DONE',
      ].join('\n')
      const cwd = lastRoot !== '' ? lastRoot : '/tmp'
      const r1 = await runViaShellSession(ctx, shell, script, cwd)
      const r = r1.ok ? r1 : await runViaSubprocess(ctx, subprocess, script, cwd)
      if (!r.ok) throw new Error(r.error.slice(0, 300))
      return { ok: true }
    },
  }

  return {
    matches: (endpoint) => typeof endpoint === 'string' && endpoint.indexOf('canvas/') === 0,
    handle: async (endpoint, payload) => {
      const fn = handlers[endpoint]
      if (fn === undefined) throw new Error('unknown endpoint: ' + endpoint)
      return await fn(payload)
    },
  }
}

export const name = 'dsh-canvas-preview'

export const inject = ['connection', 'fs', 'shell', 'subprocess', 'sessionQuery', 'sessions', 'sandboxPolicy', 'timer']

export function apply(ctx) {
  const connection = ctx.connection
  if (connection === undefined || connection === null || connection.rpc === undefined) {
    console.error('dsh-canvas-preview: connection rpc unavailable')
    return
  }
  const host = createHost(ctx)
  let disposed = false
  let disposer = null
  connection.rpc.intercept(
    '/api',
    host.matches,
    async (endpoint, payload) => {
      try {
        const value = await host.handle(endpoint, payload)
        return RPC_OK(value)
      } catch (e) {
        console.error('dsh-canvas-preview rpc', endpoint, e)
        return RPC_ERR(e !== null && e !== undefined && e.message !== undefined ? e.message : e)
      }
    },
    { authority: 'trusted-host' },
  ).then((d) => {
    if (disposed) { d().catch(() => {}) } else { disposer = d }
  }).catch((e) => console.error('dsh-canvas-preview: rpc intercept failed', e))
  return () => {
    disposed = true
    if (disposer !== null) disposer().catch(() => {})
  }
}
