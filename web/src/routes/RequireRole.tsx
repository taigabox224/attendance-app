import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';

const ROLE_LEVEL: Record<Role, number> = {
  sysadmin: 3,
  editor: 2,
  viewer: 1,
};

export function RequireRole({ minimum }: { minimum: Role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (ROLE_LEVEL[user.role] < ROLE_LEVEL[minimum]) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
