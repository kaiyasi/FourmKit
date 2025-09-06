import React from 'react';
import { 
  ArrowLeft, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  User,
  Calendar,
  Tag,
  Star,
  MoreVertical,
  Send,
  Paperclip,
  Eye,
  RefreshCw,
  Plus,
  Filter,
  Search
} from 'lucide-react';

// 統一的狀態顯示組件
export const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig = {
    open: { 
      icon: MessageSquare, 
      text: '開啟', 
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
    },
    awaiting_user: { 
      icon: Clock, 
      text: '等待用戶回應', 
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' 
    },
    awaiting_admin: { 
      icon: AlertCircle, 
      text: '等待管理員', 
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' 
    },
    resolved: { 
      icon: CheckCircle2, 
      text: '已解決', 
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' 
    },
    closed: { 
      icon: XCircle, 
      text: '已關閉', 
      className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' 
    }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${config.className}`}>
      <Icon className="w-4 h-4" />
      {config.text}
    </span>
  );
};

// 優先級顯示組件
export const PriorityBadge = ({ priority }: { priority: string }) => {
  const priorityConfig = {
    low: { text: '低', className: 'text-green-600 dark:text-green-400' },
    medium: { text: '中', className: 'text-yellow-600 dark:text-yellow-400' },
    high: { text: '高', className: 'text-orange-600 dark:text-orange-400' },
    urgent: { text: '緊急', className: 'text-red-600 dark:text-red-400' }
  };

  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${config.className}`}>
      <Star className="w-4 h-4" />
      {config.text}
    </span>
  );
};

// 分類顯示組件
export const CategoryBadge = ({ category }: { category: string }) => {
  const categoryConfig = {
    technical: { text: '技術問題', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    account: { text: '帳號問題', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
    feature: { text: '功能建議', className: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
    bug: { text: '錯誤報告', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    abuse: { text: '濫用舉報', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    other: { text: '其他', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' }
  };

  const config = categoryConfig[category as keyof typeof categoryConfig] || categoryConfig.other;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium ${config.className}`}>
      <Tag className="w-3.5 h-3.5" />
      {config.text}
    </span>
  );
};

// 工單卡片組件
interface TicketCardProps {
  ticket: {
    id: string;
    ticket_id: string;
    subject: string;
    status: string;
    category: string;
    priority: string;
    created_at: string;
    last_activity_at: string;
    message_count: number;
    user_name?: string;
  };
  onClick?: () => void;
  showUser?: boolean;
}

export const TicketCard = ({ ticket, onClick, showUser = false }: TicketCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return `${days} 天前`;
    } else {
      return date.toLocaleDateString('zh-TW');
    }
  };

  return (
    <div 
      className="bg-surface/70 backdrop-blur-md border border-border rounded-2xl p-6 hover:bg-surface-hover/70 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-fg truncate group-hover:text-primary transition-colors">
              {ticket.subject}
            </h3>
            <span className="text-sm text-muted font-mono">#{ticket.ticket_id}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={ticket.status} />
            <CategoryBadge category={ticket.category} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
        <div className="ml-4 text-right text-sm text-muted">
          <div className="flex items-center gap-1 mb-1">
            <Calendar className="w-4 h-4" />
            {formatDate(ticket.created_at)}
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {ticket.message_count} 則訊息
          </div>
        </div>
      </div>
      
      {showUser && ticket.user_name && (
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <User className="w-4 h-4 text-muted" />
          <span className="text-sm text-muted">{ticket.user_name}</span>
        </div>
      )}
    </div>
  );
};

// 頁面標題組件 - 支援返回按鈕和 NavBar
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
  isMobile?: boolean;
}

export const PageHeader = ({ 
  title, 
  subtitle, 
  showBackButton = false, 
  onBack, 
  actions,
  isMobile = false 
}: PageHeaderProps) => {
  return (
    <div className={`${isMobile ? 'px-4 py-6' : 'px-6 py-8'} border-b border-border bg-surface/50 backdrop-blur-sm`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <button
              onClick={onBack}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface border border-border hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-fg" />
            </button>
          )}
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-fg`}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

// 工具列組件
interface ToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filterOptions?: React.ReactNode;
  actions?: React.ReactNode;
  isMobile?: boolean;
}

export const Toolbar = ({ 
  searchValue = '', 
  onSearchChange, 
  filterOptions, 
  actions,
  isMobile = false 
}: ToolbarProps) => {
  return (
    <div className={`${isMobile ? 'px-4 py-4' : 'px-6 py-5'} border-b border-border bg-bg/80 backdrop-blur-sm`}>
      <div className={`flex items-center ${isMobile ? 'flex-col gap-4' : 'justify-between'}`}>
        {/* 搜尋區域 */}
        <div className={`${isMobile ? 'w-full' : 'flex-1 max-w-md'} relative`}>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            placeholder="搜尋工單..."
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-fg placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* 操作區域 */}
        <div className={`flex items-center gap-3 ${isMobile ? 'w-full justify-between' : ''}`}>
          {filterOptions}
          {actions}
        </div>
      </div>
    </div>
  );
};

// 空狀態組件
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="w-20 h-20 rounded-full bg-surface border border-border flex items-center justify-center mb-6 text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-semibold text-fg mb-2">{title}</h3>
      <p className="text-muted mb-6 max-w-md">{description}</p>
      {action}
    </div>
  );
};

// 載入狀態組件
export const LoadingSpinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex items-center justify-center py-8">
      <RefreshCw className={`${sizeClasses[size]} text-primary animate-spin`} />
    </div>
  );
};

// 按鈕組件
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  onClick, 
  disabled = false, 
  loading = false, 
  icon, 
  className = '' 
}: ButtonProps) => {
  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
    secondary: 'bg-surface border border-border text-fg hover:bg-surface-hover',
    danger: 'bg-danger text-danger-foreground hover:bg-danger-hover'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3',
    lg: 'px-6 py-4 text-lg'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors
        ${variantClasses[variant]} ${sizeClasses[size]}
        ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
};