declare module '@deepseek-ai/dsh-typert-protocol' {
  export class TypertRemoteService {
    readonly ctx: import('./contracts').DshContext
    constructor(ctx: import('./contracts').DshContext, key: string)
  }
  export function Remote(
    method: unknown,
    context: {
      kind: 'method'
      name: string
      private: boolean
      static: boolean
      addInitializer(initializer: (this: object) => void): void
    },
  ): void
}
declare module '@deepseek-ai/dsh-home-paths' {
  export function resolveDshHome(): string
}
declare module '@deepseek-ai/dsh-llm' {
  export function joinAssistantStreamText(stream: unknown): string
}
