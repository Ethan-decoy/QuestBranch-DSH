import { mkdirSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import lockfile from 'proper-lockfile'
import { z } from 'zod'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { joinAssistantStreamText } from '@deepseek-ai/dsh-llm'
import { ResearchStore } from '../desktop/store'
import { DshBindings } from './bindings'
import { DshRuntime } from './runtime'
import { DshResearchService } from './service'
import type { DshContext } from './contracts'

const selection = z
  .object({
    provider: z.string().min(1).max(200),
    model: z.string().min(1).max(200),
    reasoningEffort: z.string().max(200).optional(),
  })
  .strict()
const requestSchema = z.discriminatedUnion('method', [
  z
    .object({ method: z.literal('snapshot'), sinceVersion: z.number().int().min(0).optional() })
    .strict(),
  z.object({ method: z.literal('command'), command: z.unknown() }).strict(),
  z.object({ method: z.literal('export'), workspaceId: z.string().min(1).max(200) }).strict(),
  z.object({ method: z.literal('models'), nodeId: z.string().min(1).max(200) }).strict(),
  z
    .object({ method: z.literal('select-model'), nodeId: z.string().min(1).max(200), selection })
    .strict(),
])

export default class QuestBranchHost extends TypertRemoteService {
  static inject = ['sessionController', 'agents', 'typertGateway']
  readonly research: DshResearchService
  private release: () => void
  constructor(ctx: DshContext, config: { directory?: string } = {}) {
    super(ctx, 'questbranch')
    Remote(this.request, {
      kind: 'method',
      name: 'request',
      private: false,
      static: false,
      addInitializer: (initializer) => initializer.call(this),
    })
    const directory = config.directory ?? join(resolveDshHome(), 'plugins', 'questbranch')
    if (!isAbsolute(directory)) throw new Error('QB 研究目录必须是绝对路径')
    mkdirSync(directory, { recursive: true })
    mkdirSync(join(directory, 'agent-workspace'), { recursive: true })
    this.release = lockfile.lockSync(directory, { realpath: true })
    try {
      const store = new ResearchStore(directory)
      const runtime = new DshRuntime(
        ctx,
        store,
        new DshBindings(directory),
        join(directory, 'agent-workspace'),
        joinAssistantStreamText,
      )
      this.research = new DshResearchService(store, runtime)
    } catch (error) {
      this.release()
      throw error
    }
    ctx.on('dispose', async () => {
      await this.research.close()
      this.research.store.close()
      this.release()
    })
  }
  async request(payload: unknown) {
    if (this.ctx.invocation && this.ctx.invocation.peer.principal.kind !== 'owner')
      throw new Error('QB 研究工作台仅供此 DSH 的所有者使用')
    const request = requestSchema.parse(payload)
    switch (request.method) {
      case 'snapshot':
        return this.research.snapshot(request.sinceVersion)
      case 'command':
        return this.research.command(request.command as import('../research/types').AppCommand)
      case 'export':
        return this.research.store.exportWorkspace(request.workspaceId)
      case 'models':
        return this.research.runtime.models(request.nodeId)
      case 'select-model':
        await this.research.runtime.select(request.nodeId, request.selection)
        return {}
    }
  }
}
