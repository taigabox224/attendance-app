import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Phase 1 プロトタイプの「イベントを作成」モーダルの構造・挙動を
// 可能な限り忠実に再現したページ。

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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineToIso(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || '00:00';
  const d = new Date(`${date}T${t}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function EventCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ────── マスター / ユーザー / プリセット ──────
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);

  // ────── イベント基本情報 ──────
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [committee, setCommittee] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const [hasAfterparty, setHasAfterparty] = useState(false);
  const [afterpartyTitle, setAfterpartyTitle] = useState('');
  const [afterpartyLocation, setAfterpartyLocation] = useState('');
  const [afterpartyDescription, setAfterpartyDescription] = useState('');

  // ────── オブザーバー (inline) ──────
  const [hasObservers, setHasObservers] = useState(false);
  const [observers, setObservers] = useState<string[]>([]);
  const [observerInput, setObserverInput] = useState('');

  // ────── 参加者選択 ──────
  const [inviteSelection, setInviteSelection] = useState<Set<string>>(new Set());
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteDeptFilter, setInviteDeptFilter] = useState<Set<string>>(new Set());
  const [inviteListApplied, setInviteListApplied] = useState<string>('');

  // ────── 受付担当選択 ──────
  const [receptionistSelection, setReceptionistSelection] = useState<Set<string>>(new Set());
  const [receptionistQuery, setReceptionistQuery] = useState('');
  const [receptionistDeptFilter, setReceptionistDeptFilter] = useState<Set<string>>(new Set());

  // ────── 状態 ──────
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<null | 'publish' | 'draft'>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  // ────── 初期化 (legacy openCreateEventModal 相当) ──────
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const [usersData, mastersData, presetsData] = await Promise.all([
        api<{ users: PickerUser[] }>('/api/users').catch(() => ({ users: [] })),
        api<{ departments: string[] }>('/api/masters').catch(() => ({ departments: [] })),
        api<{ lists: PresetSummary[] }>('/api/attendee-lists').catch(() => ({ lists: [] })),
      ]);
      if (cancelled) return;
      setUsers(usersData.users);
      setDepartments(mastersData.departments);
      setPresets(presetsData.lists);

      // デフォルト日時: 翌日 19:00 / 開始 +2h / 開始 -24h
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setHours(19, 0, 0, 0);
      const endDefault = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000);
      const deadlineDefault = new Date(tomorrow.getTime() - 24 * 60 * 60 * 1000);
      setStartDate(toDateInputValue(tomorrow));
      setStartTime(toTimeInputValue(tomorrow));
      setEndDate(toDateInputValue(endDefault));
      setEndTime(toTimeInputValue(endDefault));
      setDeadlineDate(toDateInputValue(deadlineDefault));
      setDeadlineTime(toTimeInputValue(deadlineDefault));

      // 招待対象 = 全アクティブユーザー (deselect 方式)
      setInviteSelection(new Set(usersData.users.map((u) => u.id)));

      // 受付担当 = 作成者のみ (作成者は外せない)
      if (user) {
        setReceptionistSelection(new Set([user.id]));
      }

      setBootstrapped(true);
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const lockedReceptionistId = user?.id ?? null;

  // ────── フィルタ ──────
  const filteredInviteUsers = useMemo(() => {
    const q = inviteQuery.trim();
    return users.filter((u) => {
      if (inviteDeptFilter.size > 0) {
        if (!u.department || !inviteDeptFilter.has(u.department)) return false;
      }
      if (q && !u.name.includes(q)) return false;
      return true;
    });
  }, [users, inviteQuery, inviteDeptFilter]);

  const filteredReceptionistUsers = useMemo(() => {
    const q = receptionistQuery.trim();
    return users.filter((u) => {
      if (receptionistDeptFilter.size > 0) {
        if (!u.department || !receptionistDeptFilter.has(u.department)) return false;
      }
      if (q && !u.name.includes(q)) return false;
      return true;
    });
  }, [users, receptionistQuery, receptionistDeptFilter]);

  // ────── ハンドラ ──────
  function toggleInvite(id: string) {
    setInviteSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setInviteListApplied('');
  }

  function bulkSelectInvites(select: boolean) {
    setInviteSelection((prev) => {
      const next = new Set(prev);
      filteredInviteUsers.forEach((u) => {
        if (select) next.add(u.id);
        else next.delete(u.id);
      });
      return next;
    });
    setInviteListApplied('');
  }

  function toggleInviteDept(d: string) {
    setInviteDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function applyAttendeeList(listId: string) {
    if (!listId) {
      setInviteListApplied('');
      return;
    }
    try {
      const d = await api<{ list: PresetDetail }>(`/api/attendee-lists/${listId}`);
      // 全置換 (legacy 仕様)
      const validIds = d.list.user_ids.filter((uid) => users.some((u) => u.id === uid));
      setInviteSelection(new Set(validIds));
      setInviteListApplied(listId);
      const preset = presets.find((p) => p.id === listId);
      if (preset) showToast(`「${preset.name}」を反映 (${validIds.length}名)`);
    } catch {
      /* ignore */
    }
  }

  function toggleReceptionist(id: string) {
    // 作成者は外せない
    if (id === lockedReceptionistId) return;
    setReceptionistSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkSelectReceptionists(select: boolean) {
    setReceptionistSelection((prev) => {
      const next = new Set(prev);
      filteredReceptionistUsers.forEach((u) => {
        if (u.id === lockedReceptionistId) return; // 作成者は対象外
        if (select) next.add(u.id);
        else next.delete(u.id);
      });
      // 作成者は常に含める
      if (lockedReceptionistId) next.add(lockedReceptionistId);
      return next;
    });
  }

  function toggleReceptionistDept(d: string) {
    setReceptionistDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function addObserver() {
    const name = observerInput.trim();
    if (!name) return;
    setObservers((prev) => [...prev, name]);
    setObserverInput('');
  }

  function removeObserver(i: number) {
    setObservers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function toggleHasObservers(checked: boolean) {
    setHasObservers(checked);
    if (!checked) {
      setObservers([]);
      setObserverInput('');
    }
  }

  // ────── 送信 ──────
  async function save(publish: boolean) {
    setError(null);

    if (!title.trim()) {
      setError('タイトルを入力してください');
      return;
    }
    if (!startDate || !startTime) {
      setError('開始日時を入力してください');
      return;
    }
    if (inviteSelection.size === 0 && (!hasObservers || observers.length === 0)) {
      setError('参加者を 1 名以上選択するか、ゲストを追加してください');
      return;
    }

    setSubmitting(publish ? 'publish' : 'draft');
    try {
      // Step 1: イベント作成
      const payload = {
        title: title.trim(),
        start_at: combineToIso(startDate, startTime) ?? '',
        end_at: combineToIso(endDate, endTime),
        response_deadline: combineToIso(deadlineDate, deadlineTime),
        committee: committee || null,
        location: location.trim() || null,
        description: description.trim() || null,
        published: publish,
        has_afterparty: hasAfterparty,
        afterparty_title: hasAfterparty ? afterpartyTitle.trim() || null : null,
        afterparty_location: hasAfterparty ? afterpartyLocation.trim() || null : null,
        afterparty_description: hasAfterparty ? afterpartyDescription.trim() || null : null,
      };

      const { event } = await api<{ event: { id: string } }>('/api/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Step 2: 参加者 + オブザーバー
      const observerPayload = hasObservers ? observers.map((name) => ({ name })) : [];
      if (inviteSelection.size > 0 || observerPayload.length > 0) {
        await api(`/api/events/${event.id}/attendees`, {
          method: 'POST',
          body: JSON.stringify({
            user_ids: Array.from(inviteSelection),
            observers: observerPayload,
          }),
        });
      }

      // Step 3: 受付担当
      if (receptionistSelection.size > 0) {
        await api(`/api/events/${event.id}/receptionists`, {
          method: 'PUT',
          body: JSON.stringify({ user_ids: Array.from(receptionistSelection) }),
        });
      }

      navigate('/events', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラーが発生しました');
    } finally {
      setSubmitting(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // form の onSubmit (Enter 等) はデフォで「公開して作成」扱い
    void save(true);
  }

  if (!bootstrapped) {
    return (
      <div className="screen">
        <Link to="/events" className="back-link">イベント一覧へ</Link>
        <p>読込中...</p>
      </div>
    );
  }

  const totalUsers = users.length;

  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">イベントを作成</h1>
      </header>

      <form onSubmit={handleSubmit} className="form-stack">
        <p className="form-help">
          <span className="required-mark">*</span> は必須項目です
        </p>

        {/* タイトル */}
        <div className="field">
          <label htmlFor="ec-title">タイトル <span className="required-mark">*</span></label>
          <input
            id="ec-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 2026年6月度例会"
            maxLength={200}
          />
        </div>

        {/* 開始日時 */}
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="ec-start-date">開始日 <span className="required-mark">*</span></label>
            <input
              id="ec-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="ec-start-time">時刻</label>
            <input
              id="ec-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        {/* 終了日時 */}
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="ec-end-date">
              終了日 <span className="optional-mark">任意</span>
            </label>
            <input
              id="ec-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="ec-end-time">時刻</label>
            <input
              id="ec-end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {/* 回答期限 */}
        <div className="field">
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="ec-deadline-date">回答期限</label>
              <input
                id="ec-deadline-date"
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ec-deadline-time">時刻</label>
              <input
                id="ec-deadline-time"
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
              />
            </div>
          </div>
          <p className="note" style={{ margin: '4px 0 0', fontSize: 11 }}>
            この日時を過ぎると、ユーザーは出欠を変更できなくなります(管理者は変更可)
          </p>
        </div>

        {/* 担当委員会 */}
        <div className="field">
          <label htmlFor="ec-committee">担当委員会</label>
          <select
            id="ec-committee"
            value={committee}
            onChange={(e) => setCommittee(e.target.value)}
          >
            <option value="">(未選択)</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
            <option value="その他">その他</option>
          </select>
        </div>

        {/* 場所 */}
        <div className="field">
          <label htmlFor="ec-location">場所</label>
          <input
            id="ec-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="例: スターツおおたかの森ホール"
          />
        </div>

        {/* 説明 */}
        <div className="field">
          <label htmlFor="ec-desc">
            説明 <span className="optional-mark">任意</span>
          </label>
          <textarea
            id="ec-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="服装、持ち物、注意事項など"
          />
        </div>

        {/* 懇親会あり */}
        <label className="check check-with-sub">
          <input
            type="checkbox"
            checked={hasAfterparty}
            onChange={(e) => setHasAfterparty(e.target.checked)}
          />
          <span>
            <span className="check-name">懇親会あり</span>
            <span className="check-sub">参加者は本編とは別に懇親会の出欠も回答できます</span>
          </span>
        </label>

        {hasAfterparty && (
          <div className="afterparty-section">
            <div className="field">
              <label htmlFor="ec-ap-title">
                懇親会タイトル <span className="optional-mark">任意</span>
              </label>
              <input
                id="ec-ap-title"
                type="text"
                value={afterpartyTitle}
                onChange={(e) => setAfterpartyTitle(e.target.value)}
                placeholder="例: 懇親会"
              />
            </div>
            <div className="field">
              <label htmlFor="ec-ap-loc">
                懇親会の場所 <span className="optional-mark">任意</span>
              </label>
              <input
                id="ec-ap-loc"
                type="text"
                value={afterpartyLocation}
                onChange={(e) => setAfterpartyLocation(e.target.value)}
                placeholder="例: 居酒屋 旬彩(本社から徒歩3分)"
              />
            </div>
            <div className="field">
              <label htmlFor="ec-ap-desc">
                懇親会の説明 <span className="optional-mark">任意</span>
              </label>
              <textarea
                id="ec-ap-desc"
                rows={3}
                value={afterpartyDescription}
                onChange={(e) => setAfterpartyDescription(e.target.value)}
                placeholder="会費、地図URL、注意事項など"
              />
              <p className="note" style={{ margin: '4px 0 0', fontSize: 11 }}>
                URL は自動でリンクになります
              </p>
            </div>
          </div>
        )}

        {/* オブザーバー */}
        <label className="check check-with-sub">
          <input
            type="checkbox"
            checked={hasObservers}
            onChange={(e) => toggleHasObservers(e.target.checked)}
          />
          <span>
            <span className="check-name">オブザーバー(ゲスト)を追加</span>
            <span className="check-sub">登録ユーザー以外のゲストを参加者に含めます。出席人数にカウントされます</span>
          </span>
        </label>

        {hasObservers && (
          <div className="observer-fields">
            <label className="form-sub-label">オブザーバー</label>
            {observers.length === 0 ? (
              <p className="note" style={{ margin: '0 0 6px', padding: 6 }}>
                まだ追加されていません
              </p>
            ) : (
              <ul className="observer-list" style={{ marginBottom: 6 }}>
                {observers.map((name, i) => (
                  <li key={i}>
                    <span>{name}</span>
                    <button
                      type="button"
                      className="danger btn-sm"
                      onClick={() => removeObserver(i)}
                      aria-label={`${name} を削除`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={observerInput}
                onChange={(e) => setObserverInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addObserver();
                  }
                }}
                placeholder="ゲストのお名前"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={addObserver}
                disabled={!observerInput.trim()}
              >
                追加
              </button>
            </div>
          </div>
        )}

        {/* 参加者 (必須) */}
        <section className="picker-card picker-participants">
          <div className="picker-card-header">
            <span className="picker-card-icon" aria-hidden="true">👥</span>
            <span className="picker-card-title">参加者を選択</span>
            <span className="picker-card-tag required">必須</span>
          </div>
          <p className="picker-card-help">出欠回答を依頼するメンバーを選びます</p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>
            <span>
              選択中{' '}
              <strong className="mono" style={{ color: 'var(--text)' }}>
                {inviteSelection.size}
              </strong>
              {' '}/ {totalUsers}
            </span>
          </div>

          {presets.length > 0 && (
            <div className="field" style={{ marginBottom: 8 }}>
              <select
                value={inviteListApplied}
                onChange={(e) => {
                  void applyAttendeeList(e.target.value);
                }}
              >
                <option value="">リストから一括選択…</option>
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
            value={inviteQuery}
            onChange={(e) => setInviteQuery(e.target.value)}
            placeholder="名前で検索"
          />

          {departments.length > 0 && (
            <>
              <div className="filter-section-label">委員会(複数選択可)</div>
              <div className="filter-chips">
                {departments.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${inviteDeptFilter.has(d) ? 'active' : ''}`}
                    onClick={() => toggleInviteDept(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="bulk-actions">
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => bulkSelectInvites(true)}
            >
              表示中を全選択
            </button>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => bulkSelectInvites(false)}
            >
              表示中を全解除
            </button>
          </div>

          <div className="picker-list">
            {filteredInviteUsers.length === 0 ? (
              <div className="picker-empty">該当するユーザーはいません</div>
            ) : (
              filteredInviteUsers.map((u) => (
                <label key={u.id} className="check picker-row">
                  <input
                    type="checkbox"
                    checked={inviteSelection.has(u.id)}
                    onChange={() => toggleInvite(u.id)}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="picker-row-name">{u.name}</span>
                    {(u.department || u.title) && (
                      <span className="picker-row-meta">
                        {u.department}
                        {u.department && u.title && ' · '}
                        {u.title}
                      </span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>

          <p className="picker-count">
            選択中:{' '}
            <strong className="mono" style={{ color: 'var(--text)' }}>
              {inviteSelection.size}
            </strong>{' '}
            / {totalUsers}
          </p>
        </section>

        {/* 受付担当 (任意) */}
        <section className="picker-card picker-receptionists">
          <div className="picker-card-header">
            <span className="picker-card-icon" aria-hidden="true">🛡️</span>
            <span className="picker-card-title">受付担当を選択</span>
            <span className="picker-card-tag optional">任意</span>
          </div>
          <p className="picker-card-help">
            当日「受付」モードに切替えて QR スキャンや出欠変更ができるメンバーです
          </p>

          <input
            type="search"
            className="search-input"
            value={receptionistQuery}
            onChange={(e) => setReceptionistQuery(e.target.value)}
            placeholder="名前で検索"
          />

          {departments.length > 0 && (
            <>
              <div className="filter-section-label">委員会(複数選択可)</div>
              <div className="filter-chips">
                {departments.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${receptionistDeptFilter.has(d) ? 'active' : ''}`}
                    onClick={() => toggleReceptionistDept(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="bulk-actions">
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => bulkSelectReceptionists(true)}
            >
              表示中を全選択
            </button>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => bulkSelectReceptionists(false)}
            >
              表示中を全解除
            </button>
          </div>

          <div className="picker-list picker-list-short">
            {filteredReceptionistUsers.length === 0 ? (
              <div className="picker-empty">該当するユーザーはいません</div>
            ) : (
              filteredReceptionistUsers.map((u) => {
                const isLocked = u.id === lockedReceptionistId;
                return (
                  <label key={u.id} className="check picker-row">
                    <input
                      type="checkbox"
                      checked={receptionistSelection.has(u.id)}
                      onChange={() => toggleReceptionist(u.id)}
                      disabled={isLocked}
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="picker-row-name">
                        {u.name}
                        {isLocked && <span className="badge" style={{ marginLeft: 6 }}>作成者</span>}
                      </span>
                      {(u.department || u.title) && (
                        <span className="picker-row-meta">
                          {u.department}
                          {u.department && u.title && ' · '}
                          {u.title}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <p className="picker-count">
            選択中:{' '}
            <strong className="mono" style={{ color: 'var(--text)' }}>
              {receptionistSelection.size}
            </strong>
            <span style={{ color: 'var(--accent)', marginLeft: 6 }}>※自分を含みます</span>
          </p>
        </section>

        {error && <p className="error">{error}</p>}

        <div className="event-form-actions">
          <button type="submit" disabled={submitting !== null}>
            {submitting === 'publish' ? '作成中...' : '公開して作成'}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => void save(false)}
            disabled={submitting !== null}
          >
            {submitting === 'draft' ? '保存中...' : '下書きとして保存'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate('/events')}
            disabled={submitting !== null}
          >
            キャンセル
          </button>
        </div>
      </form>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
