import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { ApiError, api } from '../api/client';
import { formatDateTime } from '../lib/format';

interface PickerUser {
  id: string;
  name: string;
  department: string | null;
  title: string | null;
}

interface ListSummary {
  id: string;
  name: string;
  member_count: number;
  updated_at: string;
}

interface ListDetail {
  id: string;
  name: string;
  user_ids: string[];
  created_at: string;
  updated_at: string;
}

interface Props {
  onClose: () => void;
}

// 参加者リスト管理モーダル (legacy modal-attendee-lists)
// 一覧ビュー <-> エディタビューを内部で切替える (新規モーダルを重ねない)
export function AttendeeListsModal({ onClose }: Props) {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = 一覧ビュー, 'new' = 新規, string = id 編集
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<{ lists: ListSummary[] }>('/api/attendee-lists');
      setLists(d.lists);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(list: ListSummary) {
    if (!window.confirm(`「${list.name}」を削除しますか?`)) return;
    try {
      await api(`/api/attendee-lists/${list.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
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

        {editingId ? (
          <ListEditor
            listId={editingId === 'new' ? null : editingId}
            onBack={() => setEditingId(null)}
            onSaved={async () => {
              setEditingId(null);
              await load();
            }}
          />
        ) : (
          <>
            <h2>参加者リスト</h2>
            <p
              className="note"
              style={{ margin: '0 0 14px', fontSize: 12 }}
            >
              繰り返し使う参加者集合を保存して、イベント作成時に一括適用できます。
            </p>

            {error && <p className="error">{error}</p>}

            <button
              type="button"
              onClick={() => setEditingId('new')}
              style={{ marginBottom: 12, width: '100%' }}
            >
              + 新規リスト作成
            </button>

            {loading ? (
              <p>読込中...</p>
            ) : lists.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="glyph">○</div>
                <div className="hint">まだリストがありません</div>
              </div>
            ) : (
              <ul className="attendee-list">
                {lists.map((l) => (
                  <li key={l.id} className="attendee-row">
                    <div className="left" style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{l.name}</div>
                        <div
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: 'var(--text-mute)',
                            marginTop: 2,
                          }}
                        >
                          {l.member_count}名 ・ 更新{' '}
                          {formatDateTime(l.updated_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => setEditingId(l.id)}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className="danger btn-sm"
                        onClick={() => onDelete(l)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="action-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-outline"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ListEditor({
  listId,
  onBack,
  onSaved,
}: {
  listId: string | null;
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ users: PickerUser[] }>('/api/users'),
      listId
        ? api<{ list: ListDetail }>(`/api/attendee-lists/${listId}`)
        : Promise.resolve(null),
    ])
      .then(([usersData, listData]) => {
        setUsers(usersData.users);
        if (listData) {
          setName(listData.list.name);
          setSelected(new Set(listData.list.user_ids));
        }
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : '通信エラー'),
      )
      .finally(() => setLoading(false));
  }, [listId]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return users;
    return users.filter((u) => u.name.includes(q));
  }, [users, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (listId) {
        await api(`/api/attendee-lists/${listId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            user_ids: Array.from(selected),
          }),
        });
      } else {
        await api('/api/attendee-lists', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            user_ids: Array.from(selected),
          }),
        });
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!listId) return;
    if (!window.confirm(`「${name}」を削除しますか?`)) return;
    setDeleting(true);
    try {
      await api(`/api/attendee-lists/${listId}`, { method: 'DELETE' });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="back-link"
        onClick={onBack}
        style={{ marginBottom: 8 }}
      >
        参加者リスト一覧へ
      </button>
      <h2>{listId ? 'リスト編集' : '新規リスト作成'}</h2>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>読込中...</p>
      ) : (
        <form onSubmit={onSubmit} className="form-stack">
          <div className="field">
            <label htmlFor="al-name">
              リスト名 <span className="required-mark">*</span>
            </label>
            <input
              id="al-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 2026 年度 理事会メンバー"
              maxLength={80}
              required
            />
          </div>

          <div className="picker-card picker-participants">
            <div className="picker-card-header">
              <span className="picker-card-title">メンバー</span>
              <span className="picker-card-tag required">
                {selected.size}名
              </span>
            </div>

            <input
              type="search"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前で検索..."
            />

            <div className="user-picker">
              {filtered.length === 0 ? (
                <p className="note" style={{ margin: '8px 0' }}>
                  該当ユーザーがいません
                </p>
              ) : (
                filtered.map((u) => (
                  <label key={u.id} className="user-pick">
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                    />
                    <span>{u.name}</span>
                    {u.department && (
                      <span className="badge">{u.department}</span>
                    )}
                    {u.title && <span className="badge">{u.title}</span>}
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="action-row">
            <button
              type="submit"
              disabled={saving || deleting || !name.trim()}
              style={{ flex: 1 }}
            >
              {saving ? '保存中...' : listId ? '更新' : '作成'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onBack}
              disabled={saving || deleting}
            >
              キャンセル
            </button>
          </div>

          {listId && (
            <button
              type="button"
              className="danger"
              onClick={onDelete}
              disabled={saving || deleting}
              style={{ marginTop: 8, width: '100%' }}
            >
              {deleting ? '削除中...' : 'このリストを削除'}
            </button>
          )}
        </form>
      )}
    </>
  );
}
