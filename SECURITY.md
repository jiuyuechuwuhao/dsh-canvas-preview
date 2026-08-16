# Security notes

`dsh-canvas-preview` is a local DeepSeek Harness plugin.

- It scans the session workspace for HTML files and previews them in a sandboxed iframe (`allow-scripts allow-popups`).
- PNG/JPG export launches a local headless Chrome against a `file://` path and writes the screenshot next to the HTML (or a directory you choose).
- It does not send artifacts to a third-party service. If the HTML itself loads remote fonts or images, those requests come from the preview/export engine.
- It does not read API keys or DSH credentials.

Report issues at https://github.com/jiuyuechuwuhao/dsh-canvas-preview/issues
