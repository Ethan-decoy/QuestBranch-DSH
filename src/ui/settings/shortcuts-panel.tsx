import { Feedback } from '../components'
import { modifierKey, useShortcuts, type SendShortcut } from '../shortcuts'

export function ShortcutsPanel() {
  const { sendMessage, persistent, chooseSend } = useShortcuts()
  return (
    <>
      <h3 className="settings-section-title">对话</h3>
      <div className="settings-preference-group">
        <div className="settings-preference-row">
          <strong>发送消息</strong>
          <select
            aria-label="发送消息快捷键"
            value={sendMessage}
            onChange={(event) => chooseSend(event.target.value as SendShortcut)}
          >
            <option value="enter">Enter</option>
            <option value="mod-enter">{modifierKey} + Enter</option>
          </select>
        </div>
        <div className="settings-preference-row">
          <strong>换行</strong>
          <kbd>{sendMessage === 'enter' ? 'Shift + Enter' : 'Enter'}</kbd>
        </div>
      </div>
      <h3 className="settings-section-title shortcuts-heading">工作台</h3>
      <div className="settings-preference-group">
        {(
          [
            ['搜索研究', `${modifierKey} + K`],
            ['打开设置', `${modifierKey} + ,`],
            ['关闭面板', 'Esc'],
          ] as const
        ).map(([label, keys]) => (
          <div className="settings-preference-row" key={label}>
            <strong>{label}</strong>
            <kbd>{keys}</kbd>
          </div>
        ))}
      </div>
      {!persistent && <Feedback tone="error">快捷键仅在当前窗口生效，无法保存到本机。</Feedback>}
    </>
  )
}
