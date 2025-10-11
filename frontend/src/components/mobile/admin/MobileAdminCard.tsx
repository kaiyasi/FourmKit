import React from 'react'
import { ChevronRight } from 'lucide-react'

/**
 *
 */
export interface MobileAdminCardProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  description?: string
  status?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  badge?: {
    text: string
    variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  }
  icon?: React.ReactNode
  actions?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  compact?: boolean
}

/**
 *
 */
export function MobileAdminCard({
  title,
  subtitle,
  description,
  status = 'neutral',
  badge,
  icon,
  actions,
  onClick,
  disabled = false,
  loading = false,
  compact = false
}: MobileAdminCardProps) {
  const isClickable = !!onClick && !disabled && !loading

  const getStatusStyles = (variant: string) => {
    const styles = {
      success: 'border-green-200 bg-green-50/50 dark:border-green-800/30 dark:bg-green-900/10',
      warning: 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-800/30 dark:bg-yellow-900/10',
      danger: 'border-red-200 bg-red-50/50 dark:border-red-800/30 dark:bg-red-900/10',
      info: 'border-blue-200 bg-blue-50/50 dark:border-blue-800/30 dark:bg-blue-900/10',
      neutral: 'border-border bg-surface'
    }
    return styles[variant as keyof typeof styles] || styles.neutral
  }

  const getBadgeStyles = (variant: string) => {
    const styles = {
      success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
    }
    return styles[variant as keyof typeof styles] || styles.neutral
  }

  if (loading) {
    return (
      <div className={`rounded-2xl border p-4 ${getStatusStyles('neutral')} animate-pulse`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-xl dark:bg-gray-700" />
          <div className="flex-1 min-w-0">
            <div className="h-5 bg-gray-200 rounded mb-2 dark:bg-gray-700" />
            <div className="h-4 bg-gray-200 rounded w-3/4 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`
        rounded-2xl border transition-all duration-200
        ${getStatusStyles(status)}
        ${isClickable 
          ? 'cursor-pointer hover:bg-surface-hover active:scale-[0.98] touch-manipulation' 
          : ''
        }
        ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
        ${compact ? 'p-3' : 'p-4'}
      `}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
    >
      <div className="flex items-start gap-3">
        
        {icon && (
          <div className={`flex-shrink-0 ${compact ? 'p-2' : 'p-2.5'} rounded-xl bg-surface-hover border border-border`}>
            {icon}
          </div>
        )}

        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className={`font-semibold text-fg truncate ${compact ? 'text-sm' : 'text-base'}`}>
                {title}
              </h3>
              {badge && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${getBadgeStyles(badge.variant)}`}>
                  {badge.text}
                </span>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {actions}
              </div>
            )}
          </div>

          {subtitle && (
            <p className={`text-muted mb-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              {subtitle}
            </p>
          )}

          {description && (
            <p className={`text-muted ${compact ? 'text-xs' : 'text-sm'} line-clamp-2`}>
              {description}
            </p>
          )}
        </div>

        
        {isClickable && (
          <div className="flex-shrink-0 ml-2">
            <ChevronRight className="w-5 h-5 text-muted" />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 *
 */
export function MobileAdminListItem({
  title,
  subtitle,
  badge,
  icon,
  onClick,
  disabled = false
}: Pick<MobileAdminCardProps, 'title' | 'subtitle' | 'badge' | 'icon' | 'onClick' | 'disabled'>) {
  return (
    <MobileAdminCard
      title={title}
      subtitle={subtitle}
      badge={badge}
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      compact={true}
    />
  )
}

/**
 *
 */
export function MobileAdminStatCard({
  title,
  value,
  change,
  trend
}: {
  title: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
}) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up': return 'text-green-600'
      case 'down': return 'text-red-600'
      default: return 'text-muted'
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">{title}</span>
        {change && (
          <span className={`text-xs font-medium ${getTrendColor()}`}>
            {trend === 'up' && '↗'} {trend === 'down' && '↘'} {change}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-fg">
        {value}
      </div>
    </div>
  )
}