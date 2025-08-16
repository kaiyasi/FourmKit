import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
import App from './App'
import AuthPage from './pages/AuthPage'
import ModePage from './pages/ModePage'
import Forbidden403 from './pages/Forbidden403'
import { RequireAuth, RequireRoles } from './router/guards'

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/auth", element: <AuthPage /> },
  { path: "/403", element: <Forbidden403 /> },
  { 
    path: "/mode", 
    element: (
      <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
        <ModePage />
      </RequireRoles>
    )
  },
  // 管理員路由重導向到 /mode
  { 
    path: "/admin", 
    element: (
      <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin', 'campus_moder', 'cross_moder']}>
        <ModePage />
      </RequireRoles>
    )
  },
  { 
    path: "/settings/admin", 
    element: (
      <RequireRoles allow={['dev_admin', 'campus_admin', 'cross_admin']}>
        <ModePage />
      </RequireRoles>
    )
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
