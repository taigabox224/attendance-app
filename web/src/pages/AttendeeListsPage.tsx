import { Link } from 'react-router-dom';

// TODO: 後続コミットでリスト CRUD + EventForm からの適用を実装する
export function AttendeeListsPage() {
  return (
    <div className="screen">
      <Link to="/admin/users" className="back-link">ユーザー管理へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">参加者リスト</h1>
        <p className="screen-sub">理事会メンバー等、繰り返し使う参加者集合を保存します</p>
      </header>
      <div className="empty-state">
        <div className="glyph">○</div>
        <div className="hint">
          この機能は次のアップデートで追加されます。
        </div>
      </div>
    </div>
  );
}
