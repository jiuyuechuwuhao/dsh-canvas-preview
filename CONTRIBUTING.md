# 参与贡献

欢迎 Issue 和 PR。改代码前请先在本机 DeepSeek Harness 的 web profile 用 `file:` 链接验证。

## 本地跑起来

```bash
dsh plugin --profile web add "dsh-canvas-preview@file:$PWD"
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 保留：

```yaml
- insert:
    - id: canvas-preview
      name: dsh-canvas-preview
```

重启 `dsh web` 后硬刷新 http://127.0.0.1:3080/ 。

## 不要碰的边界

- 不要对 `/api` 再注册 interceptor（官方网关独占）
- 客户端必须用 `window.__ModuleLoader__.load`，`inject` 只能写 Cordis **服务名**（如 `slots`、`connection`）

## 发版

1. 改 `package.json` 的 `version`
2. 更新 `CHANGELOG.md`
3. `git tag vX.Y.Z && git push origin main --tags`
4. `gh release create vX.Y.Z`
5. 本机终端：`npm publish --access public`
