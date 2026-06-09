import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api } from '../api/client';

export const ROLES = ['sysadmin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  role: Role;
  department: string | null;
  title: string | null;
  email_verified_at: string | null;
  must_change_password: boolean;
}

export type ViewMode = 'user' | 'admin';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  // editor+ が「ユーザーから見た画面」「管理者画面」を切り替えるためのモード。
  // viewer はモード概念がない (常に user 相当)。
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // sessionStorage はタブごとに独立。新規タブで URL を開いた時は
    // 既存タブが admin でも引き継がれず 'user' で開始するのが意図。
    // 同タブ内のリロードでは保持される。
    const saved = sessionStorage.getItem('viewMode');
    if (saved === 'admin' || saved === 'user') return saved;
    return 'user';
  });

  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m);
    sessionStorage.setItem('viewMode', m);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        return;
      }
      throw e;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      // login レスポンスは部分情報なので /me を取り直して全フィールドを反映
      await refresh();
      // ログイン直後は常にユーザーモードで開く。前回 admin で抜けても
      // 次回ログインはユーザー画面から始めたい (運用ルール)。
      setViewModeState('user');
      sessionStorage.setItem('viewMode', 'user');
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ネットワークエラーでも UI はログアウト扱いにする
    }
    setUser(null);
    // 別ユーザーが同じ端末でログインしてくる可能性に備えて mode を初期化
    setViewModeState('user');
    sessionStorage.setItem('viewMode', 'user');
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, refresh, viewMode, setViewMode }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
