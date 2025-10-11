import { useEffect, useState } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { AlertTriangle, Edit, MessageSquare, Calendar, Eye, RefreshCw } from 'lucide-react'
import { formatLocalMinute } from '@/utils/time'
import { HttpError, getJSON } from '@/lib/http'
import ErrorPage from '@/components/ui/ErrorPage'

interface ViolationItem {
  id: number
  content: string
  created_at: string
  updated_at: string
  post: {
    id: number
    content: string
  }
}

/**
 *
 */
export default function MyViolationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [violations, setViolations] = useState<ViolationItem[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadViolations = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await getJSON<{
        ok: boolean
        items: ViolationItem[]
      }>('/api/comments/my-violations')

      if (response.ok) {
        setViolations(response.items || [])
      } else {
        throw new Error('載入失敗')
      }
    } catch (e) {
      if (e instanceof HttpError) {
        setError(e.message)
      } else {
        setError('載入失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (violation: ViolationItem) => {
    setEditingId(violation.id)
    setEditContent(violation.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const submitEdit = async () => {
    if (!editingId || !editContent.trim()) return

    try {
      setSubmitting(true)
      const response = await fetch(`/api/admin/comments/${editingId}/resubmit`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')||''}` 
        },
        body: JSON.stringify({ content: editContent.trim() })
      })

      if (!response.ok) throw new Error('提交失敗')

      await loadViolations()
      setEditingId(null)
      setEditContent('')
    } catch (e) {
      setError('提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    loadViolations()
  }, [])

  if (error) {
    return <ErrorPage title="載入失敗" message={error} />
  }

  return (
    <div className="min-h-screen bg-base">
      <NavBar pathname="/my-violations" />
      
      <div className="container mx-auto px-4 py-6 max-w-4xl pt-20 sm:pt-24 md:pt-28">
        <div className="flex flex-col gap-6">
          
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-fg flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              我的違規留言
              <span className="text-sm px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                {violations.length} 則留言
              </span>
            </h1>
            <button
              onClick={loadViolations}
              className="btn-secondary px-3 py-2 flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-2">違規留言處理說明：</p>
                <ul className="space-y-1">
                  <li>• 您的留言因違反社群規範被標記為違規並自動下架</li>
                  <li>• 您可以修改留言內容後重新提交審核</li>
                  <li>• 重新提交的留言將進入待審核狀態</li>
                  <li>• 如果多次違規，您的帳號可能會受到限制</li>
                </ul>
              </div>
            </div>
          </div>

          
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-muted">載入中...</p>
              </div>
            ) : violations.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-muted">您目前沒有違規留言</p>
              </div>
            ) : (
              <>
                {violations.map(violation => (
                  <div key={violation.id} className="bg-surface border border-border rounded-xl p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-fg">留言 #{violation.id}</span>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            違規
                          </span>
                        </div>
                        
                        {editingId === violation.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              placeholder="修改留言內容..."
                              className="w-full p-3 bg-surface-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={submitEdit}
                                disabled={submitting || !editContent.trim()}
                                className="btn-primary px-4 py-2 text-sm"
                              >
                                {submitting ? '提交中...' : '提交修改'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={submitting}
                                className="btn-secondary px-4 py-2 text-sm"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="prose prose-sm max-w-none mb-3">
                            <div className="text-fg whitespace-pre-line">
                              {violation.content}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            貼文 #{violation.post.id}
                          </span>
                          {violation.created_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatLocalMinute(violation.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {editingId !== violation.id && (
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => startEdit(violation)}
                            className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            修改
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  )
}
