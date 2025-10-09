/**
 * Instagram 管理導航列
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const IGNavigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/admin/ig/dashboard', label: '儀表板' },
    { path: '/admin/ig/accounts', label: '帳號管理' },
    { path: '/admin/ig/templates', label: '模板管理' },
    { path: '/admin/ig/fonts', label: '字體管理' },
    { path: '/admin/ig/queue', label: '發布佇列' },
  ];

  return (
    <nav className="bg-surface shadow-sm border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center space-x-1 overflow-x-auto">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  px-4 py-3 text-sm font-medium whitespace-nowrap
                  border-b-2 transition-colors
                  ${isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-fg hover:border-border'
                  }
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default IGNavigation;
