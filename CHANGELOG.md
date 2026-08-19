# Changelog

## 0.4.9 — 2026-08-19

**预览窗高度兜底 + 正式发到 npm**

- iframe 预览区：`.cv-stage` / `.cv-holder` / `.cv-frame` 增加 `min-height:420px`，避免会话页签父容器没给高度时预览塌成一条线（绝对定位 iframe 自身没有内容高度）
- 客户端 `inject` 补上 `workspaces`，目录选择器不再依赖碰巧已加载的服务
- 0.4.8 只上了 GitHub、没发 npm；`dsh plugin add` / `npx` 一直在装 0.4.6，静态 CSS 全垮问题对外仍在。本版一并发布

## 0.4.8 — 2026-08-19

**修复静态包 UI 全垮（0.4.4 起所有静态安装受影响）**

- 根因：静态运行时 `apply(ctx, config)` 的第二个参数是插件 config，不是带
  `styles` 的 env——`env.styles` 永远取不到，整段 CSS 从未注入文档，画板页签
  一直是无样式的原始 HTML（0.4.7 的 `min-height` 兜底因此也无效）
- CSS 注入改为 `insertCss()`：优先用动态运行时的 `styles.insert` 全局缝隙，
  否则直接插入 `<style>` 标签（静态包的原生路径，client-modules 会在物化时
  按 `data-plugin` 认领）；标签预打 `data-plugin="dsh-canvas-preview"`，避免
  被后加载的插件错误认领、HMR 时被误删

**补齐静态包缺失/退化的功能（与动态版对齐）**

- 导出组补上 **SVG 矢量导出按钮**（Host 端本就支持，按钮在静态化时遗漏，
  README/Roadmap 早已宣称）
- 「更改…」与「另存…」接回**原生 macOS 目录选择器**（客户端 `workspaces`
  服务的 `pickDirectory`；此前退化为"重置为工作区根目录"）
- 「另存…」恢复为先弹目录选择器、再导出 PNG 到所选目录
- 导出成功后记录 `outPath`，**「📁 点击查看」Finder 定位链接恢复可用**；
  导出耗时（· 2.1s）随成功消息一并显示
- 清理 CSS 中重复定义的 `.cvn-hint` 规则

**已验证（端到端）**：刷新后样式注入 ✓ · 画板页签渲染 ✓ · 文件扫描/读取/
iframe 预览 ✓ · 空态引导卡 ✓ · 控制台无报错 ✓

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
