import { useState, useRef, useCallback } from 'react'

interface VerticalResizableDividerProps {
  topContent: React.ReactNode
  bottomContent: React.ReactNode
  initialTopHeight?: number // 初始上方高度百分比 (0-100)
  minTopHeight?: number     // 最小上方高度百分比
  maxTopHeight?: number     // 最大上方高度百分比
  onResize?: (topHeight: number) => void
  className?: string
  disabled?: boolean
}

export function VerticalResizableDivider({
  topContent,
  bottomContent,
  initialTopHeight = 50,
  minTopHeight = 20,
  maxTopHeight = 80,
  onResize,
  className = '',
  disabled = false
}: VerticalResizableDividerProps) {
  const [topHeight, setTopHeight] = useState(initialTopHeight)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    
    e.preventDefault()
    setIsDragging(true)

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerHeight = containerRect.height
      const mouseY = e.clientY - containerRect.top
      
      let newTopHeight = (mouseY / containerHeight) * 100
      
      // 限制在最小和最大高度之間
      newTopHeight = Math.max(minTopHeight, Math.min(maxTopHeight, newTopHeight))
      
      setTopHeight(newTopHeight)
      onResize?.(newTopHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [disabled, minTopHeight, maxTopHeight, onResize])

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col h-full ${className}`}
      style={{ cursor: isDragging ? 'row-resize' : 'default' }}
    >
      {/* 上方內容 */}
      <div 
        className="overflow-hidden"
        style={{ 
          height: disabled ? 'auto' : `${topHeight}%`,
          flex: disabled ? 1 : 'none'
        }}
      >
        {topContent}
      </div>

      {/* 拖拽分隔條 - 隱藏但保留功能 */}
      {!disabled && (
        <div
          className="relative cursor-row-resize transition-all duration-300 flex items-center justify-center bg-transparent hover:bg-transparent"
          onMouseDown={handleMouseDown}
          style={{ 
            height: '1px',
            minHeight: '1px',
            maxHeight: '1px'
          }}
        />
      )}

      {/* 下方內容 */}
      <div 
        className={`overflow-hidden ${disabled ? 'flex-1' : ''}`}
        style={{ 
          height: disabled ? 'auto' : `${100 - topHeight}%`,
          flex: disabled ? 1 : 'none'
        }}
      >
        {bottomContent}
      </div>
    </div>
  )
}
