import React, { useEffect, useState, useCallback } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useAuth } from '@/contexts/AuthContext'
import { getRoleDisplayName } from '@/utils/auth'
import { api } from '@/services/api'
import { ArrowLeft, RefreshCw, MessageSquare, User, Clock, Tag, Send, CheckCircle, XCircle, Bell, UserCheck, UserX } from 'lucide-react'

interface TicketListItem {
  id: number
  public_id: string
  subject: string
  status: 'open' | 'awaiting_admin' | 'awaiting_user' | 'resolved' | 'closed'
  category: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  created_at: string
  last_activity_at: string
  message_count: number
  submitter: string  // 後端返回的是 submitter
  submitter_type: 'user' | 'guest'  // 後端返回的類型
  submitter_email?: string  // 後端返回的郵箱
  assigned_to?: number
  assignee_name?: string
  school?: string
  guest_verified?: boolean
  labels?: any[]
}

interface TicketMessage {
  id: number
  body: string
  author_type: string
  author_display_name: string
  created_at: string
}

interface TicketDetail extends TicketListItem {
  messages: TicketMessage[]
}

const statusPill = (s: TicketListItem['status']) => ({
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  awaiting_admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  awaiting_user: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  closed: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
}[s] || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300')

const priorityColor = (p: TicketListItem['priority']) => ({
  low: 'text-green-600 dark:text-green-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  high: 'text-orange-600 dark:text-orange-400',
  urgent: 'text-red-600 dark:text-red-400'
}[p] || 'text-muted')

const fmt = (s: string) => {
  try { return new Date(s).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s }
}

<<<<<<< Updated upstream
export default function AdminSupportPage() {
=======
/**
 *
 */
export default function AdminSupportPage() {
>>>>>>> Stashed changes
  const { role } = useAuth()
  const canAccess = ['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator'].includes(role || '')
  const canManage = ['dev_admin','campus_admin','cross_admin'].includes(role || '')

  const [list, setList] = useState<TicketListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketDetail | null>(null)

  const [filters, setFilters] = useState({
    status: '' as '' | TicketListItem['status'],
    priority: '' as '' | TicketListItem['priority'],
    q: ''
  })

  const loadList = useCallback(async () => {
    if (!canAccess) return
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.priority) params.append('priority', filters.priority)
      if (filters.q) params.append('q', filters.q)
      const resp = await api<{ ok:boolean; tickets: TicketListItem[] }>(`/api/admin/support/tickets?${params.toString()}`)
      setList(resp?.tickets || [])
    } catch (e:any) {
      setError(e?.message || '載入支援單失敗')
    } finally {
      setLoading(false)
    }
  }, [canAccess, filters])

  const loadDetail = useCallback(async (publicId: string) => {
    try {
      setError(null)
      const resp = await api<{ ok:boolean; ticket: TicketDetail }>(`/api/admin/support/tickets/${publicId}`)
      setSelected(resp.ticket)
    } catch (e:any) {
      setError(e?.message || '載入詳情失敗')
    }
  }, [])

<<<<<<< Updated upstream
  const [reply, setReply] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyErr, setReplyErr] = useState('')
=======
  const [reply, setReply] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyErr, setReplyErr] = useState('')
>>>>>>> Stashed changes
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignLoading, setAssignLoading] = useState(false)
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [isDevAdmin] = useState(() => role === 'dev_admin')
  
  const [showNotification, setShowNotification] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [notificationType, setNotificationType] = useState<'success' | 'error'>('success')
  
  const submitReply = useCallback(async () => {
    if (!selected || !reply.trim()) return
    if (!canManage) return
    try {
      setReplyLoading(true)
      await api(`/api/admin/support/tickets/${selected.public_id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim(), internal: false })
      })
      setReply('')
      await loadDetail(selected.public_id)
      await loadList()
    } catch (e) {
      setError('回覆失敗')
    } finally {
      setReplyLoading(false)
    }
  }, [selected, reply, loadDetail, loadList, canManage])

  const updateStatus = useCallback(async (status: TicketListItem['status']) => {
    if (!selected) return
    if (!canManage) return
    try {
      await api(`/api/admin/support/tickets/${selected.public_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      await loadDetail(selected.public_id)
      await loadList()
    } catch (e) {
      setError('狀態更新失敗')
    }
  }, [selected, loadDetail, loadList, canManage])

<<<<<<< Updated upstream
  const loadAdminUsers = useCallback(async () => {
    try {
      // 改用後端提供的管理端使用者清單（避免 404）
      const resp = await api<{ users: any[] }>(
        '/api/admin/chat/admin-users'
      )
      const users = (resp.users || []).filter((u:any)=> ['campus_admin','cross_admin','dev_admin'].includes(u.role))
      setAdminUsers(users)
    } catch (e) {
      console.error('載入管理員列表失敗:', e)
    }
  }, [])
=======
  const loadAdminUsers = useCallback(async () => {
    try {
      const resp = await api<{ users: any[] }>(
        '/api/admin/chat/admin-users'
      )
      const users = (resp.users || []).filter((u:any)=> ['campus_admin','cross_admin','dev_admin'].includes(u.role))
      setAdminUsers(users)
    } catch (e) {
      console.error('載入管理員列表失敗:', e)
    }
  }, [])
>>>>>>> Stashed changes

  const assignToAdmin = useCallback(async (adminUserId: number) => {
    if (!selected) return
    try {
      setAssignLoading(true)
      await api(`/api/admin/support/tickets/${selected.public_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: adminUserId })
      })
      await loadDetail(selected.public_id)
      await loadList()
      setShowAssignModal(false)
      
      const adminUser = adminUsers.find(u => u.id === adminUserId)
      if (adminUser) {
        setNotificationMessage(`已成功指派給 ${adminUser.username}`)
        setNotificationType('success')
        setShowNotification(true)
        
        setTimeout(() => setShowNotification(false), 3000)
      }
    } catch (e) {
      setError('指派失敗')
      setNotificationMessage('指派失敗')
      setNotificationType('error')
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 3000)
    } finally {
      setAssignLoading(false)
    }
  }, [selected, loadDetail, loadList, adminUsers])

  const removeAssignment = useCallback(async () => {
    if (!selected) return
    try {
      setAssignLoading(true)
      await api(`/api/admin/support/tickets/${selected.public_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to: null })
      })
      await loadDetail(selected.public_id)
      await loadList()
      
      setNotificationMessage('已移除指派')
      setNotificationType('success')
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 3000)
    } catch (e) {
      setError('移除指派失敗')
      setNotificationMessage('移除指派失敗')
      setNotificationType('error')
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 3000)
    } finally {
      setAssignLoading(false)
    }
  }, [selected, loadDetail, loadList])

  useEffect(() => { loadList() }, [loadList])

  if (!canAccess) return null

  const getStatusDisplay = (status: TicketListItem['status']) => {
    switch (status) {
      case 'open':
        return '開啟'
      case 'awaiting_admin':
        return '待處理'
      case 'awaiting_user':
        return '待回覆'
      case 'resolved':
        return '已解決'
      case 'closed':
        return '已關閉'
      default:
        return status
    }
  }

  // 第二排：狀態選單用
  const [statusChoice, setStatusChoice] = useState<TicketListItem['status']>('open')
  useEffect(() => {
    if (selected?.status) setStatusChoice(selected.status)
  }, [selected?.status])

  const [statusChoice, setStatusChoice] = useState<TicketListItem['status']>('open')
  useEffect(() => {
    if (selected?.status) setStatusChoice(selected.status)
  }, [selected?.status])

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/support" />
      <MobileBottomNav />

      
      {showNotification && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 ${
          notificationType === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {notificationMessage}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => window.history.back()} className="flex items-center gap-2 text-muted hover:text-fg transition-colors">
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold dual-text">客服管理</h1>
            <p className="text-sm text-muted mt-1">管理並回覆用戶支援單</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-4 shadow-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                支援單列表
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              </h2>
              <button onClick={loadList} className="p-2 text-muted hover:text-fg transition-colors" disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            
            <div className="mb-4 p-3 bg-surface-hover rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  className="form-control form-control--compact flex-1"
                  placeholder="搜尋主旨/使用者/Email"
                  value={filters.q}
                  onChange={(e) => setFilters(prev => ({ ...prev, q: e.target.value }))}
                />
                <select
                  className="form-control form-control--compact flex-1"
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                >
                  <option value="">所有狀態</option>
                  <option value="open">開啟</option>
                  <option value="awaiting_admin">等待處理</option>
                  <option value="awaiting_user">等待用戶回覆</option>
                  <option value="resolved">已解決</option>
                  <option value="closed">已關閉</option>
                </select>
                <select
                  className="form-control form-control--compact flex-1"
                  value={filters.priority}
                  onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value as any }))}
                >
                  <option value="">所有優先級</option>
                  <option value="urgent">緊急</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              {!canManage && (
                <div className="mt-2 text-xs text-muted">唯讀模式：僅可檢視，無法回覆或變更狀態</div>)
              }
            </div>

            
            <div className="space-y-3">
              {error && <div className="text-sm text-red-600">{error}</div>}
              {list.length === 0 ? (
                <div className="text-center py-8 text-muted">暫無支援單</div>
              ) : (
                list.map((t) => (
                  <div
                    key={t.public_id}
                    className={`p-4 rounded-xl border border-border cursor-pointer transition-colors relative ${
                      selected?.public_id === t.public_id ? 'ring-2 ring-primary bg-primary/5' : 'bg-surface-hover hover:bg-surface'
                    }`}
                    onClick={() => loadDetail(t.public_id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">#{t.public_id.slice(-6)}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusPill(t.status)}`}>
                          {getStatusDisplay(t.status)}
                        </span>
                        <span className={`text-xs ${priorityColor(t.priority)}`}>
                          {t.priority === 'low' ? '低' : t.priority === 'medium' ? '中' : t.priority === 'high' ? '高' : '緊急'}
                        </span>
                        
                        {t.assigned_to && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {t.assignee_name || '已指派'}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">
                        <Clock className="inline w-3 h-3 mr-1" />
                        {fmt(t.last_activity_at)}
                      </span>
                    </div>
                    <div className="mb-2 text-sm line-clamp-2 font-medium">{t.subject}</div>
                    <div className="flex items-center gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{t.submitter_type === 'user' ? t.submitter : t.submitter_email || '匿名'}</span>
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{t.category}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t.message_count} 則訊息</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          
          <div className="space-y-6">
            {!selected ? (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft text-center text-muted">選取左側一筆支援單以檢視詳情</div>
            ) : (
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <h3 className="text-lg font-semibold text-fg mb-4">支援單詳情</h3>

                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium">主旨</div>
                    <div className="text-sm text-fg">{selected.subject}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-muted">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(selected.status)}`}>
                        {getStatusDisplay(selected.status)}
                      </span>
                      <span className={priorityColor(selected.priority)}>
                        {selected.priority === 'low' ? '低' : selected.priority === 'medium' ? '中' : selected.priority === 'high' ? '高' : '緊急'}
                      </span>
                    </div>
                    <div className="text-right">
                      <Clock className="inline w-3 h-3 mr-1" />{fmt(selected.created_at)}
                    </div>
                  </div>

                  
                  {selected.assigned_to && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-blue-600" />
                          <div>
                            <div className="text-sm font-medium text-blue-800 dark:text-blue-200">已指派給</div>
                            <div className="text-sm text-blue-700 dark:text-blue-300">{selected.assignee_name || '未知用戶'}</div>
                          </div>
                        </div>
                        {isDevAdmin && (
                          <button
                            onClick={removeAssignment}
                            disabled={assignLoading}
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                            title="移除指派"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {selected.messages.map(m => (
                      <div key={m.id} className={`p-3 rounded-lg ${
                        (m.author_type || '').toLowerCase() === 'admin'
                          ? 'bg-blue-50 border-l-4 border-blue-500 dark:bg-blue-900/20'
                          : 'bg-surface border border-border'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              (m.author_type || '').toLowerCase() === 'admin'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                            }`}>
                              {(m.author_type || '').toLowerCase() === 'admin' ? '管理員' : '用戶'}
                            </span>
                            <span className="text-xs font-medium">{m.author_display_name}</span>
                          </div>
                          <span className="text-[11px] text-muted">{fmt(m.created_at)}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                      </div>
                    ))}
                  </div>

<<<<<<< Updated upstream
                  {/* 操作區：兩排佈局 */}
                  <div className="mt-3 space-y-2">
                    {/* 排 1：回覆輸入 + 送出（2:1） */}
                    {selected.status !== 'closed' && (
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={reply}
                          onChange={(e) => { setReply(e.target.value); setReplyErr('') }}
                          className="col-span-2 px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg text-sm w-full"
                          placeholder="輸入回覆內容…"
                          maxLength={10000}
                          disabled={!canManage}
                        />
                        <div className="flex flex-col items-end gap-1">
                          <button onClick={submitReply} disabled={!canManage || !reply.trim() || replyLoading} className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-sm disabled:opacity-50 w-full">
                            {replyLoading ? '發送中…' : '送出回覆'}
                          </button>
                          {replyErr && <span className="text-danger text-xs">{replyErr}</span>}
                        </div>
                      </div>
                    )}

                    {/* 排 2：狀態選單 + 更新 + 指派（1:1:1） */}
                    <div className="grid grid-cols-3 gap-2">
                      <select value={statusChoice} onChange={(e)=> setStatusChoice(e.target.value as TicketListItem['status'])} className="px-3 py-2 rounded-lg border border-border bg-surface text-sm w-full">
                        <option value="open">開啟</option>
                        <option value="awaiting_admin">待處理</option>
                        <option value="awaiting_user">待回覆</option>
                        <option value="resolved">已解決</option>
                        <option value="closed">已關閉</option>
                      </select>
                      <button onClick={() => updateStatus(statusChoice)} disabled={!canManage} className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm w-full">更新狀態</button>
                      {isDevAdmin && (
                        <button 
                          onClick={() => { loadAdminUsers(); setShowAssignModal(true) }}
                          disabled={!canManage}
                          className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm w-full"
                        >
                          指派/轉單
                        </button>
                      )}
                      {!isDevAdmin && (
                        <div className="w-full" />
                      )}
                    </div>
                  </div>
=======
                  
                  <div className="mt-3 space-y-2">
                    
                    {selected.status !== 'closed' && (
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={reply}
                          onChange={(e) => { setReply(e.target.value); setReplyErr('') }}
                          className="col-span-2 px-3 py-2 border border-border rounded-lg bg-surface-hover text-fg text-sm w-full"
                          placeholder="輸入回覆內容…"
                          maxLength={10000}
                          disabled={!canManage}
                        />
                        <div className="flex flex-col items-end gap-1">
                          <button onClick={submitReply} disabled={!canManage || !reply.trim() || replyLoading} className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 text-sm disabled:opacity-50 w-full">
                            {replyLoading ? '發送中…' : '送出回覆'}
                          </button>
                          {replyErr && <span className="text-danger text-xs">{replyErr}</span>}
                        </div>
                      </div>
                    )}

                    
                    <div className="grid grid-cols-3 gap-2">
                      <select value={statusChoice} onChange={(e)=> setStatusChoice(e.target.value as TicketListItem['status'])} className="px-3 py-2 rounded-lg border border-border bg-surface text-sm w-full">
                        <option value="open">開啟</option>
                        <option value="awaiting_admin">待處理</option>
                        <option value="awaiting_user">待回覆</option>
                        <option value="resolved">已解決</option>
                        <option value="closed">已關閉</option>
                      </select>
                      <button onClick={() => updateStatus(statusChoice)} disabled={!canManage} className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm w-full">更新狀態</button>
                      {isDevAdmin && (
                        <button 
                          onClick={() => { loadAdminUsers(); setShowAssignModal(true) }}
                          disabled={!canManage}
                          className="px-3 py-2 rounded-lg border bg-surface hover:bg-surface-hover text-sm w-full"
                        >
                          指派/轉單
                        </button>
                      )}
                      {!isDevAdmin && (
                        <div className="w-full" />
                      )}
                    </div>
                  </div>
>>>>>>> Stashed changes
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-dramatic">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold dual-text">指派給管理員</h2>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-muted">
                選擇要指派此支援單的管理員，他們將能夠看到並處理此支援單。
              </p>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {adminUsers.length === 0 ? (
                  <div className="text-center text-muted py-4">
                    載入中...
                  </div>
                ) : (
                  adminUsers.map((admin) => (
                    <button
                      key={admin.id}
                      onClick={() => assignToAdmin(admin.id)}
                      disabled={assignLoading}
                      className="w-full p-3 text-left bg-surface-hover rounded-lg border border-border hover:bg-surface transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-fg">{admin.username}</div>
                          <div className="text-sm text-muted">
                            {getRoleDisplayName(admin.role)} • {admin.school?.name || '無學校'}
                          </div>
                        </div>
                        {assignLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
<<<<<<< Updated upstream
}
=======
}
>>>>>>> Stashed changes
