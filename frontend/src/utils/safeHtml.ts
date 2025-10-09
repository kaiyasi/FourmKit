/**
 * 安全的HTML內容處理工具
 * 允許特定的安全標籤和屬性，支援連結點擊
 */

// 允許的安全標籤和屬性
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote']
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'target', 'rel'],
  '*': ['class']
}

// URL白名單模式
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
    // 基本檢查
    if (!url || typeof url !== 'string') return false
    
    // 防止javascript:和data:等危險協議
    if (url.toLowerCase().startsWith('javascript:') || 
        url.toLowerCase().startsWith('data:') || 
        url.toLowerCase().startsWith('vbscript:')) {
      return false
    }
    
    // 檢查是否符合白名單模式
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
    // 創建一個臨時DOM來處理HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    
    // 遞歸清理所有節點
    function cleanNode(node: Node): Node | null {
      if (node.nodeType === Node.TEXT_NODE) {
        return node
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        const tagName = element.tagName.toLowerCase()
        
        // 檢查標籤是否被允許
        if (!ALLOWED_TAGS.includes(tagName)) {
          // 不允許的標籤，但保留其文本內容
          const textContent = element.textContent || ''
          return document.createTextNode(textContent)
        }
        
        // 創建新的乾淨元素
        const cleanElement = document.createElement(tagName)
        
        // 清理屬性
        const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] || []
        const globalAttrs = ALLOWED_ATTRIBUTES['*'] || []
        const allAllowedAttrs = [...allowedAttrs, ...globalAttrs]
        
        for (const attr of Array.from(element.attributes)) {
          if (allAllowedAttrs.includes(attr.name)) {
            if (attr.name === 'href') {
              // 特殊處理 href 屬性：修剪各式引號，確保外部連結不被錯誤包裝
              let hrefVal = (attr.value || '').trim()
              // 去除可能殘留的 ASCII 與全形引號
              hrefVal = hrefVal.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
              if (isSafeUrl(hrefVal)) {
                cleanElement.setAttribute('href', hrefVal)
                // 為外部連結添加安全屬性
                if (hrefVal.startsWith('http')) {
                  cleanElement.setAttribute('target', '_blank')
                  cleanElement.setAttribute('rel', 'noopener noreferrer')
                }
              }
            } else if (attr.name === 'class') {
              // 只允許特定的CSS類別
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
        
        // 遞歸清理子節點
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
    
    // 清理所有子節點
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
    // 如果清理失敗，回退到純文字
    return html.replace(/<[^>]*>/g, '')
  }
}

/**
 * 將純文本轉換為HTML，自動識別連結
 */
export function textToHtml(text: string): string {
  if (!text || typeof text !== 'string') return ''
  
  // 轉義HTML特殊字符
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  
  // 自動識別URL並轉為連結
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi
  const withLinks = escaped.replace(urlRegex, (url) => {
    if (isSafeUrl(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    }
    return url
  })
  
  // 換行轉為<br>
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

// 導出類型，讓組件在其他 .tsx 文件中實作
export function createSafeHtmlContent(html: string, allowLinks = true): string {
  return allowLinks ? sanitizeHtmlContent(html) : html.replace(/<[^>]*>/g, '')
}

/**
 * 檢查內容是否包含HTML標籤
 */
export function hasHtmlTags(content: string): boolean {
  return /<[^>]+>/.test(content)
}
