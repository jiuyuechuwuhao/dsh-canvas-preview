# 动态插件源码（打磨期工作目录）

这里存放**动态 Cordis 插件的精确源码**（与当前运行版本一致），用于：

1. **每日启用**：dsh 重启后动态插件会消失。对 Agent 说一句：
   > 「按 dsh-canvas-preview/dynamic/ 重新启用画板插件」
   
   Agent 会读取 host.js + client.js → cordis_define → cordis_run → 您点一次批准 → 30 秒内画板回来。

2. **持续迭代**（推荐流程）：
   - 直接编辑 host.js / client.js（或让 Agent 改）
   - 对 Agent 说「用 dynamic/ 的新代码更新画板插件」
   - Agent 会 define 新版本 + update —— 无需重启，即时生效，失败可回滚
   
   **这两个文件就是唯一事实来源（source of truth）**。每次迭代改这里。

## 文件说明

| 文件 | 内容 |
|---|---|
| `host.js` | Host 半函数体（fs 扫描 / shell+subprocess 双路径导出 / reveal） |
| `client.js` | Client 半函数体（画板页签 / 通知卡片 / 另存为 / Finder 定位） |

## 重要注意事项（给 Agent 的技术备忘）

- 这是**动态运行时**源码：使用 `harness.handle()` / `host.call()` RPC、闭包式 `React`/`styles`/`host` 符号——只在 cordis_define/cordis_run 环境有效。
- `../lib/` 下的 index.js / client.js 是**未来发布用**的静态包骨架（ESM + 接缝标注），RPC 部分需要静态化改造后才能用——发布前再做。
- 启用时 cordis_define 建议 `kind: 'new'`（新进程里 pluginId 从头分配，slot id `canvas` / `canvas-notifier` 才是 UI 挂载的关键，pluginId 数字后缀无所谓）。
- 首次 cordis_run 需要用户批准一次。

## 已知的设计决策（继承自调试期，别踩回去）

1. Chrome 无头在字体被墙时永不退出 → 必须后台启动 + 轮询截图文件 + 尺寸稳定即杀
2. shell 直调会回落部署级沙箱（workspace-write 会杀 Chrome）→ 必须传 `sandboxPolicy: 会话解析的真实策略`
3. 一切 await 都要 withDeadline 硬超时 → subprocess 超时主动 terminate
4. 选中文件的计算必须放在 setState 更新函数内部 → 否则闭包过期导致选择被重置
