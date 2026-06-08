import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  EventForm,
  emptyEventForm,
  type EventFormPayload,
} from '../components/EventForm';

interface PickerUser {
  id: string;
  name: string;
  department: string | null;
  title: string | null;
}

interface PresetSummary {
  id: string;
  name: string;
  member_count: number;
}

interface PresetDetail {
  id: string;
  user_ids: string[];
}

export function EventCreatePage() {
  const navigate = useNavigate();

  const [users, setUsers] = useState<PickerUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [presets, setPresets] = useState<PresetSummary[]>([]);

  // 参加者選択 state
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set());
  const [observerInput, setObserverInput] = useState('');

  // 受付担当選択 state
  const [receptionistIds, setReceptionistIds] = useState<Set<string>>(new Set());

  // 参加者ピッカー用フィルタ
  const [attendeeQuery, setAttendeeQuery] = useState('');
  const [attendeeDeptFilter, setAttendeeDeptFilter] = useState<Set<string>>(new Set());
  const [attendeeTitleFilter, setAttendeeTitleFilter] = useState<string>('');

  // 受付担当ピッカー用フィルタ
  const [receptionistQuery, setReceptionistQuery] = useState('');

  useEffect(() => {
    api<{ users: PickerUser[] }>('/api/users')
      .then((d) => setUsers(d.users))
      .catch(() => {});
    api<{ departments: string[]; titles: string[] }>('/api/masters')
      .then((d) => {
        setDepartments(d.departments);
        setTitles(d.titles);
      })
      .catch(() => {});
    api<{ lists: PresetSummary[] }>('/api/attendee-lists')
      .then((d) => setPresets(d.lists))
      .catch(() => {});
  }, []);

  const filteredAttendeeUsers = useMemo(() => {
    const q = attendeeQuery.trim();
    return users.filter((u) => {
      if (attendeeDeptFilter.size > 0) {
        if (!u.department || !attendeeDeptFilter.has(u.department)) return false;
      }
      if (attendeeTitleFilter) {
        if (u.title !== attendeeTitleFilter) return false;
      }
      if (q && !u.name.includes(q)) return false;
      return true;
    });
  }, [users, attendeeQuery, attendeeDeptFilter, attendeeTitleFilter]);

  const filteredReceptionistUsers = useMemo(() => {
    const q = receptionistQuery.trim();
    if (!q) return users;
    return users.filter((u) => u.name.includes(q));
  }, [users, receptionistQuery]);

  const observerNames = useMemo(
    () =>
      observerInput
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [observerInput],
  );

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleReceptionist(id: string) {
    setReceptionistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAttendeeDept(d: string) {
    setAttendeeDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function applyPreset(listId: string) {
    if (!listId) return;
    try {
      const d = await api<{ list: PresetDetail }>(
        `/api/attendee-lists/${listId}`,
      );
      setAttendeeIds((prev) => {
        const next = new Set(prev);
        for (const uid of d.list.user_ids) next.add(uid);
        return next;
      });
    } catch {
      /* ignore */
    }
  }

  async function onSubmit(payload: EventFormPayload) {
    // Step 1: イベント本体を作成
    const created = await api<{ event: { id: string } }>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const newId = created.event.id;

    // Step 2: 参加者 + ゲストを追加 (空ならスキップ)
    if (attendeeIds.size > 0 || observerNames.length > 0) {
      try {
        await api(`/api/events/${newId}/attendees`, {
          method: 'POST',
          body: JSON.stringify({
            user_ids: Array.from(attendeeIds),
            observers: observerNames.map((name) => ({ name })),
          }),
        });
      } catch (e) {
        // 参加者追加が失敗してもイベント自体は作成済み → 警告だけ出して navigate
        console.warn('Failed to add attendees:', e);
      }
    }

    // Step 3: 受付担当をセット (空ならスキップ)
    if (receptionistIds.size > 0) {
      try {
        await api(`/api/events/${newId}/receptionists`, {
          method: 'PUT',
          body: JSON.stringify({ user_ids: Array.from(receptionistIds) }),
        });
      } catch (e) {
        console.warn('Failed to set receptionists:', e);
      }
    }

    navigate('/events', { replace: true });
  }

  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">新規イベント</h1>
      </header>

      <EventForm
        initialValues={emptyEventForm}
        buttonMode="split"
        submitLabel="作成して公開"
        submittingLabel="作成中..."
        draftLabel="下書きとして保存"
        draftSubmittingLabel="保存中..."
        onSubmit={onSubmit}
        onCancel={() => navigate('/events')}
      >
        {/* 参加者ピッカー */}
        <section className="picker-card picker-participants">
          <div className="picker-card-header">
            <span className="picker-card-title">参加者を選択</span>
            <span className="picker-card-tag optional">任意</span>
          </div>
          <p className="picker-card-help">
            既存ユーザーを選択 / プリセットから一括追加 / ゲストを下の欄に入力。後で編集画面からも追加できます。
          </p>

          {presets.length > 0 && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="ec-preset">プリセットから一括追加</label>
              <select
                id="ec-preset"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    void applyPreset(e.target.value);
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
            value={attendeeQuery}
            onChange={(e) => setAttendeeQuery(e.target.value)}
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
                    className={`chip ${attendeeDeptFilter.has(d) ? 'active' : ''}`}
                    onClick={() => toggleAttendeeDept(d)}
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
                  className={`chip ${attendeeTitleFilter === '' ? 'active' : ''}`}
                  onClick={() => setAttendeeTitleFilter('')}
                >
                  全て
                </button>
                {titles.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${attendeeTitleFilter === t ? 'active' : ''}`}
                    onClick={() => setAttendeeTitleFilter(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="user-picker" style={{ marginTop: 8 }}>
            {filteredAttendeeUsers.length === 0 ? (
              <p className="note" style={{ margin: '8px 0' }}>
                該当ユーザーがいません
              </p>
            ) : (
              filteredAttendeeUsers.map((u) => (
                <label key={u.id} className="user-pick">
                  <input
                    type="checkbox"
                    checked={attendeeIds.has(u.id)}
                    onChange={() => toggleAttendee(u.id)}
                  />
                  <span>{u.name}</span>
                  {u.department && <span className="badge">{u.department}</span>}
                  {u.title && <span className="badge">{u.title}</span>}
                </label>
              ))
            )}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="ec-observer">
              ゲスト(オブザーバー)を追加 <span className="optional-mark">任意</span>
            </label>
            <textarea
              id="ec-observer"
              rows={3}
              value={observerInput}
              onChange={(e) => setObserverInput(e.target.value)}
              placeholder={`1行に1名で複数入力できます。例:\n山田 太郎(株式会社X)\n佐藤 花子`}
            />
            <p className="note" style={{ margin: '4px 0 0' }}>
              選択 {attendeeIds.size}名 + ゲスト {observerNames.length}名 = 計 {attendeeIds.size + observerNames.length}名
            </p>
          </div>
        </section>

        {/* 受付担当ピッカー */}
        <section className="picker-card picker-receptionists">
          <div className="picker-card-header">
            <span className="picker-card-title">受付担当を選択</span>
            <span className="picker-card-tag optional">任意</span>
          </div>
          <p className="picker-card-help">
            当日の受付モード (QR スキャン) を使えるユーザーを指定します。後で編集画面から変更可能。
          </p>

          <input
            type="search"
            className="search-input"
            value={receptionistQuery}
            onChange={(e) => setReceptionistQuery(e.target.value)}
            placeholder="名前で検索..."
          />

          <div className="user-picker" style={{ marginTop: 8 }}>
            {filteredReceptionistUsers.length === 0 ? (
              <p className="note" style={{ margin: '8px 0' }}>
                該当ユーザーがいません
              </p>
            ) : (
              filteredReceptionistUsers.map((u) => (
                <label key={u.id} className="user-pick">
                  <input
                    type="checkbox"
                    checked={receptionistIds.has(u.id)}
                    onChange={() => toggleReceptionist(u.id)}
                  />
                  <span>{u.name}</span>
                  {u.department && <span className="badge">{u.department}</span>}
                  {u.title && <span className="badge">{u.title}</span>}
                </label>
              ))
            )}
          </div>

          <p className="note" style={{ margin: '8px 0 0' }}>
            {receptionistIds.size}名を受付担当に指定
          </p>
        </section>
      </EventForm>
    </div>
  );
}
