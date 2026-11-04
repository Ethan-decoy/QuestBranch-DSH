import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const source = JSON.parse(readFileSync('config/dsh-package.json', 'utf8'))
const destination = resolve('release/dsh')
const built = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))
if (JSON.stringify(source) !== JSON.stringify(built) || built.license !== 'MIT')
  throw new Error('插件 manifest 与源码或已确认许可证不同，请重新构建')
const required = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'CHANGELOG.md',
  'docs/development.md',
  'docs/troubleshooting.md',
]
for (const file of required)
  if (!readFileSync(join(destination, file)).length) throw new Error(`缺少插件交付文件：${file}`)
const manager = process.env.npm_execpath
if (!manager) throw new Error('请通过 pnpm pack:dsh 执行')
const executable = manager.endsWith('.exe') ? manager : process.execPath
const args = manager.endsWith('.exe') ? [] : [manager]
const result = JSON.parse(
  execFileSync(
    executable,
    [...args, '--dir', destination, 'pack', '--pack-destination', '..', '--json'],
    { encoding: 'utf8' },
  ),
)
const expectedName = `dsh-plugin-questbranch-${source.version}.tgz`
if (
  resolve(result.filename) !== resolve('release', expectedName) ||
  required.some((file) => !result.files.some((entry) => entry.path === file)) ||
  result.files.some(
    (entry) => !required.includes(entry.path) && !/^chunks\/[\w.-]+\.js$/.test(entry.path),
  )
)
  throw new Error('安装包内容超出交付清单或缺少必需文件')
const archive = join('release', expectedName)
const contents = readFileSync(archive)
const sha256 = createHash('sha256').update(contents).digest('hex')
writeFileSync(`${archive}.sha256`, `${sha256}  ${expectedName}\n`)
console.log(
  JSON.stringify(
    {
      filename: archive,
      version: source.version,
      hostVersion: source.engines.dsh,
      bytes: contents.length,
      sha256,
      files: result.files.map((entry) => entry.path),
    },
    null,
    2,
  ),
)
