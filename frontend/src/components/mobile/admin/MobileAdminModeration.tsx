import React, { useState, useEffect } from 'react'
import { MobileAdminLayout } from './MobileAdminLayout'
import { MobileAdminCard, MobileAdminStatCard } from './MobileAdminCard'
import { 
  ShieldCheck, 
  FileText, 
  Image, 
  MessageSquare, 
  User, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MoreVertical,
  Filter,
  Search,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'

interface ModerationItem {
  id: number
  type: 'post' | 'media' | 'delete_request'
  content?: string
  excerpt?: string
  fileName?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  author: {
    username: string
    schoolName?: string
  }
  priority?: 'low' | 'medium' | 'high'
  processing?: boolean
}

interface ModerationStats {
  pending: number
  processed: number
  approved: number
  rejected: number
}

export function MobileAdminModeration() {
  const [items, setItems] = useState<ModerationItem[]>([])
  const [stats, setStats] = useState<ModerationStats>({
    pending: 0,
    processed: 0,
    approved: 0,
    rejected: 0
  })
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    status: 'pending' as 'all' | 'pending' | 'approved' | 'rejected',
    type: 'all' as 'all' | 'post' | 'media' | 'delete_request'
  })
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [showBatchActions, setShowBatchActions] = useState(false)

  // 模擬載入數據
  useEffect(() => {
    loadModerationData()
  }, [filter])

  const loadModerationData = async () => {
    setLoading(true)
    // 模擬 API 調用
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 模擬數據
    const mockItems: ModerationItem[] = [
      {
        id: 1,
        type: 'post',
        excerpt: '這是一個需要審核的貼文內容預覽...',
        status: 'pending',
        createdAt: new Date().toISOString(),
        author: { username: 'user123', schoolName: '台灣大學' },
        priority: 'high'
      },
      {
        id: 2,
        type: 'media',
        fileName: 'image.jpg',
        status: 'pending',
        createdAt: new Date().toISOString(),
        author: { username: 'user456', schoolName: '清華大學' },
        priority: 'medium'
      },
      {
        id: 3,
        type: 'delete_request',
        excerpt: '用戶申請刪除貼文的理由...',
        status: 'pending',
        createdAt: new Date().toISOString(),
        author: { username: 'user789', schoolName: '交通大學' },
        priority: 'low'
      }
    ]

    setItems(mockItems)
    setStats({
      pending: 12,
      processed: 145,
      approved: 132,
      rejected: 13
    })
    setLoading(false)
  }

  const handleApprove = async (itemId: number) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, processing: true }
        : item
    ))

    // 模擬 API 調用
    await new Promise(resolve => setTimeout(resolve, 1000))

    setItems(prev => prev.filter(item => item.id !== itemId))
    setStats(prev => ({ 
      ...prev, 
      pending: prev.pending - 1, 
      approved: prev.approved + 1 
    }))
  }

  const handleReject = async (itemId: number) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, processing: true }
        : item
    ))

    await new Promise(resolve => setTimeout(resolve, 1000))

    setItems(prev => prev.filter(item => item.id !== itemId))
    setStats(prev => ({ 
      ...prev, 
      pending: prev.pending - 1, 
      rejected: prev.rejected + 1 
    }))
  }

  const handleBatchApprove = async () => {
    const selectedArray = Array.from(selectedItems)
    for (const id of selectedArray) {
      await handleApprove(id)
    }
    setSelectedItems(new Set())
    setShowBatchActions(false)
  }

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'post': return <FileText className="w-4 h-4" />
      case 'media': return <Image className="w-4 h-4" />
      case 'delete_request': return <MessageSquare className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const getItemTitle = (item: ModerationItem) => {
    switch (item.type) {
      case 'post': return '貼文內容'
      case 'media': return `媒體檔案 - ${item.fileName}`
      case 'delete_request': return '刪文請求'
      default: return '未知項目'
    }
  }

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'high':
        return { text: '高優先級', variant: 'danger' as const }
      case 'medium':
        return { text: '中優先級', variant: 'warning' as const }
      case 'low':
        return { text: '低優先級', variant: 'info' as const }
      default:
        return undefined
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return '剛剛'
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小時前`
    return `${Math.floor(diffInMinutes / 1440)} 天前`
  }

  const filteredItems = items.filter(item => {
    if (filter.status !== 'all' && item.status !== filter.status) return false
    if (filter.type !== 'all' && item.type !== filter.type) return false
    return true
  })

  return (
    <MobileAdminLayout
      title="Moderation"
      subtitle="Moderation"
      showSearch={true}
      actions={
        <button 
          onClick={loadModerationData}
          disabled={loading}
          className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
      bottomContent={showBatchActions ? (
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted">
              已選擇 {selectedItems.size} 項
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedItems(new Set())
                  setShowBatchActions(false)
                }}
                className="px-4 py-2 text-sm font-medium text-muted border border-border rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleBatchApprove}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg"
              >
                批量通過
              </button>
            </div>
          </div>
        </div>
      ) : undefined}
    >
      {/* 統計概覽 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <MobileAdminStatCard
          title="待審核"
          value={stats.pending}
          change={stats.pending > 10 ? '+5' : undefined}
          trend={stats.pending > 10 ? 'up' : 'neutral'}
        />
        <MobileAdminStatCard
          title="今日處理"
          value={stats.processed}
          change="+12"
          trend="up"
        />
      </div>

      {/* 篩選器 */}
      <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Filter className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium text-fg">篩選條件</span>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-2">狀態</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="all">全部</option>
              <option value="pending">待審核</option>
              <option value="approved">已通過</option>
              <option value="rejected">已拒絕</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-muted mb-2">類型</label>
            <select
              value={filter.type}
              onChange={(e) => setFilter(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="all">全部</option>
              <option value="post">貼文</option>
              <option value="media">媒體</option>
              <option value="delete_request">刪文請求</option>
            </select>
          </div>
        </div>
      </div>

      {/* 批量操作提示 */}
      {stats.pending > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 dark:bg-blue-900/10 dark:border-blue-800/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
              批量處理
            </span>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
            長按項目進入選擇模式，可批量處理多個審核項目
          </p>
          <button
            onClick={() => setShowBatchActions(!showBatchActions)}
            className="text-xs font-medium text-blue-600 dark:text-blue-400"
          >
            {showBatchActions ? '退出' : '進入'}批量模式
          </button>
        </div>
      )}

      {/* 審核項目列表 */}
      <div className="space-y-3">
        {loading ? (
          // 載入骨架
          Array(3).fill(0).map((_, i) => (
            <MobileAdminCard key={i} title="" loading={true} />
          ))
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-8">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted mb-3" />
            <h3 className="font-medium text-fg mb-1">沒有審核項目</h3>
            <p className="text-sm text-muted">
              {filter.status === 'pending' ? '目前沒有待審核的項目' : '沒有符合條件的項目'}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <MobileAdminCard
              key={item.id}
              title={getItemTitle(item)}
              subtitle={`${item.author.username} • ${item.author.schoolName} • ${formatTimeAgo(item.createdAt)}`}
              description={item.excerpt}
              status={item.priority === 'high' ? 'danger' : 'neutral'}
              badge={getPriorityBadge(item.priority)}
              icon={getItemIcon(item.type)}
              loading={item.processing}
              actions={
                !item.processing && item.status === 'pending' ? (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReject(item.id)
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      disabled={item.processing}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleApprove(item.id)
                      }}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      disabled={item.processing}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : undefined
              }
              onClick={() => {
                // 點擊查看詳情
                console.log('查看詳情:', item.id)
              }}
            />
          ))
        )}
      </div>
    </MobileAdminLayout>
  )
}
