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

interface AttendeeListSummary {
  id: string;
  name: string;
  member_count: number;
}

interface AttendeeListDetail {
  id: string;
  user_ids: string[];
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
  const [presets, setPresets] = useState<AttendeeListSummary[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [titleFilter, setTitleFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [observerNames, setObserverNames] = useState('');
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

  const loadPresets = useCallback(async () => {
    try {
      const d = await api<{ lists: AttendeeListSummary[] }>('/api/attendee-lists');
      setPresets(d.lists);
    } catch {
      // 取得失敗時は preset 機能を非表示にする
    }
  }, []);

  const loadMasters = useCallback(async () => {
    try {
      const d = await api<{ departments: string[]; titles: string[] }>(
        '/api/masters',
      );
      setDepartments(d.departments);
      setTitles(d.titles);
    } catch {
      // マスター未取得時はフィルタ非表示
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadPresets();
    loadMasters();
  }, [loadUsers, loadPresets, loadMasters]);

  function toggleDept(d: string) {
    setDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function applyPreset(listId: string) {
    if (!listId) return;
    try {
      const d = await api<{ list: AttendeeListDetail }>(
        `/api/attendee-lists/${listId}`,
      );
      // 既存 attendee の user_id を除外してから追加
      const existingIds = new Set(
        existing
          .map((a) => a.user_id)
          .filter((id): id is string => id !== null),
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const uid of d.list.user_ids) {
          if (!existingIds.has(uid)) next.add(uid);
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

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
      if (deptFilter.size > 0) {
        if (!u.department || !deptFilter.has(u.department)) return false;
      }
      if (titleFilter) {
        if (u.title !== titleFilter) return false;
      }
      if (q === '') return true;
      return u.name.includes(q);
    });
  }, [users, existingUserIds, query, deptFilter, titleFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const parsedObservers = useMemo(() => {
    return observerNames
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [observerNames]);

  async function add() {
    if (selected.size === 0 && parsedObservers.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${eventId}/attendees`, {
        method: 'POST',
        body: JSON.stringify({
          user_ids: Array.from(selected),
          observers: parsedObservers.map((n) => ({ name: n })),
        }),
      });
      setSelected(new Set());
      setObserverNames('');
      setQuery('');
      setDeptFilter(new Set());
      setTitleFilter('');
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
      {error && <p className="error">{error}</p>}

      <div className="picker-card picker-participants">
        <div className="picker-card-header">
          <span className="picker-card-title">参加者を追加</span>
          <span className="picker-card-tag required">必須</span>
        </div>
        <p className="picker-card-help">
          既存ユーザーから複数選択、またはゲスト名を直接入力できます。
        </p>

        {presets.length > 0 && (
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="am-preset">プリセットから一括追加</label>
            <select
              id="am-preset"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  applyPreset(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="">選択してください...</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.member_count}名)
                </option>
              ))}
            </select>
          </div>
        )}

        <input
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で検索..."
        />

        {departments.length > 0 && (
          <>
            <div className="filter-label" style={{ marginTop: 8 }}>委員会で絞り込み</div>
            <div className="filter-chips">
              {departments.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip ${deptFilter.has(d) ? 'active' : ''}`}
                  onClick={() => toggleDept(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}

        {titles.length > 0 && (
          <>
            <div className="filter-label" style={{ marginTop: 8 }}>役職で絞り込み</div>
            <div className="filter-chips">
              <button
                type="button"
                className={`chip ${titleFilter === '' ? 'active' : ''}`}
                onClick={() => setTitleFilter('')}
              >
                全て
              </button>
              {titles.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip ${titleFilter === t ? 'active' : ''}`}
                  onClick={() => setTitleFilter(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="user-picker" style={{ marginTop: 8 }}>
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
          <label htmlFor="am-observer">
            ゲスト(オブザーバー)を追加 <span className="optional-mark">任意</span>
          </label>
          <textarea
            id="am-observer"
            rows={3}
            value={observerNames}
            onChange={(e) => setObserverNames(e.target.value)}
            placeholder={`1行に1名で複数入力できます。例:\n山田 太郎(株式会社X)\n佐藤 花子`}
          />
          {parsedObservers.length > 0 && (
            <p className="note" style={{ margin: '4px 0 0' }}>
              ゲスト {parsedObservers.length} 名を追加
            </p>
          )}
        </div>

        <button
          onClick={add}
          disabled={saving || (selected.size === 0 && parsedObservers.length === 0)}
          style={{ marginTop: 12 }}
        >
          {saving
            ? '追加中...'
            : `${selected.size + parsedObservers.length}名を追加`}
        </button>
      </div>

      {existing.length > 0 && (
        <>
          <h2 style={{ marginTop: 8 }}>現在の参加者を削除</h2>
          <ul className="attendee-list">
            {existing.map((a) => (
              <li key={a.id} className="attendee-row">
                <div>
                  <span>{a.name}</span>
                  {a.is_observer && <span className="badge">ゲスト</span>}
                </div>
                <button
                  className="danger btn-sm"
                  onClick={() => remove(a)}
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
