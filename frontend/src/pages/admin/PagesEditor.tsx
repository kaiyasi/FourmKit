import { useEffect, useState, useRef } from 'react'
import { NavBar } from '@/components/layout/NavBar'
import { MobileFabNav } from '@/components/layout/MobileFabNav'
import { Eye, Save, Upload, Download, Bold, Italic, Link, List, Quote, Code, ArrowLeft } from 'lucide-react'
import { getRole, getRoleDisplayName } from '@/utils/auth'
import { useAuth } from '@/contexts/AuthContext'

type PageSlug = 'about' | 'rules'
type Scope = 'school' | 'cross' | 'global'

export default function AdminPagesEditor() {
  const { role, schoolId } = useAuth()
  const [slug, setSlug] = useState<PageSlug>('about')
  const [markdown, setMarkdown] = useState('')
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [scope, setScope] = useState<Scope>(() => {
    if (role === 'dev_admin') return 'global'
    if (role === 'cross_admin') return 'cross'
    return 'school'
  })
  const [selectedSchool, setSelectedSchool] = useState<string>('')
  const [schools, setSchools] = useState<{ id: number; slug: string; name: string }[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const html = document.documentElement
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige')
    html.classList.add('theme-ready')
    return () => html.classList.remove('theme-ready')
  }, [])

  // 載入學校清單
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/schools', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (Array.isArray(j?.items)) setSchools(j.items)
        // campus_admin 預設為自己學校
        if (role === 'campus_admin') {
          const mine = (j.items || []).find((x: any) => Number(x.id) === Number(schoolId))
          if (mine) setSelectedSchool(mine.slug)
        }
      } catch {}
    })()
  }, [])

  const load = async (s: PageSlug, sc: Scope = scope, school?: string) => {
    try {
      setLoading(true); setMsg(null)
      const qs = new URLSearchParams()
      if (sc) qs.set('scope', sc)
      const headers: Record<string,string> = {}
      if (sc === 'school') {
        const chosen = school || selectedSchool
        if (chosen) headers['X-School-Slug'] = chosen
      }
      const r = await fetch(`/api/pages/${s}?${qs.toString()}`, { headers })
      const j = await r.json()
      setMarkdown(String(j?.markdown || ''))
      setPreview(String(j?.html || ''))
    } catch (e:any) {
      setMsg(e?.message || '載入失敗')
    } finally {
      setLoading(false)
    }
  }
  useEffect(()=>{ load(slug, scope) }, [slug, scope, selectedSchool])

  const doPreview = async () => {
    try {
      const r = await fetch('/api/pages/render', { method:'POST', headers:{ 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }, body: JSON.stringify({ markdown }) })
      const j = await r.json(); setPreview(String(j?.html || ''))
    } catch {}
  }



  // Markdown 工具欄功能
  const insertText = (before: string, after = '', placeholder = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = markdown.slice(start, end)
    const replacement = before + (selectedText || placeholder) + after

    const newText = markdown.slice(0, start) + replacement + markdown.slice(end)
    setMarkdown(newText)

    // 重新設置光標位置
    setTimeout(() => {
      const newCursorPos = start + before.length + (selectedText || placeholder).length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    }, 0)
  }

  // 工具欄按鈕
  const toolbarButtons = [
    { icon: Bold, action: () => insertText('**', '**', '粗體文字'), title: '粗體' },
    { icon: Italic, action: () => insertText('*', '*', '斜體文字'), title: '斜體' },
    { icon: Link, action: () => insertText('[', '](https://)', '連結文字'), title: '連結' },
    { icon: List, action: () => insertText('- ', '', '清單項目'), title: '無序清單' },
    { icon: Quote, action: () => insertText('> ', '', '引用文字'), title: '引用' },
    { icon: Code, action: () => insertText('`', '`', '程式碼'), title: '行內程式碼' },
  ]

  // 檔案匯入匯出
  const exportMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importMarkdown = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setMarkdown(content)
    }
    reader.readAsText(file)
  }

  const save = async () => {
    try {
      setSaving(true); setMsg(null)
      const body: any = { markdown, scope }
      if (scope === 'school') body.school_slug = selectedSchool
      const r = await fetch(`/api/pages/${slug}`, { method:'PUT', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error(await r.text())
      setMsg('已儲存')
      doPreview()
    } catch (e:any) {
      setMsg(e?.message || '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar pathname="/admin/pages" />
      <MobileFabNav />
      <main className="mx-auto max-w-6xl px-3 sm:px-4 pt-20 sm:pt-24 md:pt-28 pb-8">
        {/* 頁首 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 shadow-soft mb-4">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-muted hover:text-fg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回後台
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold dual-text">頁面內容編輯</h1>
              <p className="text-sm text-muted mt-1">編輯關於我們、版規等頁面內容</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">儲存變更</span>
                <span className="sm:hidden">儲存</span>
              </button>
            </div>
          </div>
          
          {msg && (
            <div className={`mt-3 p-2 rounded-lg text-sm ${msg.includes('失敗') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {msg}
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted">載入中...</div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
            {/* 上方控制列：頁面、範圍與學校選擇 */}
            <div className="border-b border-border p-4 flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">頁面</span>
                <select
                  value={slug}
                  onChange={e => setSlug(e.target.value as PageSlug)}
                  className="px-3 py-1.5 text-sm rounded-lg border bg-surface-hover border-border"
                >
                  <option value="about">關於我們</option>
                  <option value="rules">版規</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">範圍</span>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value as Scope)}
                  className="px-3 py-1.5 text-sm rounded-lg border bg-surface-hover border-border"
                >
                  {role === 'dev_admin' && (<>
                    <option value="global">全域</option>
                    <option value="cross">跨校</option>
                    <option value="school">校內</option>
                  </>)}
                  {role === 'cross_admin' && (<>
                    <option value="cross">跨校</option>
                  </>)}
                  {role === 'campus_admin' && (<>
                    <option value="school">校內</option>
                  </>)}
                </select>
              </div>
              {scope === 'school' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">學校</span>
                  <select
                    value={selectedSchool}
                    onChange={e => setSelectedSchool(e.target.value)}
                    disabled={role === 'campus_admin'}
                    className="px-3 py-1.5 text-sm rounded-lg border bg-surface-hover border-border min-w-[160px]"
                  >
                    {schools.map(s => (
                      <option key={s.slug} value={s.slug}>{s.name} ({s.slug})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={doPreview} className="btn-secondary flex items-center gap-2 px-3 py-1.5 text-sm">
                  <Eye className="w-4 h-4" /> 預覽
                </button>
              </div>
            </div>
            {/* 工具欄 */}
            {!previewMode && (
              <div className="border-b border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {toolbarButtons.map(({ icon: Icon, action, title }, i) => (
                    <button
                      key={i}
                      onClick={action}
                      title={title}
                      className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-fg"
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                  
                  <div className="w-px h-6 bg-border mx-2"></div>
                  
                  <button onClick={exportMarkdown} title="匯出 Markdown" className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-fg">
                    <Download className="w-4 h-4" />
                  </button>
                  
                  <label title="匯入 Markdown" className="p-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer text-fg">
                    <Upload className="w-4 h-4" />
                    <input type="file" accept=".md,.txt" onChange={importMarkdown} className="hidden" />
                  </label>
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row min-h-[600px]">
              {/* 編輯區 */}
              {!previewMode && (
                <div className="flex-1 p-4">
                  <textarea
                    ref={textareaRef}
                    value={markdown}
                    onChange={e => setMarkdown(e.target.value)}
                    className="form-control w-full h-[550px] font-mono text-sm resize-none"
                    placeholder="# 標題

這是一段內容

## 子標題

可以使用 **粗體** 和 *斜體* 等 Markdown 語法。

- 清單項目 1
- 清單項目 2

> 這是引用文字

`行內程式碼`

```
程式碼區塊
```

[連結文字](https://example.com)"
                  />
                </div>
              )}

              {/* 預覽區 */}
              {(previewMode || (!previewMode && preview)) && (
                <div className={`${!previewMode ? 'flex-1 border-l border-border' : 'w-full'} p-4`}>
                  {!previewMode && <h3 className="font-semibold dual-text mb-3">即時預覽</h3>}
                  <div className="prose prose-sm max-w-none text-fg min-h-[500px]">
                    {preview ? (
                      <div dangerouslySetInnerHTML={{ __html: preview }} />
                    ) : (
                      <div className="text-muted text-center py-8">
                        點擊「預覽」按鈕查看渲染結果
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
