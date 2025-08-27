import { createSafeHtmlContent, type SafeHtmlProps } from '@/utils/safeHtml'

/**
 * 安全HTML內容顯示組件
 * 自動清理危險標籤但保留安全連結
 */
export function SafeHtmlContent({ html, className = '', allowLinks = true }: SafeHtmlProps) {
  const safeHtml = createSafeHtmlContent(html, allowLinks)
  
  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}