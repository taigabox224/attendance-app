import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../api/client';

interface PickerUser {
  id: string;
  name: string;
  department: string | null;
  title: string | null;
}

interface InitialReceptionist {
  user_id: string;
  name: string;
}

interface Props {
  eventId: string;
  initial: InitialReceptionist[];
}

export function ReceptionistPicker({ eventId, initial }: Props) {
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.map((r) => r.user_id)),
  );
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ users: PickerUser[] }>('/api/users');
      setUsers(d.users);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    setSavedMsg(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api(`/api/events/${eventId}/receptionists`, {
        method: 'PUT',
        body: JSON.stringify({ user_ids: Array.from(selected) }),
      });
      setSavedMsg(`受付担当 ${selected.size}名を保存しました`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="picker-card picker-receptionists">
      <div className="picker-card-header">
        <span className="picker-card-title">受付担当</span>
        <span className="picker-card-tag optional">任意</span>
      </div>
      <p className="picker-card-help">
        当日の受付担当者をマークします (実際の受付モード利用は editor+ なら誰でも可能)。
      </p>

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

      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      {savedMsg && <p className="success" style={{ marginTop: 8 }}>{savedMsg}</p>}

      <button
        type="button"
        className="btn-outline"
        onClick={save}
        disabled={saving}
        style={{ marginTop: 12 }}
      >
        {saving ? '保存中...' : `${selected.size}名を受付担当として保存`}
      </button>
    </section>
  );
}
