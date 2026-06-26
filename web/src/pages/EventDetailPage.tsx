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
  computeBreakdown,
  feeRate,
  type AttendeeStats,
} from '../lib/breakdown';
import { downloadCsv, sanitizeFilenamePart } from '../lib/csv';
import { formatDateRange, formatDateTime } from '../lib/format';

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
  // canEdit: 「管理者画面 (受付モード) を出す」かどうかの UI 制御。
  //          表示の切替なので viewMode を絡める。
  const canEdit = isPrivileged && viewMode === 'admin';
  // canManage: 「このイベントを編集/削除する権限があるか」の機能判定。
  //            役割そのもので決まる (viewMode に関係なく、editor/sysadmin なら可)。
  //            これにより、user モードで受付モードに入っている時も歯車から
  //            編集ボタンが出る (受付担当者が会場で内容修正したいケース対応)。
  const canManage = isPrivileged;

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

  // 受付モード中は 5 秒間隔で event 詳細を再取得し、複数端末で
  // 同時に受付作業しているときの「他端末で受付済になった」を反映する。
  // - 通常モードでは不要 (自分の RSVP しか触らないので polling しない)
  // - タブが非表示の時はスキップ (バッテリー / 通信節約)
  // - scanner modal が開いていても data の reflect は問題ないのでそのまま続行
  useEffect(() => {
    if (mode !== 'reception') return;
    const POLL_INTERVAL_MS = 5000;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [mode, load]);

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
  // 受付 (QRスキャン / 受付済トグル / 会費トグル) の可否:
  //   sysadmin: 常に可
  //   editor:   受付担当に指定されている時 or 管理者モードの時のみ可
  //   viewer:   受付担当に指定されている時のみ可
  const canDoReception =
    user?.role === 'sysadmin' ||
    isReceptionist ||
    (user?.role === 'editor' && viewMode === 'admin');
  // 管理者 (admin viewMode) は常に受付モードで開く → toggle 不要。
  // 受付担当 (一般ユーザ viewMode) のみが「通常/受付」を切替できる。
  const showToggle = !canEdit && isReceptionist;
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
          canDoReception={canDoReception}
          onReload={load}
          onShowToast={showToast}
          onOpenScanner={() => setShowScanner(true)}
        />
      ) : (
        <NormalView
          eventId={ev.id}
          ev={ev}
          yourRsvp={data.your_rsvp}
          onAfterSaveNavigate={() => navigate('/events')}
          onShowQr={() => setShowQr(true)}
        />
      )}

      {showQr && <QrModal eventId={ev.id} onClose={() => setShowQr(false)} />}

      {showScanner && (
        <Suspense fallback={<div className="toast">カメラを準備中...</div>}>
          <QrScannerModal
            eventId={ev.id}
            eventTitle={ev.title}
            hasAfterparty={ev.has_afterparty}
            afterpartyDescription={ev.afterparty_description}
            onClose={() => setShowScanner(false)}
            onScanned={load}
          />
        </Suspense>
      )}

      {showMenu && (
        <EventActionsMenu
          canManage={canManage}
          canScan={canDoReception}
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
  onAfterSaveNavigate,
  onShowQr,
}: {
  eventId: string;
  ev: EventDetail;
  yourRsvp: YourRsvp | null;
  onAfterSaveNavigate: () => void;
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
        onAfterSaveNavigate={onAfterSaveNavigate}
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
      <div className="date" style={{ whiteSpace: 'pre-line' }}>
        {formatDateRange(ev.start_at, ev.end_at)}
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
  onAfterSaveNavigate,
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
  onAfterSaveNavigate: () => void;
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
      // 保存後は /events 一覧に戻る (ユーザー指示)。
      // onSaved は呼ばない (詳細を再取得するより遷移を優先)。
      onAfterSaveNavigate();
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
  canDoReception,
  onReload,
  onShowToast,
  onOpenScanner,
}: {
  eventId: string;
  ev: EventDetail;
  attendees: Attendee[];
  // QRスキャン / 受付済トグル / 会費トグル が可能か
  // (sysadmin / editor / receptionist)
  canDoReception: boolean;
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
    <div className="reception-view">
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

      {canDoReception && (
        <button type="button" className="scan-cta" onClick={onOpenScanner}>
          📷 QRコードをスキャン
        </button>
      )}

      <BreakdownSection
        eventTitle={ev.title}
        hasAfterparty={ev.has_afterparty}
        attendees={attendees}
      />

      <div className="section-label">
        参加者{' '}
        <span className="count">
          {hasFilter
            ? `${visibleAttendees.length}/${attendees.length}`
            : attendees.length}
        </span>
      </div>

      {attendees.length > 0 && (
        <div className="filter-bar">
          <input
            type="search"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前で検索"
          />
          <div className="filter-chips">
            <FilterChip
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              label="全て"
              count={attendees.length}
            />
            <FilterChip
              active={statusFilter === 'yes'}
              onClick={() => setStatusFilter('yes')}
              label="出席"
              count={attendees.filter((a) => a.status === 'yes').length}
            />
            <FilterChip
              active={statusFilter === 'checked'}
              onClick={() => setStatusFilter('checked')}
              label="受付済"
              count={attendees.filter((a) => a.checked_in_at).length}
            />
            <FilterChip
              active={statusFilter === 'pending'}
              onClick={() => setStatusFilter('pending')}
              label="未回答"
              count={attendees.filter((a) => a.status === 'pending').length}
            />
            <FilterChip
              active={statusFilter === 'no'}
              onClick={() => setStatusFilter('no')}
              label="欠席"
              count={attendees.filter((a) => a.status === 'no').length}
            />
          </div>
          {departments.length > 0 && (
            <>
              <div className="filter-section-label">委員会(複数選択可)</div>
              <div className="multiselect-chips">
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
          <div className="filter-section-label">区分</div>
          <div className="filter-chips" style={{ marginTop: 4 }}>
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
          {hasFilter && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={resetFilter}
              >
                フィルタをリセット
              </button>
            </div>
          )}
        </div>
      )}

      {attendees.length === 0 ? (
        <p className="note">まだ参加者がいません。</p>
      ) : visibleAttendees.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <div className="hint">該当する参加者はいません</div>
        </div>
      ) : (
        <div className="attendee-list">
          {visibleAttendees.map((a) => (
            <AttendeeRow
              key={a.id}
              attendee={a}
              hasAfterparty={ev.has_afterparty}
              afterpartyTitle={ev.afterparty_title}
              canDoReception={canDoReception}
              onPatch={(body) => patchAttendee(a.id, body)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 参加者リスト1行 (legacy renderAdminAttendeeList の HTML をそのまま React 化)
function AttendeeRow({
  attendee,
  hasAfterparty,
  afterpartyTitle,
  canDoReception,
  onPatch,
}: {
  attendee: Attendee;
  hasAfterparty: boolean;
  afterpartyTitle: string | null;
  canDoReception: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const a = attendee;
  const showFee = hasAfterparty && a.after_status === 'yes';
  const name = a.name || (a.is_observer ? '(ゲスト)' : '');
  const initial = (name || '?').trim().charAt(0);

  // legacy renderAdminAttendeeList 同様、出欠 / 受付 / 会費 の手動変更は
  // すべて confirm ダイアログを挟む。誤タップでの状態変更を防ぐため。
  function confirmStatus(next: RsvpStatus) {
    const before = STATUS_LABEL[a.status];
    const after = STATUS_LABEL[next];
    if (a.status === next) return;
    if (!window.confirm(`${name} の出欠を変更します\n\n  ${before}  →  ${after}\n\nよろしいですか?`))
      return;
    void onPatch({ status: next });
  }
  function confirmAfterStatus(next: RsvpStatus) {
    const current = a.after_status ?? 'pending';
    if (current === next) return;
    const before = STATUS_LABEL[current];
    const after = STATUS_LABEL[next];
    const apTitle = afterpartyTitle || '懇親会';
    if (!window.confirm(`${name} の${apTitle}を変更します\n\n  ${before}  →  ${after}\n\nよろしいですか?`))
      return;
    void onPatch({ after_status: next });
  }
  function confirmCheckin(setTo: boolean) {
    if (setTo) {
      if (!window.confirm(`${name} さんを受付済にします。\nよろしいですか?`))
        return;
      void onPatch({ checked_in_at: 'now' });
    } else {
      if (!window.confirm(`${name} さんの受付済を取消します。\nよろしいですか?`))
        return;
      void onPatch({ checked_in_at: null });
    }
  }
  function confirmFee(setTo: boolean) {
    if (setTo) {
      if (
        !window.confirm(
          `${name} さんの懇親会会費を受領済にします。\nよろしいですか?`,
        )
      )
        return;
      void onPatch({ fee_paid: true });
    } else {
      if (
        !window.confirm(
          `${name} さんの懇親会会費「受領済」を取消します。\nよろしいですか?`,
        )
      )
        return;
      void onPatch({ fee_paid: false });
    }
  }

  return (
    <div className={`attendee-row ${a.is_observer ? 'is-observer' : ''}`}>
      <div className="left">
        <div className="avatar">{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div className="name-row">
            <span className="name">{name}</span>
            {a.is_observer && <span className="badge-observer">ゲスト</span>}
            {canDoReception ? (
              a.checked_in_at ? (
                <button
                  type="button"
                  className="badge-checked-in"
                  onClick={() => confirmCheckin(false)}
                  title="受付済を取消"
                >
                  ✓受付済
                </button>
              ) : (
                <button
                  type="button"
                  className="badge-not-checked-in"
                  onClick={() => confirmCheckin(true)}
                  title="受付済にする"
                >
                  受付未
                </button>
              )
            ) : (
              // 受付権限がない場合は、現状の状態だけ表示 (クリック不可)
              a.checked_in_at && (
                <span className="badge-checked-in" style={{ cursor: 'default' }}>
                  ✓受付済
                </span>
              )
            )}
            {showFee && canDoReception &&
              (a.fee_paid ? (
                <button
                  type="button"
                  className="badge-paid"
                  onClick={() => confirmFee(false)}
                  title="会費受領を取消"
                >
                  💰受領済
                </button>
              ) : (
                <button
                  type="button"
                  className="badge-unpaid"
                  onClick={() => confirmFee(true)}
                  title="会費を受領済にする"
                >
                  💰未収
                </button>
              ))}
            {showFee && !canDoReception && a.fee_paid && (
              <span className="badge-paid" style={{ cursor: 'default' }}>
                💰受領済
              </span>
            )}
          </div>
          {(a.department || a.title) && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-mute)',
                marginTop: 1,
              }}
            >
              {a.department}
              {a.department && a.title ? ' · ' : ''}
              {a.title}
            </div>
          )}
          <div
            style={{
              marginTop: 2,
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <StatusPill status={a.status} />
            {hasAfterparty && (
              <>
                <span className="afterparty-mini-label">🍻</span>
                <StatusPill status={a.after_status ?? 'pending'} />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="actions-stack">
        <div className="actions">
          <button
            type="button"
            className={`status-btn ${a.status === 'yes' ? 'active yes' : ''}`}
            onClick={() => confirmStatus(a.status === 'yes' ? 'pending' : 'yes')}
          >
            出
          </button>
          <button
            type="button"
            className={`status-btn ${a.status === 'no' ? 'active no' : ''}`}
            onClick={() => confirmStatus(a.status === 'no' ? 'pending' : 'no')}
          >
            欠
          </button>
        </div>
        {hasAfterparty && (
          <div className="actions actions-secondary">
            <span className="actions-prefix">懇</span>
            <button
              type="button"
              className={`status-btn ${a.after_status === 'yes' ? 'active yes' : ''}`}
              onClick={() =>
                confirmAfterStatus(a.after_status === 'yes' ? 'pending' : 'yes')
              }
            >
              出
            </button>
            <button
              type="button"
              className={`status-btn ${a.after_status === 'no' ? 'active no' : ''}`}
              onClick={() =>
                confirmAfterStatus(a.after_status === 'no' ? 'pending' : 'no')
              }
            >
              欠
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 「出席」「欠席」「未回答」 を 11px の小ピルで表示 (legacy statusBadge)
function StatusPill({ status }: { status: RsvpStatus }) {
  return (
    <span className={`status-badge badge-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// 件数チップ (legacy renderAdminEventDetail の chip ヘルパ相当)
function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {label}
      <span className="num">{count}</span>
    </button>
  );
}

// =====================================================
// BreakdownSection (出席内訳 + 懇親会会費)
// legacy renderAdminEventDetail の出席内訳カード相当
// =====================================================
function BreakdownSection({
  eventTitle,
  hasAfterparty,
  attendees,
}: {
  eventTitle: string;
  hasAfterparty: boolean;
  attendees: Attendee[];
}) {
  const [committeeOrder, setCommitteeOrder] = useState<string[]>([]);
  // 委員会別の母数を出すための active ユーザー一覧。
  // /api/users は status='left' を除外 + system account を除外して返してくれる
  // ので、そのままの長さで「active メンバー数」に使える。
  const [activeUsers, setActiveUsers] = useState<
    Array<{ id: string; department: string | null }>
  >([]);

  useEffect(() => {
    api<{ departments: string[] }>('/api/masters')
      .then((d) => setCommitteeOrder(d.departments))
      .catch(() => {
        /* マスター無しでも alphabetical fallback */
      });
    api<{ users: Array<{ id: string; department: string | null }> }>(
      '/api/users',
    )
      .then((d) => setActiveUsers(d.users))
      .catch(() => {
        /* 取れなくても rate は '—' になるだけ */
      });
  }, []);

  const breakdown = useMemo(
    () => computeBreakdown(attendees, committeeOrder, activeUsers),
    [attendees, committeeOrder, activeUsers],
  );

  // legacy 互換の CSV 出力 (一発で出席内訳 + 懇親会会費を含む)
  function exportCsv() {
    const baseHeader = [
      '区分',
      '委員会',
      '出席数',
      '出席回答数',
      '委員会人数',
      '参加率',
    ];
    const apHeader = hasAfterparty ? ['懇親会出席予定', '懇親会会費受領'] : [];
    const rows: Array<Array<unknown>> = [[...baseHeader, ...apHeader]];

    const apCols = (afterYes: number, afterPaid: number) =>
      hasAfterparty ? [afterYes, afterPaid] : [];

    rows.push([
      '全体',
      '',
      breakdown.total.checkedIn,
      breakdown.total.yes,
      breakdown.total.members,
      attendanceRate(breakdown.total),
      ...apCols(breakdown.total.afterYes, breakdown.total.afterPaid),
    ]);
    for (const g of breakdown.byCommittee) {
      rows.push([
        '委員会別',
        g.key,
        g.stats.checkedIn,
        g.stats.yes,
        g.stats.members,
        attendanceRate(g.stats),
        ...apCols(g.stats.afterYes, g.stats.afterPaid),
      ]);
    }
    if (breakdown.observers.invited > 0) {
      rows.push([
        'オブザーバー',
        '',
        breakdown.observers.checkedIn,
        '',
        breakdown.observers.invited,
        '',
        ...apCols(
          breakdown.observers.afterYes,
          breakdown.observers.afterPaid,
        ),
      ]);
    }
    downloadCsv(`${sanitizeFilenamePart(eventTitle)}_出席内訳.csv`, rows);
  }

  return (
    <>
      <section className="breakdown-card">
        <div className="breakdown-header">
          <span>出席内訳</span>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={exportCsv}
          >
            CSV書き出し
          </button>
        </div>
        <div className="breakdown-rows">
          <BreakdownRow
            label="全体"
            stats={breakdown.total}
            variant="total"
          />
          {breakdown.byCommittee.map((g) => (
            <BreakdownRow key={g.key} label={g.key} stats={g.stats} />
          ))}
          {breakdown.observers.invited > 0 && (
            <BreakdownRow
              label="オブザーバー"
              stats={breakdown.observers}
              variant="observers"
            />
          )}
        </div>
        <div className="breakdown-note">
          参加率は受付済 ÷ 委員会のアクティブメンバー数で算出
        </div>
      </section>

      {hasAfterparty && (
        <section className="breakdown-card" style={{ marginTop: 10 }}>
          <div className="breakdown-header">
            <span>🍻 懇親会会費</span>
          </div>
          <div className="breakdown-rows">
            <FeeRow
              label="全体"
              stats={breakdown.total}
              variant="total"
            />
            {breakdown.byCommittee
              .filter((g) => g.stats.afterYes > 0 || g.stats.afterPaid > 0)
              .map((g) => (
                <FeeRow key={g.key} label={g.key} stats={g.stats} />
              ))}
            {breakdown.observers.afterYes > 0 && (
              <FeeRow
                label="オブザーバー"
                stats={breakdown.observers}
                variant="observers"
              />
            )}
          </div>
          <div className="breakdown-note">
            受領率は懇親会「出席予定」を母数として算出
          </div>
        </section>
      )}
    </>
  );
}

// 出席内訳の行: 受付済 / 委員会人数 + サブ「出席回答 N 名」 + 参加率
// オブザーバーは委員会に属さないので分母は invited (招待 = ゲスト人数) を使う。
function BreakdownRow({
  label,
  stats,
  variant,
}: {
  label: string;
  stats: AttendeeStats;
  variant?: 'total' | 'observers';
}) {
  const denom =
    variant === 'observers' ? stats.invited : stats.members;
  return (
    <div className={`breakdown-row ${variant ? `breakdown-${variant}` : ''}`}>
      <div className="bd-label">
        <strong>{label}</strong>
      </div>
      <span className="bd-count">
        {stats.checkedIn} / {denom}
        <div className="bd-sub">出席回答 {stats.yes} 名</div>
      </span>
      <span className="bd-rate">
        {variant === 'observers'
          ? denom === 0
            ? '—'
            : ((stats.checkedIn / denom) * 100).toFixed(1) + '%'
          : attendanceRate(stats)}
      </span>
    </div>
  );
}

// 懇親会会費の行: {afterPaid}/{afterYes} + サブ「受領済 / 出席予定」
function FeeRow({
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
      </div>
      <span className="bd-count">
        {stats.afterPaid} / {stats.afterYes}
        {variant === 'total' && (
          <div className="bd-sub">受領済 / 出席予定</div>
        )}
      </span>
      <span className="bd-rate">{feeRate(stats)}</span>
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
      <span className="afterparty-stats-label">🍻 懇親会</span>
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
