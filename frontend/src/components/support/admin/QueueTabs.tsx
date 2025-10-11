import React from 'react'

type QueueKey = 'inbox' | 'mine' | 'unassigned' | 'sla' | 'resolved' | 'closed'

/**
 *
 */
export interface QueueTabsProps {
  current: QueueKey
  counts?: Partial<Record<QueueKey, number>>
  onChange: (key: QueueKey) => void
}

const TabBtn: React.FC<{ active: boolean; onClick: () => void; label: string; count?: number }>
  = ({ active, onClick, label, count }) => (
  <button
    onClick={onClick}
    className={`px-3 support-control rounded-lg border ${active ? 'bg-surface-hover border-primary text-fg' : 'bg-surface border-border text-muted'} flex items-center gap-2`}
  >
    <span className="text-sm font-medium">{label}</span>
    {typeof count === 'number' && (
      <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-md text-xs bg-info-bg text-info-text border border-info-border">{count}</span>
    )}
  </button>
)

export const QueueTabs: React.FC<QueueTabsProps> = ({ current, counts, onChange }) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <TabBtn active={current==='inbox'} label="收件匣" onClick={() => onChange('inbox')} count={counts?.inbox} />
      <TabBtn active={current==='mine'} label="我的" onClick={() => onChange('mine')} count={counts?.mine} />
      <TabBtn active={current==='unassigned'} label="未分配" onClick={() => onChange('unassigned')} count={counts?.unassigned} />
      <TabBtn active={current==='sla'} label="SLA 風險" onClick={() => onChange('sla')} count={counts?.sla} />
      <TabBtn active={current==='resolved'} label="已解決" onClick={() => onChange('resolved')} count={counts?.resolved} />
      <TabBtn active={current==='closed'} label="已關閉" onClick={() => onChange('closed')} count={counts?.closed} />
    </div>
  )
}

export default QueueTabs

