import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ResearchStore } from '../desktop/store'
import { researchTools, researchToolSpecifications } from '../desktop/research-tools'
import type { AgentRun } from '../research/agent'
import type { ResearchRun } from '../research/types'
import { DshBindings } from './bindings'
import type { DshAgent, DshContext, Disposer, HostSelection } from './contracts'

type Turn = {
  runId: string
  sessionId: string
  signal: AbortSignal
  agent: AgentRun
  committed: string
  live: string
  finish(error?: Error): void
  toolDisposers: Disposer[]
  mounted?: DshAgent
  lastWrite: number
  publishTimer?: ReturnType<typeof setTimeout>
  approvals: number
}
type Creation = { promise: Promise<string>; abort: AbortController; readers: number }

/** Detach a caller from an unabortable Host call; always observe late rejection. */
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
    if (signal.aborted) abort()
  })
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const toolTitles = new Map<string, string>(
  Object.values(researchToolSpecifications).map((tool) => [tool.name, tool.title]),
)
const textContent = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((p) => {
          const part = object(p)
          return part.type === 'text' ? String(part.text ?? '') : ''
        })
        .join('\n')
    : ''

/** Uses the already running Host. No ACP process, model key, or second compactor. */
export class DshRuntime {
  private turns = new Map<string, Turn>()
  private subscriptions: Disposer[]
  private creating = new Map<string, Creation>()
  private selections = new Map<string, Promise<void>>()
  private lifetime = new AbortController()
  constructor(
    private ctx: DshContext,
    private store: ResearchStore,
    private bindings: DshBindings,
    private cwd: string,
    private publicText: (stream: unknown) => string,
  ) {
    this.subscriptions = [
      ctx.on(
        'agent/created',
        ({ agent }) => {
          const turn = this.turns.get(agent.id)
          if (turn) this.mountTools(turn, agent)
        },
        { global: true },
      ),
      ctx.on(
        'agent/assistant-stream',
        ({ agent, frame }) => {
          const turn = this.turns.get(agent.id)
          if (!turn || turn.signal.aborted) return
          if (frame.type === 'start') turn.live = ''
          const chunk = object(frame.chunk)
          if (frame.type === 'chunk' && chunk.type === 'text-delta') {
            turn.live += String(chunk.text ?? '')
            const delay = 350 - (Date.now() - turn.lastWrite)
            if (delay <= 0) this.publish(turn)
            else if (!turn.publishTimer)
              turn.publishTimer = setTimeout(() => this.publish(turn), delay)
          }
        },
        { global: true },
      ),
      ctx.on(
        'session/event',
        (session, event) => {
          const turn = this.turns.get(session.id)
          if (!turn || turn.signal.aborted) return
          const data = event.data
          if (event.type === 'assistant/message') {
            const text = this.publicText(data.stream)
            if (text) turn.committed += (turn.committed ? '\n\n' : '') + text
            turn.live = ''
          } else if (event.type === 'tool/call') {
            turn.agent.activities.push({
              id: String(data.callId),
              title: toolTitles.get(String(data.name)) ?? String(data.name),
              kind: 'tool',
              status: 'in_progress',
              content: '',
            })
          } else if (event.type === 'tool/result') {
            const message = object(data.message)
            const activity = turn.agent.activities.find((a) => a.id === message.toolCallId)
            if (activity) {
              activity.status = message.isError ? 'failed' : 'completed'
              activity.content ||= textContent(message.content).slice(0, 20000)
            }
          } else if (event.type === 'turn/end') {
            const reason = object(data.reason)
            const ok = reason.kind === 'completed'
            this.publish(turn)
            turn.finish(
              ok ? undefined : new Error(`DSH 运行结束：${String(reason.kind ?? 'unknown')}`),
            )
            return
          }
          this.publish(turn)
        },
        { global: true },
      ),
      ctx.on(
        'approval/request',
        async (request, next) => {
          const turn = request.agent ? this.turns.get(request.agent.id) : undefined
          if (turn) {
            turn.approvals++
            this.publish(turn)
          }
          try {
            return await next()
          } finally {
            if (turn) {
              turn.approvals--
              this.publish(turn)
            }
          }
        },
        { global: true },
      ),
    ]
  }
  async ensure(nodeId: string, requestSignal: AbortSignal = this.lifetime.signal): Promise<string> {
    const signal = AbortSignal.any([requestSignal, this.lifetime.signal])
    signal.throwIfAborted()
    if (this.store.node(nodeId).removedAt) throw new Error('此研究分支已移除')
    const known = this.bindings.get(nodeId)
    if (known) return known.sessionId
    let creation = this.creating.get(nodeId)
    if (!creation) {
      const abort = new AbortController()
      const preparing = AbortSignal.any([abort.signal, this.lifetime.signal])
      const promise = (async () => {
        const catalog = await waitFor(this.ctx.sessionController.modelCatalog(), preparing)
        preparing.throwIfAborted()
        const { sessionId } = await waitFor(
          this.ctx.sessionController.create({ cwd: this.cwd }),
          preparing,
        )
        preparing.throwIfAborted()
        if (this.store.node(nodeId).removedAt) throw new Error('此研究分支已移除')
        this.bindings.save(nodeId, { sessionId, materialDigest: '', selection: catalog.default })
        return sessionId
      })()
      creation = { promise, abort, readers: 0 }
      this.creating.set(nodeId, creation)
    }
    creation.readers++
    try {
      return await waitFor(creation.promise, signal)
    } finally {
      // A cancelled run must not cancel a model picker sharing the same creation.
      if (--creation.readers === 0) {
        if (this.creating.get(nodeId) === creation) this.creating.delete(nodeId)
        creation.abort.abort(new Error('研究会话准备已取消'))
      }
    }
  }
  async models(nodeId: string) {
    this.lifetime.signal.throwIfAborted()
    this.store.node(nodeId)
    const catalog = await waitFor(this.ctx.sessionController.modelCatalog(), this.lifetime.signal)
    return { catalog, selection: this.bindings.get(nodeId)?.selection ?? catalog.default }
  }
  async select(nodeId: string, selection: HostSelection) {
    this.lifetime.signal.throwIfAborted()
    if (this.selections.has(nodeId)) throw new Error('正在切换模型，请稍后再试')
    const update = (async () => {
      const sessionId = await this.ensure(nodeId)
      if (this.turns.has(sessionId)) throw new Error('请等待当前研究结束后切换模型')
      await waitFor(
        this.ctx.sessionController.selectModel({ sessionId, ...selection }),
        this.lifetime.signal,
      )
      this.lifetime.signal.throwIfAborted()
      this.bindings.select(nodeId, selection)
    })()
    this.selections.set(nodeId, update)
    try {
      await update
    } finally {
      this.selections.delete(nodeId)
    }
  }
  private publish(turn: Turn) {
    clearTimeout(turn.publishTimer)
    turn.publishTimer = undefined
    if (this.lifetime.signal.aborted) return
    const run = this.store.run(turn.runId)
    if (run.status !== 'running') return
    turn.lastWrite = Date.now()
    turn.agent.waitingForResponse = turn.approvals > 0
    this.store.saveRun({
      ...run,
      agent: structuredClone(turn.agent),
      output: turn.committed + (turn.live ? (turn.committed ? '\n\n' : '') + turn.live : ''),
      phase:
        turn.approvals > 0
          ? '等待在 DSH 中回应'
          : turn.agent.activities.some((a) => a.status === 'in_progress')
            ? '正在调用工具'
            : turn.committed || turn.live
              ? '正在回复'
              : 'DSH 正在研究',
    })
  }
  private mountTools(turn: Turn, agent: DshAgent) {
    if (turn.mounted === agent) return
    turn.mounted = agent
    for (const tool of researchTools(this.store, turn.runId, turn.signal).filter(
      (t) => this.store.run(turn.runId).mode === 'chat' || t.readOnly,
    )) {
      turn.toolDisposers.push(
        agent.ctx.tools.register({
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.parameters),
          output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
          },
          execute: (args, execution) => {
            if (
              execution.signal.aborted ||
              turn.signal.aborted ||
              this.store.run(turn.runId).status !== 'running'
            )
              throw new Error('本轮研究已结束')
            const outcome = tool.execute(args)
            const activity = turn.agent.activities.find((a) => a.id === execution.callId)
            if (activity) {
              activity.content = outcome.summary
              if (outcome.undo) activity.undo = outcome.undo
            }
            return outcome.value
          },
        }),
      )
    }
  }
  async run(run: ResearchRun, requestSignal: AbortSignal) {
    const signal = AbortSignal.any([requestSignal, this.lifetime.signal])
    const sessionId = await this.ensure(run.nodeId, signal)
    await waitFor(this.selections.get(run.nodeId) ?? Promise.resolve(), signal)
    signal.throwIfAborted()
    if (this.turns.has(sessionId)) throw new Error('此 DSH 会话仍在研究')
    const binding = this.bindings.get(run.nodeId)!
    this.store.saveRun({ ...this.store.run(run.id), model: binding.selection.model })
    const material = run.context.messages
      .slice(0, 2)
      .map((p) => `[${p.role}]\n${p.content}`)
      .join('\n\n')
    const digest = createHash('sha256').update(material).digest('hex')
    const bootstrap = !binding.materialDigest
    const history = bootstrap
      ? run.context.messages
          .slice(2, -1)
          .map((p) => `[${p.role}]\n${p.content}`)
          .join('\n\n')
      : ''
    const prompt = [
      bootstrap || binding.materialDigest !== digest
        ? `以下是 QB 当前研究材料快照，替代此前外部材料；保留会话原文。研究成果仅在 qb_save_research 成功后视为保存。\n\n${material}`
        : '',
      history ? `此前本节点的公开对话：\n${history}` : '',
      `用户本轮请求：\n${run.instruction}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    const request = {
      sessionId,
      requestId: run.id,
      content: [{ type: 'text' as const, text: prompt }],
    }
    let settle!: (error?: Error) => void
    const completion = new Promise<void>((resolve, reject) => {
      settle = (error) => (error ? reject(error) : resolve())
    })
    // Observe rejection immediately: prompt admission can outlive cancellation.
    void completion.catch(() => {})
    const turn: Turn = {
      runId: run.id,
      sessionId,
      signal,
      agent: {
        name: 'DeepSeek Harness',
        sessionId,
        configuration: { ...binding.selection },
        activities: [],
        requests: [],
        input: {
          request,
          submittedAt: new Date().toISOString(),
          materials: {
            digest,
            previousDigest: binding.materialDigest,
            included: bootstrap || binding.materialDigest !== digest,
            historyIncluded: !!history,
          },
        },
      },
      committed: '',
      live: '',
      finish: settle,
      toolDisposers: [],
      lastWrite: 0,
      approvals: 0,
    }
    this.turns.set(sessionId, turn)
    const live = this.ctx.agents.get(sessionId)
    if (live) this.mountTools(turn, live)
    const abort = () => {
      this.publish(turn)
      this.ctx.agents.get(sessionId)?.cancel({ kind: 'user' })
      settle(new Error('研究已取消'))
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      this.publish(turn)
      await waitFor(this.ctx.sessionController.prompt(request, signal), signal)
      signal.throwIfAborted()
      turn.agent.input!.acceptedAt = new Date().toISOString()
      this.bindings.save(run.nodeId, { ...binding, materialDigest: digest })
      await completion
      this.publish(turn)
      return { model: binding.selection.model, sessionId }
    } finally {
      clearTimeout(turn.publishTimer)
      signal.removeEventListener('abort', abort)
      // Cancel drains before removing tools. Saved domain operations remain saved.
      if (signal.aborted)
        await waitFor(
          this.ctx.agents.get(sessionId)?.whenIdle() ?? Promise.resolve(),
          this.lifetime.signal,
        ).catch(() => {})
      for (const dispose of turn.toolDisposers.reverse()) await dispose()
      this.turns.delete(sessionId)
    }
  }
  async close() {
    if (this.lifetime.signal.aborted) return
    this.lifetime.abort(new Error('DSH 插件已关闭'))
    for (const turn of this.turns.values()) {
      this.ctx.agents.get(turn.sessionId)?.cancel({ kind: 'user' })
      turn.finish(new Error('DSH 插件已关闭'))
    }
    for (const dispose of this.subscriptions.reverse()) await dispose()
  }
}
