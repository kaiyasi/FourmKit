import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
// 確保主題在應用啟動時即刻套用（不依賴 NavBar/ThemeToggle 出現）
import './lib/theme'
import './styles/markdown.css'
import App from './utils/App'
import AuthPage from './pages/AuthPage'
import ModePage from './pages/ModePage'
import SettingsPage from './pages/SettingsPage'
import BoardsPage from './pages/BoardsPage'
import ModerationPage from './pages/admin/ModerationPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminCommentsMonitorPage from './pages/admin/AdminCommentsMonitorPage'
import MyViolationsPage from './pages/MyViolationsPage'
import AdminUsersPage from './pages/admin/UsersPage'
import AdminSchoolsPage from './pages/admin/SchoolsPage'
import AdminIntegrationsPage from './pages/admin/IntegrationsPage'
import AdminPagesEditor from './pages/admin/PagesEditor'
// Instagram 整合系統
import IGAccountManagementPage from './pages/admin/ig/AccountManagementPage'
import IGPublishDashboardPage from './pages/admin/ig/PublishDashboardPage'
import IGTemplateManagementPage from './pages/admin/ig/TemplateManagementPage'
import IGFontManagementPage from './pages/admin/ig/FontManagementPage'
import IGQueueManagementPage from './pages/admin/ig/QueueManagementPage'
import IGPostDetailPage from './pages/admin/ig/PostDetailPage'
import IGAnalyticsPage from './pages/admin/ig/AnalyticsPage'
// 聊天室功能已移除
import AdminEventsPage from './pages/admin/EventsPage'
import AdminAnnouncementsPage from './pages/admin/AnnouncementsPage'
import SupportCenterPage from './pages/admin/SupportCenterPage'
import ServerStatusPage from './pages/admin/ServerStatusPage'
import ProjectStatusPage from './pages/admin/ProjectStatusPage'
import MemberManagementPage from './pages/admin/MemberManagementPage'
// FontManagementPage 已移除
// TokenManagementPage 已移除
import ResponsiveSupportPage from './pages/ResponsiveSupportPage'
import TicketTrackPage from './pages/TicketTrackPage'
import AboutPage from './pages/AboutPage'
import RulesPage from './pages/RulesPage'
import FAQPage from './pages/FAQPage'
import Forbidden403 from './pages/Forbidden403'
import CreatePostPage from './pages/CreatePostPage'
import ThemeDesignerPage from './pages/ThemeDesignerPage'
import { RequireAuth, RequireRoles } from './router/guards'
import PostDetailPage from './pages/PostDetailPage'
import RouteError from './components/ui/RouteError'
import ExternalAccountErrorPage from './pages/ExternalAccountErrorPage'
import RegisterConfirmPage from './pages/RegisterConfirmPage'
import LoginRestrictedPage from './pages/LoginRestrictedPage'
import Root from './router/Root';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import AdminChatPage from './pages/admin/AdminChatPage';

const router = createBrowserRouter([
    {
        element: <Root />,
        errorElement: <RouteError />,
        children: [
            { path: "/", element: <App /> },
            { path: "/auth", element: <AuthPage /> },
            { path: "/auth/register-confirm", element: <RegisterConfirmPage /> },
            { path: "/error/external-account", element: <ExternalAccountErrorPage /> },
            { path: "/error/login-restricted", element: <LoginRestrictedPage /> },
            { path: "/boards", element: <BoardsPage /> },
            { path: "/about", element: <AboutPage /> },
            { path: "/rules", element: <RulesPage /> },
            { path: "/faq", element: <FAQPage /> },
            { path: "/posts/:id", element: <PostDetailPage /> },
            { path: "/theme-designer", element: <ThemeDesignerPage /> },
            { path: "/403", element: <Forbidden403 /> },
            { path: "/create", element: <CreatePostPage /> },
            { 
                path: "/settings/profile", 
                element: (
                    <RequireAuth>
                        <SettingsPage />
                    </RequireAuth>
                ),
            },
            { 
                path: "/mode", 
                element: (
                    <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
                        <ModePage />
                    </RequireRoles>
                ),
            },
            { 
                path: "/admin", 
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                        <AdminDashboard />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/moderation",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                        <ModerationPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/comments",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                        <AdminCommentsMonitorPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/my-violations",
                element: <MyViolationsPage />,
            },
            {
                path: "/admin/users",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <AdminUsersPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/schools",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <AdminSchoolsPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/chat",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator']}>
                        <AdminChatPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/integrations",
                element: (
                    <RequireRoles allow={['dev_admin','cross_admin','campus_admin']}>
                        <AdminIntegrationsPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/pages",
                element: (
                    <RequireRoles allow={['dev_admin','cross_admin','campus_admin']}>
                        <AdminPagesEditor />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/events",
                element: (
                    <RequireRoles allow={['dev_admin']}>
                        <AdminEventsPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/platform",
                element: (
                    <RequireRoles allow={['dev_admin']}>
                        <ServerStatusPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/project",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin']}>
                        <ProjectStatusPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/members",
                element: (
                    <RequireRoles allow={['dev_admin']}>
                        <MemberManagementPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/announcements",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin']}>
                        <AdminAnnouncementsPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/support",
                element: <ResponsiveSupportPage />,
            },
            {
                path: "/support/track",
                element: <TicketTrackPage />,
            },
            {
                path: "/support/ticket/:id",
                element: <TicketTrackPage />,
            },
            {
                path: "/ticket-track",
                element: <TicketTrackPage />,
            },
            {
                path: "/admin/ig/dashboard",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGPublishDashboardPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/ig/accounts",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGAccountManagementPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/ig/templates",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGTemplateManagementPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/ig/fonts",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGFontManagementPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/ig/queue",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGQueueManagementPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/ig/posts/:id",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGPostDetailPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/ig/analytics",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin']}>
                        <IGAnalyticsPage />
                    </RequireRoles>
                ),
            },
            {
                path: "/admin/support",
                element: (
                    <RequireRoles allow={['dev_admin','campus_admin','cross_admin','campus_moderator','cross_moderator']}>
                        <SupportCenterPage />
                    </RequireRoles>
                ),
            },
            { 
                path: "/settings/admin", 
                element: (
                    <RequireRoles allow={['dev_admin', 'campus_admin', 'campus_moderator', 'cross_admin']}>
                        <SettingsPage />
                    </RequireRoles>
                ),
            },
        ]
    }
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
	<AuthProvider>
		<NotificationProvider>
			<AppProvider>
				<RouterProvider router={router} />
			</AppProvider>
		</NotificationProvider>
	</AuthProvider>
)
