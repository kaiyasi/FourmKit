import { useMemo, useEffect } from 'react'

interface TemplateData {
  article_number: {
    enabled: boolean
    x: number
    y: number
    align_horizontal: string
    align_vertical: string
    font_size: number
    font_weight: string
    color: string
    google_font: string
  }
  content_block: {
    x: number
    y: number
    align_horizontal: string
    align_vertical: string
    font_size: number
    font_weight: string
    color: string
    google_font: string
    max_lines: number
  }
  timestamp: {
    enabled: boolean
    x: number
    y: number
    align_horizontal: string
    align_vertical: string
    font_size: number
    font_weight: string
    color: string
    google_font: string
    format: string
  }
  logo: {
    enabled: boolean
    x: number
    y: number
    align_horizontal: string
    align_vertical: string
    size: number
    opacity: number
  }
  background: {
    type: string
    color: string
    image: string
    overlay_enabled: boolean
    overlay_color: string
    overlay_opacity: number
    overlay_size: { width: number; height: number }
    overlay_radius: number
  }
}

interface InstagramTemplatePreviewProps {
  templateData: TemplateData
  className?: string
}

export default function InstagramTemplatePreview({ templateData, className = '' }: InstagramTemplatePreviewProps) {
  // 動態載入 Google Fonts
  useEffect(() => {
    const fontsToLoad = new Set<string>()
    
    if (templateData.article_number.enabled && templateData.article_number.google_font) {
      fontsToLoad.add(templateData.article_number.google_font)
    }
    if (templateData.content_block.google_font) {
      fontsToLoad.add(templateData.content_block.google_font)
    }
    if (templateData.timestamp.enabled && templateData.timestamp.google_font) {
      fontsToLoad.add(templateData.timestamp.google_font)
    }
    
    fontsToLoad.forEach(font => {
      // 檢查是否已經載入過這個字體
      if (!document.querySelector(`link[href*="${encodeURIComponent(font)}"]`)) {
        const link = document.createElement('link')
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@300;400;500;600;700&display=swap`
        link.rel = 'stylesheet'
        document.head.appendChild(link)
      }
    })
  }, [templateData])
  // 計算位置樣式的函數
  const calculatePosition = (element: any) => {
    const x = element.x * 100 // 轉換為百分比
    const y = element.y * 100
    
    let transform = ''
    
    // 水平對齊
    if (element.align_horizontal === 'center') {
      transform += 'translateX(-50%) '
    } else if (element.align_horizontal === 'right') {
      transform += 'translateX(-100%) '
    }
    
    // 垂直對齊  
    if (element.align_vertical === 'middle') {
      transform += 'translateY(-50%)'
    } else if (element.align_vertical === 'bottom') {
      transform += 'translateY(-100%)'
    }
    
    return {
      position: 'absolute' as const,
      left: `${x}%`,
      top: `${y}%`,
      transform: transform.trim() || undefined
    }
  }

  // 獲取字體樣式
  const getFontStyle = (element: any) => {
    return {
      fontSize: `${element.font_size}px`,
      fontWeight: element.font_weight,
      color: element.color,
      fontFamily: element.google_font || 'sans-serif',
      textAlign: element.align_horizontal as 'left' | 'center' | 'right'
    }
  }

  // 示例文章編號
  const sampleArticleNumber = "01"
  
  // 示例內容
  const sampleContent = "本週校園活動精彩回顧\n\n社團博覽會圓滿落幕，各社團展現創意與活力，吸引眾多新生加入。期待下學期更多精彩活動！"
  
  // 示例時間戳
  const sampleTimestamp = useMemo(() => {
    const now = new Date()
    const format = templateData.timestamp.format
    
    // 簡單的時間格式化
    if (format && format.includes('YYYY')) {
      return format
        .replace('YYYY', now.getFullYear().toString())
        .replace('MM', (now.getMonth() + 1).toString().padStart(2, '0'))
        .replace('DD', now.getDate().toString().padStart(2, '0'))
        .replace('HH', now.getHours().toString().padStart(2, '0'))
        .replace('mm', now.getMinutes().toString().padStart(2, '0'))
    }
    return '2024/03/15 14:30'
  }, [templateData.timestamp.format])

  return (
    <div className={`relative bg-white rounded-lg border aspect-square overflow-hidden ${className}`}>
      {/* 背景 */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundColor: templateData.background.color,
          backgroundImage: templateData.background.image ? `url(${templateData.background.image})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      {/* 背景遮罩 */}
      {templateData.background.overlay_enabled && (
        <div 
          className="absolute"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: `${templateData.background.overlay_size.width * 100}%`,
            height: `${templateData.background.overlay_size.height * 100}%`,
            backgroundColor: templateData.background.overlay_color,
            opacity: templateData.background.overlay_opacity / 100,
            borderRadius: `${templateData.background.overlay_radius}px`
          }}
        />
      )}

      {/* 文章編號區 */}
      {templateData.article_number.enabled && (
        <div
          style={{
            ...calculatePosition(templateData.article_number),
            ...getFontStyle(templateData.article_number),
            zIndex: 10
          }}
        >
          {sampleArticleNumber}
        </div>
      )}

      {/* 內容區塊 */}
      <div
        style={{
          ...calculatePosition(templateData.content_block),
          ...getFontStyle(templateData.content_block),
          maxWidth: '70%',
          zIndex: 10,
          whiteSpace: 'pre-line',
          lineHeight: '1.4',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: templateData.content_block.max_lines,
          WebkitBoxOrient: 'vertical'
        }}
      >
        {sampleContent}
      </div>

      {/* 時間戳記 */}
      {templateData.timestamp.enabled && (
        <div
          style={{
            ...calculatePosition(templateData.timestamp),
            ...getFontStyle(templateData.timestamp),
            zIndex: 10
          }}
        >
          {sampleTimestamp}
        </div>
      )}

      {/* Logo區域 */}
      {templateData.logo.enabled && (
        <div
          style={{
            ...calculatePosition(templateData.logo),
            width: `${templateData.logo.size}px`,
            height: `${templateData.logo.size}px`,
            opacity: templateData.logo.opacity,
            zIndex: 10,
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            color: '#6b7280'
          }}
        >
          LOGO
        </div>
      )}

      {/* 預覽標記 */}
      <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
        1080x1080
      </div>
    </div>
  )
}