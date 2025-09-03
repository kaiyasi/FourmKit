// 後台手機版元件導出
export { MobileAdminLayout } from './MobileAdminLayout'
export { MobileAdminDashboard } from './MobileAdminDashboard'
export { MobileAdminCard, MobileAdminListItem, MobileAdminStatCard } from './MobileAdminCard'
export { MobileAdminModeration } from './MobileAdminModeration'
export { MobileAdminSupport } from './MobileAdminSupport'

// 後台手機版路由配置
export const mobileAdminRoutes = [
  {
    path: '/admin',
    component: 'MobileAdminDashboard',
    title: '後台管理',
    icon: 'LayoutDashboard'
  },
  {
    path: '/admin/moderation',
    component: 'MobileAdminModeration',
    title: '審核管理',
    icon: 'ShieldCheck'
  },
  {
    path: '/admin/support',
    component: 'MobileAdminSupport',
    title: '客服管理',
    icon: 'LifeBuoy'
  }
]

// 判斷是否為手機版後台路由
export const isMobileAdminRoute = (pathname: string): boolean => {
  return mobileAdminRoutes.some(route => 
    pathname === route.path || pathname.startsWith(route.path + '/')
  )
}

// 獲取手機版後台路由配置
export const getMobileAdminRoute = (pathname: string) => {
  return mobileAdminRoutes.find(route => 
    pathname === route.path || pathname.startsWith(route.path + '/')
  )
}