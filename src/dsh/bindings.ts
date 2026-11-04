import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { HostSelection } from './contracts'

const bindingSchema = z.object({
  sessionId: z.string().min(1),
  materialDigest: z.string(),
  selection: z.object({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.string().optional(),
  }),
})
export type Binding = z.infer<typeof bindingSchema>

/** Host references only. Research, transcripts and reports stay in ResearchStore. */
export class DshBindings {
  private readonly path: string
  private values: Record<string, Binding>
  constructor(directory: string) {
    this.path = join(directory, 'dsh-sessions.json')
    this.values = existsSync(this.path)
      ? z.record(z.string(), bindingSchema).parse(JSON.parse(readFileSync(this.path, 'utf8')))
      : {}
  }
  get(nodeId: string) {
    return this.values[nodeId]
  }
  save(nodeId: string, binding: Binding) {
    const next = { ...this.values, [nodeId]: bindingSchema.parse(binding) }
    const temporary = `${this.path}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 })
    renameSync(temporary, this.path)
    this.values = next
  }
  select(nodeId: string, selection: HostSelection) {
    const current = this.get(nodeId)
    if (!current) throw new Error('研究会话尚未建立')
    this.save(nodeId, { ...current, selection })
  }
}
