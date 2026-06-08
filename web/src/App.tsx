import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { EventCreatePage } from './pages/EventCreatePage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventEditPage } from './pages/EventEditPage';
import { AttendeeListsPage } from './pages/AttendeeListsPage';
import { HomePage } from './pages/HomePage';
import { MastersPage } from './pages/MastersPage';
import { UserOrderPage } from './pages/UserOrderPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { RequireAuth } from './routes/RequireAuth';
import { RequirePasswordChanged } from './routes/RequirePasswordChanged';
import { RequireRole } from './routes/RequireRole';

// html5-qrcode が重いので受付モードに入った時だけロードする
const ReceptionPage = lazy(() =>
  import('./pages/ReceptionPage').then((m) => ({ default: m.ReceptionPage })),
);

function ReceptionRoute() {
  return (
    <Suspense
      fallback={
        <div className="screen">
          <p>カメラを準備中...</p>
        </div>
      }
    >
      <ReceptionPage />
    </Suspense>
  );
}

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
              <Route path="/events/:id/reception" element={<ReceptionRoute />} />
            </Route>
            <Route element={<RequireRole minimum="sysadmin" />}>
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/users/order" element={<UserOrderPage />} />
              <Route path="/admin/masters" element={<MastersPage />} />
              <Route path="/admin/attendee-lists" element={<AttendeeListsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
