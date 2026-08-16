# dsh-canvas-preview

> **🚧 WIP v0.1.0 — 打磨中 / Work in Progress**
> 当前版本以**动态 Cordis 插件**形式提供（见 `dynamic/` 目录，DSH 创造模式即用）。
> `dsh plugin add` 一键安装的静态包正在开发中（见 Roadmap）。
> 边用边改，欢迎 Fork / 提 Issue。
>
> **Current release works as a DYNAMIC Cordis plugin** (see `dynamic/` — usable today in DSH's authoring preset). The one-line static install (`dsh plugin add`) is on the roadmap. Iterate-in-public; forks and issues welcome.

---

**DSH 画板预览插件** — A Canvas/Artifact preview panel for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.

在会话视图里增加一个「画板」页签：自动列出工作区中的自包含 HTML 产物（图表、原型、幻灯片），沙箱实时预览、文件变化自动同步、宽度适配、深色模式、一键导出 PNG/JPG —— 对标 Gemini / Claude 的 Canvas 体验。

> Add a "Canvas" tab to the DSH conversation view: auto-list self-contained HTML artifacts in the workspace, live-preview them in a sandbox, auto-sync on file change, width presets, dark preview, and one-click PNG/JPG export.

## ✨ 功能 / Features

| 功能 | 说明 |
|---|---|
| 🖼 画板页签 | 与 聊天 / Trajectory 并排的第三个视图页签 |
| 🔄 自动同步 | 每 4 秒扫描工作区，文件签名变化即自动刷新预览，无需手动刷新 |
| ↔️ 宽度适配 | 适配 / 1280（桌面）/ 390（手机竖屏）三档 |
| 🌓 深色预览 | 一键反色滤镜，浅色图表秒变深色底，无需重新生成 |
| 📥 导出 PNG/JPG | Chrome 无头 2x 高清截图（3200×2400）· ~2秒出图 · 轮询杀进程（不受被墙字体影响）· JPG 质量 85 |
| 📂 另存为 | 保存位置行（默认 HTML 同目录，可改）+ 「另存…」原生目录选择器 · 导出后点击链接 Finder 定位文件 |
| 🔒 沙箱安全 | iframe `sandbox="allow-scripts"` 预览，无同源权限 |

## 📦 安装 / Install

**方式一：npm（推荐）**

```sh
dsh plugin --profile web add dsh-canvas-preview
```

**方式二：GitHub**

```sh
dsh plugin --profile web add github:YOUR_GITHUB_USERNAME/dsh-canvas-preview
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加启用行：

```yaml
- id: canvas-preview
  name: dsh-canvas-preview
```

重启 `dsh web` 生效。

## 🚀 使用 / Usage

1. 让 Agent 生成任意自包含 HTML（推荐搭配 [diagram-design](https://github.com/cathrynlavery/diagram-design) 技能画图）
2. 切到会话顶部「画板」页签
3. 左侧点选文件 → 右侧实时预览；文件更新自动刷新
4. 工具栏切换宽度/主题，点 PNG / JPG 导出高清图

## 🏗 架构 / Architecture

双平面 Cordis 插件（two-plane Cordis plugin）：

```
┌─ Host (Node.js) ─────────────┐   ┌─ Client (browser) ──────────┐
│ fs 服务扫描工作区             │   │ conversation.view 插槽        │
│ canvas/list  → 文件清单+签名   │◄──┤ host.call RPC               │
│ canvas/read  → 文件内容       │◄──┤ 沙箱 iframe 预览             │
│ canvas/export→ Chrome 无头截图 │◄──┤ 宽度/主题/导出控件           │
└──────────────────────────────┘   └─────────────────────────────┘
```

## 🗺 Roadmap

- [x] 画板页签 + 文件列表 + 沙箱预览
- [x] 会话 cwd 智能定位扫描根
- [x] 自动同步（签名轮询）
- [x] 宽度适配 / 深色预览
- [x] PNG/JPG 导出（2x）
- [x] 右上角产物通知卡片（实时缩略图 + 展开为可拖动/可调大小的浮动窗口）
- [ ] **v0.2 · 静态包**：`dsh plugin add` 一键安装（RPC 接缝改造）
- [ ] SVG 导出
- [ ] 自定义导出尺寸

## 👤 作者 / Author

**YOUR NAME** — [@YOUR_GITHUB_USERNAME](https://github.com/YOUR_GITHUB_USERNAME)

## 📄 License

[MIT](LICENSE)
