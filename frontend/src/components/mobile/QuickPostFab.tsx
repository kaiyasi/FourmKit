import { useState } from 'react'
import { Edit3 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { MobilePostComposer } from './MobilePostComposer'

interface QuickPostFabProps {
  onPostCreated?: (post: any) => void
}

export function QuickPostFab({ onPostCreated }: QuickPostFabProps) {
  const { isLoggedIn } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  const haptic = (ms = 10) => {
    try {
      if ('vibrate' in navigator) navigator.vibrate(ms)
    } catch {}
  }

  if (!isLoggedIn) return null

  return (
    <>
      {/* 主 FAB 按鈕 */}
      <button
        onClick={() => {
          haptic(8)
          setIsOpen(true)
        }}
        className="fixed right-4 bottom-20 z-40 w-14 h-14 bg-primary hover:bg-primary-hover
                   rounded-full shadow-xl border border-primary/20
                   flex items-center justify-center transition-all duration-200
                   active:scale-95 md:hidden"
        aria-label="快速發文"
      >
        <Edit3 className="w-6 h-6 text-white" />
      </button>

      {/* 使用新的螢幕自適應發文組件 */}
      <MobilePostComposer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onPostCreated={onPostCreated}
      />
    </>
  )
}
