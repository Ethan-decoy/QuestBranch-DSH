import { createElement, useLayoutEffect, useRef } from 'react'
import type { ClientContext } from './contracts'
import mark from '../ui/assets/c2-mark.svg?raw'

declare const __QUESTBRANCH_FRAME_HTML__: string

export const inject = ['slots', 'layout', 'connection']
export function apply(ctx: ClientContext) {
  function Workbench() {
    const frame = useRef<HTMLIFrameElement>(null)
    const identity = useRef(crypto.randomUUID())
    const html = useRef(__QUESTBRANCH_FRAME_HTML__.replace('__QB_CHANNEL__', identity.current))
    useLayoutEffect(() => {
      const lifetime = new AbortController()
      const channel = identity.current
      const targetOrigin = location.origin === 'null' ? '*' : location.origin
      const onMessage = (event: MessageEvent) => {
        if (
          event.source !== frame.current?.contentWindow ||
          event.data?.channel !== channel ||
          event.data?.kind !== 'qb-dsh-call'
        )
          return
        const { id, request } = event.data
        if (!Number.isSafeInteger(id) || !request || typeof request !== 'object') return
        void ctx.connection.rpc
          .call('/api', 'questbranch/request', { args: { payload: request } }, lifetime.signal)
          .then(
            (result) => {
              if (!lifetime.signal.aborted)
                frame.current?.contentWindow?.postMessage(
                  {
                    kind: 'qb-dsh-result',
                    channel,
                    id,
                    ...(result.ok
                      ? { value: result.value }
                      : { error: result.error?.message ?? 'DSH 调用失败' }),
                  },
                  targetOrigin,
                )
            },
            (error) => {
              if (!lifetime.signal.aborted)
                frame.current?.contentWindow?.postMessage(
                  {
                    kind: 'qb-dsh-result',
                    channel,
                    id,
                    error: error instanceof Error ? error.message : 'DSH 连接中断',
                  },
                  targetOrigin,
                )
            },
          )
      }
      const theme = () => {
        const dark = getComputedStyle(document.body).colorScheme.includes('dark')
        frame.current?.contentWindow?.postMessage(
          { kind: 'qb-dsh-theme', channel, dark },
          targetOrigin,
        )
      }
      window.addEventListener('message', onMessage)
      const observer = new MutationObserver(theme)
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-ds-dark-theme', 'style'],
      })
      frame.current?.addEventListener('load', theme)
      return () => {
        lifetime.abort()
        observer.disconnect()
        window.removeEventListener('message', onMessage)
        frame.current?.removeEventListener('load', theme)
      }
    }, [])
    return createElement('iframe', {
      ref: frame,
      title: 'QuestBranch 研究工作台',
      srcDoc: html.current,
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads',
      style: { display: 'block', width: '100%', height: '100%', border: 0, minHeight: 0 },
      'data-questbranch-workbench': true,
    })
  }
  function Icon() {
    return createElement('span', {
      'aria-hidden': true,
      style: {
        display: 'inline-block',
        width: 20,
        height: 20,
        backgroundColor: 'currentColor',
        maskImage: `url("data:image/svg+xml,${encodeURIComponent(mark)}")`,
        maskSize: 'contain',
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
      },
    })
  }
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: 'questbranch' }, Workbench),
  )
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: 'questbranch', order: 1, label: () => 'QuestBranch' },
      Icon,
    ),
  )
}
