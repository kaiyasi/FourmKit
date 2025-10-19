import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  FileText,
  Bug,
  Lightbulb,
  HelpCircle,
  Shield,
  Users,
  Zap,
  Star
} from 'lucide-react';

/**
 *
 */
export interface BaseTicket {
  id: string;
  ticket_id: string;
  subject: string;
  status: 'open' | 'awaiting_user' | 'awaiting_admin' | 'resolved' | 'closed';
  category: 'technical' | 'account' | 'feature' | 'bug' | 'abuse' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  last_activity_at: string;
  message_count: number;
  user_name: string;
  tags?: string[];
}

/**
 *
 */
export interface BaseMessage {
  id: string;
  message: string;
  author_type: 'user' | 'admin';
  author_name: string;
  created_at: string;
  attachments?: BaseAttachment[];
  is_internal?: boolean;
}

/**
 *
 */
export interface BaseAttachment {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  content_type: string;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInDays > 7) {
    return date.toLocaleDateString('zh-TW');
  } else if (diffInDays > 0) {
    return `${diffInDays}天前`;
  } else if (diffInHours > 0) {
    return `${diffInHours}小時前`;
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes}分鐘前`;
  } else {
    return '剛剛';
  }
};

export const formatFullDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const getStatusInfo = (status: string) => {
  const statusMap = {
    open: { 
      label: '開啟', 
      color: 'bg-blue-100 text-blue-800 border-blue-200', 
      mobileColor: 'bg-blue-500 text-white',
      icon: AlertCircle 
    },
    awaiting_user: { 
      label: '等待回覆', 
      color: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
      mobileColor: 'bg-orange-500 text-white',
      icon: Clock 
    },
    awaiting_admin: { 
      label: '處理中', 
      color: 'bg-purple-100 text-purple-800 border-purple-200', 
      mobileColor: 'bg-purple-500 text-white',
      icon: Clock 
    },
    resolved: { 
      label: '已解決', 
      color: 'bg-green-100 text-green-800 border-green-200', 
      mobileColor: 'bg-green-500 text-white',
      icon: CheckCircle2 
    },
    closed: { 
      label: '已關閉', 
      color: 'bg-gray-100 text-gray-800 border-gray-200', 
      mobileColor: 'bg-gray-500 text-white',
      icon: X 
    }
  };
  return statusMap[status as keyof typeof statusMap] || statusMap.open;
};

export const getPriorityInfo = (priority: string) => {
  const priorityMap = {
    low: { label: '低', color: 'text-gray-500', bgColor: 'bg-gray-50', dotColor: 'bg-gray-400' },
    medium: { label: '中', color: 'text-blue-500', bgColor: 'bg-blue-50', dotColor: 'bg-blue-500' },
    high: { label: '高', color: 'text-orange-500', bgColor: 'bg-orange-50', dotColor: 'bg-orange-500' },
    urgent: { label: '緊急', color: 'text-red-500', bgColor: 'bg-red-50', dotColor: 'bg-red-500' }
  };
  return priorityMap[priority as keyof typeof priorityMap] || priorityMap.medium;
};

export const getCategoryInfo = (category: string) => {
  const categoryMap = {
    technical: { label: '技術支援', icon: HelpCircle, color: 'text-blue-600' },
    account: { label: '帳戶問題', icon: Users, color: 'text-green-600' },
    feature: { label: '功能建議', icon: Lightbulb, color: 'text-yellow-600' },
    bug: { label: '錯誤回報', icon: Bug, color: 'text-red-600' },
    abuse: { label: '濫用檢舉', icon: Shield, color: 'text-purple-600' },
    other: { label: '其他問題', icon: FileText, color: 'text-gray-600' }
  };
  return categoryMap[category as keyof typeof categoryMap] || categoryMap.other;
};

interface StatusBadgeProps {
  status: string;
  variant?: 'desktop' | 'mobile';
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  variant = 'desktop',
  size = 'md' 
}) => {
  const statusInfo = getStatusInfo(status);
  const StatusIcon = statusInfo.icon;
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5'
  };
  
  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${
      variant === 'mobile' ? statusInfo.mobileColor : statusInfo.color
    } ${sizeClasses[size]}`}>
      <StatusIcon className={`mr-1 ${iconSizes[size]}`} />
      {statusInfo.label}
    </span>
  );
};

interface PriorityBadgeProps {
  priority: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ 
  priority, 
  showIcon = true,
  size = 'md'
}) => {
  const priorityInfo = getPriorityInfo(priority);
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1'
  };

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${priorityInfo.color} ${priorityInfo.bgColor} ${sizeClasses[size]}`}>
      {showIcon && <div className={`w-2 h-2 rounded-full mr-1.5 ${priorityInfo.dotColor}`} />}
      {priorityInfo.label}
    </span>
  );
};

interface CategoryBadgeProps {
  category: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ 
  category, 
  showIcon = true,
  size = 'md'
}) => {
  const categoryInfo = getCategoryInfo(category);
  const CategoryIcon = categoryInfo.icon;
  
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm'
  };
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4'
  };

  return (
    <div className={`inline-flex items-center ${categoryInfo.color} ${sizeClasses[size]}`}>
      {showIcon && <CategoryIcon className={`mr-1 ${iconSizes[size]}`} />}
      <span>{categoryInfo.label}</span>
    </div>
  );
};

interface UrgentBadgeProps {
  priority: string;
  size?: 'sm' | 'md';
}

export const UrgentBadge: React.FC<UrgentBadgeProps> = ({ priority, size = 'md' }) => {
  if (priority !== 'urgent') return null;

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4'
  };

  return <Zap className={`text-red-500 ${sizeClasses[size]} animate-pulse`} />;
};

interface SatisfactionRatingProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
}

export const SatisfactionRating: React.FC<SatisfactionRatingProps> = ({
  rating,
  size = 'md',
  showValue = false
}) => {
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${sizeClasses[size]} ${
            star <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
          }`}
        />
      ))}
      {showValue && (
        <span className="ml-2 text-sm text-gray-600">
          {rating}/5
        </span>
      )}
    </div>
  );
};

interface AttachmentPreviewProps {
  attachment: BaseAttachment;
  variant?: 'list' | 'compact';
  onDownload?: () => void;
  onRemove?: () => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  variant = 'list',
  onDownload,
  onRemove
}) => {
  const isImage = attachment.content_type.startsWith('image/');
  
  if (variant === 'compact') {
    return (
      <div className="flex items-center bg-gray-50 rounded p-2 text-sm">
        <span className="flex-1 truncate">{attachment.filename}</span>
        <span className="ml-2 text-xs text-gray-500">
          {formatFileSize(attachment.file_size)}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-2 text-gray-400 hover:text-red-500"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg">
      <div className="flex-shrink-0">
        {isImage ? (
          <img
            src={attachment.file_path}
            alt={attachment.filename}
            className="w-12 h-12 object-cover rounded"
          />
        ) : (
          <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
            <FileText className="w-6 h-6 text-gray-400" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {attachment.filename}
        </p>
        <p className="text-sm text-gray-500">
          {formatFileSize(attachment.file_size)}
        </p>
      </div>
      <div className="flex items-center space-x-2">
        {onDownload && (
          <button
            onClick={onDownload}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            下載
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-red-600 hover:text-red-800 text-sm"
          >
            移除
          </button>
        )}
      </div>
    </div>
  );
};

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  text = '載入中...'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]}`} />
      {text && (
        <p className="mt-2 text-sm text-gray-500">{text}</p>
      )}
    </div>
  );
};

interface EmptyStateProps {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action
}) => {
  return (
    <div className="text-center py-12">
      <Icon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};