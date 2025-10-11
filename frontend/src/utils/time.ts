/**
 *
 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 *
 */
export function formatLocalMinute(value: string | number | Date | undefined | null): string {
  if (value === undefined || value === null) return ''
  
  try {
    const d = new Date(value as any)
    if (isNaN(d.getTime())) return ''
    
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/\//g, '-')
  } catch (error) {
    console.warn('時間格式化失敗:', error, value)
    return ''
  }
}

