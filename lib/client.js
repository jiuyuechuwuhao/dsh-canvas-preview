window.__ModuleLoader__.load({
	id: "dsh-canvas-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

/**
 * dsh-canvas-preview — Client half (browser)
 *
 * "画板" (Canvas) tab in the conversation view + top-right artifact notifier:
 *   • lists self-contained HTML files found in the session workspace
 *   • live sandboxed preview, auto-sync every 4s (signature-based, never
 *     resets the user's selection — selection resolution happens inside the
 *     state updater so it always reads the latest state)
 *   • width presets (fit / 1280 / 390) and light/dark preview toggle
 *   • PNG/JPG export via the Host half's headless-Chrome pipeline
 *   • top-right notification card with real-rendered thumbnail, expand to a
 *     draggable, resizable floating window (⠿ move handle, ◢ size handle)
 *
 * React arrives as the `React` closure symbol in the dynamic runtime; in a
 * static build import it normally. `rpc()` is the single seam that changes
 * over the /api connection channel (static package wiring).
 */

/* eslint-disable */
let __ctx = null

/**
 * Insert the package CSS in a way that works in BOTH wirings:
 *   • dynamic runtime: a global `styles` seam with .insert(css) → disposer
 *   • static bundle (dsh plugin add): apply's 2nd arg is the plugin CONFIG,
 *     not an env with styles — so inject a plain <style> tag. The client
 *     module system claims untagged <style> tags during materialization
 *     (data-plugin bookkeeping), which makes this the native static path.
 */
function insertCss(css) {
  try {
    if (typeof styles !== 'undefined' && styles !== null && typeof styles.insert === 'function') {
      const d = styles.insert(css)
      return typeof d === 'function' ? d : function () {}
    }
  } catch (e) { /* fall through to direct tag */ }
  if (typeof document === 'undefined' || !document.head) return function () {}
  const el = document.createElement('style')
  // Pre-tag ownership: claimStyles() only sweeps style:not([data-plugin]), so an
  // untagged tag here would be claimed by whichever plugin materializes next.
  el.setAttribute('data-plugin', 'dsh-canvas-preview')
  el.textContent = css
  document.head.appendChild(el)
  return function () { el.remove() }
}

function rpc(method, args) {
  const connection = __ctx !== null ? __ctx.connection : undefined
  const call = connection === undefined || connection === null
    ? undefined
    : (connection.rpc !== undefined && typeof connection.rpc.call === 'function'
      ? connection.rpc.call.bind(connection.rpc)
      : (typeof connection.call === 'function' ? connection.call.bind(connection) : undefined))
  if (call === undefined) {
    return Promise.reject(new Error('connection unavailable'))
  }
  const endpoint = typeof method === 'string' && method.indexOf('/') >= 0
    ? method.slice(method.lastIndexOf('/') + 1)
    : method
  return call('/canvas', endpoint, args === undefined ? {} : args).then((res) => {
    if (res !== null && typeof res === 'object' && res.ok === true) return res.value
    const err = res !== null && typeof res === 'object' && res.error !== undefined ? res.error : res
    throw new Error(typeof err === 'object' && err.details !== undefined && err.details.message !== undefined
      ? err.details.message : JSON.stringify(err))
  })
}

const CSS = ''
  + '.cv-root{display:flex;height:100%;min-height:380px;color:inherit;font-family:inherit}'
  + '.cv-side{width:220px;flex:0 0 220px;overflow-y:auto;border-right:1px solid rgba(128,134,152,.3);padding:8px}'
  + '.cv-side-head{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.65}'
  + '.cv-refresh{font-size:11px;padding:2px 8px;border:1px solid rgba(128,134,152,.4);background:transparent;border-radius:4px;cursor:pointer;color:inherit}'
  + '.cv-refresh:hover{background:rgba(128,134,152,.12)}'
  + '.cv-item{display:block;width:100%;text-align:left;padding:6px 8px;margin:2px 0;border:0;border-radius:5px;background:transparent;cursor:pointer;color:inherit}'
  + '.cv-item:hover{background:rgba(128,134,152,.12)}'
  + '.cv-active{background:rgba(128,134,152,.2)}'
  + '.cv-name{font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '.cv-meta{font-size:10.5px;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}'
  + '.cv-main{flex:1;min-width:0;display:flex;flex-direction:column}'
  + '.cv-bar{display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:11px;border-bottom:1px solid rgba(128,134,152,.3);opacity:.9}'
  + '.cv-bar-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}'
  + '.cv-count{opacity:.55;font-size:10.5px;flex:none;white-space:nowrap}'
  + '.cv-ctrl{display:flex;align-items:center;gap:6px;padding:4px 12px;font-size:10.5px;border-bottom:1px solid rgba(128,134,152,.3);flex-wrap:wrap}'
  + '.cv-grp-label{opacity:.5;margin-right:2px;letter-spacing:.05em}'
  + '.cv-btn{font-size:10.5px;padding:2px 8px;border:1px solid rgba(128,134,152,.35);background:transparent;border-radius:4px 0 0 4px;cursor:pointer;color:inherit;margin-left:-1px}'
  + '.cv-btn:last-child{border-radius:0 4px 4px 0}'
  + '.cv-btn:hover{background:rgba(128,134,152,.12)}'
  + '.cv-btn-on{background:rgba(128,134,152,.25);font-weight:600}'
  + '.cv-btn:disabled{opacity:.4;cursor:default}'
  + '.cv-exportmsg{opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}'
  + '.cv-stage{flex:1 1 auto;min-height:420px;overflow:auto;display:flex;justify-content:center;align-items:stretch}'
  + '.cv-stage-dark{background:#0e0f12}'
  + '.cv-stage-light{background:#fff}'
  + '.cv-holder{height:100%;min-height:420px;flex:none;position:relative}'
  + '.cv-frame{position:absolute;inset:0;width:100%;height:100%;min-height:420px;border:0;display:block}'
  + '.cv-empty{padding:10px;font-size:12px;opacity:.6}'
  + '.cv-empty-hero{margin:auto;text-align:center;opacity:.55;font-size:12.5px;line-height:1.9;max-width:460px;padding:20px}'
  + '.cv-empty-hero b{display:block;font-size:15px;font-weight:600;opacity:.95;margin-bottom:4px}'
  + '.cv-center{display:flex;align-items:center;justify-content:center;height:100%}'
  + '.cv-error{padding:12px;font-size:12px;color:#c0392b;white-space:pre-wrap}'
  + '.cvn-card{position:fixed;top:64px;right:16px;width:248px;background:#fff;border:1px solid rgba(45,49,66,.25);border-radius:10px;overflow:hidden;color:#2d3142;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 6px 24px rgba(45,49,66,.14)}'
  + '.cvn-card-big{width:auto}'
  + '.cvn-head{display:flex;align-items:center;gap:6px;padding:8px 10px 6px;cursor:default}'
  + '.cvn-grip{cursor:move;user-select:none;color:#b3bacb;font-size:13px;line-height:1;padding:0 2px;touch-action:none}'
  + '.cvn-grip:hover{color:#4f5d75}'
  + '.cvn-dot{width:7px;height:7px;border-radius:50%;background:#eb6c36;flex:none}'
  + '.cvn-title{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7a8399;flex:none}'
  + '.cvn-file{flex:1;min-width:0;font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#2d3142}'
  + '.cvn-x{border:0;background:transparent;cursor:pointer;color:#7a8399;font-size:13px;padding:0 4px;line-height:1}'
  + '.cvn-x:hover{color:#2d3142}'
  + '.cvn-thumb{margin:0 10px;width:228px;height:142px;border:1px solid rgba(45,49,66,.15);border-radius:6px;overflow:hidden;background:#f5f5f5;position:relative;cursor:pointer}'
  + '.cvn-thumb-frame{position:absolute;top:0;left:0;width:1140px;height:710px;border:0;transform:scale(0.2);transform-origin:0 0;pointer-events:none}'
  + '.cvn-bigview{margin:0 10px;width:100%;border:1px solid rgba(45,49,66,.15);border-radius:6px;overflow:hidden;background:#f5f5f5;position:relative}'
  + '.cvn-bigview-frame{position:absolute;inset:0;width:100%;height:100%;border:0}'
  + '.cvn-foot{display:flex;align-items:center;gap:6px;padding:7px 10px 9px;flex-wrap:wrap}'
  + '.cvn-act{font-size:10.5px;padding:2px 9px;border:1px solid rgba(45,49,66,.3);background:transparent;border-radius:4px;cursor:pointer;color:#2d3142;margin-left:-1px}'
  + '.cvn-act:hover{background:rgba(45,49,66,.08)}'
  + '.cvn-act:disabled{opacity:.4;cursor:default}'
  + '.cvn-rsz{position:absolute;right:2px;bottom:2px;width:16px;height:16px;cursor:nwse-resize;color:#b3bacb;font-size:11px;line-height:16px;text-align:center;user-select:none;touch-action:none}'
  + '.cvn-rsz:hover{color:#4f5d75}'
  + '.cvn-spin{font-size:10px;color:#7a8399;padding:2px 6px}'
  + '.cv-link{color:#2e5aa8;text-decoration:underline;cursor:pointer;opacity:1;flex:none;max-width:420px;font-weight:500}'
  + '.cv-link:hover{color:#1e3f78}'
  + '.cv-save-row{display:flex;align-items:center;gap:6px;padding:4px 12px;font-size:10.5px;border-bottom:1px solid rgba(128,134,152,.3);flex-wrap:wrap;opacity:.9}'
  + '.cv-save-path{flex:1;min-width:120px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.75}'
  + '.cvn-hint{font-size:10px;color:#7a8399;flex:1 1 100%;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '.cvn-link{font-size:10px;color:#2e5aa8;text-decoration:underline;cursor:pointer;flex:1 1 100%;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}'
  + '.cvn-link:hover{color:#1e3f78}'

function fmtSize(n) {
  if (typeof n !== 'number') return ''
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}

function themed(html, theme) {
  if (theme !== 'dark' || typeof html !== 'string' || html === '') return html
  const css = '<style data-cv-dark>html{filter:invert(1) hue-rotate(180deg);background:#fff}</style>'
  if (html.indexOf('</head>') !== -1) return html.replace('</head>', css + '</head>')
  return css + html
}


function CanvasView(props) {
  const h = React.createElement
  const pair = React.useState({
    ready: false, root: '', files: [], picked: null, pickedSig: '', html: '', reading: false, error: '',
    width: 'fit', theme: 'light', exporting: false, exportMsg: '', exportOut: '', saveDir: '', picking: false,
  })
  const state = pair[0]
  const setState = pair[1]

  function patch(fn) { setState(function (s) { return fn(s) }) }

  function pickFrom(list, prev) {
    if (prev !== null && prev !== undefined) {
      for (let i = 0; i < list.length; i++) if (list[i].path === prev) return list[i]
    }
    return list.length > 0 ? list[0] : null
  }

  // Selection resolution happens INSIDE the state updater so it always reads
  // the latest `picked`; an unchanged file+signature never touches the user's
  // selection or the loaded content.
  function applyList(res, onErrorText) {
    if (onErrorText !== '') {
      patch(function (s) { return Object.assign({}, s, { ready: true, files: [], picked: null, pickedSig: '', html: '', reading: false, error: onErrorText }) })
      return
    }
    const ok = res !== null && res !== undefined && typeof res === 'object'
    const list = ok && Array.isArray(res.files) ? res.files : []
    patch(function (s) {
      const target = pickFrom(list, s.picked)
      const sig = target !== null && typeof target.sig === 'string' ? target.sig : ''
      const sameFile = target !== null && target.path === s.picked
      const sameSig = sameFile && sig === s.pickedSig
      return Object.assign({}, s, {
        ready: true,
        root: ok && typeof res.root === 'string' ? res.root : s.root,
        files: list,
        picked: target !== null ? target.path : null,
        pickedSig: sig,
        html: sameSig ? s.html : '',
        reading: target !== null && !sameSig,
        error: '',
      })
    })
  }

  function doList() {
    rpc('canvas/list').then(function (res) {
      const ok = res !== null && res !== undefined && typeof res === 'object'
      const errText = ok && typeof res.error === 'string' && res.error !== '' ? res.error : ''
      applyList(res, errText)
    }, function (e) { applyList(null, String(e)) })
  }

  React.useEffect(function () {
    const ctx = __ctx
    if (ctx === null) return undefined
    let busy = false
    const tick = function () {
      if (busy) return
      busy = true
      rpc('canvas/list').then(function (res) {
        busy = false
        const ok = res !== null && res !== undefined && typeof res === 'object'
        const errText = ok && typeof res.error === 'string' && res.error !== '' ? res.error : ''
        applyList(res, errText)
      }, function () { busy = false })
    }
    tick()
    const d = ctx.interval(tick, 4000)
    return function () { d() }
  }, [])

  React.useEffect(function () {
    let alive = true
    if (state.picked === null || state.picked === undefined) return undefined
    rpc('canvas/read', { path: state.picked }).then(function (res) {
      if (!alive) return
      const ok = res !== null && res !== undefined && typeof res === 'object'
      const errText = ok && typeof res.error === 'string' && res.error !== '' ? res.error : ''
      const text = ok && typeof res.content === 'string' ? res.content : ''
      patch(function (s) { return Object.assign({}, s, { html: errText === '' ? text : '', reading: false, error: errText }) })
    }, function (e) {
      if (!alive) return
      patch(function (s) { return Object.assign({}, s, { html: '', reading: false, error: String(e) }) })
    })
    return function () { alive = false }
  }, [state.picked, state.pickedSig])

  function onExport(fmt, dirOverride) {
    if (state.picked === null || state.picked === undefined || state.exporting) return
    patch(function (s) { return Object.assign({}, s, { exporting: true, exportMsg: '导出中…', exportOut: '' }) })
    const req = { path: state.picked, format: fmt, w: 1600, h: 1200 }
    const dir = typeof dirOverride === 'string' && dirOverride !== '' ? dirOverride : state.saveDir
    if (dir !== '') req.dir = dir
    rpc('export', req).then(function (res) {
      const ok = res !== null && res !== undefined && typeof res === 'object'
      const out = ok && typeof res.out === 'string' ? res.out : ''
      const err = ok && typeof res.error === 'string' ? res.error : 'unknown'
      const ms = ok && typeof res.ms === 'string' ? (' · ' + res.ms + 's') : ''
      patch(function (s) { return Object.assign({}, s, {
        exporting: false,
        exportMsg: out !== '' ? ('✓ 已导出 ' + out + ms) : ('导出失败: ' + err),
        exportOut: out !== '' && ok && typeof res.outPath === 'string' ? res.outPath : '',
      }) })
    }, function (e) {
      patch(function (s) { return Object.assign({}, s, { exporting: false, exportMsg: '导出失败: ' + String(e), exportOut: '' }) })
    })
  }

  function onExportAs() {
    if (state.picked === null || state.picked === undefined || state.exporting) return
    pickSaveDir().then(function (dir) {
      if (dir === null) return
      onExport('png', dir)
    })
  }

  // Native macOS directory picker via the client `workspaces` service (the same
  // capability the dynamic version uses). Resolves null when cancelled or the
  // service is unavailable.
  function pickSaveDir() {
    if (state.picking) return Promise.resolve(null)
    const ctx = __ctx
    const workspaces = ctx !== null ? ctx.get('workspaces') : undefined
    if (workspaces === undefined || workspaces === null || typeof workspaces.pickDirectory !== 'function') {
      return Promise.resolve(null)
    }
    patch(function (s) { return Object.assign({}, s, { picking: true }) })
    return workspaces.pickDirectory().then(function (dir) {
      patch(function (s) { return Object.assign({}, s, { picking: false, saveDir: typeof dir === 'string' ? dir : '' }) })
      return typeof dir === 'string' ? dir : null
    }, function () {
      patch(function (s) { return Object.assign({}, s, { picking: false }) })
      return null
    })
  }

  function onReveal() {
    if (state.exportOut === '') return
    rpc('reveal', { path: state.exportOut }).catch(function () {})
  }

  const listNodes = []
  for (let i = 0; i < state.files.length; i++) {
    const f = state.files[i]
    const dir = f.path === f.name ? '' : f.path.slice(0, f.path.length - f.name.length - 1)
    const sizeText = fmtSize(f.size)
    const meta = (dir === '' ? '根目录' : dir) + (sizeText === '' ? '' : ' · ' + sizeText)
    listNodes.push(h('button', {
      key: f.path,
      type: 'button',
      className: f.path === state.picked ? 'cv-item cv-active' : 'cv-item',
      onClick: function () {
        let sig = ''
        for (let j = 0; j < state.files.length; j++) {
          if (state.files[j].path === f.path && typeof state.files[j].sig === 'string') sig = state.files[j].sig
        }
        patch(function (s) { return Object.assign({}, s, { picked: f.path, pickedSig: sig, html: '', reading: true, error: '' }) })
      },
    },
      h('div', { className: 'cv-name' }, f.name),
      h('div', { className: 'cv-meta' }, meta)))
  }

  let sideNode
  if (!state.ready) sideNode = h('div', { className: 'cv-empty' }, '扫描工作区…')
  else if (state.files.length === 0) sideNode = h('div', { className: 'cv-empty' }, '没有找到 HTML 文件。让模型生成 HTML 产物后，会自动出现在这里。')
  else sideNode = listNodes

  const holderWidth = state.width === 'wide' ? '1280px' : (state.width === 'phone' ? '390px' : '100%')
  let bodyNode
  if (state.picked === null || state.picked === undefined) {
    bodyNode = h('div', { className: 'cv-empty-hero', style: { width: '100%' } },
      h('b', null, '📭 还没有可预览的网页'),
      '工作区暂无 HTML 产物——让模型生成一个 HTML artifact，左侧列表会自动出现，点击即可预览、导出 PNG/JPG/SVG。')
  } else if (state.error !== '') {
    bodyNode = h('div', { className: 'cv-error cv-center', style: { width: '100%' } }, '读取失败：' + state.error)
  } else if (state.reading) {
    bodyNode = h('div', { className: 'cv-empty cv-center', style: { width: '100%' } }, '载入中…')
  } else {
    bodyNode = h('div', { className: 'cv-holder', style: { width: holderWidth } },
      h('iframe', { className: 'cv-frame', srcDoc: themed(state.html, state.theme), sandbox: 'allow-scripts allow-popups' }))
  }

  function seg(on, label, click) {
    return h('button', { type: 'button', className: on ? 'cv-btn cv-btn-on' : 'cv-btn', onClick: click }, label)
  }
  function setKV(kv) { patch(function (s) { return Object.assign({}, s, kv) }) }

  return h('div', { className: 'cv-root' },
    h('div', { className: 'cv-side' },
      h('div', { className: 'cv-side-head' },
        h('span', null, '画板 · HTML'),
        h('button', { type: 'button', className: 'cv-refresh', onClick: doList }, '刷新')),
      sideNode),
    h('div', { className: 'cv-main' },
      h('div', { className: 'cv-bar' },
        h('span', { className: 'cv-bar-path' }, state.picked === null || state.picked === undefined ? state.root : state.picked),
        h('span', { className: 'cv-count' }, state.files.length > 0 ? String(state.files.length) + ' 个文件 · 自动同步' : '')),
      h('div', { className: 'cv-save-row' },
        h('span', { className: 'cv-grp-label' }, '保存到'),
        h('span', { className: 'cv-save-path', title: state.saveDir !== '' ? state.saveDir : '默认（HTML 同目录）' }, state.saveDir !== '' ? state.saveDir : '默认（HTML 同目录）'),
        h('button', { type: 'button', className: 'cv-btn', disabled: state.picking, onClick: function () { pickSaveDir().then(function () {}) } }, '更改…')),
      h('div', { className: 'cv-ctrl' },
        h('span', { className: 'cv-grp-label' }, '宽度'),
        seg(state.width === 'fit', '适配', function () { setKV({ width: 'fit' }) }),
        seg(state.width === 'wide', '1280', function () { setKV({ width: 'wide' }) }),
        seg(state.width === 'phone', '390', function () { setKV({ width: 'phone' }) }),
        h('span', { className: 'cv-grp-label', style: { marginLeft: '8px' } }, '预览'),
        seg(state.theme === 'light', '浅色', function () { setKV({ theme: 'light' }) }),
        seg(state.theme === 'dark', '深色', function () { setKV({ theme: 'dark' }) }),
        h('span', { className: 'cv-grp-label', style: { marginLeft: '8px' } }, '导出'),
        h('button', { type: 'button', className: 'cv-btn', disabled: state.exporting || state.picked === null, onClick: function () { onExport('png') } }, 'PNG'),
        h('button', { type: 'button', className: 'cv-btn', disabled: state.exporting || state.picked === null, onClick: function () { onExport('jpg') } }, 'JPG'),
        h('button', { type: 'button', className: 'cv-btn', disabled: state.exporting || state.picked === null, onClick: function () { onExport('svg') } }, 'SVG'),
        h('button', { type: 'button', className: 'cv-btn', disabled: state.exporting || state.picking || state.picked === null, onClick: onExportAs }, '另存…'),
        state.exportOut !== ''
          ? h('span', { className: 'cv-link', title: state.exportOut + '（点击在 Finder 中显示）', onClick: onReveal }, '📁 ' + state.exportMsg + ' · 点击查看')
          : (state.exportMsg !== '' ? h('span', { className: 'cv-exportmsg' }, state.exportMsg) : null)),
      h('div', { className: state.theme === 'dark' ? 'cv-stage cv-stage-dark' : 'cv-stage cv-stage-light' }, bodyNode)))
}

// ── Top-right artifact notifier: thumbnail → expandable floating window ──
function NotifierCard(props) {
  const h = React.createElement
  const pair = React.useState({ open: false, path: null, name: '', html: '', expanded: false, exporting: false, msg: '' })
  const state = pair[0]
  const setState = pair[1]
  const posPair = React.useState(null)          // {x,y} after drag (null = default top-right)
  const pos = posPair[0]
  const setPos = posPair[1]
  const sizePair = React.useState({ w: 680, h: 460 }) // expanded window size
  const size = sizePair[0]
  const setSize = sizePair[1]
  const dragPair = React.useState(null)         // {mode,sx,sy,ox,oy,ow,oh}
  const drag = dragPair[0]
  const setDrag = dragPair[1]

  function patch(fn) { setState(function (s) { return fn(s) }) }

  React.useEffect(function () {
    const ctx = __ctx
    if (ctx === null) return undefined
    let seeded = false
    const lastSigs = {}
    let busy = false
    let dismissTimer = null

    const tick = function () {
      if (busy) return
      busy = true
      rpc('canvas/list').then(function (res) {
        busy = false
        const ok = res !== null && res !== undefined && typeof res === 'object'
        const list = ok && Array.isArray(res.files) ? res.files : []
        let changed = null
        for (let i = 0; i < list.length; i++) {
          const f = list[i]
          const sig = typeof f.sig === 'string' ? f.sig : ''
          if (!seeded || lastSigs[f.path] !== sig) {
            if (seeded && changed === null) changed = f
          }
        }
        for (let i = 0; i < list.length; i++) lastSigs[list[i].path] = typeof list[i].sig === 'string' ? list[i].sig : ''
        seeded = true
        if (changed === null) return
        if (dismissTimer !== null) { dismissTimer(); dismissTimer = null }
        const p = changed.path
        const nm = typeof changed.name === 'string' ? changed.name : p
        patch(function (s) { return Object.assign({}, s, { open: true, path: p, name: nm, html: '', expanded: false, msg: '' }) })
        rpc('canvas/read', { path: p }).then(function (r2) {
          const ok2 = r2 !== null && r2 !== undefined && typeof r2 === 'object'
          const text = ok2 && typeof r2.content === 'string' ? r2.content : ''
          patch(function (s) { return s.path === p ? Object.assign({}, s, { html: text }) : s })
        }, function () {})
        dismissTimer = ctx.timeout(function () {
          dismissTimer = null
          patch(function (s) { return Object.assign({}, s, { open: false }) })
        }, 25000)
      }, function () { busy = false })
    }
    tick()
    const d = ctx.interval(tick, 3000)
    return function () {
      d()
      if (dismissTimer !== null) dismissTimer()
    }
  }, [])

  if (!state.open || state.path === null) return null

  function onExpand() {
    patch(function (s) { return Object.assign({}, s, { expanded: !s.expanded }) })
  }
  function onClose() {
    patch(function (s) { return Object.assign({}, s, { open: false }) })
  }
  function onExport(fmt) {
    if (state.exporting) return
    patch(function (s) { return Object.assign({}, s, { exporting: true, msg: '导出中…' }) })
    rpc('canvas/export', { path: state.path, format: fmt, w: 1600, h: 1200 }).then(function (res) {
      const ok = res !== null && res !== undefined && typeof res === 'object'
      const out = ok && typeof res.out === 'string' ? res.out : ''
      const err = ok && typeof res.error === 'string' ? res.error : 'unknown'
      patch(function (s) { return Object.assign({}, s, { exporting: false, msg: out !== '' ? ('✓ ' + out) : ('失败: ' + err) }) })
    }, function (e) {
      patch(function (s) { return Object.assign({}, s, { exporting: false, msg: '失败: ' + String(e) }) })
    })
  }

  // Drag & resize via pointer capture on the card root — no global listeners.
  function onPointerDown(e) {
    if (e.target === null || e.target === undefined || e.currentTarget === null || e.currentTarget === undefined) return
    const t = e.target
    const mode = typeof t.getAttribute === 'function' ? t.getAttribute('data-cvdrag') : null
    if (mode === null || mode === undefined || mode === false || mode === '') return
    const root = e.currentTarget
    if (typeof root.setPointerCapture === 'function') {
      try { root.setPointerCapture(e.pointerId) } catch (err) { }
    }
    if (mode === 'move') {
      let r = { left: 0, top: 0 }
      if (typeof root.getBoundingClientRect === 'function') {
        const b = root.getBoundingClientRect()
        r = { left: b.left, top: b.top }
      }
      setDrag({ mode: 'move', sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, ow: 0, oh: 0 })
    } else {
      setDrag({ mode: 'size', sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, ow: size.w, oh: size.h })
    }
  }
  function onPointerMove(e) {
    if (drag === null) return
    const dx = e.clientX - drag.sx
    const dy = e.clientY - drag.sy
    if (drag.mode === 'move') {
      setPos({ x: Math.max(8, drag.ox + dx), y: Math.max(8, drag.oy + dy) })
    } else {
      setSize({ w: Math.max(360, drag.ow + dx), h: Math.max(240, drag.oh + dy) })
    }
  }
  function onPointerUp() {
    if (drag !== null) setDrag(null)
  }

  const bigStyle = { width: size.w + 'px' }
  const cardPos = pos !== null ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto' } : null

  const view = state.expanded
    ? h('div', { className: 'cvn-bigview', style: { height: size.h + 'px' } },
        state.html === ''
          ? h('div', { className: 'cvn-spin', style: { padding: '8px' } }, '载入中…')
          : h('iframe', { className: 'cvn-bigview-frame', srcDoc: state.html, sandbox: 'allow-scripts allow-popups' }))
    : h('div', { className: 'cvn-thumb', onClick: onExpand, title: '点击展开 · 展开后可拖动/调大小' },
        state.html === ''
          ? h('div', { className: 'cvn-spin', style: { padding: '8px' } }, '载入中…')
          : h('iframe', { className: 'cvn-thumb-frame', srcDoc: state.html, sandbox: 'allow-scripts allow-popups' }))

  return h('div', {
    className: state.expanded ? 'cvn-card cvn-card-big' : 'cvn-card',
    style: Object.assign({ pointerEvents: 'auto' }, state.expanded ? bigStyle : null, cardPos),
    onPointerDown: onPointerDown,
    onPointerMove: onPointerMove,
    onPointerUp: onPointerUp,
    onPointerCancel: onPointerUp,
  },
    h('div', { className: 'cvn-head' },
      h('span', { className: 'cvn-grip', 'data-cvdrag': 'move', title: '按住拖动卡片' }, '⠿'),
      h('span', { className: 'cvn-dot' }),
      h('span', { className: 'cvn-title' }, '新产物'),
      h('span', { className: 'cvn-file', title: state.path }, state.name),
      h('button', { type: 'button', className: 'cvn-x', onClick: onClose, 'aria-label': '关闭' }, '✕')),
    view,
    h('div', { className: 'cvn-foot' },
      h('button', { type: 'button', className: 'cvn-act', onClick: onExpand }, state.expanded ? '收起' : '展开'),
      h('button', { type: 'button', className: 'cvn-act', disabled: state.exporting, onClick: function () { onExport('png') } }, 'PNG'),
      h('button', { type: 'button', className: 'cvn-act', disabled: state.exporting, onClick: function () { onExport('jpg') } }, 'JPG'),
      state.msg !== ''
        ? h('span', { className: 'cvn-hint' }, state.msg)
        : h('span', { className: 'cvn-hint' }, state.expanded ? '⠿ 拖动 · ◢ 右下角调大小' : '完整功能见「画板」页签')),
    state.expanded ? h('div', { className: 'cvn-rsz', 'data-cvdrag': 'size', title: '按住调整大小' }, '◢') : null)
}

const name = 'dsh-canvas-preview/client'

function apply(ctx) {
  __ctx = ctx
  const slots = ctx.get('slots')
  if (slots === undefined) {
    console.error('canvas: slots service unavailable')
    return
  }
  const disposeCss = insertCss(CSS)
  const disposeReg = slots.inject('conversation.view', () => slots.register(
    { name: 'conversation.view', id: 'canvas', order: 20, label: () => '画板' },
    CanvasView,
  ))
  const disposeOverlay = slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'canvas-notifier', order: 100, label: () => '画板通知' },
    NotifierCard,
  ))
  ctx.effect(function () {
    return function () { disposeOverlay(); disposeReg(); disposeCss(); __ctx = null }
  })
}


		// Cordis apply 的 inject 是服务名，不是 npm 包名。
		// dsh.client.inject 只负责预加载，不会让这些包变成 ctx 服务。
		const inject = ["timer", "slots", "connection", "workspaces"];
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
