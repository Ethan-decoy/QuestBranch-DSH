import type { AppCommand, Snapshot } from '../research/types'

export const dshPackageName = 'dsh-plugin-questbranch'
export const dshPanelId = 'questbranch'
export const dshHostVersion = '0.2.1-rc.5'

export type HostSelection = { provider: string; model: string; reasoningEffort?: string }
export type HostCatalog = {
  default: HostSelection
  groups: {
    id: string
    name: string
    models: {
      id: string
      name: string
      reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string }
    }[]
  }[]
  failures: { id: string; name: string; message: string }[]
}
export type HostModelState = { catalog: HostCatalog; selection: HostSelection }
export type DshCall =
  | { method: 'snapshot'; sinceVersion?: number }
  | { method: 'command'; command: AppCommand }
  | { method: 'export'; workspaceId: string }
  | { method: 'models'; nodeId: string }
  | { method: 'select-model'; nodeId: string; selection: HostSelection }

export type DshBootstrap = { snapshot: Snapshot; version: string }

/** The small, versioned slice of the installed DSH Host used by this adapter. */
export type Disposer = () => void | Promise<void>
export type DshEvent = { type: string; seq?: number; data: Record<string, unknown> }
export type DshAgent = {
  id: string
  status: string
  ctx: { tools: { register(tool: DshTool): Disposer } }
  cancel(cause: { kind: 'user' }): void
  whenIdle(): Promise<void>
}
export type DshTool = {
  name: string
  description: string
  parameters: object
  output: { schema: object; render(args: unknown, value: unknown): unknown }
  execute(args: unknown, execution: { callId: string; signal: AbortSignal }): unknown
}
export type DshContext = {
  agents: { get(id: string): DshAgent | undefined }
  sessionController: {
    create(request: { cwd: string }): Promise<{ sessionId: string }>
    prompt(
      request: { sessionId: string; requestId: string; content: { type: 'text'; text: string }[] },
      signal: AbortSignal,
    ): Promise<unknown>
    selectModel(request: { sessionId: string } & HostSelection): Promise<unknown>
    modelCatalog(): Promise<HostCatalog>
  }
  invocation?: { peer: { principal: { kind: string } } }
  on(
    event: 'session/event',
    listener: (session: { id: string }, event: DshEvent) => void,
    options?: { global: true },
  ): Disposer
  on(
    event: 'agent/created',
    listener: (event: { agent: DshAgent }) => void,
    options?: { global: true },
  ): Disposer
  on(
    event: 'agent/assistant-stream',
    listener: (event: { agent: DshAgent; frame: Record<string, unknown> }) => void,
    options?: { global: true },
  ): Disposer
  on(
    event: 'approval/request',
    listener: (request: { agent?: DshAgent }, next: () => Promise<unknown>) => Promise<unknown>,
    options?: { global: true },
  ): Disposer
  on(event: 'dispose', listener: () => void | Promise<void>): Disposer
}

export type ClientContext = {
  slots: {
    inject(name: string, register: () => unknown): unknown
    register(options: Record<string, unknown>, renderer: unknown): unknown
  }
  connection: {
    rpc: {
      call(
        channel: string,
        endpoint: string,
        payload: unknown,
        signal?: AbortSignal,
      ): Promise<{ ok: boolean; value?: unknown; error?: { message: string } }>
    }
  }
}
