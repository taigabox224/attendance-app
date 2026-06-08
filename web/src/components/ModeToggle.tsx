import { useAuth } from '../auth/AuthContext';

// editor+ のみ表示。「ユーザー」を選ぶと viewer 相当の見え方になり、
// 下書きイベント・新規作成・編集ボタン等の管理者向け要素が隠れる。
// viewer ロールには表示されない (元から見えない要素しかないため)。
export function ModeToggle() {
  const { user, viewMode, setViewMode } = useAuth();
  if (!user) return null;
  if (user.role === 'viewer') return null;

  return (
    <div className="mode-toggle-bar">
      <div className="mode-toggle">
        <button
          className={viewMode === 'user' ? 'active' : ''}
          onClick={() => setViewMode('user')}
          type="button"
        >
          ユーザー
        </button>
        <button
          className={viewMode === 'admin' ? 'active' : ''}
          onClick={() => setViewMode('admin')}
          type="button"
        >
          管理者
        </button>
      </div>
    </div>
  );
}
