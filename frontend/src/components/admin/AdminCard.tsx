import React from 'react'

type Badge = { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }

export interface AdminCardProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
  badges?: Badge[]
  content?: React.ReactNode
  footer?: React.ReactNode
  selected?: boolean
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
}

const badgeTone = (tone?: Badge['tone']) => {
  switch (tone) {
    case 'success': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
    case 'warning': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
    case 'danger':  return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300'
    case 'info':    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
    default:        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
  }
}

export default function AdminCard({ title, subtitle, meta, badges, content, footer, selected, disabled, interactive = true, onClick }: AdminCardProps) {
  return (
    <div
      className={`p-4 rounded-xl border border-border ${interactive ? 'cursor-pointer transition-colors' : ''} relative ${selected ? 'ring-2 ring-primary bg-primary/5' : 'bg-surface-hover hover:bg-surface'} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
    >
      <div className="flex items-start justify-between mb-2 gap-4">
        <div className="min-w-0">
          <div className="text-base font-medium text-fg truncate">{title}</div>
          {subtitle && <div className="mt-0.5 text-sm text-muted truncate">{subtitle}</div>}
        </div>
        {meta && <div className="text-xs text-muted shrink-0">{meta}</div>}
      </div>

      {badges && badges.length > 0 && (
        <div className="mb-2 -mt-1 flex items-center gap-1 flex-wrap">
          {badges.map((b, i) => (
            <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeTone(b.tone)}`}>{b.label}</span>
          ))}
        </div>
      )}

      {content && (
        <div className="text-sm text-fg/90 space-y-2">
          {content}
        </div>
      )}

      {footer && (
        <div className="mt-3 pt-3 border-t border-border/70 flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </div>
  )
}
