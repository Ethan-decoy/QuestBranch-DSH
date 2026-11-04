import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ResearchStore } from '../desktop/store'
import { commandSchema } from '../desktop/command-schemas'
import { buildContext } from '../research/context'
import { branchReport } from '../research/branching'
import { ResearchOutputSchema, type AppCommand, type ResearchRun } from '../research/types'
import { DshRuntime } from './runtime'

/** Shared QB operations with one native DSH runtime; no model-provider stack. */
export class DshResearchService {
  private active = new Map<string, { abort: AbortController; done: Promise<void> }>()
  constructor(
    readonly store: ResearchStore,
    readonly runtime: DshRuntime,
  ) {}
  snapshot(sinceVersion?: number) {
    if (sinceVersion !== undefined) z.number().int().min(0).parse(sinceVersion)
    const snapshot =
      sinceVersion === undefined ? this.store.snapshot() : this.store.snapshot(sinceVersion)
    if (!snapshot) return null
    return {
      ...snapshot,
      storage: {
        directory: this.store.directory,
        database: `${this.store.directory}/research.sqlite`,
      },
      settings: {
        ...snapshot.settings,
        backend: 'acp' as const,
        agent: { kind: 'custom' as const, name: 'DeepSeek Harness' },
        model: 'DeepSeek Harness',
        hasApiKey: false,
        hasSearchKey: false,
      },
    }
  }
  async command(input: AppCommand) {
    const command = commandSchema.parse(input)
    switch (command.type) {
      case 'create-workspace':
        return {
          id: this.store.createWorkspace(command.question, command.name, command.constraints),
        }
      case 'create-node':
        return {
          id: this.store.createNode(
            command.parentId,
            command.question,
            command.sourceReportId,
            command,
          ),
        }
      case 'edit-node':
        this.store.editNode(command.nodeId, command.question)
        break
      case 'remove-branch':
        this.store.removeBranch(command.nodeId, command.requestId)
        break
      case 'restore-branch':
        this.store.restoreBranch(command.nodeId, command.removalId)
        break
      case 'save-view':
        this.store.saveView(command.workspaceId, command.view)
        break
      case 'import-workspace':
        return { id: this.store.importWorkspace(command.data) }
      case 'save-settings':
        throw new Error('模型、账号和运行配置由 DSH 管理')
      case 'cancel-research':
        this.active.get(command.runId)?.abort.abort()
        break
      case 'send-message':
      case 'start-research': {
        const node = this.store.node(command.nodeId)
        if (node.removedAt) throw new Error('此研究分支已移除')
        const snapshot = this.snapshot()!
        if (snapshot.runs.some((r) => r.nodeId === node.id && r.status === 'running'))
          throw new Error('此节点已有研究正在进行')
        if (this.active.size >= 3) throw new Error('最多同时进行三项研究')
        const chat = command.type === 'send-message'
        const instruction = chat ? command.message : command.instruction
        const context = buildContext(
          snapshot,
          node.id,
          instruction,
          command.type === 'start-research' ? command.reportIds : [],
          chat ? 'chat' : 'research',
          0,
          false,
        )
        const selected = command.selectedReportId
          ? this.store.report(command.selectedReportId)
          : branchReport(snapshot, node.id, snapshot.views[node.workspaceId])
        if (selected && (selected.nodeId !== node.id || selected.workspaceId !== node.workspaceId))
          throw new Error('所选报告不属于当前研究节点')
        const run: ResearchRun = {
          id: randomUUID(),
          workspaceId: node.workspaceId,
          nodeId: node.id,
          instruction,
          selectedReportId: selected?.id,
          status: 'running',
          phase: '准备 DSH 研究会话',
          output: '',
          error: '',
          model: 'DeepSeek Harness',
          agent: { name: 'DeepSeek Harness', activities: [], requests: [] },
          ...(chat ? { mode: 'chat' as const } : {}),
          context,
          createdAt: new Date().toISOString(),
        }
        this.store.saveRun(run)
        const abort = new AbortController()
        const done = this.perform(run, abort.signal).finally(() => this.active.delete(run.id))
        this.active.set(run.id, { abort, done })
        return { id: run.id }
      }
    }
    return {}
  }
  private async perform(run: ResearchRun, signal: AbortSignal) {
    try {
      const result = await this.runtime.run(run, signal)
      if (signal.aborted) throw new Error('研究已停止')
      const current = this.store.run(run.id)
      if (run.mode !== 'chat') {
        const json = current.output
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
        const output = ResearchOutputSchema.parse(JSON.parse(json))
        this.store.complete(run.id, output, current.context.sources)
      } else
        this.store.saveRun({
          ...current,
          status: 'completed',
          phase: '对话已保存',
          model: result.model,
          finishedAt: new Date().toISOString(),
        })
    } catch (error) {
      const current = this.store.run(run.id)
      this.store.saveRun({
        ...current,
        status: signal.aborted ? 'cancelled' : 'failed',
        phase: signal.aborted ? '已停止' : '研究未完成',
        error: error instanceof Error ? error.message : 'DSH 研究失败',
        finishedAt: new Date().toISOString(),
      })
    }
  }
  async close() {
    for (const { abort } of this.active.values()) abort.abort()
    await Promise.allSettled([...this.active.values()].map((v) => v.done))
    await this.runtime.close()
  }
}
