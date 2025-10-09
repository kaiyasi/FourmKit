import { useNotifications } from '@/hooks/useNotifications'

export default function NotificationCount() {
  const { unreadCount, showCount } = useNotifications()

  // Only show the count if there are unread notifications and showCount is true
  if (unreadCount === 0 || !showCount) {
    return null
  }

  return (
    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-red-500 rounded-full">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  )
}
