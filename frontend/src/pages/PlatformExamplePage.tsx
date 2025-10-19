import React from 'react'
import { usePlatform } from '@/hooks/usePlatform'
import { PlatformPageLayout, MobileLayout, DesktopLayout, TabletLayout } from '@/components/layout/PlatformPageLayout'
import { ResponsiveContainer } from '@/components/layout/PlatformLayout'

/**
 *
 */
export default function PlatformExamplePage() {
  const platform = usePlatform()

  return (
    <PlatformPageLayout pathname="/platform-example">
      
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold dual-text mb-4">平台架構示例</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">設備資訊</h3>
            <div className="space-y-1">
              <div>設備類型: <span className="font-mono">{platform.deviceType}</span></div>
              <div>螢幕尺寸: <span className="font-mono">{platform.screenWidth} × {platform.screenHeight}</span></div>
              <div>方向: <span className="font-mono">{platform.orientation}</span></div>
              <div>觸控設備: <span className="font-mono">{platform.isTouchDevice ? '是' : '否'}</span></div>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">平台狀態</h3>
            <div className="space-y-1">
              <div>手機: <span className="font-mono">{platform.isMobile ? '✓' : '✗'}</span></div>
              <div>平板: <span className="font-mono">{platform.isTablet ? '✓' : '✗'}</span></div>
              <div>桌面: <span className="font-mono">{platform.isDesktop ? '✓' : '✗'}</span></div>
              <div>小螢幕: <span className="font-mono">{platform.isSmallScreen ? '✓' : '✗'}</span></div>
            </div>
          </div>
        </div>
      </div>

      
      <div className="space-y-6">
        
        <MobileLayout>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <h2 className="text-lg font-semibold text-blue-800 mb-2">📱 手機專用內容</h2>
            <p className="text-blue-700 text-sm">
              這部分內容只在手機設備上顯示，使用專用的手機佈局和樣式。
            </p>
            <div className="mt-3 space-y-2">
              <button className="platform-mobile-button bg-blue-500 text-white w-full">
                手機專用按鈕
              </button>
              <input 
                type="text" 
                placeholder="手機專用輸入框" 
                className="platform-mobile-input w-full"
              />
            </div>
          </div>
        </MobileLayout>

        
        <TabletLayout>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <h2 className="text-lg font-semibold text-green-800 mb-2">📱 平板專用內容</h2>
            <p className="text-green-700 text-sm">
              這部分內容只在平板設備上顯示，使用專用的平板佈局和樣式。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button className="platform-tablet-button bg-green-500 text-white">
                平板按鈕 1
              </button>
              <button className="platform-tablet-button bg-green-500 text-white">
                平板按鈕 2
              </button>
            </div>
          </div>
        </TabletLayout>

        
        <DesktopLayout>
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
            <h2 className="text-lg font-semibold text-purple-800 mb-2">🖥️ 桌面專用內容</h2>
            <p className="text-purple-700 text-sm">
              這部分內容只在桌面設備上顯示，使用專用的桌面佈局和樣式。
            </p>
            <div className="mt-3 flex gap-3">
              <button className="platform-desktop-button bg-purple-500 text-white">
                桌面按鈕 1
              </button>
              <button className="platform-desktop-button bg-purple-500 text-white">
                桌面按鈕 2
              </button>
              <button className="platform-desktop-button bg-purple-500 text-white">
                桌面按鈕 3
              </button>
            </div>
          </div>
        </DesktopLayout>

        
        <ResponsiveContainer 
          className="bg-surface border border-border rounded-2xl p-4 shadow-soft"
          mobileClassName="platform-mobile-container"
          tabletClassName="platform-tablet-container"
          desktopClassName="platform-desktop-container"
        >
          <h2 className="text-lg font-semibold dual-text mb-3">🔄 響應式容器</h2>
          <p className="text-muted text-sm mb-4">
            這個容器會根據平台自動應用不同的樣式，包括間距、圓角和陰影。
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="platform-card bg-surface-hover rounded-lg p-3">
              <h3 className="font-semibold mb-2">卡片 1</h3>
              <p className="text-sm text-muted">響應式卡片內容</p>
            </div>
            <div className="platform-card bg-surface-hover rounded-lg p-3">
              <h3 className="font-semibold mb-2">卡片 2</h3>
              <p className="text-sm text-muted">響應式卡片內容</p>
            </div>
            <div className="platform-card bg-surface-hover rounded-lg p-3">
              <h3 className="font-semibold mb-2">卡片 3</h3>
              <p className="text-sm text-muted">響應式卡片內容</p>
            </div>
          </div>
        </ResponsiveContainer>

        
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <h2 className="text-lg font-semibold dual-text mb-3">📝 平台特定文字</h2>
          
          <div className="space-y-3">
            <div>
              <h3 className="platform-text-sm font-semibold mb-1">小文字 (platform-text-sm)</h3>
              <p className="platform-text-sm text-muted">
                這段文字會根據平台自動調整大小和行高。
              </p>
            </div>
            
            <div>
              <h3 className="platform-text-base font-semibold mb-1">基本文字 (platform-text-base)</h3>
              <p className="platform-text-base text-muted">
                這段文字會根據平台自動調整大小和行高。
              </p>
            </div>
            
            <div>
              <h3 className="platform-text-lg font-semibold mb-1">大文字 (platform-text-lg)</h3>
              <p className="platform-text-lg text-muted">
                這段文字會根據平台自動調整大小和行高。
              </p>
            </div>
          </div>
        </div>

        
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <h2 className="text-lg font-semibold dual-text mb-3">📏 平台特定間距</h2>
          
          <div className="platform-gap-base">
            <div className="platform-gap-sm flex flex-wrap">
              <button className="platform-button bg-primary text-white px-4 py-2 rounded">
                按鈕 1
              </button>
              <button className="platform-button bg-primary text-white px-4 py-2 rounded">
                按鈕 2
              </button>
              <button className="platform-button bg-primary text-white px-4 py-2 rounded">
                按鈕 3
              </button>
            </div>
            
            <div className="platform-gap-lg grid grid-cols-1 md:grid-cols-2">
              <div className="bg-surface-hover rounded-lg p-3">
                <h3 className="font-semibold">間距項目 1</h3>
                <p className="text-sm text-muted">使用平台特定間距</p>
              </div>
              <div className="bg-surface-hover rounded-lg p-3">
                <h3 className="font-semibold">間距項目 2</h3>
                <p className="text-sm text-muted">使用平台特定間距</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PlatformPageLayout>
  )
}
