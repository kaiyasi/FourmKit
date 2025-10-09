import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SupportPage from './SupportPage';
import AdminSupportPageNew from './admin/AdminSupportPageNew';

// Hook 檢測裝置類型
const useDeviceDetection = () => {
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      
      if (width <= 768) {
        setDeviceType('mobile');
      } else if (width <= 1024) {
        setDeviceType('tablet');
      } else {
        setDeviceType('desktop');
      }
    };

    // 初始檢測
    checkDevice();

    // 監聽窗口大小變化
    window.addEventListener('resize', checkDevice);
    
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return deviceType;
};

// Hook 檢測觸控支援
const useTouchDetection = () => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-ignore
        navigator.msMaxTouchPoints > 0
      );
    };

    checkTouch();
  }, []);

  return isTouchDevice;
};

const ResponsiveSupportPage: React.FC = () => {
  const { user } = useAuth();
  const deviceType = useDeviceDetection();
  const isTouchDevice = useTouchDetection();
  const [forceMode, setForceMode] = useState<'auto' | 'desktop' | 'admin'>('auto');

  // 初始化主題
  useEffect(() => {
    const html = document.documentElement;
    if (!html.getAttribute('data-theme')) html.setAttribute('data-theme', 'beige');
    html.classList.add('theme-ready');
    return () => html.classList.remove('theme-ready');
  }, []);

  // 判斷用戶是否為管理員
  const isAdmin = user?.role && ['dev_admin', 'campus_admin', 'cross_admin', 'campus_moderator', 'cross_moderator'].includes(user.role);

  // 決定顯示哪個界面
  const getUIMode = () => {
    if (forceMode !== 'auto') {
      return forceMode;
    }

    // 管理員優先使用管理界面（桌面端）
    if (isAdmin && deviceType !== 'mobile') {
      return 'admin';
    }

    // 所有其他情況使用統一的支援界面（包含響應式設計）
    return 'desktop';
  };

  const uiMode = getUIMode();

  // 渲染界面切換器（僅在開發環境顯示）
  const renderModeSelector = () => {
    if (process.env.NODE_ENV !== 'development') return null;

    return (
      <div className="fixed top-4 right-4 z-50 bg-black bg-opacity-80 text-white p-2 rounded-lg text-xs">
        <div className="mb-2">
          <strong>界面模式:</strong> {uiMode}
        </div>
        <div className="mb-2">
          <strong>裝置:</strong> {deviceType} {isTouchDevice ? '(觸控)' : ''}
        </div>
        <div className="mb-2">
          <strong>用戶角色:</strong> {user?.role || 'guest'}
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setForceMode('auto')}
            className={`px-2 py-1 text-xs rounded ${forceMode === 'auto' ? 'bg-blue-600' : 'bg-gray-600'}`}
          >
            自動選擇
          </button>
          <button
            onClick={() => setForceMode('desktop')}
            className={`px-2 py-1 text-xs rounded ${forceMode === 'desktop' ? 'bg-blue-600' : 'bg-gray-600'}`}
          >
            用戶界面
          </button>
          {isAdmin && (
            <button
              onClick={() => setForceMode('admin')}
              className={`px-2 py-1 text-xs rounded ${forceMode === 'admin' ? 'bg-blue-600' : 'bg-gray-600'}`}
            >
              管理界面
            </button>
          )}
        </div>
      </div>
    );
  };

  // 渲染對應的界面
  const renderPage = () => {
    switch (uiMode) {
      case 'admin':
        return <AdminSupportPageNew />;
      case 'desktop':
      default:
        return <SupportPage />;
    }
  };

  return (
    <>
      {renderPage()}
      {renderModeSelector()}
    </>
  );
};

export default ResponsiveSupportPage;