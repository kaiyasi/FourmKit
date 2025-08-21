import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
import App from './App'
import AuthPage from './pages/AuthPage'
import ModePage from './pages/ModePage'
import UnderDevelopment from './pages/UnderDevelopment'
import GeneralAdminPage from './pages/GeneralAdminPage'
import Forbidden403 from './pages/Forbidden403'
import CreatePostPage from './pages/CreatePostPage'
import { RequireAuth, RequireRoles } from './router/guards'
import RouteError from './components/ui/RouteError'

const router = createBrowserRouter([
	{ path: "/", element: <App />, errorElement: <RouteError /> },
    { path: "/auth", element: <AuthPage />, errorElement: <RouteError /> },
    // 公開頁面（尚未完成 -> 導向開發中頁）
    { path: "/boards", element: <UnderDevelopment />, errorElement: <RouteError /> },
    { path: "/about", element: <UnderDevelopment />, errorElement: <RouteError /> },
    { path: "/rules", element: <UnderDevelopment />, errorElement: <RouteError /> },
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
    // 個人設定（僅登入用戶可見 -> 開發中頁）
    { 
        path: "/settings/profile", 
        element: (
            <RequireAuth>
                <UnderDevelopment />
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
    // 管理頁（尚未完成 -> 仍按權限顯示，但導向開發中頁）
    { 
        path: "/admin", 
        element: (
            <RequireRoles allow={['admin','dev_admin','campus_admin','cross_admin','moderator','campus_moder','cross_moder']}>
                <GeneralAdminPage />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
    { 
        path: "/settings/admin", 
        element: (
            <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
                <UnderDevelopment />
            </RequireRoles>
        ),
        errorElement: <RouteError />,
    },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>,
)
