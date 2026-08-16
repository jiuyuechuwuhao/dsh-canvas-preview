return {
  inject: ['timer'],
  apply(ctx) {
    const fs = ctx.get('fs')
    if (fs === undefined) {
      console.error('canvas: fs service unavailable')
      return
    }
    const shell = ctx.get('shell')
    const subprocess = ctx.get('subprocess')
    const sessionsSvc = ctx.get('sessions')
    const sandboxPolicySvc = ctx.get('sandboxPolicy')
    const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'vendor', '__pycache__', '.venv', 'venv', '.next', 'coverage'])
    let lastRoot = ''

    const resolveRoot = async () => {
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

    const walk = async (target, depth, relDir, out) => {
      if (depth > 4 || out.length >= 200) return
      let entries
      try { entries = await fs.listDir(target) } catch (e) { return }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
        const rel = relDir === '' ? entry.name : relDir + '/' + entry.name
        if (entry.type === 'directory') {
          await walk(entry.target, depth + 1, rel, out)
        } else if (entry.type === 'file' && /\.html?$/i.test(entry.name)) {
          const size = typeof entry.size === 'number' ? entry.size : null
          const ver = entry.version === undefined || entry.version === null ? '' : String(entry.version)
          out.push({ path: rel, name: entry.name, size: size, sig: String(size) + ':' + ver })
        }
      }
    }

    const d1 = harness.handle('canvas/list', async () => {
      try {
        const rootPath = await resolveRoot()
        const root = await fs.resolve(rootPath)
        lastRoot = root.displayPath
        const out = []
        await walk(root, 0, '', out)
        out.sort((a, b) => a.path.localeCompare(b.path))
        return { root: root.displayPath, files: out }
      } catch (e) {
        console.error('canvas/list failed', e)
        return { root: '', files: [], error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
      }
    })

    const d2 = harness.handle('canvas/read', async (args) => {
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
    })

    const shQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"

    const readCollected = (handle, name) => {
      try {
        const reader = handle !== null && handle !== undefined && handle.collected !== undefined && handle.collected !== null
          ? handle.collected[name] : undefined
        if (reader === undefined || reader === null || typeof reader.readFrom !== 'function') return ''
        const r = reader.readFrom(0)
        if (r !== null && r !== undefined && typeof r.text === 'string') return r.text
        return ''
      } catch (e) { return '' }
    }

    const withDeadline = (p, ms, label) => {
      return new Promise((resolve, reject) => {
        let settled = false
        const d = ctx.timeout(() => {
          if (!settled) { settled = true; reject(new Error(label + ' timeout(' + ms + 'ms)')) }
        }, ms)
        p.then(
          (v) => { if (!settled) { settled = true; d(); resolve(v) } },
          (e) => { if (!settled) { settled = true; d(); reject(e) } }
        )
      })
    }

    const liveSession = () => {
      try {
        if (sessionsSvc === undefined || sessionsSvc === null || typeof sessionsSvc.list !== 'function') return undefined
        const arr = sessionsSvc.list()
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
      } catch (e) { return undefined }
    }

    const runViaShellSession = async (script, cwd) => {
      try {
        if (shell === undefined || shell === null) return { ok: false, error: 'shell unavailable' }
        let policy = undefined
        if (sandboxPolicySvc !== undefined && sandboxPolicySvc !== null && typeof sandboxPolicySvc.resolve === 'function') {
          const sess = liveSession()
          policy = sess !== undefined
            ? sandboxPolicySvc.resolve({ session: sess })
            : sandboxPolicySvc.resolve({})
        }
        const req = { command: script, workdir: cwd !== '' ? cwd : undefined, timeoutMs: 30000, stdoutMaxBytes: 65536 }
        if (policy !== undefined) req.sandboxPolicy = policy
        const spec = await shell.resolve(req)
        const r = await withDeadline(shell.run(spec), 40000, 'shell.run')
        const outText = r !== null && r !== undefined && r.stdout !== null && r.stdout !== undefined && typeof r.stdout.text === 'string' ? r.stdout.text : ''
        if (r.exitCode === 0 && outText.indexOf('DONE') !== -1) return { ok: true }
        return { ok: false, error: 'exit=' + String(r.exitCode) + ' ' + outText.slice(0, 250) }
      } catch (e) {
        return { ok: false, error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
      }
    }

    const runViaSubprocess = async (script, cwd) => {
      let handle = null
      try {
        if (subprocess === undefined || subprocess === null || typeof subprocess.spawn !== 'function') {
          return { ok: false, error: 'subprocess unavailable' }
        }
        handle = subprocess.spawn({
          argv: ['/bin/bash', '-c', script],
          cwd: cwd,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } },
          graceMs: 5000,
        })
        if (handle === undefined || handle === null) return { ok: false, error: 'spawn returned nothing' }
        let outcome
        try {
          outcome = await withDeadline(handle.done, 40000, 'subprocess.done')
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

    // SVG 导出：读 HTML 源，提取首个 <svg>…</svg> 块（含 xmlns 补全），直接写文件
    const exportSvg = async (srcAbs, outAbs) => {
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

    const d3 = harness.handle('canvas/export', async (args) => {
      const a = args !== null && typeof args === 'object' ? args : {}
      const path = typeof a.path === 'string' ? a.path : ''
      const format = a.format === 'jpg' ? 'jpg' : (a.format === 'svg' ? 'svg' : 'png')
      const dirArg = typeof a.dir === 'string' && a.dir !== '' ? a.dir : ''
      let w = typeof a.w === 'number' && isFinite(a.w) ? Math.round(a.w) : 1600
      let hgt = typeof a.h === 'number' && isFinite(a.h) ? Math.round(a.h) : 1200
      w = Math.min(4000, Math.max(400, w))
      hgt = Math.min(4000, Math.max(400, hgt))
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

        // SVG 走独立路径：纯文本提取，不需要 Chrome
        if (format === 'svg') {
          const rs = await exportSvg(srcAbs, outAbs)
          if (rs.ok) {
            const secs = ((Date.now() - t0) / 1000).toFixed(1)
            console.log('canvas/export svg ok in ' + secs + 's: ' + outName)
            return { ok: true, out: outName, outPath: outAbs, ms: secs }
          }
          return { error: 'SVG: ' + rs.error }
        }

        const script = [
          'set -eu',
          'CHROME=""',
          "for c in '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' '/Applications/Chromium.app/Contents/MacOS/Chromium' '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'; do",
          '  if [ -x "$c" ]; then CHROME="$c"; break; fi',
          'done',
          'if [ -z "$CHROME" ]; then echo NO_CHROME; exit 3; fi',
          'TMP="$(mktemp -d)"',
          'CPID=""',
          'cleanup() { if [ -n "$CPID" ]; then kill -9 "$CPID" 2>/dev/null || true; fi; rm -rf "$TMP" 2>/dev/null || true; }',
          'trap cleanup EXIT',
          '"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-background-networking --disable-sync --disable-component-update --user-data-dir="$TMP/profile" --hide-scrollbars --force-device-scale-factor=2 --window-size=' + w + ',' + hgt + ' --virtual-time-budget=2500 --screenshot="$TMP/shot.png" ' + shQuote('file://' + srcAbs) + ' >"$TMP/chrome.log" 2>&1 &',
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
        const cwd = lastRoot !== '' ? lastRoot : '/tmp'

        const r1 = await runViaShellSession(script, cwd)
        if (r1.ok) {
          const secs = ((Date.now() - t0) / 1000).toFixed(1)
          console.log('canvas/export ok via A in ' + secs + 's: ' + outName)
          return { ok: true, out: outName, outPath: outAbs, ms: secs }
        }

        const r2 = await runViaSubprocess(script, cwd)
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
    })

    const d4 = harness.handle('canvas/reveal', async (args) => {
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
        const r1 = await runViaShellSession(script, cwd)
        if (r1.ok) return { ok: true }
        const r2 = await runViaSubprocess(script, cwd)
        if (r2.ok) return { ok: true }
        return { error: r1.error }
      } catch (e) {
        console.error('canvas/reveal failed', e)
        return { error: String(e !== null && e !== undefined && e.message !== undefined ? e.message : e) }
      }
    })

    ctx.effect(() => () => { d1(); d2(); d3(); d4() })
  },
}
