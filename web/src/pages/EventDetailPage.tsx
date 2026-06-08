import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AttendeeManager } from '../components/AttendeeManager';
import { QrModal } from '../components/QrModal';
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

interface DetailResponse {
  event: EventDetail;
  attendees: Attendee[];
  your_rsvp: YourRsvp | null;
}

const STATUS_LABEL: Record<RsvpStatus, string> = {
  yes: '出席',
  no: '欠席',
  pending: '未回答',
};

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, viewMode } = useAuth();
  const isPrivileged = user?.role === 'sysadmin' || user?.role === 'editor';
  // ユーザー画面プレビュー中はビューアー扱い
  const canEdit = isPrivileged && viewMode === 'admin';

  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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

  return (
    <div className="screen">
      <div className="detail-toolbar">
        <Link to="/" className="back-link">イベント一覧へ</Link>
        {canEdit && (
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
        <p className="note" style={{ marginBottom: 12 }}>
          <span className="badge warn">下書き</span> このイベントはまだ公開されていません。
        </p>
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

      <div className="section-label">
        参加者
        <span className="count">
          {data.attendees.filter((a) => a.checked_in_at).length} 受付 /{' '}
          {data.attendees.length} 名
        </span>
      </div>

      {ev.has_afterparty && data.attendees.length > 0 && (
        <AfterpartyStats attendees={data.attendees} />
      )}

      {data.attendees.length === 0 ? (
        <p className="note">まだ参加者がいません。</p>
      ) : (
        <ul className="attendee-list">
          {data.attendees.map((a) => (
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
                </div>
              ) : (
                <span className={`status-badge badge-${a.status}`}>
                  {a.checked_in_at ? '受付済' : STATUS_LABEL[a.status]}
                </span>
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

      {showMenu && canEdit && (
        <EventActionsMenu
          eventId={ev.id}
          onClose={() => setShowMenu(false)}
        />
      )}
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
  onClose,
}: {
  eventId: string;
  onClose: () => void;
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
          <Link to={`/events/${eventId}/reception`} className="link-button">
            受付モード(QR スキャン)
          </Link>
          <Link to={`/events/${eventId}/edit`} className="link-button">
            編集
          </Link>
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
