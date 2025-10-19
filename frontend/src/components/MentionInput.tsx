import React, { useState, useRef, useEffect, useMemo } from 'react'
import { User } from 'lucide-react'

interface OnlineUser {
  id: number
  username: string
  role: string
  school_id?: number
  client_id: string
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onlineUsers: OnlineUser[]
  placeholder?: string
  className?: string
  maxLength?: number
  onSubmit?: () => void
}

interface MentionSuggestion {
  user: OnlineUser
  startIndex: number
  query: string
}

/**
 *
 */
export function MentionInput({
  value,
  onChange,
  onlineUsers,
  placeholder = "輸入訊息…",
  className = "",
  maxLength = 2000,
  onSubmit
}: MentionInputProps) {
  const [caretPosition, setCaretPosition] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [mentionSuggestion, setMentionSuggestion] = useState<MentionSuggestion | null>(null)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const parseMentionContext = useMemo(() => {
    if (!value || caretPosition <= 0) return null

    const textBeforeCaret = value.substring(0, caretPosition)
    const lastAtIndex = textBeforeCaret.lastIndexOf('@')

    if (lastAtIndex === -1) return null

    if (lastAtIndex > 0 && !/\s/.test(textBeforeCaret[lastAtIndex - 1])) return null

    const queryText = textBeforeCaret.substring(lastAtIndex + 1)

    if (/\s/.test(queryText)) return null

    return {
      startIndex: lastAtIndex,
      query: queryText.toLowerCase()
    }
  }, [value, caretPosition])

  const filteredUsers = useMemo(() => {
    if (!parseMentionContext) return []

    return onlineUsers.filter(user =>
      user.username.toLowerCase().includes(parseMentionContext.query)
    ).slice(0, 5) // 最多顯示5個建議
  }, [onlineUsers, parseMentionContext])

  useEffect(() => {
    if (parseMentionContext && filteredUsers.length > 0) {
      setMentionSuggestion({
        user: filteredUsers[0], // 預設選中第一個
        startIndex: parseMentionContext.startIndex,
        query: parseMentionContext.query
      })
      setShowSuggestions(true)
      setSelectedSuggestionIndex(0)
    } else {
      setShowSuggestions(false)
      setMentionSuggestion(null)
    }
  }, [parseMentionContext, filteredUsers])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    const newCaretPosition = e.target.selectionStart || 0

    onChange(newValue)
    setCaretPosition(newCaretPosition)
  }

  const handleSelectionChange = () => {
    if (inputRef.current) {
      setCaretPosition(inputRef.current.selectionStart || 0)
    }
  }

  const insertMention = (user: OnlineUser) => {
    if (!mentionSuggestion) return

    const beforeMention = value.substring(0, mentionSuggestion.startIndex)
    const afterMention = value.substring(caretPosition)
    const mention = `@${user.username} `

    const newValue = beforeMention + mention + afterMention
    const newCaretPosition = mentionSuggestion.startIndex + mention.length

    onChange(newValue)
    setShowSuggestions(false)
    setMentionSuggestion(null)

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newCaretPosition, newCaretPosition)
        setCaretPosition(newCaretPosition)
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || filteredUsers.length === 0) {
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault()
        onSubmit()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < filteredUsers.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : filteredUsers.length - 1
        )
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        insertMention(filteredUsers[selectedSuggestionIndex])
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setMentionSuggestion(null)
        break
    }
  }

  const handleSuggestionClick = (user: OnlineUser, index: number) => {
    setSelectedSuggestionIndex(index)
    insertMention(user)
  }

  const getRoleDisplayName = (role: string) => {
    const roleNames: Record<string, string> = {
      'dev_admin': '開發人員',
      'campus_admin': '校內管理員',
      'cross_admin': '跨校管理員',
      'campus_moderator': '校內審核',
      'cross_moderator': '跨校審核',
      'user': '一般用戶'
    }
    return roleNames[role] || role
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelectionChange}
        onClick={handleSelectionChange}
        placeholder={placeholder}
        className={`form-control text-sm flex-1 ${className}`}
        maxLength={maxLength}
      />

      
      {showSuggestions && filteredUsers.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
        >
          <div className="p-2">
            <div className="text-xs text-muted mb-2 px-2">提及用戶：</div>
            {filteredUsers.map((user, index) => (
              <button
                key={user.client_id}
                onClick={() => handleSuggestionClick(user, index)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-3 ${
                  index === selectedSuggestionIndex
                    ? 'bg-primary text-white'
                    : 'hover:bg-surface-hover'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${
                    index === selectedSuggestionIndex ? 'text-white' : 'text-fg'
                  }`}>
                    {user.username}
                  </div>
                  <div className={`text-xs truncate ${
                    index === selectedSuggestionIndex ? 'text-white/80' : 'text-muted'
                  }`}>
                    {getRoleDisplayName(user.role)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 *
 */
export function renderMessageWithMentions(message: string, currentUsername?: string): React.ReactNode {
  const mentionRegex = /@(\w+)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.substring(lastIndex, match.index))
    }

    const mentionedUsername = match[1]
    const isCurrentUser = mentionedUsername === currentUsername

    parts.push(
      <span
        key={`mention-${match.index}`}
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
          isCurrentUser
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
        }`}
      >
        @{mentionedUsername}
      </span>
    )

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < message.length) {
    parts.push(message.substring(lastIndex))
  }

  return parts.length > 1 ? <>{parts}</> : message
}