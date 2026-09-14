import type { ReactNode } from 'react'

/** 通用设置控件 —— 模块级定义，避免在 App 内联导致每次渲染重挂载（输入框失焦） */

export function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' on' : ''}`}
      onClick={onToggle}
    >
      <i />
    </button>
  )
}

export function SettingRow({
  label,
  children,
  right,
}: {
  label: string
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-label">{label}</div>
      <div className="setting-control">{children}</div>
      {right != null && <div className="setting-right">{right}</div>}
    </div>
  )
}
