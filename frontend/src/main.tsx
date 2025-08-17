import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
import App from './App'
import AuthPage from './pages/AuthPage'
import ModePage from './pages/ModePage'
import Forbidden403 from './pages/Forbidden403'
import CreatePostPage from './pages/CreatePostPage'
import { RequireAuth, RequireRoles } from './router/guards'
import RouteError from './components/ui/RouteError'

const router = createBrowserRouter([
	{ path: "/", element: <App />, errorElement: <RouteError /> },
	{ path: "/auth", element: <AuthPage />, errorElement: <RouteError /> },
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
	{ 
		path: "/mode", 
		element: (
			<RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
				<ModePage />
			</RequireRoles>
		),
		errorElement: <RouteError />,
	},
	// 管理員路由重導向到 /mode
	{ 
		path: "/admin", 
		element: (
			<RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin', 'campus_moder', 'cross_moder']}>
				<ModePage />
			</RequireRoles>
		),
		errorElement: <RouteError />,
	},
	{ 
		path: "/settings/admin", 
		element: (
			<RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
				<ModePage />
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
