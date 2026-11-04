import type { ResearchClient, Snapshot } from '../research/types'
import type { DshCall } from './contracts'
import { version } from '../../config/dsh-package.json'

declare global {
  interface Window {
    __QB_DSH_CHANNEL__?: string
  }
}
const channel = window.__QB_DSH_CHANNEL__
const targetOrigin = location.origin === 'null' ? '*' : location.origin
if (!channel || window.parent === window) throw new Error('QB requires its DSH host')
let serial = 0
const pending = new Map<
  number,
  {
    resolve(value: unknown): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  }
>()
const send = <T>(request: DshCall): Promise<T> =>
  new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('DSH 宿主暂未响应，请返回研究页面重试'))
    }, 90000)
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
    parent.postMessage({ kind: 'qb-dsh-call', channel, id, request }, targetOrigin)
  })
function snapshot(): Promise<Snapshot>
function snapshot(sinceVersion: number): Promise<Snapshot | null>
function snapshot(sinceVersion?: number): Promise<Snapshot | null> {
  return send({ method: 'snapshot', sinceVersion })
}
const unavailable = async (): Promise<never> => {
  throw new Error('账号、工具和运行配置在 DSH 中管理')
}
const client: ResearchClient = {
  host: {
    name: 'DeepSeek Harness',
    version,
    models: (nodeId) => send({ method: 'models', nodeId }),
    selectModel: async (nodeId, selection) => {
      await send({ method: 'select-model', nodeId, selection })
    },
  },
  snapshot,
  command: (command) => send({ method: 'command', command }),
  exportWorkspace: (workspaceId) => send({ method: 'export', workspaceId }),
  testConnection: unavailable,
  modelProviders: async () => [],
  auth: {
    start: unavailable,
    status: unavailable,
    respond: unavailable,
    cancel: unavailable,
    logout: unavailable,
  },
}
window.questbranch = client
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.channel !== channel) return
  const data = event.data
  if (data.kind === 'qb-dsh-result' && Number.isSafeInteger(data.id)) {
    const call = pending.get(data.id)
    if (!call) return
    clearTimeout(call.timer)
    pending.delete(data.id)
    if (data.error) call.reject(new Error(String(data.error)))
    else call.resolve(data.value)
  } else if (data.kind === 'qb-dsh-theme') {
    void import('../ui/theme').then(({ useTheme }) =>
      useTheme.getState().choose(data.dark ? 'dark' : 'light'),
    )
  }
})
window.addEventListener('pagehide', () => {
  for (const call of pending.values()) {
    clearTimeout(call.timer)
    call.reject(new Error('研究页面已关闭'))
  }
  pending.clear()
})
// A separate document keeps React versions, styling, portals and keyboard focus
// local to QB. All research operations cross the host's authenticated RPC.
void import('../ui/main')
