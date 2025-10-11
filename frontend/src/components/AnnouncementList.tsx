import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface Announcement {
  id: number
  title: string
  content: string
  is_pinned: boolean
  school_id: number | null
  created_at: string
  updated_at: string
  is_read: boolean
  read_at: string | null
  creator: {
    id: number
    username: string
    role: string
  } | null
  school: {
    id: number
    name: string
  } | null
}

interface AnnouncementListProps {
  className?: string
  showRead?: boolean
  limit?: number
}

/**
 *
 */
export function AnnouncementList({ className = "", showRead = false, limit = 20 }: AnnouncementListProps) {
  const { isLoggedIn } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadAnnouncements = async () => {
    if (!isLoggedIn) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        include_read: showRead.toString()
      })

      const response = await fetch(`/api/announcements?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.ok) {
          setAnnouncements(data.announcements || [])
        }
      }
    } catch (error) {
      console.error('Failed to load announcements:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUnreadCount = async () => {
    if (!isLoggedIn) return

    try {
      const response = await fetch('/api/announcements/unread-count', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.ok) {
          setUnreadCount(data.unread_count || 0)
        }
      }
    } catch (error) {
      console.error('Failed to load unread count:', error)
    }
  }

  const markAsRead = async (announcementId: number) => {
    try {
      const response = await fetch(`/api/announcements/${announcementId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setAnnouncements(prev => prev.map(announcement => 
          announcement.id === announcementId 
            ? { ...announcement, is_read: true, read_at: new Date().toISOString() }
            : announcement
        ))
        
        loadUnreadCount()
      }
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  useEffect(() => {
    if (isLoggedIn) {
      loadAnnouncements()
      loadUnreadCount()
    }
  }, [isLoggedIn, showRead, limit])



  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isLoggedIn) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-muted">請先登入以查看公告</div>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">公告通知</h3>
        {unreadCount > 0 && (
          <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
            {unreadCount} 則未讀
          </span>
        )}
      </div>

      
      {loading && (
        <div className="text-center py-8">
          <div className="text-muted">載入中...</div>
        </div>
      )}

      
      {!loading && announcements.length === 0 && (
        <div className="text-center py-8">
          <div className="text-muted">暫無公告</div>
        </div>
      )}

      {!loading && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className={`border rounded-lg p-4 transition-all ${
                announcement.is_read 
                  ? 'bg-gray-50 border-gray-200' 
                  : 'bg-white border-blue-200 shadow-sm'
              } ${announcement.is_pinned ? 'ring-2 ring-yellow-300' : ''}`}
            >
              
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2 flex-1">
                  <h4 className="font-medium text-gray-900 flex-1">
                    {announcement.title}
                    {announcement.is_pinned && (
                      <span className="ml-2 text-yellow-600 text-sm">📌 置頂</span>
                    )}
                  </h4>
                </div>
                <div className="flex items-center space-x-2">
                  {!announcement.is_read && (
                    <button
                      onClick={() => markAsRead(announcement.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      標記已讀
                    </button>
                  )}
                </div>
              </div>

              
              <div className="text-gray-700 text-sm mb-3 break-words line-clamp-6 md-line-clamp-12">
                {announcement.content}
              </div>

              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center space-x-4">
                  <span>發布時間：{formatTime(announcement.created_at)}</span>
                  {announcement.creator && (
                    <span>發布者：{announcement.creator.username}</span>
                  )}
                  {announcement.school && (
                    <span>學校：{announcement.school.name}</span>
                  )}
                  {announcement.school_id === null && (
                    <span className="text-blue-600">
                      {announcement.creator?.role === 'cross_admin' ? '跨校公告' : '全平台公告'}
                    </span>
                  )}
                </div>
                <div>
                  {announcement.is_read ? (
                    <span className="text-green-600">已讀</span>
                  ) : (
                    <span className="text-red-600">未讀</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
