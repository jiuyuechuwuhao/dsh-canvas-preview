# Changelog

## 0.4.7 — 2026-08-18

- 修复空态垮塌：`.cv-root` 增加 `min-height:380px` 兜底（父容器无高度时面板不再塌陷）
- 空态体验：无 HTML 产物时舞台显示居中引导卡（生成 HTML artifact 后自动出现）；侧栏空态补充提示文案

## 0.4.6 — 2026-08-18

- 补齐 `dsh.bundle` + 根目录 `cordis.patch.yml`，使 `dsh plugin add` 可安装
- 发布包纳入 `cordis.patch.yml`
- 客户端 `inject` 补上 `timer`（`ctx.interval` / `ctx.timeout` 依赖该服务）

## 0.4.5 — 2026-08-17

- 仓库页与 npm 文档对齐：访问范围、SECURITY.md、发现入口
- `package.json` 增加 `dsh-plugin` 关键词

## 0.4.4 — 2026-08-17

- Host 不再拦截官方 `/api`（会让设置里「插件列表」整页读失败）
- 画板 RPC 改走独立频道 `/canvas`
- 客户端补 `connection` inject，修复「另存」崩溃

## 0.4.3 — 2026-08-17

- Cordis `apply.inject` 改为服务名 `slots`，不再误等 npm 包名

## 0.4.2 — 2026-08-17

- 增加 `npx dsh-canvas-preview` 一键安装（装包 + 写入 patch + 尝试重启）

## 0.4.1 — 2026-08-17

- 客户端按 DSH 要求用 `window.__ModuleLoader__.load` 注册，避免 Harness 启动失败
- 包声明 `"type": "module"`
