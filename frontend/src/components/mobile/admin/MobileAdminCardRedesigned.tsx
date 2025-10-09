import React from 'react'
import { Link } from 'react-router-dom'
import { LucideIcon, ArrowUpRight, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

interface MobileAdminCardProps {
  to: string
  title: string
  desc: string
  icon: LucideIcon
  disabled?: boolean
  stats?: string
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow' | 'gray'
  urgent?: boolean
  className?: string
}

export const MobileAdminCardRedesigned: React.FC<MobileAdminCardProps> = ({
  to,
  title,
  desc,
  icon: Icon,
  disabled = false,
  stats,
  color = 'blue',
  urgent = false,
  className = ''
}) => {
  const colorClasses = {
    blue: 'from-blue-500 to-cyan-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-violet-600',
    orange: 'from-orange-500 to-red-500',
    pink: 'from-pink-500 to-rose-600',
    yellow: 'from-yellow-500 to-orange-500',
    gray: 'from-gray-500 to-slate-600'
  }

  const cardContent = (
    <div className={`group relative overflow-hidden rounded-3xl border border-border bg-surface shadow-soft hover:shadow-medium transition-all duration-300 ${
      disabled ? 'opacity-60' : 'hover:scale-105 active:scale-95'
    } ${className}`}>
      {/* 背景漸層 */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} opacity-5 group-hover:opacity-10 transition-opacity`}></div>
      
      {urgent && (
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <AlertTriangle className="w-4 h-4 text-red-500" />
        </div>
      )}
      
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center shadow-lg`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          {stats && (
            <div className="text-right">
              <div className="text-2xl font-bold text-fg">{stats}</div>
              <div className="text-xs text-muted">項目</div>
            </div>
          )}
        </div>
        
        <div>
          <h3 className="font-bold text-lg text-fg mb-2 group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-sm text-muted leading-relaxed">{desc}</p>
        </div>
        
        <div className="absolute bottom-4 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  )

  if (disabled) {
    return cardContent
  }

  return <Link to={to}>{cardContent}</Link>
}

interface MobileAdminStatCardProps {
  title: string
  value: string | number
  change?: string
  icon: LucideIcon
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow' | 'gray'
  className?: string
}

export const MobileAdminStatCardRedesigned: React.FC<MobileAdminStatCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  color = 'blue',
  className = ''
}) => {
  const isPositive = change && parseFloat(change.replace('%', '')) > 0
  
  const colorClasses = {
    blue: 'from-blue-500 to-cyan-600',
    green: 'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-violet-600',
    orange: 'from-orange-500 to-red-500',
    pink: 'from-pink-500 to-rose-600',
    yellow: 'from-yellow-500 to-orange-500',
    gray: 'from-gray-500 to-slate-600'
  }

  return (
    <div className={`bg-surface border border-border rounded-2xl p-4 shadow-soft hover:shadow-medium transition-shadow ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {change && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isPositive 
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {change}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-fg mb-1">{value}</div>
      <div className="text-sm text-muted">{title}</div>
    </div>
  )
}

interface MobileAdminListItemProps {
  title: string
  desc?: string
  value?: string | number
  icon: LucideIcon
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow' | 'gray' | 'red'
  onClick?: () => void
  className?: string
  status?: 'normal' | 'warning' | 'error' | 'success'
}

export const MobileAdminListItemRedesigned: React.FC<MobileAdminListItemProps> = ({
  title,
  desc,
  value,
  icon: Icon,
  color = 'blue',
  onClick,
  className = '',
  status = 'normal'
}) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    pink: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
  }

  const statusIndicator = {
    normal: '',
    warning: 'ring-2 ring-yellow-200 dark:ring-yellow-800',
    error: 'ring-2 ring-red-200 dark:ring-red-800',
    success: 'ring-2 ring-green-200 dark:ring-green-800'
  }

  return (
    <div
      className={`flex items-center justify-between p-3 bg-surface-hover rounded-xl ${statusIndicator[status]} ${
        onClick ? 'cursor-pointer hover:bg-surface-active' : ''
      } transition-colors ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="font-medium text-fg">{title}</div>
          {desc && <div className="text-sm text-muted">{desc}</div>}
        </div>
      </div>
      {value && (
        <div className="text-right">
          <div className="text-lg font-bold text-fg">{value}</div>
        </div>
      )}
    </div>
  )
}

interface MobileAdminAlertProps {
  title: string
  desc: string
  type?: 'info' | 'warning' | 'error' | 'success'
  icon?: LucideIcon
  onDismiss?: () => void
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary'
  }>
  className?: string
}

export const MobileAdminAlert: React.FC<MobileAdminAlertProps> = ({
  title,
  desc,
  type = 'info',
  icon: Icon,
  onDismiss,
  actions,
  className = ''
}) => {
  const typeStyles = {
    info: {
      bg: 'from-blue-500/10 to-cyan-500/10',
      border: 'border-blue-200 dark:border-blue-800',
      icon: 'text-blue-600 dark:text-blue-400',
      title: 'text-blue-800 dark:text-blue-400',
      desc: 'text-blue-600 dark:text-blue-500'
    },
    warning: {
      bg: 'from-yellow-500/10 to-orange-500/10',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: 'text-yellow-600 dark:text-yellow-400',
      title: 'text-yellow-800 dark:text-yellow-400',
      desc: 'text-yellow-600 dark:text-yellow-500'
    },
    error: {
      bg: 'from-red-500/10 to-pink-500/10',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-600 dark:text-red-400',
      title: 'text-red-800 dark:text-red-400',
      desc: 'text-red-600 dark:text-red-500'
    },
    success: {
      bg: 'from-green-500/10 to-emerald-500/10',
      border: 'border-green-200 dark:border-green-800',
      icon: 'text-green-600 dark:text-green-400',
      title: 'text-green-800 dark:text-green-400',
      desc: 'text-green-600 dark:text-green-500'
    }
  }

  const styles = typeStyles[type]

  return (
    <div className={`bg-gradient-to-r ${styles.bg} border ${styles.border} rounded-2xl p-4 ${className}`}>
      <div className="flex items-start gap-3 mb-3">
        {Icon && (
          <div className={`w-8 h-8 rounded-full bg-current/10 flex items-center justify-center ${styles.icon}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1">
          <h3 className={`font-bold ${styles.title} mb-1`}>{title}</h3>
          <p className={`text-sm ${styles.desc}`}>{desc}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`p-1 hover:bg-current/10 rounded-lg transition-colors ${styles.icon}`}
          >
            <ArrowUpRight className="w-4 h-4 rotate-45" />
          </button>
        )}
      </div>
      
      {actions && actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={action.onClick}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                action.variant === 'primary'
                  ? `bg-current/20 ${styles.title} hover:bg-current/30`
                  : `bg-current/10 ${styles.desc} hover:bg-current/20`
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}