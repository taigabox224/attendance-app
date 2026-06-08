import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type ViewMode } from '../auth/AuthContext';

// editor+ のみ表示。「ユーザー」を選ぶと viewer 相当の見え方になり、
// 下書きイベント・新規作成・編集ボタン等の管理者向け要素が隠れる。
// viewer ロールには表示されない (元から見えない要素しかないため)。
export function ModeToggle() {
  const { user, viewMode, setViewMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;
  if (user.role === 'viewer') return null;

  function switchTo(m: ViewMode) {
    setViewMode(m);
    // ユーザー画面では /admin/* (管理者向けページ) にとどまれないので
    // 自動で /events に逃がす。管理者画面に戻る時はその場に留まる。
    if (m === 'user' && location.pathname.startsWith('/admin')) {
      navigate('/events');
    }
  }

  return (
    <div className="mode-toggle-bar">
      <div className="mode-toggle">
        <button
          className={viewMode === 'user' ? 'active' : ''}
          onClick={() => switchTo('user')}
          type="button"
        >
          ユーザー
        </button>
        <button
          className={viewMode === 'admin' ? 'active' : ''}
          onClick={() => switchTo('admin')}
          type="button"
        >
          管理者
        </button>
      </div>
    </div>
  );
}
