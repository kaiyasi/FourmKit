import { useState, useEffect, useRef } from 'react'

interface ResizableSectionProps {
  title: string
  children: React.ReactNode
  min?: number
  max?: number
  initial?: number
  storageKey?: string
  className?: string
}

/**
 *
 */
function ResizableSection({
  title,
  children,
  min = 160,
  max = 600,
  initial = 280,
  storageKey,
  className = ''
}: ResizableSectionProps) {
  const [height, setHeight] = useState(initial)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= min && parsed <= max) {
          setHeight(parsed)
        }
      }
    }
  }, [storageKey, min, max])

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, height.toString())
    }
  }, [height, storageKey])

  const handleStart = (clientY: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const newHeight = clientY - rect.top
    if (newHeight >= min && newHeight <= max) setHeight(newHeight)
    setIsDragging(true)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    handleStart(e.clientY)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    const y = e.touches[0]?.clientY ?? 0
    handleStart(y)
  }

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newHeight = e.clientY - rect.top
      if (newHeight >= min && newHeight <= max) setHeight(newHeight)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!containerRef.current) return
      const y = e.touches[0]?.clientY ?? 0
      const rect = containerRef.current.getBoundingClientRect()
      const newHeight = y - rect.top
      if (newHeight >= min && newHeight <= max) setHeight(newHeight)
      e.preventDefault()
    }
    const stop = () => setIsDragging(false)

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', stop)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', stop)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', stop)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', stop)
    }
  }, [isDragging, min, max])

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col rounded-xl border border-border/60 bg-surface/50 ${className}`}
      style={{ height: `${height}px` }}
    >
      <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur px-2 sm:px-3 py-2 border-b border-border/60">
        <h3 className="font-semibold dual-text text-sm sm:text-base">{title}</h3>
      </div>

      
      <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-3">
        {children}
      </div>

      
      <div
        className="absolute bottom-0 left-0 right-0 h-3 sm:h-3.5 bg-border/40 cursor-ns-resize hover:bg-primary/60 transition-colors"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{ touchAction: 'none' }}
        aria-label="拖拉調整高度"
        role="separator"
        aria-orientation="horizontal"
      />
    </div>
  )
}

export default ResizableSection
