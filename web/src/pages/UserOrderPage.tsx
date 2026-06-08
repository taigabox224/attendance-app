import { Link } from 'react-router-dom';

// TODO: 後続コミットでドラッグ並び替え + display_order の永続化を実装する
export function UserOrderPage() {
  return (
    <div className="screen">
      <Link to="/admin/users" className="back-link">ユーザー管理へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">ユーザー表示順</h1>
        <p className="screen-sub">招待時のユーザー並び順を管理します</p>
      </header>
      <div className="empty-state">
        <div className="glyph">○</div>
        <div className="hint">
          この機能は次のアップデートで追加されます。
          <br />
          現状は登録日時(古い順)で並んでいます。
        </div>
      </div>
    </div>
  );
}
