export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatLocalMinute(value: string | number | Date | undefined | null): string {
  if (value === undefined || value === null) return ''
  const d = new Date(value as any)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  return `${y}-${m}-${day} ${hh}:${mm}`
}

