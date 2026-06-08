import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AttendeeManager } from '../components/AttendeeManager';
import { QrModal } from '../components/QrModal';
import {
  attendanceRate,
  checkInRate,
  computeBreakdown,
  type AttendeeStats,
} from '../lib/breakdown';
import { downloadCsv, sanitizeFilenamePart } from '../lib/csv';
import { formatDateTime } from '../lib/format';

type RsvpStatus = 'pending' | 'yes' | 'no';

interface Attendee {
  id: string;
  user_id: string | null;
  is_observer: boolean;
  name: string;
  department: string | null;
  title: string | null;
  status: RsvpStatus;
  after_status: RsvpStatus | null;
  checked_in_at: string | null;
  fee_paid: boolean;
}

interface YourRsvp {
  attendee_id: string;
  status: RsvpStatus;
  after_status: RsvpStatus | null;
  checked_in_at: string | null;
}

interface EventDetail {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  response_deadline: string | null;
  committee: string | null;
  location: string | null;
  description: string | null;
  published: boolean;
  has_afterparty: boolean;
  afterparty_title: string | null;
  afterparty_location: string | null;
  afterparty_description: string | null;
}

interface Receptionist {
  user_id: string;
  name: string;
}

interface DetailResponse {
  event: EventDetail;
  attendees: Attendee[];
  your_rsvp: YourRsvp | null;
  receptionists: Receptionist[];
}

const STATUS_LABEL: Record<RsvpStatus, string> = {
  yes: '出席',
  no: '欠席',
  pending: '未回答',
};

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, viewMode } = useAuth();
  const isPrivileged = user?.role === 'sysadmin' || user?.role === 'editor';
  // ユーザー画面プレビュー中はビューアー扱い
  const canEdit = isPrivileged && viewMode === 'admin';

  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Toast (簡易、自動で 2 秒後に消える)
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 2000);
  }, []);

  async function copyShareLink() {
    if (!id) return;
    const url = `${window.location.origin}/events/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('共有リンクをコピーしました');
    } catch {
      showToast('コピーに失敗しました');
    }
  }

  async function deleteEvent() {
    if (!id) return;
    const ok = window.confirm(
      'このイベントを削除しますか?\nこの操作は取り消せません。',
    );
    if (!ok) return;
    try {
      await api(`/api/events/${id}`, { method: 'DELETE' });
      navigate('/', { replace: true });
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '削除に失敗しました');
    }
  }

  // 参加者フィルタ (editor+ かつ admin モードの時に表示)
  type AStatusFilter = 'all' | 'yes' | 'no' | 'pending' | 'checked';
  type AKindFilter = 'all' | 'member' | 'observer';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AStatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<AKindFilter>('all');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (!canEdit) return;
    api<{ departments: string[] }>('/api/masters')
      .then((d) => setDepartments(d.departments))
      .catch(() => {
        /* マスターなしならフィルタは出さない */
      });
  }, [canEdit]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const d = await api<DetailResponse>(`/api/events/${id}`);
      setData(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchAttendee(attendeeId: string, body: Record<string, unknown>) {
    if (!id) return;
    try {
      await api(`/api/events/${id}/attendees/${attendeeId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

  const visibleAttendees = useMemo(() => {
    if (!data) return [] as Attendee[];
    const q = query.trim().toLowerCase();
    return data.attendees.filter((a) => {
      // ステータス
      if (statusFilter === 'checked') {
        if (!a.checked_in_at) return false;
      } else if (statusFilter !== 'all') {
        if (a.status !== statusFilter) return false;
      }
      // 区分
      if (kindFilter === 'member' && a.is_observer) return false;
      if (kindFilter === 'observer' && !a.is_observer) return false;
      // 委員会 (ゲストは委員会無いので、deptFilter があるとゲストは除外される)
      if (deptFilter.size > 0) {
        if (!a.department || !deptFilter.has(a.department)) return false;
      }
      // 名前検索
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, statusFilter, kindFilter, deptFilter]);

  function toggleDept(d: string) {
    setDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function resetAttendeeFilter() {
    setQuery('');
    setStatusFilter('all');
    setKindFilter('all');
    setDeptFilter(new Set());
  }

  const hasAttendeeFilter =
    query !== '' ||
    statusFilter !== 'all' ||
    kindFilter !== 'all' ||
    deptFilter.size > 0;

  if (error && !data) {
    return (
      <div className="screen">
        <div className="detail-toolbar">
          <Link to="/" className="back-link">イベント一覧へ</Link>
        </div>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="screen">
        <p>読込中...</p>
      </div>
    );
  }

  const ev = data.event;
  const yourRsvp = data.your_rsvp;
  // 受付担当として scan できるか (sysadmin or 指定された receptionist)
  const canScanReception =
    user?.role === 'sysadmin' ||
    data.receptionists.some((r) => r.user_id === user?.id);

  return (
    <div className="screen">
      <div className="detail-toolbar">
        <Link to="/" className="back-link">イベント一覧へ</Link>
        {(canEdit || canScanReception) && (
          <button
            className="gear-btn"
            onClick={() => setShowMenu(true)}
            aria-label="このイベントの操作"
            type="button"
          >
            ⚙
          </button>
        )}
      </div>

      {canEdit && !ev.published && (
        <div
          className="draft-notice"
          role="status"
        >
          <span className="badge warn">下書き</span>
          <span>このイベントはまだ公開されていません</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <section className="event-hero">
        <div className="date">
          {formatDateTime(ev.start_at)}
          {ev.end_at ? ` 〜 ${formatDateTime(ev.end_at)}` : ''}
        </div>
        <h1 className="title">{ev.title}</h1>
        {ev.committee && (
          <div className="info-row">
            <span className="ico">●</span>
            <span>{ev.committee}</span>
          </div>
        )}
        {ev.location && (
          <div className="info-row">
            <span className="ico">●</span>
            <span>{ev.location}</span>
          </div>
        )}
        {ev.response_deadline && (
          <div className="info-row">
            <span className="ico">●</span>
            <span>回答期限 {formatDateTime(ev.response_deadline)}</span>
          </div>
        )}
        {ev.description && <div className="desc">{ev.description}</div>}
      </section>

      {ev.has_afterparty && (
        <div className="afterparty-section" style={{ marginTop: 0, marginBottom: 16 }}>
          <strong>二次会: {ev.afterparty_title || '(未設定)'}</strong>
          {ev.afterparty_location && (
            <p style={{ margin: '4px 0' }}>{ev.afterparty_location}</p>
          )}
          {ev.afterparty_description && (
            <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
              {ev.afterparty_description}
            </p>
          )}
        </div>
      )}

      {yourRsvp && (
        <RsvpSection
          eventId={ev.id}
          hasAfterparty={ev.has_afterparty}
          rsvp={yourRsvp}
          onSaved={load}
          onShowQr={() => setShowQr(true)}
        />
      )}

      {canEdit && data.attendees.length > 0 && (
        <BreakdownSection
          eventTitle={ev.title}
          attendees={data.attendees}
        />
      )}

      <div className="section-label">
        参加者
        <span className="count">
          {hasAttendeeFilter
            ? `${visibleAttendees.length} / ${data.attendees.length} 名`
            : `${data.attendees.filter((a) => a.checked_in_at).length} 受付 / ${data.attendees.length} 名`}
        </span>
      </div>

      {ev.has_afterparty && data.attendees.length > 0 && (
        <AfterpartyStats attendees={data.attendees} />
      )}

      {canEdit && data.attendees.length > 0 && (
        <div className="user-filter" style={{ marginBottom: 8 }}>
          <input
            type="search"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="参加者名で検索..."
          />

          <div className="filter-label">出欠</div>
          <div className="filter-chips">
            {(['all', 'yes', 'no', 'pending', 'checked'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all'
                  ? '全て'
                  : s === 'yes'
                    ? '出席'
                    : s === 'no'
                      ? '欠席'
                      : s === 'pending'
                        ? '未回答'
                        : '受付済'}
              </button>
            ))}
          </div>

          <div className="filter-label">区分</div>
          <div className="filter-chips">
            {(['all', 'member', 'observer'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${kindFilter === k ? 'active' : ''}`}
                onClick={() => setKindFilter(k)}
              >
                {k === 'all' ? '全て' : k === 'member' ? '会員' : 'ゲスト'}
              </button>
            ))}
          </div>

          {departments.length > 0 && (
            <>
              <div className="filter-label">委員会</div>
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

          {hasAttendeeFilter && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={resetAttendeeFilter}
              style={{ marginTop: 4 }}
            >
              フィルタを解除
            </button>
          )}
        </div>
      )}

      {data.attendees.length === 0 ? (
        <p className="note">まだ参加者がいません。</p>
      ) : visibleAttendees.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">○</div>
          <div className="hint">該当する参加者がいません</div>
        </div>
      ) : (
        <ul className="attendee-list">
          {visibleAttendees.map((a) => (
            <li key={a.id} className="attendee-row">
              <div className="attendee-main">
                <span>{a.name}</span>
                {a.is_observer && <span className="badge">ゲスト</span>}
                {a.department && <span className="badge">{a.department}</span>}
              </div>
              {canEdit ? (
                <div className="actions-stack">
                  <button
                    type="button"
                    className={`status-btn ${a.status === 'yes' ? 'active yes' : ''}`}
                    onClick={() =>
                      patchAttendee(a.id, {
                        status: a.status === 'yes' ? 'pending' : 'yes',
                      })
                    }
                  >
                    出席
                  </button>
                  <button
                    type="button"
                    className={`status-btn ${a.status === 'no' ? 'active no' : ''}`}
                    onClick={() =>
                      patchAttendee(a.id, {
                        status: a.status === 'no' ? 'pending' : 'no',
                      })
                    }
                  >
                    欠席
                  </button>
                  <button
                    type="button"
                    className={`status-btn ${a.checked_in_at ? 'active checked' : ''}`}
                    onClick={() =>
                      patchAttendee(a.id, {
                        checked_in_at: a.checked_in_at ? null : 'now',
                      })
                    }
                  >
                    受付
                  </button>
                  <button
                    type="button"
                    className={`status-btn ${a.fee_paid ? 'active fee' : ''}`}
                    onClick={() =>
                      patchAttendee(a.id, { fee_paid: !a.fee_paid })
                    }
                  >
                    会費
                  </button>
                </div>
              ) : (
                <div className="actions-stack">
                  <span className={`status-badge badge-${a.status}`}>
                    {a.checked_in_at ? '受付済' : STATUS_LABEL[a.status]}
                  </span>
                  {a.fee_paid && (
                    <span className="status-badge badge-checked">会費済</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <AttendeeManager
          eventId={ev.id}
          existing={data.attendees.map((a) => ({
            id: a.id,
            user_id: a.user_id,
            is_observer: a.is_observer,
            name: a.name,
          }))}
          onChange={load}
        />
      )}

      {showQr && <QrModal eventId={ev.id} onClose={() => setShowQr(false)} />}

      {showMenu && (canEdit || canScanReception) && (
        <EventActionsMenu
          eventId={ev.id}
          canManage={canEdit}
          canScan={canScanReception}
          onClose={() => setShowMenu(false)}
          onCopyLink={copyShareLink}
          onDelete={deleteEvent}
        />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

function BreakdownSection({
  eventTitle,
  attendees,
}: {
  eventTitle: string;
  attendees: Attendee[];
}) {
  const [committeeOrder, setCommitteeOrder] = useState<string[]>([]);

  useEffect(() => {
    api<{ departments: string[] }>('/api/masters')
      .then((d) => setCommitteeOrder(d.departments))
      .catch(() => {
        /* マスターが取れない時は alphabetical fallback で OK */
      });
  }, []);

  const breakdown = useMemo(
    () => computeBreakdown(attendees, committeeOrder),
    [attendees, committeeOrder],
  );

  function exportBreakdownCsv() {
    const rows: Array<Array<unknown>> = [
      ['区分', '招待', '出席', '欠席', '未回答', '受付済', '出席率', '受付率'],
    ];
    for (const g of breakdown.byCommittee) {
      rows.push([
        g.key,
        g.stats.invited,
        g.stats.yes,
        g.stats.no,
        g.stats.pending,
        g.stats.checkedIn,
        attendanceRate(g.stats),
        checkInRate(g.stats),
      ]);
    }
    rows.push([
      '全体',
      breakdown.total.invited,
      breakdown.total.yes,
      breakdown.total.no,
      breakdown.total.pending,
      breakdown.total.checkedIn,
      attendanceRate(breakdown.total),
      checkInRate(breakdown.total),
    ]);
    if (breakdown.observers.invited > 0) {
      rows.push([
        'オブザーバー',
        breakdown.observers.invited,
        breakdown.observers.yes,
        breakdown.observers.no,
        breakdown.observers.pending,
        breakdown.observers.checkedIn,
        attendanceRate(breakdown.observers),
        checkInRate(breakdown.observers),
      ]);
    }
    downloadCsv(`${sanitizeFilenamePart(eventTitle)}_出席内訳.csv`, rows);
  }

  function exportAttendeesCsv() {
    const rows: Array<Array<unknown>> = [
      ['氏名', '区分', '委員会', '役職', '出欠', '二次会', '受付済', '受付時刻'],
    ];
    for (const a of attendees) {
      const statusLabel =
        a.status === 'yes' ? '出席' : a.status === 'no' ? '欠席' : '未回答';
      const afterLabel = a.after_status
        ? a.after_status === 'yes'
          ? '参加'
          : a.after_status === 'no'
            ? '不参加'
            : '未回答'
        : '';
      rows.push([
        a.name,
        a.is_observer ? 'ゲスト' : '会員',
        a.department ?? '',
        a.title ?? '',
        statusLabel,
        afterLabel,
        a.checked_in_at ? '済' : '',
        a.checked_in_at ? formatDateTime(a.checked_in_at) : '',
      ]);
    }
    downloadCsv(`${sanitizeFilenamePart(eventTitle)}_参加者一覧.csv`, rows);
  }

  return (
    <section className="breakdown-card">
      <div className="breakdown-header">
        <span>出席内訳</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={exportBreakdownCsv}
          >
            内訳 CSV
          </button>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={exportAttendeesCsv}
          >
            参加者 CSV
          </button>
        </div>
      </div>

      <div className="breakdown-rows">
        {breakdown.byCommittee.map((g) => (
          <BreakdownRow key={g.key} label={g.key} stats={g.stats} />
        ))}
        <BreakdownRow label="全体" stats={breakdown.total} variant="total" />
        {breakdown.observers.invited > 0 && (
          <BreakdownRow
            label="オブザーバー"
            stats={breakdown.observers}
            variant="observers"
          />
        )}
      </div>
    </section>
  );
}

function BreakdownRow({
  label,
  stats,
  variant,
}: {
  label: string;
  stats: AttendeeStats;
  variant?: 'total' | 'observers';
}) {
  return (
    <div className={`breakdown-row ${variant ? `breakdown-${variant}` : ''}`}>
      <div className="bd-label">
        <strong>{label}</strong>
        <span className="bd-sub">
          出席 {stats.yes} / 欠席 {stats.no} / 未回答 {stats.pending} / 受付 {stats.checkedIn}
        </span>
      </div>
      <span className="bd-count">{stats.yes}/{stats.invited}名</span>
      <span className="bd-rate">{attendanceRate(stats)}</span>
    </div>
  );
}

function AfterpartyStats({ attendees }: { attendees: Attendee[] }) {
  const counts = useMemo(() => {
    let yes = 0;
    let no = 0;
    for (const a of attendees) {
      if (a.after_status === 'yes') yes++;
      else if (a.after_status === 'no') no++;
    }
    return {
      yes,
      no,
      pending: attendees.length - yes - no,
    };
  }, [attendees]);

  return (
    <div className="afterparty-stats">
      <span className="afterparty-stats-label">🍻 二次会</span>
      <div className="afterparty-stats-grid">
        <div>
          <span className="num">{counts.yes}</span>
          <span className="lab">参加</span>
        </div>
        <div>
          <span className="num">{counts.no}</span>
          <span className="lab">不参加</span>
        </div>
        <div>
          <span className="num">{counts.pending}</span>
          <span className="lab">未回答</span>
        </div>
      </div>
    </div>
  );
}

function EventActionsMenu({
  eventId,
  canManage,
  canScan,
  onClose,
  onCopyLink,
  onDelete,
}: {
  eventId: string;
  canManage: boolean;
  canScan: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
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
        <h2>イベント操作</h2>
        <div className="action-stack" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              onClose();
              void onCopyLink();
            }}
          >
            共有リンクをコピー
          </button>
          {canScan && (
            <Link
              to={`/events/${eventId}/reception`}
              className="link-button"
              onClick={onClose}
            >
              受付モード(QR スキャン)
            </Link>
          )}
          {canManage && (
            <Link
              to={`/events/${eventId}/edit`}
              className="link-button"
              onClick={onClose}
            >
              編集
            </Link>
          )}
          {canManage && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onClose();
                onDelete();
              }}
            >
              このイベントを削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface RsvpSectionProps {
  eventId: string;
  hasAfterparty: boolean;
  rsvp: YourRsvp;
  onSaved: () => Promise<void>;
  onShowQr: () => void;
}

function RsvpSection({
  eventId,
  hasAfterparty,
  rsvp,
  onSaved,
  onShowQr,
}: RsvpSectionProps) {
  const [status, setStatus] = useState<RsvpStatus>(rsvp.status);
  const [afterStatus, setAfterStatus] = useState<RsvpStatus>(
    rsvp.after_status ?? 'pending',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api(`/api/events/${eventId}/rsvp`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          after_status: hasAfterparty ? afterStatus : null,
        }),
      });
      setSavedMsg('回答を保存しました');
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rsvp-section">
      <h2 style={{ marginTop: 32 }}>あなたの出欠</h2>

      <fieldset className="rsvp-radio-group">
        <legend>出欠</legend>
        {(['yes', 'no', 'pending'] as RsvpStatus[]).map((s) => (
          <label key={s} className="rsvp-radio">
            <input
              type="radio"
              name="rsvp-status"
              checked={status === s}
              onChange={() => setStatus(s)}
            />
            <span>{STATUS_LABEL[s]}</span>
          </label>
        ))}
      </fieldset>

      {hasAfterparty && (
        <fieldset className="rsvp-radio-group">
          <legend>二次会</legend>
          {(['yes', 'no', 'pending'] as RsvpStatus[]).map((s) => (
            <label key={s} className="rsvp-radio">
              <input
                type="radio"
                name="rsvp-after"
                checked={afterStatus === s}
                onChange={() => setAfterStatus(s)}
              />
              <span>{s === 'yes' ? '参加' : s === 'no' ? '不参加' : '未回答'}</span>
            </label>
          ))}
        </fieldset>
      )}

      {error && <p className="error">{error}</p>}
      {savedMsg && <p className="success">{savedMsg}</p>}

      <div className="action-row" style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving}>
          {saving ? '保存中...' : '回答を保存'}
        </button>
      </div>

      <div className="action-stack" style={{ marginTop: 16 }}>
        <button className="secondary" onClick={onShowQr}>
          受付用 QR コードを表示
        </button>
      </div>
    </section>
  );
}
