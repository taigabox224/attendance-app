import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { QrModal } from '../components/QrModal';

// html5-qrcode が重いのでスキャナを開くまでロードしない
const QrScannerModal = lazy(() =>
  import('../components/QrScannerModal').then((m) => ({
    default: m.QrScannerModal,
  })),
);
import {
  attendanceRate,
  checkInRate,
  computeBreakdown,
  type AttendeeStats,
} from '../lib/breakdown';
import { downloadCsv, parseCsv, sanitizeFilenamePart } from '../lib/csv';
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

type DetailMode = 'normal' | 'reception';

const STATUS_LABEL: Record<RsvpStatus, string> = {
  yes: '出席',
  no: '欠席',
  pending: '未回答',
};

const AFTER_LABEL: Record<RsvpStatus, string> = {
  yes: '参加',
  no: '不参加',
  pending: '未回答',
};

// =====================================================
// Top-level page
// =====================================================
export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, viewMode } = useAuth();
  const isPrivileged = user?.role === 'sysadmin' || user?.role === 'editor';
  const canEdit = isPrivileged && viewMode === 'admin';

  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // モーダル類
  const [showQr, setShowQr] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // 受付モード切替 (legacy receptionMode)
  // 'normal' = ユーザ RSVP 表示 / 'reception' = 管理者風表示
  const [mode, setMode] = useState<DetailMode>('normal');
  const modeInitialized = useRef(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2000);
  }, []);

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

  // データ取得後、初期 mode を決める (legacy: admin 画面なら reception、ユーザ画面は normal)
  useEffect(() => {
    if (!data || modeInitialized.current) return;
    setMode(canEdit ? 'reception' : 'normal');
    modeInitialized.current = true;
  }, [data, canEdit]);

  // イベントが変わったら mode 初期化フラグをリセット
  useEffect(() => {
    modeInitialized.current = false;
  }, [id]);

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
      navigate('/events', { replace: true });
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '削除に失敗しました');
    }
  }

  if (error && !data) {
    return (
      <div className="screen">
        <div className="detail-toolbar">
          <Link to="/events" className="back-link">
            イベント一覧へ
          </Link>
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
  const isReceptionist = data.receptionists.some(
    (r) => r.user_id === user?.id,
  );
  // legacy: 受付担当 OR 編集可 なら toggle 表示
  const showToggle = isReceptionist || canEdit;
  // 受付モードに切り替えられるか (sysadmin / editor の自作 / receptionist 指定者)
  const canEnterReception = canEdit || isReceptionist;

  function changeMode(next: DetailMode) {
    if (next === mode) return;
    if (next === 'reception' && !canEnterReception) return;
    setMode(next);
  }

  return (
    <div className="screen">
      <div className="detail-toolbar">
        <Link to="/events" className="back-link">
          イベント一覧へ
        </Link>
        {(canEdit || canEnterReception) && (
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

      {showToggle && (
        <div className="reception-toggle-bar">
          <div className="reception-toggle">
            <button
              type="button"
              className={mode === 'normal' ? 'active' : ''}
              onClick={() => changeMode('normal')}
            >
              通常
            </button>
            <button
              type="button"
              className={mode === 'reception' ? 'active' : ''}
              onClick={() => changeMode('reception')}
            >
              受付
            </button>
          </div>
        </div>
      )}

      {canEdit && !ev.published && (
        <div className="draft-notice" role="status">
          <span className="badge warn">下書き</span>
          <span>このイベントはまだ公開されていません</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {mode === 'reception' ? (
        <ReceptionView
          eventId={ev.id}
          ev={ev}
          attendees={data.attendees}
          canEdit={canEdit}
          onReload={load}
          onShowToast={showToast}
          onOpenScanner={() => setShowScanner(true)}
        />
      ) : (
        <NormalView
          eventId={ev.id}
          ev={ev}
          yourRsvp={data.your_rsvp}
          onSaved={load}
          onShowQr={() => setShowQr(true)}
        />
      )}

      {showQr && <QrModal eventId={ev.id} onClose={() => setShowQr(false)} />}

      {showScanner && (
        <Suspense fallback={<div className="toast">カメラを準備中...</div>}>
          <QrScannerModal
            eventId={ev.id}
            onClose={() => setShowScanner(false)}
            onScanned={load}
          />
        </Suspense>
      )}

      {showMenu && (
        <EventActionsMenu
          canManage={canEdit}
          canScan={canEnterReception}
          eventId={ev.id}
          onClose={() => setShowMenu(false)}
          onCopyLink={copyShareLink}
          onDelete={deleteEvent}
          onOpenScanner={() => {
            setMode('reception');
            setShowScanner(true);
          }}
        />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

// =====================================================
// NormalView : ユーザ RSVP 中心 (legacy renderUserEventDetail)
// =====================================================
function NormalView({
  eventId,
  ev,
  yourRsvp,
  onSaved,
  onShowQr,
}: {
  eventId: string;
  ev: EventDetail;
  yourRsvp: YourRsvp | null;
  onSaved: () => Promise<void>;
  onShowQr: () => void;
}) {
  const locked = !!(
    ev.response_deadline && new Date(ev.response_deadline) < new Date()
  );

  // 招待されていない場合のフォールバック
  if (!yourRsvp) {
    return (
      <>
        <EventHero ev={ev} locked={locked} />
        <div className="rsvp-card">
          <div
            style={{
              textAlign: 'center',
              padding: '14px 0',
              lineHeight: 1.6,
              fontSize: 14,
              color: 'var(--text-mute)',
            }}
          >
            あなたはこのイベントに招待されていません
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <EventHero ev={ev} locked={locked} />

      <RsvpCard
        eventId={eventId}
        title={ev.title}
        rsvp={yourRsvp}
        locked={locked}
        hasAfterparty={ev.has_afterparty}
        afterpartyTitle={ev.afterparty_title}
        afterpartyLocation={ev.afterparty_location}
        afterpartyDescription={ev.afterparty_description}
        onSaved={onSaved}
        onShowQr={onShowQr}
      />
    </>
  );
}

// =====================================================
// EventHero
// =====================================================
function EventHero({
  ev,
  locked,
}: {
  ev: EventDetail;
  locked: boolean;
}) {
  return (
    <section className="event-hero">
      <div className="date">
        {formatDateTime(ev.start_at)}
        {ev.end_at ? ` 〜 ${formatDateTime(ev.end_at)}` : ''}
      </div>
      <h1 className="title">
        {ev.title}
        {!ev.published && <span className="event-badge draft">下書き</span>}
      </h1>
      {ev.committee && (
        <div className="info-row">
          <span className="ico">🏛️</span>
          <span>担当: {ev.committee}</span>
        </div>
      )}
      <div className="info-row">
        <span className="ico">📍</span>
        <span>{ev.location || '場所未定'}</span>
      </div>
      {ev.description && (
        <div className="info-row">
          <span className="ico">📝</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{ev.description}</span>
        </div>
      )}
      {ev.response_deadline && (
        <div className="info-row">
          <span className="ico">⏰</span>
          <span>
            回答期限 {formatDateTime(ev.response_deadline)}
            {locked && (
              <span className="event-badge expired" style={{ marginLeft: 6 }}>
                締切
              </span>
            )}
          </span>
        </div>
      )}
      {ev.has_afterparty && (
        <div className="info-row">
          <span className="ico">🍻</span>
          <span>
            {ev.afterparty_title || '懇親会'}あり
            {ev.afterparty_location ? ` · ${ev.afterparty_location}` : ''}
          </span>
        </div>
      )}
    </section>
  );
}

// =====================================================
// RsvpCard : 大ボタン + 下書き保持 + 保存
// =====================================================
function RsvpCard({
  eventId,
  title,
  rsvp,
  locked,
  hasAfterparty,
  afterpartyTitle,
  afterpartyLocation,
  afterpartyDescription,
  onSaved,
  onShowQr,
}: {
  eventId: string;
  title: string;
  rsvp: YourRsvp;
  locked: boolean;
  hasAfterparty: boolean;
  afterpartyTitle: string | null;
  afterpartyLocation: string | null;
  afterpartyDescription: string | null;
  onSaved: () => Promise<void>;
  onShowQr: () => void;
}) {
  // pending を含めて選択候補は yes/no/pending。
  // legacy では「出席する/欠席する」ボタンの 2 つで pending は無いが、
  // 元の状態が pending の場合のセマンティクスを保つため内部状態は 3 値で持つ。
  const [status, setStatus] = useState<RsvpStatus>(rsvp.status);
  const [afterStatus, setAfterStatus] = useState<RsvpStatus>(
    rsvp.after_status ?? 'pending',
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    status !== rsvp.status ||
    (hasAfterparty && afterStatus !== (rsvp.after_status ?? 'pending'));
  const showQrBtn = rsvp.status === 'yes' || !!rsvp.checked_in_at;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api(`/api/events/${eventId}/rsvp`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          after_status: hasAfterparty ? afterStatus : null,
        }),
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="rsvp-card">
        <div className="label">{title} の出欠</div>
        <div className="rsvp-buttons">
          <button
            type="button"
            className={`rsvp-btn ${status === 'yes' ? 'active-yes' : ''}`}
            disabled={locked}
            onClick={() => setStatus('yes')}
          >
            出席する
          </button>
          <button
            type="button"
            className={`rsvp-btn ${status === 'no' ? 'active-no' : ''}`}
            disabled={locked}
            onClick={() => setStatus('no')}
          >
            欠席する
          </button>
        </div>
        <div className="rsvp-current">
          現在の回答:{' '}
          <span className={`status-badge badge-${rsvp.status}`}>
            {STATUS_LABEL[rsvp.status]}
          </span>
          {rsvp.checked_in_at && (
            <span
              className="status-badge badge-checked"
              style={{ marginLeft: 4 }}
            >
              ✓受付済
            </span>
          )}
          {status !== rsvp.status && <span className="unsaved">(未保存)</span>}
        </div>
        {locked && (
          <div className="rsvp-locked-notice">
            回答期限を過ぎたため、変更できません。
            <br />
            変更が必要な場合は管理者にご連絡ください。
          </div>
        )}
      </div>

      {hasAfterparty && (
        <div className="rsvp-card">
          <div className="label">{afterpartyTitle || '懇親会'} の出欠</div>
          {(afterpartyLocation || afterpartyDescription) && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-mute)',
                margin: '-2px 0 10px',
                lineHeight: 1.6,
              }}
            >
              {afterpartyLocation && (
                <div>
                  <span style={{ opacity: 0.6 }}>📍</span> {afterpartyLocation}
                </div>
              )}
              {afterpartyDescription && (
                <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                  <span style={{ opacity: 0.6 }}>📝</span>{' '}
                  {afterpartyDescription}
                </div>
              )}
            </div>
          )}
          <div className="rsvp-buttons">
            <button
              type="button"
              className={`rsvp-btn ${afterStatus === 'yes' ? 'active-yes' : ''}`}
              disabled={locked}
              onClick={() => setAfterStatus('yes')}
            >
              参加する
            </button>
            <button
              type="button"
              className={`rsvp-btn ${afterStatus === 'no' ? 'active-no' : ''}`}
              disabled={locked}
              onClick={() => setAfterStatus('no')}
            >
              不参加
            </button>
          </div>
          <div className="rsvp-current">
            現在の回答:{' '}
            <span
              className={`status-badge badge-${rsvp.after_status ?? 'pending'}`}
            >
              {AFTER_LABEL[rsvp.after_status ?? 'pending']}
            </span>
            {afterStatus !== (rsvp.after_status ?? 'pending') && (
              <span className="unsaved">(未保存)</span>
            )}
          </div>
          {locked && (
            <div className="rsvp-locked-notice">
              回答期限を過ぎたため、変更できません。
            </div>
          )}
        </div>
      )}

      {err && <p className="error">{err}</p>}

      {!locked && (
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: 12, marginTop: 4 }}
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? '保存中...' : dirty ? '保存する' : '変更はありません'}
        </button>
      )}

      {showQrBtn && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="scan-cta"
            style={{ margin: 0 }}
            onClick={onShowQr}
          >
            {rsvp.checked_in_at
              ? '✓ 受付済 (QRを再表示)'
              : '📱 受付用QRコードを表示'}
          </button>
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-mute)',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            当日、このQRコードを受付で提示してください
          </p>
        </div>
      )}
    </>
  );
}

// =====================================================
// ReceptionView : 管理者風表示 (legacy renderAdminEventDetail)
// =====================================================
function ReceptionView({
  eventId,
  ev,
  attendees,
  canEdit,
  onReload,
  onShowToast,
  onOpenScanner,
}: {
  eventId: string;
  ev: EventDetail;
  attendees: Attendee[];
  canEdit: boolean;
  onReload: () => Promise<void>;
  onShowToast: (msg: string) => void;
  onOpenScanner: () => void;
}) {
  const locked = !!(
    ev.response_deadline && new Date(ev.response_deadline) < new Date()
  );

  const counts = useMemo(() => {
    const c = { yes: 0, checked: 0, no: 0, pending: 0 };
    for (const a of attendees) {
      if (a.checked_in_at) c.checked++;
      if (a.status === 'yes') c.yes++;
      else if (a.status === 'no') c.no++;
      else c.pending++;
    }
    return c;
  }, [attendees]);

  // フィルタ
  type StatusFilter = 'all' | 'yes' | 'no' | 'pending' | 'checked';
  type KindFilter = 'all' | 'member' | 'observer';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    api<{ departments: string[] }>('/api/masters')
      .then((d) => setDepartments(d.departments))
      .catch(() => {
        /* マスター無くてもフィルタを諦めるだけ */
      });
  }, []);

  const visibleAttendees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attendees.filter((a) => {
      if (statusFilter === 'checked') {
        if (!a.checked_in_at) return false;
      } else if (statusFilter !== 'all') {
        if (a.status !== statusFilter) return false;
      }
      if (kindFilter === 'member' && a.is_observer) return false;
      if (kindFilter === 'observer' && !a.is_observer) return false;
      if (deptFilter.size > 0) {
        if (!a.department || !deptFilter.has(a.department)) return false;
      }
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [attendees, query, statusFilter, kindFilter, deptFilter]);

  const hasFilter =
    query !== '' ||
    statusFilter !== 'all' ||
    kindFilter !== 'all' ||
    deptFilter.size > 0;

  function toggleDept(d: string) {
    setDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function resetFilter() {
    setQuery('');
    setStatusFilter('all');
    setKindFilter('all');
    setDeptFilter(new Set());
  }

  async function patchAttendee(
    attendeeId: string,
    body: Record<string, unknown>,
  ) {
    try {
      await api(`/api/events/${eventId}/attendees/${attendeeId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await onReload();
    } catch (e) {
      onShowToast(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

  return (
    <>
      <EventHero ev={ev} locked={locked} />

      <div className="count-grid">
        <div className="count-cell yes">
          <div className="num">{counts.yes}</div>
          <div className="lab">出席</div>
        </div>
        <div className="count-cell checked">
          <div className="num">{counts.checked}</div>
          <div className="lab">受付済</div>
        </div>
        <div className="count-cell no">
          <div className="num">{counts.no}</div>
          <div className="lab">欠席</div>
        </div>
        <div className="count-cell pending">
          <div className="num">{counts.pending}</div>
          <div className="lab">未回答</div>
        </div>
      </div>

      {ev.has_afterparty && <AfterpartyStats attendees={attendees} />}

      <button type="button" className="scan-cta" onClick={onOpenScanner}>
        📷 QRコードをスキャン
      </button>

      <BreakdownSection
        eventId={ev.id}
        eventTitle={ev.title}
        hasAfterparty={ev.has_afterparty}
        attendees={attendees}
        onReload={onReload}
        onToast={onShowToast}
      />

      <div className="section-label">
        参加者{' '}
        <span className="count">
          {hasFilter
            ? `${visibleAttendees.length} / ${attendees.length} 名`
            : `${attendees.filter((a) => a.checked_in_at).length} 受付 / ${attendees.length} 名`}
        </span>
      </div>

      {attendees.length > 0 && (
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
                {k === 'all' ? '全て' : k === 'member' ? 'メンバー' : 'オブザーバー'}
              </button>
            ))}
          </div>
          {departments.length > 0 && (
            <>
              <div className="filter-label">委員会(複数選択可)</div>
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
          {hasFilter && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={resetFilter}
              style={{ marginTop: 4 }}
            >
              フィルタをリセット
            </button>
          )}
        </div>
      )}

      {attendees.length === 0 ? (
        <p className="note">まだ参加者がいません。</p>
      ) : visibleAttendees.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">○</div>
          <div className="hint">該当する参加者がいません</div>
        </div>
      ) : (
        <ul className="attendee-list">
          {visibleAttendees.map((a) => (
            <li
              key={a.id}
              className={`attendee-row ${a.is_observer ? 'is-observer' : ''}`}
            >
              <div className="attendee-main">
                <span>{a.name}</span>
                {a.is_observer && <span className="badge">ゲスト</span>}
                {a.department && <span className="badge">{a.department}</span>}
              </div>
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
                {ev.has_afterparty && (a.after_status === 'yes' || a.fee_paid) && (
                  <button
                    type="button"
                    className={`status-btn ${a.fee_paid ? 'active fee' : ''}`}
                    onClick={() =>
                      patchAttendee(a.id, { fee_paid: !a.fee_paid })
                    }
                  >
                    会費
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* canEdit が false (= 受付担当だけ) の時は legacy 仕様で「参加者の追加」UI は出さない */}
      {!canEdit && (
        <p
          className="note"
          style={{ marginTop: 16, fontSize: 11, color: 'var(--text-mute)' }}
        >
          受付担当として表示しています。出欠/受付/会費の更新は可能です。
        </p>
      )}
    </>
  );
}

// =====================================================
// BreakdownSection
// =====================================================
function BreakdownSection({
  eventId,
  eventTitle,
  hasAfterparty,
  attendees,
  onReload,
  onToast,
}: {
  eventId: string;
  eventTitle: string;
  hasAfterparty: boolean;
  attendees: Attendee[];
  onReload: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [committeeOrder, setCommitteeOrder] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

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

  async function importAttendeesCsv(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        window.alert('CSV が空です。');
        return;
      }
      const header = (rows[0] ?? []).map((s) => s.trim());
      const idIdx = header.indexOf('ユーザーID');
      const nameIdx = header.indexOf('氏名');
      const altNameIdx = header.indexOf('名前');
      const statusIdx = header.indexOf('出欠');
      const afterIdx = header.indexOf('二次会');
      const altAfterIdx = header.indexOf('懇親会');

      const useNameIdx = nameIdx >= 0 ? nameIdx : altNameIdx;
      const useAfterIdx = afterIdx >= 0 ? afterIdx : altAfterIdx;

      if (statusIdx < 0) {
        window.alert('「出欠」列が見つかりません。CSV ヘッダを確認してください。');
        return;
      }

      const JP_TO_STATUS: Record<string, 'yes' | 'no' | 'pending'> = {
        出席: 'yes',
        欠席: 'no',
        未回答: 'pending',
        yes: 'yes',
        no: 'no',
        pending: 'pending',
      };

      const memberByName = new Map(
        attendees.filter((a) => !a.is_observer).map((a) => [a.name, a]),
      );
      const byUserId = new Map(
        attendees.filter((a) => a.user_id).map((a) => [a.user_id!, a]),
      );

      interface Update {
        attendee_id: string;
        name: string;
        status: 'yes' | 'no' | 'pending';
        after_status: 'yes' | 'no' | 'pending' | null;
      }
      const updates: Update[] = [];
      const skipped: string[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        let attendee: Attendee | undefined;
        if (idIdx >= 0) {
          const v = (row[idIdx] ?? '').trim();
          if (v) attendee = byUserId.get(v);
        }
        if (!attendee && useNameIdx >= 0) {
          const v = (row[useNameIdx] ?? '').trim();
          if (v) attendee = memberByName.get(v);
        }
        const rowLabel =
          (useNameIdx >= 0 ? (row[useNameIdx] ?? '').trim() : '') ||
          (idIdx >= 0 ? (row[idIdx] ?? '').trim() : '') ||
          `行${r + 1}`;
        if (!attendee) {
          skipped.push(rowLabel);
          continue;
        }
        const statusJp = (row[statusIdx] ?? '').trim();
        const newStatus = JP_TO_STATUS[statusJp];
        if (!newStatus) {
          skipped.push(`${rowLabel} (出欠 "${statusJp}" 不明)`);
          continue;
        }
        let newAfter: 'yes' | 'no' | 'pending' | null = null;
        if (hasAfterparty && useAfterIdx >= 0) {
          const v = (row[useAfterIdx] ?? '').trim();
          newAfter = JP_TO_STATUS[v] ?? null;
        }
        updates.push({
          attendee_id: attendee.id,
          name: rowLabel,
          status: newStatus,
          after_status: newAfter,
        });
      }

      if (updates.length === 0) {
        window.alert(
          '反映できる行がありませんでした。' +
            (skipped.length ? `\nスキップ ${skipped.length} 件` : ''),
        );
        return;
      }

      const msg =
        `${updates.length} 件の出欠を更新します。` +
        (skipped.length
          ? `\nスキップ ${skipped.length} 件: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`
          : '') +
        '\n\n出席に切り替えた行は受付済としても登録されます。よろしいですか?';
      if (!window.confirm(msg)) return;

      for (const u of updates) {
        const body: Record<string, unknown> = { status: u.status };
        if (u.status === 'yes') body.checked_in_at = 'now';
        else if (u.status !== 'pending') body.checked_in_at = null;
        if (hasAfterparty && u.after_status !== null) {
          body.after_status = u.after_status;
        }
        await api(`/api/events/${eventId}/attendees/${u.attendee_id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }

      await onReload();
      onToast(
        `${updates.length} 件を更新${skipped.length ? ` (${skipped.length} 件スキップ)` : ''}`,
      );
    } catch (e) {
      window.alert(
        `CSV インポートに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="breakdown-card">
      <div className="breakdown-header">
        <span>出席内訳</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={exportBreakdownCsv}
            disabled={importing}
          >
            内訳 CSV
          </button>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={exportAttendeesCsv}
            disabled={importing}
          >
            参加者 CSV
          </button>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="氏名 + 出欠 列を含む CSV をアップロード"
          >
            {importing ? '取込中...' : 'CSV 取込'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await importAttendeesCsv(f);
              e.target.value = '';
            }}
          />
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
          出席 {stats.yes} / 欠席 {stats.no} / 未回答 {stats.pending} / 受付{' '}
          {stats.checkedIn}
        </span>
      </div>
      <span className="bd-count">
        {stats.yes}/{stats.invited}名
      </span>
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
    return { yes, no, pending: attendees.length - yes - no };
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

// =====================================================
// EventActionsMenu (歯車から開く操作モーダル)
// =====================================================
function EventActionsMenu({
  eventId,
  canManage,
  canScan,
  onClose,
  onCopyLink,
  onDelete,
  onOpenScanner,
}: {
  eventId: string;
  canManage: boolean;
  canScan: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onOpenScanner: () => void;
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
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onClose();
                onOpenScanner();
              }}
            >
              QRコードをスキャン
            </button>
          )}
          {canManage && (
            <Link
              to={`/events/${eventId}/edit`}
              className="link-button"
              onClick={onClose}
            >
              イベントを編集
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
