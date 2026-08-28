import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import VxLayout from './layouts/VxLayout';
import Dashboard from './pages/Dashboard';
import BookList from './pages/BookList';
import BookDetail from './pages/BookDetail';
import ChapterDetail from './pages/ChapterDetail';
import AiVoices from './pages/AiVoices';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { isLoggedIn } from './auth';
import './index.css';

/** 路由守卫：未登录跳转登录页 */
function RequireAuth({ children }: { children: React.ReactElement }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<VxLayout />}>
            <Route path="/" element={<RequireAuth><Navigate to="/dashboard" replace /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/books" element={<RequireAuth><BookList /></RequireAuth>} />
            <Route path="/books/:bookId" element={<RequireAuth><BookDetail /></RequireAuth>} />
            <Route path="/books/:bookId/chapters/:chapterId" element={<RequireAuth><ChapterDetail /></RequireAuth>} />
            <Route path="/voices" element={<RequireAuth><AiVoices /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
