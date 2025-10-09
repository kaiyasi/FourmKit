import React, { useState, useEffect, useRef } from 'react'
import { X, Send, Image, Mic } from 'lucide-react'
import { postJSON, postFormData, HttpError } from '@/lib/http'
import { newTxId } from '@/utils/client'
import { useAuth } from '@/contexts/AuthContext'

interface MobilePostComposerProps {
  isOpen: boolean
  onClose: () => void
  onPostCreated?: (post: any) => void
}

interface ScreenDimensions {
  height: number
  safeAreaTop: number
  availableHeight: number
  headerHeight: number
  inputHeight: number
  actionHeight: number
}

export function MobilePostComposer({ isOpen, onClose, onPostCreated, allowAnonymous = false }: MobilePostComposerProps & { allowAnonymous?: boolean }) {
  const { isLoggedIn } = useAuth()
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSchool, setSelectedSchool] = useState<string>('')
  const [schools, setSchools] = useState<{ id: number; slug: string; name: string }[]>([])
  const [dimensions, setDimensions] = useState<ScreenDimensions>({
    height: 0,
    safeAreaTop: 0,
    availableHeight: 0,
    headerHeight: 0,
    inputHeight: 0,
    actionHeight: 0
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 計算螢幕尺寸和空間分配
  const calculateDimensions = () => {
    const screenHeight = window.innerHeight
    const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0')

    const topPadding = Math.max(20, safeAreaTop + 16)
    const headerHeight = 60
    const actionHeight = 80

    const availableHeight = screenHeight - topPadding - headerHeight - actionHeight
    const inputHeight = availableHeight

    setDimensions({
      height: screenHeight,
      safeAreaTop: topPadding,
      availableHeight,
      headerHeight,
      inputHeight,
      actionHeight
    })
  }

  // 監聽螢幕尺寸變化
  useEffect(() => {
    if (!isOpen) return

    calculateDimensions()

    const handleResize = () => calculateDimensions()
    const handleOrientationChange = () => {
      setTimeout(calculateDimensions, 100)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleOrientationChange)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
    }
  }, [isOpen])

  // 載入學校清單
  useEffect(() => {
    if (!isOpen) return

    const loadSchools = async () => {
      try {
        const response = await fetch('/api/schools', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          setSchools(data.items || [])
        }
      } catch (error) {
        console.warn('載入學校清單失敗:', error)
      }
    }

    loadSchools()
  }, [isOpen])

  const handleSubmit = async () => {
    if (!content.trim()) return
    
    setIsSubmitting(true)
    setError(null)

    const clientId = getClientId()
    const txId = newTxId()
    const now = new Date().toISOString()

    const placeholderPost = {
      tempKey: `tmp_${txId}`,
      client_tx_id: txId,
      content: content.trim(),
      author_hash: '您',
      created_at: now,
      pending_private: true,
    }

    try {
      let result
      let replyToId: number | null = null
      let textBody = content.trim()

      if (files.length === 0) {
        const match = textBody.match(/^#(\d+)\s*(.*)$/s)
        if (match) {
          replyToId = parseInt(match[1], 10)
          textBody = (match[2] || '').trim()
        }
      }

      if (files.length > 0) {
        const formData = new FormData()
        formData.set('content', content.trim())
        formData.set('client_tx_id', txId)
        if (selectedSchool) formData.set('school_slug', selectedSchool)
        files.forEach(file => formData.append('files', file))

        const headers = {
          'X-Tx-Id': txId
        }
        result = await postFormData('/api/posts/with-media', formData, { headers })
      } else {
        const payload: any = { content: textBody, client_tx_id: txId }
        if (selectedSchool) payload.school_slug = selectedSchool
        if (replyToId) payload.reply_to_id = replyToId

        result = await postJSON('/api/posts', payload, {
          headers: { 'X-Tx-Id': txId }
        })
      }

      onPostCreated?.(placeholderPost)
      setContent('')
      setFiles([])
      setSelectedSchool('')
      onClose()

    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message)
      } else {
        setError('發文失敗，請稍後再試')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...selected].slice(0, 4))
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  if ((!isLoggedIn && !allowAnonymous) || !isOpen) return null

  return (
    <>
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 bg-surface"
        style={{
          paddingTop: `${dimensions.safeAreaTop}px`
        }}
      >
        {/* 標題區域 */}
        <div
          className="flex items-center justify-between px-4 border-b border-border"
          style={{ height: `${dimensions.headerHeight}px` }}
        >
          <h2 className="text-lg font-semibold text-fg">發文</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-hover
                       flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主輸入區域 */}
        <div
          className="flex flex-col px-4"
          style={{ height: `${dimensions.inputHeight}px` }}
        >
          {/* 文字輸入區 */}
          <div className="flex-1 py-4">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="分享你的想法..."
              className="w-full h-full p-0 bg-transparent border-none resize-none
                         text-base text-fg placeholder-muted
                         focus:outline-none focus:ring-0"
              autoFocus
            />
          </div>

          {/* 檔案預覽區 */}
          {files.length > 0 && (
            <div className="pb-4">
              <div className="grid grid-cols-2 gap-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden bg-surface-hover"
                  >
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`預覽 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-sm text-muted truncate px-2">
                          {file.name}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full
                                 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 錯誤提示 */}
          {error && (
            <div className="pb-4">
              <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
                <p className="text-sm text-danger">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作區域 */}
        <div
          className="border-t border-border px-4 flex items-center justify-between"
          style={{ height: `${dimensions.actionHeight}px` }}
        >
          <div className="flex items-center gap-2">
            <label className="w-10 h-10 rounded-full bg-surface-hover hover:bg-surface-active
                              flex items-center justify-center cursor-pointer transition-colors">
              <Image className="w-5 h-5" />
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            <button
              className="w-10 h-10 rounded-full bg-surface-hover hover:bg-surface-active
                         flex items-center justify-center transition-colors"
              title="語音輸入（即將推出）"
              disabled
            >
              <Mic className="w-5 h-5 text-muted" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">

          {!isLoggedIn && (
            <div className="text-[11px] text-muted pr-2">匿名模式</div>
          )}

            <select 
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="h-10 rounded-full bg-surface-hover hover:bg-surface-active 
                           text-fg border-none focus:ring-0"
            >
                <option value="">跨校（全部）</option>
                {schools.map(school => (
                    <option key={school.id} value={school.slug}>{school.name}</option>
                ))}
            </select>

            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting}
              className="px-6 py-3 bg-primary hover:bg-primary-hover disabled:opacity-50
                         text-white rounded-full font-medium
                         flex items-center gap-2 transition-all duration-200
                         active:scale-95 disabled:active:scale-100"
            >
              <Send className="w-4 h-4" />
              發送
            </button>
          </div>
        </div>
      </div>
      {isSubmitting && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-surface rounded-lg p-4">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-muted">發佈中...</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
