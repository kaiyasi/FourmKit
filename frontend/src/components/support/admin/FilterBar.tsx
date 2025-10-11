import React from 'react'

interface FilterBarProps {
  search: string
  onSearch: (v: string) => void
  status: string
  onStatus: (v: string) => void
  category: string
  onCategory: (v: string) => void
  assignee: string
  onAssignee: (v: string) => void
}

export const FilterBar: React.FC<FilterBarProps> = ({
  search, onSearch,
  status, onStatus,
  category, onCategory,
  assignee, onAssignee,
}) => {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative md:col-span-2">
          <input
            type="text"
            value={search}
            onChange={(e)=>onSearch(e.target.value)}
            placeholder="搜尋：主旨 / 編號 / 用戶"
            className="w-full support-control bg-surface border border-border rounded-lg pl-3 pr-3 text-sm"
          />
        </div>
        <select value={status} onChange={(e)=>onStatus(e.target.value)} className="support-control bg-surface border border-border rounded-lg text-sm">
          <option value="all">所有狀態</option>
          <option value="open">開啟</option>
          <option value="awaiting_admin">等待管理員</option>
          <option value="awaiting_user">等待用戶</option>
          <option value="resolved">已解決</option>
          <option value="closed">已關閉</option>
        </select>
        <select value={category} onChange={(e)=>onCategory(e.target.value)} className="support-control bg-surface border border-border rounded-lg text-sm">
          <option value="all">所有分類</option>
          <option value="technical">技術問題</option>
          <option value="account">帳號問題</option>
          <option value="feature">功能建議</option>
          <option value="bug">錯誤報告</option>
          <option value="abuse">濫用舉報</option>
          <option value="other">其他</option>
        </select>
        <select value={assignee} onChange={(e)=>onAssignee(e.target.value)} className="support-control bg-surface border border-border rounded-lg text-sm">
          <option value="all">所有分配</option>
          <option value="me">分配給我</option>
          <option value="unassigned">未分配</option>
        </select>
      </div>
    </div>
  )
}

export default FilterBar

