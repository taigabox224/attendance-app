import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';

interface OrderableUser {
  id: string;
  name: string;
  department: string | null;
  title: string | null;
  status: 'active' | 'inactive' | 'left';
  display_order: number | null;
}

function compareUser(a: OrderableUser, b: OrderableUser): number {
  const aHas = a.display_order !== null;
  const bHas = b.display_order !== null;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas) {
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  }
  return a.name.localeCompare(b.name, 'ja');
}

interface Props {
  onClose: () => void;
}

// ユーザー表示順編集モーダル (legacy modal-user-order)
export function UserOrderModal({ onClose }: Props) {
  const [users, setUsers] = useState<OrderableUser[]>([]);
  const [original, setOriginal] = useState<OrderableUser[]>([]);
  const [includeLeft, setIncludeLeft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<{ users: OrderableUser[] }>('/api/admin/users');
      const sorted = [...d.users].sort(compareUser);
      setUsers(sorted);
      setOriginal(sorted);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = users.filter((u) => includeLeft || u.status !== 'left');

  function move(id: string, dir: -1 | 1) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
    setSavedMsg(null);
  }

  function moveToEdge(id: string, edge: 'top' | 'bottom') {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const [u] = next.splice(idx, 1);
      if (!u) return prev;
      if (edge === 'top') next.unshift(u);
      else next.push(u);
      return next;
    });
    setSavedMsg(null);
  }

  const dirty = users.some((u, i) => u.id !== original[i]?.id);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api('/api/admin/users/order', {
        method: 'PUT',
        body: JSON.stringify({ user_ids: users.map((u) => u.id) }),
      });
      setSavedMsg('表示順を保存しました');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

  function resetToName() {
    setUsers((prev) =>
      [...prev].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    );
    setSavedMsg(null);
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" aria-hidden="true" />
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
        <h2>ユーザー表示順</h2>
        <p
          className="note"
          style={{ margin: '0 0 14px', fontSize: 12 }}
        >
          招待時の参加者選択画面に出てくる並び順を編集します。
        </p>

        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="success">{savedMsg}</p>}

        <div
          className="action-row"
          style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}
        >
          <label className="check" style={{ flex: '1 1 auto', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={includeLeft}
              onChange={(e) => setIncludeLeft(e.target.checked)}
            />
            <span>退会者も表示</span>
          </label>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={resetToName}
            title="現在の並びを五十音順にリセット (未保存)"
          >
            名前順にリセット
          </button>
        </div>

        {loading ? (
          <p>読込中...</p>
        ) : visible.length === 0 ? (
          <p className="note">ユーザーがいません。</p>
        ) : (
          <ul className="order-list">
            {visible.map((u, i) => {
              const fullIndex = users.findIndex((x) => x.id === u.id);
              const isFirst = fullIndex === 0;
              const isLast = fullIndex === users.length - 1;
              return (
                <li key={u.id} className="order-row">
                  <span className="order-index">{i + 1}</span>
                  <span className="order-name">
                    {u.name}
                    {u.status !== 'active' && (
                      <span
                        className={`status-badge ${
                          u.status === 'left' ? 'badge-no' : 'badge-pending'
                        }`}
                        style={{ marginLeft: 6 }}
                      >
                        {u.status === 'left' ? '退会' : '休会'}
                      </span>
                    )}
                    {(u.department || u.title) && (
                      <span className="order-sub">
                        {u.department}
                        {u.department && u.title && ' · '}
                        {u.title}
                      </span>
                    )}
                  </span>
                  <span className="order-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => moveToEdge(u.id, 'top')}
                      disabled={isFirst}
                      aria-label="先頭に移動"
                      title="先頭"
                    >
                      ⤒
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => move(u.id, -1)}
                      disabled={isFirst}
                      aria-label="上へ"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => move(u.id, 1)}
                      disabled={isLast}
                      aria-label="下へ"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => moveToEdge(u.id, 'bottom')}
                      disabled={isLast}
                      aria-label="末尾に移動"
                      title="末尾"
                    >
                      ⤓
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="action-row" style={{ marginTop: 16, gap: 8 }}>
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1 }}
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            style={{ flex: 1 }}
          >
            {saving ? '保存中...' : dirty ? '表示順を保存' : '変更なし'}
          </button>
        </div>
      </div>
    </div>
  );
}
