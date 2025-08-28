import React, { useEffect, useState } from 'react'

type School = { id: number; slug: string; name: string }

export default function FilterBar() {
  const [keyword, setKeyword] = useState<string>(() => {
    try { return localStorage.getItem('posts_filter_keyword') || '' } catch { return '' }
  })
  const [start, setStart] = useState<string>(() => {
    try { return localStorage.getItem('posts_filter_start') || '' } catch { return '' }
  })
  const [end, setEnd] = useState<string>(() => {
    try { return localStorage.getItem('posts_filter_end') || '' } catch { return '' }
  })

  useEffect(() => {
    try {
      const s = localStorage.getItem('posts_filter_start') || ''
      const e = localStorage.getItem('posts_filter_end') || ''
      const k = localStorage.getItem('posts_filter_keyword') || ''
      setStart(s); setEnd(e); setKeyword(k)
    } catch {}
  }, [])

  const applyFilters = () => {
    try {
      if (start) localStorage.setItem('posts_filter_start', start); else localStorage.removeItem('posts_filter_start')
      if (end) localStorage.setItem('posts_filter_end', end); else localStorage.removeItem('posts_filter_end')
      const k = keyword.trim()
      if (k) localStorage.setItem('posts_filter_keyword', k); else localStorage.removeItem('posts_filter_keyword')
    } catch {}
    // 通知列表刷新
    try { window.dispatchEvent(new CustomEvent('fk_filter_changed')) } catch {}
  }

  const jumpIfId = (value: string) => {
    const m = value.trim().match(/^#?(\d{1,12})$/)
    if (m) {
      const id = m[1]
      try { window.location.assign(`/posts/${id}`) } catch {}
      return true
    }
    return false
  }

  // 學校下拉選單資料
  const [schools, setSchools] = useState<School[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    try { return localStorage.getItem('school_slug') || '__ALL__' } catch { return '__ALL__' }
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (alive && Array.isArray(j?.items)) setSchools(j.items)
      } catch {}
    })()
    return () => { alive = false }
  }, [])

  const setStoredSchool = (slug: string) => {
    try {
      if (slug && slug !== '__ALL__') {
        localStorage.setItem('school_slug', slug)
        localStorage.setItem('current_school_slug', slug)
        localStorage.setItem('selected_school_slug', slug)
      } else if (slug === '__ALL__') {
        localStorage.setItem('school_slug', '__ALL__')
        localStorage.setItem('current_school_slug', '')
        localStorage.setItem('selected_school_slug', '')
      } else {
        // 跨校視圖：以空字串保存，避免被判定為未設定（__ALL__）
        localStorage.setItem('school_slug', '')
        localStorage.setItem('current_school_slug', '')
        localStorage.setItem('selected_school_slug', '')
      }
      window.dispatchEvent(new CustomEvent('fk_school_changed', { detail: { slug } }))
    } catch {}
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-3 sm:p-4 shadow-soft mb-3">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">搜尋貼文</label>
          <div className="flex gap-2">
            <input
              className="form-control flex-1"
              placeholder="輸入 #編號 或 關鍵字（#123 直達貼文）"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (!jumpIfId(keyword)) applyFilters()
                }
              }}
            />
            <button className="btn-primary" onClick={() => { if (!jumpIfId(keyword)) applyFilters() }}>套用</button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">開始日期</label>
          <input type="date" className="form-control" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">結束日期</label>
          <input type="date" className="form-control" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
            <div className="md:ml-auto min-w-[220px] flex flex-col justify-end">
              <label className="block text-xs text-muted mb-0.5">瀏覽範圍</label>
              <select
                className="form-control form-control--compact text-sm"
                value={selectedSlug}
                onChange={(e) => { const v = e.target.value; setSelectedSlug(v); setStoredSchool(v) }}
              >
                <option value="__ALL__">全部（所有學校）</option>
                <option value="">跨校</option>
                {schools.map(s => (
                  <option key={s.id} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
      </div>
    </div>
  )
}
