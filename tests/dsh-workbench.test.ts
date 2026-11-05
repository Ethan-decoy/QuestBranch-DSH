import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '../src/desktop/store'
import { DshBindings } from '../src/dsh/bindings'
import { DshRuntime } from '../src/dsh/runtime'
import { DshResearchService } from '../src/dsh/service'
import type { DshContext, DshAgent, DshTool, HostCatalog } from '../src/dsh/contracts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
function fixture() {
  const base = resolve('artifacts/dsh-tests')
  mkdirSync(base, { recursive: true })
  const directory = mkdtempSync(join(base, 'case-'))
  const store = new ResearchStore(directory)
  const events = new EventEmitter()
  const agents = new Map<string, DshAgent>()
  const tools = new Map<string, Map<string, DshTool>>()
  const prompts: { sessionId: string; text: string }[] = []
  const catalog: HostCatalog = {
    default: { provider: 'fixture', model: 'research' },
    groups: [
      {
        id: 'fixture',
        name: 'Fixture',
        models: [
          {
            id: 'research',
            name: 'Research',
            reasoning: { efforts: [{ id: 'high', name: 'High' }] },
          },
        ],
      },
    ],
    failures: [],
  }
  let nextSession = 0
  let respond = async (sessionId: string) => {
    emit(sessionId, 'assistant/message', { stream: '公开研究回复' })
    emit(sessionId, 'turn/end', { reason: { kind: 'completed' } })
  }
  function attach(sessionId: string) {
    if (agents.has(sessionId)) return
    const registered = new Map<string, DshTool>()
    tools.set(sessionId, registered)
    const agent: DshAgent = {
      id: sessionId,
      status: 'idle',
      ctx: {
        tools: {
          register(tool) {
            registered.set(tool.name, tool)
            return () => {
              registered.delete(tool.name)
            }
          },
        },
      },
      cancel: vi.fn(),
      whenIdle: async () => {},
    }
    agents.set(sessionId, agent)
    events.emit('agent/created', { agent })
  }
  function emit(sessionId: string, type: string, data: Record<string, unknown>) {
    events.emit('session/event', { id: sessionId }, { type, data })
  }
  const ctx: DshContext = {
    agents: { get: (id) => agents.get(id) },
    sessionController: {
      create: async () => {
        const sessionId = `native-${++nextSession}`
        attach(sessionId)
        return { sessionId }
      },
      modelCatalog: async () => catalog,
      selectModel: vi.fn(async () => ({})),
      prompt: async (request) => {
        attach(request.sessionId)
        prompts.push({ sessionId: request.sessionId, text: request.content[0].text })
        await respond(request.sessionId)
        return { accepted: true }
      },
    },
    on(name, listener) {
      events.on(name, listener)
      return () => {
        events.off(name, listener)
      }
    },
  }
  const bindings = new DshBindings(directory)
  const runtime = new DshRuntime(ctx, store, bindings, directory, (value) => String(value))
  const service = new DshResearchService(store, runtime)
  const workspaceId = store.createWorkspace('怎样继续一项分支研究？')
  const nodeId = store.snapshot().workspaces.find((w) => w.id === workspaceId)!.rootId
  cleanup.push(async () => {
    await service.close()
    store.close()
    const path = relative(base, directory)
    if (!path || path.startsWith('..') || isAbsolute(path))
      throw new Error('Unexpected test directory')
    rmSync(directory, { recursive: true, force: true })
  })
  return {
    store,
    service,
    runtime,
    bindings,
    ctx,
    directory,
    nodeId,
    workspaceId,
    agents,
    tools,
    events,
    prompts,
    emit,
    respond(fn: typeof respond) {
      respond = fn
    },
  }
}
async function settle(f: ReturnType<typeof fixture>, id: string) {
  await vi.waitFor(() => expect(f.store.run(id).status).not.toBe('running'))
  return f.store.run(id)
}

describe('DSH workbench research adapter', () => {
  it('publishes a paused text stream promptly and retains its last text on cancellation', async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const stream = (sessionId: string, text: string) =>
        f.events.emit('agent/assistant-stream', {
          agent: f.agents.get(sessionId),
          frame: { type: 'chunk', chunk: { type: 'text-delta', text } },
        })
      f.respond(async (sessionId) => {
        stream(sessionId, '正在等待外部材料')
      })
      const result = await f.service.command({
        type: 'send-message',
        nodeId: f.nodeId,
        message: '研究并等待材料',
      })
      await vi.advanceTimersByTimeAsync(350)
      const live = f.store.run(result.id!)
      expect(live.status).toBe('running')
      expect(live.phase).toBe('正在回复')
      expect(live.output).toBe('正在等待外部材料')
      stream(f.bindings.get(f.nodeId).sessionId, '，继续保留这段回复')
      await f.service.command({ type: 'cancel-research', runId: result.id! })
      await vi.advanceTimersByTimeAsync(0)
      const stopped = f.store.run(result.id!)
      expect(stopped.status).toBe('cancelled')
      expect(stopped.output).toBe('正在等待外部材料，继续保留这段回复')
      await vi.advanceTimersByTimeAsync(1000)
      expect(f.store.run(result.id!)).toEqual(stopped)
    } finally {
      vi.useRealTimers()
    }
  })
  it('waits for an in-flight host model change before admitting a research prompt', async () => {
    const f = fixture()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    f.ctx.sessionController.selectModel = vi.fn(async () => {
      await pending
    })
    const selecting = f.runtime.select(f.nodeId, {
      provider: 'fixture',
      model: 'research',
      reasoningEffort: 'high',
    })
    await vi.waitFor(() => expect(f.ctx.sessionController.selectModel).toHaveBeenCalled())
    const result = await f.service.command({
      type: 'send-message',
      nodeId: f.nodeId,
      message: '按刚选定的模型研究',
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(f.prompts).toHaveLength(0)
    release()
    await selecting
    const saved = await settle(f, result.id!)
    expect(saved.status).toBe('completed')
    expect(saved.agent?.configuration?.reasoningEffort).toBe('high')
  })
  it('keeps native sessions per node and reuses native history without replaying earlier chat', async () => {
    const f = fixture()
    expect((await f.runtime.models(f.nodeId)).selection.model).toBe('research')
    expect(f.agents.size).toBe(0)
    const first = await f.service.command({
      type: 'send-message',
      nodeId: f.nodeId,
      message: '先讨论研究范围',
    })
    expect((await settle(f, first.id!)).status).toBe('completed')
    const second = await f.service.command({
      type: 'send-message',
      nodeId: f.nodeId,
      message: '继续这个问题',
    })
    await settle(f, second.id!)
    expect(f.prompts[1].sessionId).toBe(f.prompts[0].sessionId)
    expect(f.prompts[1].text).not.toContain('此前本节点的公开对话')
    expect(f.prompts[1].text).not.toContain('当前研究材料快照')
    expect(f.store.snapshot().messages.filter((m) => m.nodeId === f.nodeId)).toHaveLength(4)
    const reopened = new DshBindings(f.directory)
    expect(reopened.get(f.nodeId).sessionId).toBe(f.prompts[0].sessionId)
  })
  it('saves a report and branches through actual QB tools in the initiating node', async () => {
    const f = fixture()
    f.respond(async (sessionId) => {
      const tool = f.tools.get(sessionId)!.get('qb_save_research')!
      expect(tool).toBeDefined()
      const args = {
        request_id: 'report-one',
        title: '阶段研究',
        summary: '已明确两个后续方向',
        findings: ['这是待核实认识'],
        openQuestions: ['还需要原始资料'],
        report: '这是一份由智能体提供的阶段性报告，来源与推断仍需要后续核实。',
        followups: [
          { title: '证据', question: '有哪些原始来源？' },
          { title: '冲突', question: '不同来源是否矛盾？' },
        ],
      }
      f.emit(sessionId, 'tool/call', { callId: 'save-one', name: tool.name })
      const value = await tool.execute(args, {
        callId: 'save-one',
        signal: new AbortController().signal,
      })
      expect(tool.output.render(args, value)).toBeDefined()
      f.emit(sessionId, 'tool/result', {
        message: {
          toolCallId: 'save-one',
          content: [{ type: 'text', text: '已保存阶段报告与两个方向' }],
        },
      })
      f.emit(sessionId, 'assistant/message', { stream: '已通过研究工具保存。' })
      f.emit(sessionId, 'turn/end', { reason: { kind: 'completed' } })
    })
    const run = await f.service.command({
      type: 'send-message',
      nodeId: f.nodeId,
      message: '保存并构建这两个方向',
    })
    const saved = await settle(f, run.id!)
    expect(saved.status).toBe('completed')
    expect(saved.agent?.activities[0].status).toBe('completed')
    expect(saved.agent?.activities[0].title).toBe('保存报告与研究方向')
    expect(saved.agent?.activities[0].content).toBe('已保存报告与 2 个研究方向')
    const snapshot = f.store.snapshot()
    expect(snapshot.nodes.filter((n) => n.parentId === f.nodeId)).toHaveLength(2)
    expect(snapshot.reports.find((r) => r.nodeId === f.nodeId)?.title).toBe('阶段研究')
    expect(f.tools.get(saved.agent!.sessionId!)?.size).toBe(0)
  })
  it('isolates other nodes and preserves saved work after cancellation', async () => {
    const f = fixture()
    f.respond(async (sessionId) => {
      await f.tools.get(sessionId)!.get('qb_save_research')!.execute(
        {
          request_id: 'before-stop',
          title: '已保存的阶段成果',
          summary: '停止不删除已保存资料',
          findings: [],
          openQuestions: [],
          report: '这份阶段成果已经通过事务保存，停止当前运行不撤销该报告。',
          followups: [],
        },
        { callId: 'save-before-stop', signal: new AbortController().signal },
      )
      f.events.emit('agent/assistant-stream', {
        agent: f.agents.get(sessionId),
        frame: {
          type: 'chunk',
          chunk: { type: 'text-delta', text: '尚未结束的公开回复' },
        },
      })
    })
    const run = await f.service.command({
      type: 'send-message',
      nodeId: f.nodeId,
      message: '研究一下',
    })
    await vi.waitFor(() =>
      expect(f.store.snapshot().reports.some((r) => r.nodeId === f.nodeId)).toBe(true),
    )
    const nativeId = f.bindings.get(f.nodeId).sessionId
    await f.service.command({ type: 'cancel-research', runId: run.id! })
    expect((await settle(f, run.id!)).status).toBe('cancelled')
    expect(f.store.run(run.id!).output).toContain('尚未结束的公开回复')
    expect(f.store.snapshot().reports.find((r) => r.nodeId === f.nodeId)?.model).toBe('research')
    expect(f.agents.get(nativeId)!.cancel).toHaveBeenCalled()
    expect(f.tools.get(nativeId)!.size).toBe(0)
    const another = f.store.createWorkspace('另一项独立研究')
    const anotherRoot = f.store.snapshot().workspaces.find((w) => w.id === another)!.rootId
    const next = await f.runtime.ensure(anotherRoot)
    expect(next).not.toBe(nativeId)
  })
  it('observes host approval without answering it and clears the waiting signal afterwards', async () => {
    const f = fixture()
    let release!: () => void
    const answered = new Promise<void>((resolve) => {
      release = resolve
    })
    f.respond(async (sessionId) => {
      const observer = f.events.listeners('approval/request')[0]
      await observer({ agent: f.agents.get(sessionId) }, () => answered)
      f.emit(sessionId, 'turn/end', { reason: { kind: 'completed' } })
    })
    const run = await f.service.command({
      type: 'send-message',
      nodeId: f.nodeId,
      message: '等待宿主确认',
    })
    await vi.waitFor(() => expect(f.store.run(run.id!).agent?.waitingForResponse).toBe(true))
    expect(f.store.run(run.id!).phase).toBe('等待在 DSH 中回应')
    release()
    expect((await settle(f, run.id!)).agent?.waitingForResponse).toBe(false)
  })
  it('validates shared commands, owns its storage and leaves credentials with DSH', async () => {
    const f = fixture()
    await expect(
      f.service.command({ type: 'edit-node', nodeId: f.nodeId, question: '' }),
    ).rejects.toThrow()
    await expect(
      f.service.command({ type: 'save-settings', settings: f.store.settings() }),
    ).rejects.toThrow('由 DSH 管理')
    const snapshot = f.service.snapshot()!
    expect(snapshot.storage.directory).toBe(f.directory)
    expect(snapshot.settings.backend).toBe('acp')
    expect(snapshot.settings.hasApiKey).toBe(false)
    await f.runtime.select(f.nodeId, {
      provider: 'fixture',
      model: 'research',
      reasoningEffort: 'high',
    })
    expect((await f.runtime.models(f.nodeId)).selection.reasoningEffort).toBe('high')
  })
})
