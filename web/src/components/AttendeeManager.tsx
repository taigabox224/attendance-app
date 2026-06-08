import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../api/client';

interface PickerUser {
  id: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  department: string | null;
  title: string | null;
}

export interface ExistingAttendee {
  id: string;
  user_id: string | null;
  is_observer: boolean;
  name: string;
}

interface Props {
  eventId: string;
  existing: ExistingAttendee[];
  onChange: () => void | Promise<void>;
}

export function AttendeeManager({ eventId, existing, onChange }: Props) {
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [observerName, setObserverName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const d = await api<{ users: PickerUser[] }>('/api/users');
      setUsers(d.users);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const existingUserIds = useMemo(
    () =>
      new Set(
        existing
          .map((a) => a.user_id)
          .filter((id): id is string => id !== null),
      ),
    [existing],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    return users.filter((u) => {
      if (existingUserIds.has(u.id)) return false;
      if (q === '') return true;
      return u.name.includes(q);
    });
  }, [users, existingUserIds, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    if (selected.size === 0 && !observerName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${eventId}/attendees`, {
        method: 'POST',
        body: JSON.stringify({
          user_ids: Array.from(selected),
          observers: observerName.trim()
            ? [{ name: observerName.trim() }]
            : [],
        }),
      });
      setSelected(new Set());
      setObserverName('');
      setQuery('');
      await onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: ExistingAttendee) {
    const ok = window.confirm(`${a.name} を参加者から外しますか?`);
    if (!ok) return;
    try {
      await api(`/api/events/${eventId}/attendees/${a.id}`, {
        method: 'DELETE',
      });
      await onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

  return (
    <section className="attendee-manager">
      <h2>参加者を追加</h2>
      {error && <p className="error">{error}</p>}

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
              {u.department && <span className="badge">{u.department}</span>}
              {u.title && <span className="badge">{u.title}</span>}
            </label>
          ))
        )}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="am-observer">ゲスト(オブザーバー)を追加</label>
        <input
          id="am-observer"
          type="text"
          value={observerName}
          onChange={(e) => setObserverName(e.target.value)}
          placeholder="例: 山田 太郎(株式会社X)"
          maxLength={80}
        />
      </div>

      <button
        onClick={add}
        disabled={saving || (selected.size === 0 && !observerName.trim())}
        style={{ marginTop: 12 }}
      >
        {saving
          ? '追加中...'
          : `${selected.size + (observerName.trim() ? 1 : 0)}名を追加`}
      </button>

      {existing.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>現在の参加者を削除</h2>
          <ul className="attendee-list">
            {existing.map((a) => (
              <li key={a.id} className="attendee-row">
                <div>
                  <span>{a.name}</span>
                  {a.is_observer && <span className="badge">ゲスト</span>}
                </div>
                <button
                  className="danger"
                  onClick={() => remove(a)}
                  style={{ padding: '4px 12px', fontSize: 13, minHeight: 32 }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
