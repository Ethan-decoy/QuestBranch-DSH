import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const destination = resolve('release/dsh')
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
writeFileSync(
  join(destination, 'README.md'),
  readFileSync(
    existsSync('distribution/dsh/README.md') ? 'distribution/dsh/README.md' : 'README.md',
  ),
)
console.log(`DSH plugin built: ${destination}`)
