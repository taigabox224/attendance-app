import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function RequirePasswordChanged() {
  const { user } = useAuth();
  if (user?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
