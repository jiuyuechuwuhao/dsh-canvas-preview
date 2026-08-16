#!/usr/bin/env node
/**
 * 一键安装到本机 DeepSeek Harness 的 web profile：
 *   1. dsh plugin --profile web add dsh-canvas-preview
 *   2. 若 cordis.patch.yml 尚未启用，追加 insert 条目
 *   3. macOS 上尝试重启 LaunchAgent
 *
 * 用法：npx dsh-canvas-preview
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PKG = 'dsh-canvas-preview'
const PLUGIN_ID = 'canvas-preview'
const PATCH_SNIPPET = `
- insert:
    - id: ${PLUGIN_ID}
      name: ${PKG}
`.trimStart()

function fail(msg) {
  console.error('dsh-canvas-preview: ' + msg)
  process.exit(1)
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.error) fail('无法执行 ' + cmd + '：' + r.error.message)
  if (r.status !== 0) fail(cmd + ' 退出码 ' + r.status)
}

const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(home, 'profiles', 'web')
const patchFile = join(profileDir, 'cordis.patch.yml')

if (!existsSync(profileDir)) {
  fail('未找到 ' + profileDir + '。请先启动过一次 DeepSeek Harness（会自动创建 web profile）。')
}

console.log('1/3 安装包到 web profile …')
run('dsh', ['plugin', '--profile', 'web', 'add', PKG])

console.log('2/3 写入 cordis.patch.yml …')
if (!existsSync(patchFile)) {
  writeFileSync(patchFile, PATCH_SNIPPET, 'utf8')
  console.log('    已新建 ' + patchFile)
} else {
  const cur = readFileSync(patchFile, 'utf8')
  if (cur.includes('name: ' + PKG) || cur.includes('name: "' + PKG + '"')) {
    console.log('    已启用，跳过写入')
  } else {
    const sep = cur.endsWith('\n') ? '' : '\n'
    writeFileSync(patchFile, cur + sep + '\n' + PATCH_SNIPPET, 'utf8')
    console.log('    已追加启用条目')
  }
}

console.log('3/3 重启 Harness（若本机有 LaunchAgent）…')
if (process.platform === 'darwin') {
  const uid = String(process.getuid())
  const r = spawnSync('launchctl', ['kickstart', '-k', 'gui/' + uid + '/com.deepseek.dsh.web'], {
    stdio: 'inherit',
  })
  if (r.status !== 0) {
    console.log('    未找到 LaunchAgent，请手动重启 DeepSeek Harness 或刷新 http://127.0.0.1:3080/')
  }
} else {
  console.log('    请手动重启 dsh web')
}

console.log('\n完成。打开 http://127.0.0.1:3080/ ，会话顶栏应出现「画板」。')
