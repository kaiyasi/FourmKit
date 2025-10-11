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
  is_active: boolean
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

interface School {
  id: number
  slug: string
  name: string
}

/**
 *
 */
export function AnnouncementPage() {
  const { isLoggedIn, role, schoolId } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_pinned: false,
    school_id: null as number | null,
    start_at: '',
    end_at: ''
  })

  const loadSchools = async () => {
    try {
      setSchoolsLoading(true)
      const response = await fetch('/api/schools/admin', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.ok && Array.isArray(data.items)) {
          setSchools(data.items)
        }
      }
    } catch (error) {
      console.error('Failed to load schools:', error)
    } finally {
      setSchoolsLoading(false)
    }
  }

  const getAvailableSchoolOptions = () => {
    if (role === 'dev_admin') {
      return [
        { id: null, name: '全域公告（所有學校）', slug: 'global' },
        ...schools.map(school => ({ id: school.id, name: school.name, slug: school.slug }))
      ]
    } else if (role === 'campus_admin') {
      const userSchool = schools.find(s => s.id === schoolId)
      if (userSchool) {
        return [{ id: userSchool.id, name: userSchool.name, slug: userSchool.slug }]
      }
      return []
    } else if (role === 'cross_admin') {
      return [{ id: null, name: '全域公告（所有學校）', slug: 'global' }]
    }
    
    return []
  }

  const getDefaultSchoolId = () => {
    if (role === 'campus_admin') {
      return schoolId || null
    } else if (role === 'cross_admin') {
      return null // 全域公告
    } else if (role === 'dev_admin') {
      return null // 預設全域公告，但可以選擇
    }
    
    return null
  }

  const loadAnnouncements = async () => {
    if (!isLoggedIn) return

    setLoading(true)
    try {
      const response = await fetch('/api/announcements?include_read=true&limit=100', {
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

  useEffect(() => {
    if (isLoggedIn) {
      loadSchools()
      loadAnnouncements()
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (!schoolsLoading && schools.length > 0) {
      const defaultSchoolId = getDefaultSchoolId()
      if (formData.school_id === null && defaultSchoolId !== null) {
        setFormData(prev => ({ ...prev, school_id: defaultSchoolId }))
      }
    }
  }, [schoolsLoading, schools])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('請填寫標題和內容')
      return
    }

    try {
      const url = editingId 
        ? `/api/announcements/${editingId}`
        : '/api/announcements'
      
      const method = editingId ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          school_id: formData.school_id || null,
          start_at: formData.start_at || null,
          end_at: formData.end_at || null
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.ok) {
          alert(editingId ? '公告已更新' : '公告已創建')
          setShowCreateForm(false)
          setEditingId(null)
          resetForm()
          loadAnnouncements()
        }
      } else {
        const errorData = await response.json()
        alert(`操作失敗: ${errorData.error}`)
      }
    } catch (error) {
      console.error('Failed to save announcement:', error)
      alert('操作失敗')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除此公告嗎？')) return

    try {
      const response = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        alert('公告已刪除')
        loadAnnouncements()
      } else {
        const errorData = await response.json()
        alert(`刪除失敗: ${errorData.error}`)
      }
    } catch (error) {
      console.error('Failed to delete announcement:', error)
      alert('刪除失敗')
    }
  }

  const handleEdit = (announcement: Announcement) => {
    setEditingId(announcement.id)
    setFormData({
      title: announcement.title,
      content: announcement.content,
      is_pinned: announcement.is_pinned,
      school_id: announcement.school_id,
      start_at: '',
      end_at: ''
    })
    setShowCreateForm(true)
  }

  const resetForm = () => {
    const defaultSchoolId = getDefaultSchoolId()
    setFormData({
      title: '',
      content: '',
      is_pinned: false,
      school_id: defaultSchoolId,
      start_at: '',
      end_at: ''
    })
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-TW')
  }





  if (!isLoggedIn) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">公告管理</h1>
          <p className="text-muted">請先登入</p>
        </div>
      </div>
    )
  }

  const availableSchools = getAvailableSchoolOptions()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">公告管理</h1>
        <button
          onClick={() => {
            setShowCreateForm(true)
            setEditingId(null)
            resetForm()
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          新增公告
        </button>
      </div>

      
      {showCreateForm && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? '編輯公告' : '新增公告'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">標題 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">發布範圍</label>
                {schoolsLoading ? (
                  <div className="w-full border rounded-lg px-3 py-2 bg-gray-100 text-gray-500">
                    載入中...
                  </div>
                ) : (
                  <select
                    value={formData.school_id || ''}
                    onChange={(e) => setFormData({...formData, school_id: e.target.value ? Number(e.target.value) : null})}
                    className="w-full border rounded-lg px-3 py-2"
                    disabled={availableSchools.length <= 1}
                  >
                    {availableSchools.map(school => (
                      <option key={school.slug} value={school.id || ''}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">內容 *</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 h-32"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">開始時間</label>
                <input
                  type="datetime-local"
                  value={formData.start_at}
                  onChange={(e) => setFormData({...formData, start_at: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">結束時間</label>
                <input
                  type="datetime-local"
                  value={formData.end_at}
                  onChange={(e) => setFormData({...formData, end_at: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_pinned}
                  onChange={(e) => setFormData({...formData, is_pinned: e.target.checked})}
                  className="mr-2"
                />
                置頂公告
              </label>
            </div>
            
            <div className="flex space-x-4">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                {editingId ? '更新' : '創建'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setEditingId(null)
                  resetForm()
                }}
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">公告列表</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="text-muted">載入中...</div>
          </div>
        ) : announcements.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-muted">暫無公告</div>
          </div>
        ) : (
          <div className="divide-y">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium">{announcement.title}</h3>
                      {announcement.is_pinned && (
                        <span className="text-sm text-gray-500">置頂</span>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">
                      {announcement.content}
                    </div>
                    
                    <div className="text-xs text-gray-500 space-x-4">
                      <span>發布時間：{formatTime(announcement.created_at)}</span>
                      {announcement.creator && (
                        <span>發布者：{announcement.creator.username}</span>
                      )}
                      {announcement.school ? (
                        <span>學校：{announcement.school.name}</span>
                      ) : (
                        <span className="text-blue-600">
                          {announcement.creator?.role === 'cross_admin' ? '跨校公告' : '全平台公告'}
                        </span>
                      )}
                      <span>狀態：{announcement.is_active ? '啟用' : '停用'}</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleEdit(announcement)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => handleDelete(announcement.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
