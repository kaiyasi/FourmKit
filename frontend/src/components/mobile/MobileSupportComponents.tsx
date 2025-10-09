import React from 'react'
import { LucideIcon, ArrowRight, Clock, CheckCircle, AlertCircle, MessageCircle, Calendar, Tag, ChevronRight } from 'lucide-react'

interface MobileSupportCardProps {
  title: string
  desc: string
  icon: LucideIcon
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onClick?: () => void
  disabled?: boolean
  badge?: string
  className?: string
}

export const MobileSupportCard: React.FC<MobileSupportCardProps> = ({
  title,
  desc,
  icon: Icon,
  color = 'blue',
  size = 'md',
  onClick,
  disabled = false,
  badge,
  className = ''
}) => {
  const colorClasses = {
    blue: 'from-blue-500 to-cyan-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-violet-600',
    orange: 'from-orange-500 to-red-500',
    pink: 'from-pink-500 to-rose-600',
    yellow: 'from-yellow-500 to-orange-500'
  }

  const sizeClasses = {
    sm: {
      container: 'p-4 rounded-2xl',
      icon: 'w-8 h-8 rounded-xl mb-3',
      iconSize: 'w-4 h-4',
      title: 'font-semibold text-base',
      desc: 'text-xs',
      arrow: 'w-4 h-4 bottom-3 right-3',
      decoration: 'w-12 h-12 -bottom-1 -right-1'
    },
    md: {
      container: 'p-6 rounded-3xl',
      icon: 'w-12 h-12 rounded-2xl mb-4',
      iconSize: 'w-6 h-6',
      title: 'font-bold text-lg',
      desc: 'text-sm',
      arrow: 'w-5 h-5 bottom-4 right-4',
      decoration: 'w-16 h-16 -bottom-2 -right-2'
    },
    lg: {
      container: 'p-8 rounded-3xl',
      icon: 'w-16 h-16 rounded-3xl mb-6',
      iconSize: 'w-8 h-8',
      title: 'font-bold text-xl',
      desc: 'text-base',
      arrow: 'w-6 h-6 bottom-6 right-6',
      decoration: 'w-20 h-20 -bottom-3 -right-3'
    },
    xl: {
      container: 'p-10 rounded-3xl',
      icon: 'w-20 h-20 rounded-3xl mb-8',
      iconSize: 'w-10 h-10',
      title: 'font-bold text-2xl',
      desc: 'text-lg',
      arrow: 'w-7 h-7 bottom-8 right-8',
      decoration: 'w-24 h-24 -bottom-4 -right-4'
    }
  }

  const currentSize = sizeClasses[size]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden bg-gradient-to-br ${colorClasses[color]} ${currentSize.container} text-white shadow-lg hover:shadow-xl transition-all duration-300 mobile-button-press disabled:opacity-50 ${className}`}
    >
      <div className="absolute inset-0 bg-white/10 opacity-0 group-active:opacity-100 transition-opacity"></div>
      
      {badge && (
        <div className="absolute top-3 right-3 bg-white/20 text-white text-xs font-medium px-2 py-1 rounded-full">
          {badge}
        </div>
      )}
      
      <div className="relative z-10">
        <div className={`${currentSize.icon} bg-white/20 flex items-center justify-center`}>
          <Icon className={currentSize.iconSize} />
        </div>
        <h3 className={`${currentSize.title} mb-1`}>{title}</h3>
        <p className={`${currentSize.desc} text-white/80`}>{desc}</p>
      </div>
      
      <div className={`absolute ${currentSize.decoration} bg-white/10 rounded-full`}></div>
      <ArrowRight className={`absolute ${currentSize.arrow} opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all`} />
    </button>
  )
}

interface MobileTicketCardProps {
  ticket: {
    id: string
    subject: string
    status: string
    category: string
    priority: string
    created_at: string
    message_count: number
    is_urgent?: boolean
  }
  onClick?: () => void
  className?: string
}

export const MobileTicketCardRedesigned: React.FC<MobileTicketCardProps> = ({
  ticket,
  onClick,
  className = ''
}) => {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'open':
        return {
          color: 'bg-yellow-400',
          text: '處理中',
          textColor: 'text-yellow-800 dark:text-yellow-400',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/30'
        }
      case 'resolved':
        return {
          color: 'bg-green-400',
          text: '已解決',
          textColor: 'text-green-800 dark:text-green-400',
          bgColor: 'bg-green-100 dark:bg-green-900/30'
        }
      case 'closed':
        return {
          color: 'bg-gray-400',
          text: '已關閉',
          textColor: 'text-gray-800 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-800'
        }
      default:
        return {
          color: 'bg-gray-400',
          text: status,
          textColor: 'text-gray-800 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-800'
        }
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500'
      case 'medium':
        return 'text-yellow-500'
      case 'low':
        return 'text-green-500'
      default:
        return 'text-gray-500'
    }
  }

  const statusInfo = getStatusInfo(ticket.status)

  return (
    <div
      className={`bg-surface border border-border rounded-2xl p-4 shadow-soft hover:shadow-medium transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
      } ${className}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-3 h-3 rounded-full mt-2 ${statusInfo.color}`}></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-fg truncate flex-1">{ticket.subject}</h3>
            {ticket.is_urgent && (
              <div className="flex items-center gap-1 text-red-500 flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-medium">緊急</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted mt-1">
            <Tag className="w-4 h-4" />
            <span>{ticket.category}</span>
            <span>•</span>
            <Calendar className="w-4 h-4" />
            <span>{ticket.created_at}</span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.textColor}`}>
          {statusInfo.text}
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-muted">
          {ticket.message_count > 0 && (
            <div className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              <span>{ticket.message_count} 則回覆</span>
            </div>
          )}
          <div className={`flex items-center gap-1 ${getPriorityColor(ticket.priority)}`}>
            <div className="w-2 h-2 rounded-full bg-current"></div>
            <span className="capitalize">{ticket.priority}</span>
          </div>
        </div>
        {onClick && (
          <ChevronRight className="w-5 h-5 text-muted" />
        )}
      </div>
    </div>
  )
}

interface MobileSupportStatsProps {
  stats: {
    total: number
    open: number
    resolved: number
    urgent?: number
  }
  className?: string
}

export const MobileSupportStats: React.FC<MobileSupportStatsProps> = ({
  stats,
  className = ''
}) => {
  return (
    <div className={`flex gap-3 ${className}`}>
      <div className="flex-1 bg-white/15 backdrop-blur rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          <span className="text-xs opacity-80">我的工單</span>
        </div>
        <p className="text-lg font-bold mt-1">{stats.total}</p>
      </div>
      <div className="flex-1 bg-white/15 backdrop-blur rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-xs opacity-80">處理中</span>
        </div>
        <p className="text-lg font-bold mt-1">{stats.open}</p>
      </div>
      <div className="flex-1 bg-white/15 backdrop-blur rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span className="text-xs opacity-80">已解決</span>
        </div>
        <p className="text-lg font-bold mt-1">{stats.resolved}</p>
      </div>
    </div>
  )
}

interface MobileSupportQuickActionProps {
  icon: LucideIcon
  title: string
  desc: string
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow'
  onClick?: () => void
  className?: string
}

export const MobileSupportQuickAction: React.FC<MobileSupportQuickActionProps> = ({
  icon: Icon,
  title,
  desc,
  color = 'blue',
  onClick,
  className = ''
}) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    pink: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 mobile-touch-target px-4 hover:bg-surface-hover rounded-2xl transition-colors text-left mobile-button-press ${className}`}
    >
      <div className={`w-10 h-10 rounded-xl ${colorClasses[color]} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-fg">{title}</p>
        <p className="text-sm text-muted">{desc}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />
    </button>
  )
}

interface MobileSupportContactProps {
  icon: LucideIcon
  label: string
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow'
  href?: string
  onClick?: () => void
  className?: string
}

export const MobileSupportContact: React.FC<MobileSupportContactProps> = ({
  icon: Icon,
  label,
  color = 'blue',
  href,
  onClick,
  className = ''
}) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    pink: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
  }

  const content = (
    <div className={`flex flex-col items-center gap-2 mobile-touch-target px-4 hover:bg-surface-hover rounded-2xl transition-colors mobile-button-press ${className}`}>
      <div className={`w-14 h-14 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
        <Icon className="w-7 h-7" />
      </div>
      <span className="text-xs text-muted text-center">{label}</span>
    </div>
  )

  if (href) {
    return <a href={href}>{content}</a>
  }

  return (
    <button onClick={onClick}>
      {content}
    </button>
  )
}

interface MobileSupportEmptyStateProps {
  icon: LucideIcon
  title: string
  desc: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export const MobileSupportEmptyState: React.FC<MobileSupportEmptyStateProps> = ({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div className={`text-center py-12 ${className}`}>
      <Icon className="w-16 h-16 text-muted mx-auto mb-4" />
      <h3 className="font-bold text-lg text-fg mb-2">{title}</h3>
      <p className="text-muted mb-6">{desc}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-2xl font-medium hover:bg-primary-hover transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

interface MobileSupportLoadingProps {
  count?: number
  className?: string
}

export const MobileSupportLoading: React.FC<MobileSupportLoadingProps> = ({
  count = 5,
  className = ''
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {[...Array(count)].map((_, idx) => (
        <div key={idx} className="bg-surface border border-border rounded-2xl p-4 animate-pulse">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-3 h-3 bg-surface-hover rounded-full mt-2"></div>
            <div className="flex-1">
              <div className="h-4 bg-surface-hover rounded mb-2 w-3/4"></div>
              <div className="h-3 bg-surface-hover rounded w-1/2"></div>
            </div>
            <div className="h-6 bg-surface-hover rounded-full w-16"></div>
          </div>
          <div className="flex gap-2">
            <div className="h-3 bg-surface-hover rounded w-20"></div>
            <div className="h-3 bg-surface-hover rounded w-16"></div>
          </div>
        </div>
      ))}
    </div>
  )
}