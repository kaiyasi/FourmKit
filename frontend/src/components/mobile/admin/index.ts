export { MobileAdminLayout } from './MobileAdminLayout'
export { MobileAdminDashboard } from './MobileAdminDashboard'
export { MobileAdminCard, MobileAdminListItem, MobileAdminStatCard } from './MobileAdminCard'
export { MobileAdminModeration } from './MobileAdminModeration'
export { MobileAdminSupport } from './MobileAdminSupport'

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

export const isMobileAdminRoute = (pathname: string): boolean => {
  return mobileAdminRoutes.some(route => 
    pathname === route.path || pathname.startsWith(route.path + '/')
  )
}

export const getMobileAdminRoute = (pathname: string) => {
  return mobileAdminRoutes.find(route => 
    pathname === route.path || pathname.startsWith(route.path + '/')
  )
}