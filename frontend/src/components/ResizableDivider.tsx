import { useState, useRef, useCallback } from 'react'

interface ResizableDividerProps {
  leftContent: React.ReactNode
  rightContent: React.ReactNode
  initialLeftWidth?: number // 初始左側寬度（像素 or 百分比）
  minLeftWidth?: number     // 最小左側寬度（像素 or 百分比）
  maxLeftWidth?: number     // 最大左側寬度（像素 or 百分比）
  onResize?: (leftWidth: number) => void
  className?: string
  disabled?: boolean        // 在小螢幕時停用拖拽
  usePixels?: boolean       // 使用像素寬度而非百分比
}

/**
 *
 */
export function ResizableDivider({
  leftContent,
  rightContent,
  initialLeftWidth = 40,
  minLeftWidth = 20,
  maxLeftWidth = 80,
  onResize,
  className = '',
  disabled = false,
  usePixels = false
}: ResizableDividerProps) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    
    e.preventDefault()
    setIsDragging(true)

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const containerWidth = containerRect.width
      const mouseX = e.clientX - containerRect.left
      
      let newLeftWidth: number
      
      if (usePixels) {
        newLeftWidth = mouseX
        newLeftWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth))
      } else {
        newLeftWidth = (mouseX / containerWidth) * 100
        newLeftWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth))
      }
      
      setLeftWidth(newLeftWidth)
      onResize?.(newLeftWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [disabled, minLeftWidth, maxLeftWidth, onResize])

  return (
    <div 
      ref={containerRef}
      className={`flex h-full ${className}`}
      style={{ cursor: isDragging ? 'col-resize' : 'default' }}
    >
      
      <div 
        className="overflow-hidden"
        style={{ 
          width: disabled ? 'auto' : usePixels ? `${leftWidth}px` : `${leftWidth}%`,
          flex: disabled ? '0 0 auto' : 'none'
        }}
      >
        {leftContent}
      </div>

      
      {!disabled && (
        <div
          className={`
            relative bg-border hover:bg-primary/40 cursor-col-resize transition-all duration-200 flex items-center justify-center
            ${isDragging ? 'bg-primary/60 shadow-lg' : 'hover:shadow-md'}
          `}
          onMouseDown={handleMouseDown}
          style={{ 
            width: isDragging ? '8px' : '4px',
            minWidth: isDragging ? '8px' : '4px',
            maxWidth: isDragging ? '8px' : '4px'
          }}
        >
          
          <div className={`
            w-0.5 h-8 bg-gray-400/60 dark:bg-gray-300/60 rounded-full 
            ${isDragging ? 'opacity-100' : 'opacity-0 hover:opacity-70'}
            transition-opacity duration-200
          `} />
        </div>
      )}

      
      <div 
        className={`overflow-hidden ${disabled ? 'flex-1' : 'flex-1'}`}
        style={{ 
          flex: disabled ? 1 : usePixels ? 1 : 'none',
          width: disabled ? 'auto' : usePixels ? 'auto' : `${100 - leftWidth}%`
        }}
      >
        {rightContent}
      </div>
    </div>
  )
}
