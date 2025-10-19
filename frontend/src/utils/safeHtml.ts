/**
 * 安全的HTML內容處理工具
 * 允許特定的安全標籤和屬性，支援連結點擊
 */

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote']
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'target', 'rel'],
  '*': ['class']
}

const ALLOWED_URL_PATTERNS = [
  /^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,  // 一般HTTP(S)網址
  /^mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,  // Email連結
  /^tel:\+?[0-9\-\s()]+$/,  // 電話連結
  /^\/[a-zA-Z0-9\/\-_?&=%.]*$/  // 內部相對連結
]

/**
 * 檢查URL是否安全
 */
function isSafeUrl(url: string): boolean {
  try {
    if (!url || typeof url !== 'string') return false
    
    if (url.toLowerCase().startsWith('javascript:') || 
        url.toLowerCase().startsWith('data:') || 
        url.toLowerCase().startsWith('vbscript:')) {
      return false
    }
    
    return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url))
  } catch {
    return false
  }
}

/**
 * 清理HTML內容，移除危險標籤但保留安全連結
 */
export function sanitizeHtmlContent(html: string): string {
  if (!html || typeof html !== 'string') return ''
  
  try {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    
    function cleanNode(node: Node): Node | null {
      if (node.nodeType === Node.TEXT_NODE) {
        return node
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        const tagName = element.tagName.toLowerCase()
        
        if (!ALLOWED_TAGS.includes(tagName)) {
          const textContent = element.textContent || ''
          return document.createTextNode(textContent)
        }
        
        const cleanElement = document.createElement(tagName)
        
        const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] || []
        const globalAttrs = ALLOWED_ATTRIBUTES['*'] || []
        const allAllowedAttrs = [...allowedAttrs, ...globalAttrs]
        
        for (const attr of Array.from(element.attributes)) {
          if (allAllowedAttrs.includes(attr.name)) {
            if (attr.name === 'href') {
              let hrefVal = (attr.value || '').trim()
              hrefVal = hrefVal.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
              if (isSafeUrl(hrefVal)) {
                cleanElement.setAttribute('href', hrefVal)
                if (hrefVal.startsWith('http')) {
                  cleanElement.setAttribute('target', '_blank')
                  cleanElement.setAttribute('rel', 'noopener noreferrer')
                }
              }
            } else if (attr.name === 'class') {
              const safeClasses = attr.value.split(' ').filter(cls => 
                /^[a-zA-Z0-9\-_]+$/.test(cls) && !cls.startsWith('js-')
              )
              if (safeClasses.length > 0) {
                cleanElement.setAttribute('class', safeClasses.join(' '))
              }
            } else {
              cleanElement.setAttribute(attr.name, attr.value)
            }
          }
        }
        
        for (const child of Array.from(element.childNodes)) {
          const cleanChild = cleanNode(child)
          if (cleanChild) {
            cleanElement.appendChild(cleanChild)
          }
        }
        
        return cleanElement
      }
      
      return null
    }
    
    const cleanDiv = document.createElement('div')
    for (const child of Array.from(tempDiv.childNodes)) {
      const cleanChild = cleanNode(child)
      if (cleanChild) {
        cleanDiv.appendChild(cleanChild)
      }
    }
    
    return cleanDiv.innerHTML
  } catch (error) {
    console.warn('HTML sanitization failed:', error)
    return html.replace(/<[^>]*>/g, '')
  }
}

/**
 * 將純文本轉換為HTML，自動識別連結
 */
export function textToHtml(text: string): string {
  if (!text || typeof text !== 'string') return ''
  
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi
  const withLinks = escaped.replace(urlRegex, (url) => {
    if (isSafeUrl(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    }
    return url
  })
  
  return withLinks.replace(/\n/g, '<br>')
}

/**
 * React組件：安全HTML內容顯示
 * 
 * 使用方式：
 * import { SafeHtmlContent } from '@/utils/safeHtml'
 * <SafeHtmlContent html={content} className="prose" allowLinks={true} />
 */
export interface SafeHtmlProps {
  html: string
  className?: string
  allowLinks?: boolean
}

/**
 *
 */
export function createSafeHtmlContent(html: string, allowLinks = true): string {
  return allowLinks ? sanitizeHtmlContent(html) : html.replace(/<[^>]*>/g, '')
}

/**
 * 檢查內容是否包含HTML標籤
 */
export function hasHtmlTags(content: string): boolean {
  return /<[^>]+>/.test(content)
}
