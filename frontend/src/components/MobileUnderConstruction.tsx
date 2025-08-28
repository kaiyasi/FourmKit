// 注意：為避免行動端極端環境下的圖示載入導致錯誤，這裡改用輕量的內嵌圖示。

interface Props {
  message?: string
}

export default function MobileUnderConstruction({ message }: Props) {
  const bypass = () => {
    try { localStorage.setItem('fk_mobile_ok', '1') } catch {}
    try { location.reload() } catch {}
  }
  return (
    <div className="min-h-screen min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface/80 backdrop-blur p-6 shadow-soft text-center">
        <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-primary/10 grid place-items-center">
          <span className="text-primary text-xl">📱</span>
        </div>
        <h1 className="text-xl font-bold dual-text mb-2">手機版開發中</h1>
        <p className="text-sm text-muted mb-4">
          {message || "目前行動端介面仍在施工中，建議使用桌面版瀏覽器獲得完整體驗。"}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={bypass}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:opacity-90"
          >
            <span>我知道了，仍要繼續</span>
          </button>
          <a
            href="https://www.whatismybrowser.com/detect/what-is-my-user-agent/"
            target="_blank" rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-surface/70"
          >
            <span>🔗</span>
            <span>桌面版說明 / 檢查瀏覽器</span>
          </a>
        </div>
        <p className="text-xs text-muted mt-4">提示只會顯示一次，可在設定清除網站資料以重置。</p>
      </div>
    </div>
  )
}
