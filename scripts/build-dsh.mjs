import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const destination = resolve('release/dsh')
const publicDirectory = existsSync('distribution/dsh/package.json')
  ? resolve('distribution/dsh')
  : process.cwd()
const manifest = JSON.parse(readFileSync('config/dsh-package.json', 'utf8'))
const workspace = JSON.parse(readFileSync(join(publicDirectory, 'package.json'), 'utf8'))
if (manifest.name !== 'dsh-plugin-questbranch' || manifest.version !== workspace.version)
  throw new Error('DSH 插件包身份或版本与分发源码不一致')
const lockHash = createHash('sha256')
  .update(readFileSync(join(publicDirectory, 'pnpm-lock.yaml')))
  .digest('hex')
if (
  !readFileSync(join(publicDirectory, 'THIRD_PARTY_NOTICES.txt'), 'utf8').includes(
    `Lockfile SHA-256: ${lockHash}`,
  )
)
  throw new Error('DSH 第三方声明不对应当前锁文件，请在独立源码工作区更新声明')
readFileSync(join(publicDirectory, 'LICENSE'))
mkdirSync(destination, { recursive: true })
await build({
  configFile: false,
  ssr: { noExternal: true },
  build: {
    ssr: resolve('src/dsh/index.ts'),
    outDir: destination,
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      external: (id) => id.startsWith('node:') || id.startsWith('@deepseek-ai/'),
      output: { entryFileNames: 'index.js', chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
})
const frame = await build({
  configFile: false,
  plugins: [react(), tailwindcss()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    write: false,
    minify: true,
    cssCodeSplit: false,
    lib: { entry: resolve('src/dsh/frame.ts'), name: 'QuestBranchFrame', formats: ['iife'] },
  },
})
const frameOutput = (Array.isArray(frame) ? frame[0] : frame).output
const code = frameOutput.find((entry) => entry.type === 'chunk' && entry.isEntry).code
const css = frameOutput
  .filter((entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'))
  .map((entry) => String(entry.source))
  .join('\n')
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuestBranch</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>window.__QB_DSH_CHANNEL__="__QB_CHANNEL__";</script><script>${code.replaceAll('</script', '<\\/script')}</script></body></html>`
const client = await build({
  configFile: false,
  define: { __QUESTBRANCH_FRAME_HTML__: JSON.stringify(html) },
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('src/dsh/client.ts'), formats: ['cjs'] },
    rolldownOptions: { external: ['react'] },
  },
})
const clientOutput = (Array.isArray(client) ? client[0] : client).output
const clientCode = clientOutput.find((entry) => entry.type === 'chunk' && entry.isEntry).code
writeFileSync(
  join(destination, 'client.js'),
  `window.__ModuleLoader__.load({id:"dsh-plugin-questbranch",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${clientCode}\nreturn module.exports;}});\n`,
)
writeFileSync(join(destination, 'package.json'), readFileSync('config/dsh-package.json'))
writeFileSync(
  join(destination, 'cordis.patch.yml'),
  '- insert:\n    - id: questbranch\n      name: dsh-plugin-questbranch\n',
)
for (const file of [
  'README.md',
  'README.en.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'CHANGELOG.md',
  'docs/development.md',
  'docs/troubleshooting.md',
]) {
  mkdirSync(resolve(destination, file, '..'), { recursive: true })
  copyFileSync(join(publicDirectory, file), join(destination, file))
}
console.log(`DSH plugin built: ${destination}`)
