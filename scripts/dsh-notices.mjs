import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.name !== 'questbranch-dsh') throw new Error('请在独立 DSH 源码工作区执行 pnpm notices')
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw new Error('用法：pnpm notices [--check]')
const manager = process.env.npm_execpath
if (!manager) throw new Error('请通过 pnpm notices 或 pnpm notices:check 执行')
const executable = manager.endsWith('.exe') ? manager : process.execPath
const args = manager.endsWith('.exe') ? [] : [manager]
const inventory = JSON.parse(
  execFileSync(executable, [...args, 'licenses', 'list', '--prod', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
)
const overrides = JSON.parse(readFileSync(join(root, 'config/dsh-license-overrides.json'), 'utf8'))
const require = createRequire(join(root, 'package.json'))
const compiler = JSON.parse(readFileSync(require.resolve('typescript/package.json'), 'utf8'))
// Optional type peers can pull the development compiler into pnpm's --prod list.
// Neither the compiler nor its platform binaries are shipped in the plugin.
const buildOnly = new Set(
  !pkg.dependencies?.typescript && pkg.devDependencies?.typescript === compiler.version
    ? [
        `typescript@${compiler.version}`,
        ...Object.entries(compiler.optionalDependencies ?? {}).map(
          ([name, version]) => `${name}@${version}`,
        ),
      ]
    : [],
)
const packages = new Map()
function collect(directory) {
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const id = `${metadata.name}@${metadata.version}`
  if (buildOnly.has(id)) return
  const texts = readdirSync(directory)
    .filter(
      (file) =>
        /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(file) &&
        statSync(join(directory, file)).isFile(),
    )
    .sort()
    .map(
      (file) =>
        `--- ${file} ---\n${readFileSync(join(directory, file), 'utf8').replaceAll('\r\n', '\n').trimEnd()}`,
    )
  const override = overrides[id]
  if (!texts.length && override) {
    const file = resolve(root, override.file)
    const contents = readFileSync(file)
    if (createHash('sha256').update(contents).digest('hex') !== override.sha256)
      throw new Error(`上游许可校验不符：${id}`)
    texts.push(
      `Source: ${override.source}\n${override.reason}\n\n${contents.toString('utf8').replaceAll('\r\n', '\n').trimEnd()}`,
    )
  }
  if (!texts.length) throw new Error(`缺少原始许可文本：${id}；请核对来源后补充明确版本的 override`)
  const license = typeof metadata.license === 'string' ? metadata.license : metadata.license?.type
  if (!license) throw new Error(`缺少许可声明：${id}`)
  const text = `${id}\nDeclared license: ${license}\n\n${texts.join('\n\n')}`
  if (packages.has(id) && packages.get(id) !== text)
    throw new Error(`同一版本的许可内容不同：${id}`)
  packages.set(id, text)
}
for (const records of Object.values(inventory))
  for (const record of records) for (const directory of record.paths) collect(directory)
// Tailwind generates stylesheet content; its compiler is not a plugin runtime dependency.
collect(resolve(require.resolve('tailwindcss/package.json'), '..'))
const lockHash = createHash('sha256')
  .update(readFileSync(join(root, 'pnpm-lock.yaml')))
  .digest('hex')
const header = `QuestBranch-DSH third-party notices

Generated from the DSH source lockfile's production dependency inventory plus
the Tailwind stylesheet license. This is a conservative superset of bundled
dependencies. Original copyright, license and notice texts follow.
DSH, its externally loaded SDKs and Node.js are supplied by the host separately.
Development-only TypeScript compiler packages are excluded.

Lockfile SHA-256: ${lockHash}
Packages: ${packages.size}
`
const text = `${header}\n${[...packages]
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([, value]) => `${'='.repeat(80)}\n${value}`)
  .join('\n\n')}\n`
const target = join(root, 'THIRD_PARTY_NOTICES.txt')
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== text)
    throw new Error('第三方声明与锁定依赖不同，请运行 pnpm notices 并提交结果')
} else writeFileSync(target, text)
console.log(
  `Third-party notices ${process.argv.includes('--check') ? 'checked' : 'generated'}: ${packages.size} packages`,
)
