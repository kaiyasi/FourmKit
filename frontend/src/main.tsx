import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
import './styles/markdown.css'
import App from './App'
import AuthPage from './pages/AuthPage'
import ModePage from './pages/ModePage'
import SettingsPage from './pages/SettingsPage'
import BoardsPage from './pages/BoardsPage'
import GeneralAdminPage from './pages/GeneralAdminPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminCommentsMonitorPage from './pages/AdminCommentsMonitorPage'
import MyViolationsPage from './pages/MyViolationsPage'
import AdminUsersPage from './pages/admin/UsersPage'
import AdminSchoolsPage from './pages/admin/SchoolsPage'
import AdminIntegrationsPage from './pages/admin/IntegrationsPage'
import AdminPagesEditor from './pages/admin/PagesEditor'
import AdminChatPage from './pages/admin/ChatPage'
import AdminEventsPage from './pages/admin/EventsPage'
import SupportPage from './pages/SupportPage'
import AdminSupportInboxPage from './pages/admin/SupportInboxPage'
import AboutPage from './pages/AboutPage'
import RulesPage from './pages/RulesPage'
import Forbidden403 from './pages/Forbidden403'
import CreatePostPage from './pages/CreatePostPage'
import ThemeDesignerPage from './pages/ThemeDesignerPage'
import { RequireAuth, RequireRoles } from './router/guards'
import PostDetailPage from './pages/PostDetailPage'
import RouteError from './components/ui/RouteError'
import ExternalAccountErrorPage from './pages/ExternalAccountErrorPage'
import LoginRestrictedPage from './pages/LoginRestrictedPage'
import { initRestartCheck, startPeriodicRestartCheck } from './utils/auth'
import { AuthProvider } from './contexts/AuthContext'

// 在應用啟動時檢查重啟
initRestartCheck().catch(console.error);

// 啟動定期重啟檢查
const stopPeriodicCheck = startPeriodicRestartCheck();

// 在頁面卸載時清理
window.addEventListener('beforeunload', () => {
  stopPeriodicCheck();
});

const router = createBrowserRouter([
	{ path: "/", element: <App />, errorElement: <RouteError /> },
    { path: "/auth", element: <AuthPage />, errorElement: <RouteError /> },
    { path: "/error/external-account", element: <ExternalAccountErrorPage />, errorElement: <RouteError /> },
    { path: "/error/login-restricted", element: <LoginRestrictedPage />, errorElement: <RouteError /> },
    // 公開頁面：看板（貼文清單 + 發文）
    { path: "/boards", element: <BoardsPage />, errorElement: <RouteError /> },
    { path: "/about", element: <AboutPage />, errorElement: <RouteError /> },
    { path: "/rules", element: <RulesPage />, errorElement: <RouteError /> },
    { path: "/support", element: <SupportPage />, errorElement: <RouteError /> },
    { path: "/posts/:id", element: <PostDetailPage />, errorElement: <RouteError /> },
    { path: "/theme-designer", element: <ThemeDesignerPage />, errorElement: <RouteError /> },
	{ path: "/403", element: <Forbidden403 />, errorElement: <RouteError /> },
    { 
        path: "/create", 
        element: (
            <RequireAuth>
                <CreatePostPage />
            </RequireAuth>
        ),
        errorElement: <RouteError />,
    },
    // 個人設定（僅登入用戶可見）
    { 
        path: "/settings/profile", 
        element: (
            <RequireAuth>
                <SettingsPage />
            </RequireAuth>
        ),
        errorElement: <RouteError />,
    },
    { 
        path: "/mode", 
        element: (
            <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
                <ModePage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    // 後台主控台與子頁
    { 
        path: "/admin", 
        element: (
            <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                <AdminDashboard />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/admin/moderation",
        element: (
            <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                <GeneralAdminPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/admin/comments",
        element: (
            <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                <AdminCommentsMonitorPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/my-violations",
        element: <MyViolationsPage />,
        errorElement: <RouteError />,
    },
    {
        path: "/admin/users",
        element: (
            <RequireRoles allow={['dev_admin','campus_admin']}>
                <AdminUsersPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/admin/schools",
        element: (
            <RequireRoles allow={['dev_admin','campus_admin']}>
                <AdminSchoolsPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/admin/integrations",
        element: (
            <RequireRoles allow={['dev_admin','cross_admin','campus_admin']}>
                <AdminIntegrationsPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/admin/pages",
        element: (
            <RequireRoles allow={['dev_admin','cross_admin','campus_admin']}>
                <AdminPagesEditor />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
         {
         path: "/admin/chat",
         element: (
             <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                 <AdminChatPage />
             </RequireRoles>
         ),
         errorElement: <RouteError />,
     },
    {
        path: "/admin/events",
        element: (
            <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                <AdminEventsPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    {
        path: "/admin/support",
        element: (
            <RequireRoles allow={['dev_admin','campus_admin','cross_admin']}>
                <AdminSupportInboxPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    { 
        path: "/settings/admin", 
        element: (
            <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
                <SettingsPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },

]);

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<AuthProvider>
			<RouterProvider router={router} />
		</AuthProvider>
	</React.StrictMode>,
)
