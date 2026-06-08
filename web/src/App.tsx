import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { EventCreatePage } from './pages/EventCreatePage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventEditPage } from './pages/EventEditPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { RequireAuth } from './routes/RequireAuth';
import { RequirePasswordChanged } from './routes/RequirePasswordChanged';
import { RequireRole } from './routes/RequireRole';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<RequirePasswordChanged />}>
            {/* イベント一覧 (= ホーム) を /events に正規化し、/ はそこに redirect */}
            <Route path="/" element={<Navigate to="/events" replace />} />
            <Route path="/events" element={<HomePage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route element={<RequireRole minimum="editor" />}>
              <Route path="/events/new" element={<EventCreatePage />} />
              <Route path="/events/:id/edit" element={<EventEditPage />} />
            </Route>
            {/* legacy 互換: /events/:id/reception を踏んだら詳細にリダイレクト */}
            <Route
              path="/events/:id/reception"
              element={<Navigate to=".." relative="path" replace />}
            />
            <Route element={<RequireRole minimum="editor" />}>
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
            {/* legacy 互換: 旧 page ルートは /admin/users にリダイレクト
               (設定系は歯車メニュー → モーダルに統合されたため) */}
            <Route
              path="/admin/users/order"
              element={<Navigate to="/admin/users" replace />}
            />
            <Route
              path="/admin/masters"
              element={<Navigate to="/admin/users" replace />}
            />
            <Route
              path="/admin/attendee-lists"
              element={<Navigate to="/admin/users" replace />}
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
