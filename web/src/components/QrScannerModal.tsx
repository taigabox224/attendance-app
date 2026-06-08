import { Html5Qrcode } from 'html5-qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { formatDateTime } from '../lib/format';

type RsvpStatus = 'pending' | 'yes' | 'no';

interface CheckinAttendee {
  id: string;
  name: string;
  checked_in_at: string;
  after_status?: RsvpStatus | null;
  fee_paid?: boolean;
  department?: string | null;
  title?: string | null;
}

type ToastKind = 'success' | 'duplicate' | 'error';
interface Toast {
  kind: ToastKind;
  title: string;
  sub?: string;
}

interface Props {
  eventId: string;
  eventTitle: string;
  hasAfterparty: boolean;
  afterpartyDescription: string | null;
  onClose: () => void;
  onScanned: () => void;
}

const QR_REGION_ID = 'qr-scanner-region';

const AFTER_LABEL: Record<RsvpStatus, string> = {
  yes: '出席予定',
  pending: '未回答',
  no: '欠席',
};

// 受付モード内で開く QR スキャナ (legacy openScanner + openScanFeeModal 相当)
export function QrScannerModal({
  eventId,
  eventTitle,
  hasAfterparty,
  afterpartyDescription,
  onClose,
  onScanned,
}: Props) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // 懇親会あり時、受付成功後に開く会費徴収モーダルの対象データ
  const [feeAttendee, setFeeAttendee] = useState<CheckinAttendee | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pausedRef = useRef(false);
  const lastTokenRef = useRef<string | null>(null);
  const lastTimeRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((t: Toast, ms: number) => {
    setToast(t);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const handleScan = useCallback(
    async (decoded: string) => {
      const now = Date.now();
      if (
        decoded === lastTokenRef.current &&
        now - lastTimeRef.current < 2000
      ) {
        return;
      }
      lastTokenRef.current = decoded;
      lastTimeRef.current = now;
      if (pausedRef.current) return;
      pausedRef.current = true;
      try {
        const d = await api<{ ok: boolean; attendee: CheckinAttendee }>(
          `/api/events/${eventId}/checkin`,
          { method: 'POST', body: JSON.stringify({ token: decoded }) },
        );
        const a = d.attendee;
        const meta = [a.department, a.title].filter(Boolean).join(' · ');
        // 懇親会あり & 不参加でない時は会費モーダルを開く (legacy openScanFeeModal)
        if (hasAfterparty && a.after_status !== 'no') {
          setFeeAttendee(a);
          if (navigator.vibrate) navigator.vibrate(120);
          onScanned();
          return; // pausedRef は会費モーダル閉じた後に解放
        }
        showToast(
          {
            kind: 'success',
            title: `${a.name} さん`,
            sub: meta ? `${meta} ・ 受付完了` : '受付完了',
          },
          1800,
        );
        if (navigator.vibrate) navigator.vibrate(120);
        onScanned();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const dup = (e.data as { attendee?: CheckinAttendee } | undefined)
            ?.attendee;
          showToast(
            {
              kind: 'duplicate',
              title: dup ? `${dup.name} さんは既に受付済` : '既に受付済',
              sub: dup ? formatDateTime(dup.checked_in_at) : undefined,
            },
            2200,
          );
          if (navigator.vibrate) navigator.vibrate([60, 50, 60]);
        } else {
          showToast(
            {
              kind: 'error',
              title: e instanceof ApiError ? e.message : '通信エラー',
            },
            2200,
          );
          if (navigator.vibrate) navigator.vibrate([60, 50, 60]);
        }
      } finally {
        // 会費モーダル中は paused のまま (モーダル closeで解放する)
        if (!feeAttendee) {
          setTimeout(() => {
            pausedRef.current = false;
          }, 600);
        }
      }
    },
    [eventId, hasAfterparty, onScanned, showToast, feeAttendee],
  );

  useEffect(() => {
    let cancelled = false;
    let startedScanner: Html5Qrcode | null = null;

    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      const el = document.getElementById(QR_REGION_ID);
      if (!el) {
        setCameraError('スキャナの初期化領域が見つかりません');
        return;
      }
      try {
        const scanner = new Html5Qrcode(QR_REGION_ID, { verbose: false });
        startedScanner = scanner;
        scannerRef.current = scanner;
        scanner
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decoded) => {
              void handleScan(decoded);
            },
            () => {
              /* per-frame "not found" — ignore */
            },
          )
          .catch((err: unknown) => {
            if (cancelled) return;
            setCameraError(
              err instanceof Error ? err.message : 'カメラを起動できません',
            );
          });
      } catch (e) {
        setCameraError(
          e instanceof Error ? e.message : 'スキャナ初期化に失敗しました',
        );
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      const s = startedScanner ?? scannerRef.current;
      scannerRef.current = null;
      if (s) {
        Promise.resolve()
          .then(() => s.stop())
          .then(() => s.clear())
          .catch(() => {
            /* もう停止済み or 未起動 */
          });
      }
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [handleScan]);

  async function handleFeeAction(action: 'paid' | 'defer') {
    if (!feeAttendee) return;
    const target = feeAttendee;
    setFeeAttendee(null);
    // 連続スキャン抑止解除
    setTimeout(() => {
      pausedRef.current = false;
    }, 300);
    try {
      if (action === 'paid') {
        const body: Record<string, unknown> = { fee_paid: true };
        // 未回答 or 出席予定でなかった場合は出席に寄せる (legacy 仕様)
        if (target.after_status !== 'yes') body.after_status = 'yes';
        await api(`/api/events/${eventId}/attendees/${target.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        showToast(
          {
            kind: 'success',
            title: `${target.name} さん`,
            sub: '受付 + 会費受領',
          },
          1800,
        );
      } else {
        showToast(
          {
            kind: 'success',
            title: `${target.name} さん`,
            sub: '受付完了 (会費は後払い)',
          },
          1800,
        );
      }
      onScanned();
    } catch (e) {
      showToast(
        {
          kind: 'error',
          title: e instanceof ApiError ? e.message : '通信エラー',
        },
        2200,
      );
    }
  }

  return (
    <>
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
          <h2>QRコードをスキャン</h2>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-mute)',
              marginBottom: 12,
            }}
          >
            参加者のQRコードをカメラで読み取ってください
          </p>
          {cameraError ? (
            <div className="scan-result scan-result-error">
              <strong>カメラが使えません</strong>
              <p style={{ margin: '6px 0 0', fontSize: 12 }}>{cameraError}</p>
            </div>
          ) : (
            <div id={QR_REGION_ID} className="qr-scanner-region" />
          )}
          {toast && (
            <div className={`scan-result scan-result-${toast.kind}`}>
              <strong>
                {toast.kind === 'success'
                  ? '✓'
                  : toast.kind === 'duplicate'
                    ? '!'
                    : '✕'}{' '}
                {toast.title}
              </strong>
              {toast.sub && (
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>{toast.sub}</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn-outline"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {feeAttendee && (
        <ScanFeeModal
          eventTitle={eventTitle}
          afterpartyDescription={afterpartyDescription}
          attendee={feeAttendee}
          onAction={handleFeeAction}
        />
      )}
    </>
  );
}

// 会費徴収モーダル (legacy openScanFeeModal)
function ScanFeeModal({
  eventTitle,
  afterpartyDescription,
  attendee,
  onAction,
}: {
  eventTitle: string;
  afterpartyDescription: string | null;
  attendee: CheckinAttendee;
  onAction: (action: 'paid' | 'defer') => Promise<void>;
}) {
  const deptTitle = [attendee.department, attendee.title]
    .filter(Boolean)
    .join(' · ');
  const after = attendee.after_status ?? 'pending';
  const afterClass = after === 'yes' ? 'badge-yes' : 'badge-pending';
  const feeText = afterpartyDescription || '懇親会会費';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      style={{ zIndex: 1100 }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" aria-hidden="true" />
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div
            style={{
              fontSize: 36,
              color: 'var(--success)',
              lineHeight: 1,
            }}
          >
            ✓
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-mute)',
              marginTop: 4,
            }}
          >
            {eventTitle} 受付完了
          </div>
        </div>
        <div
          style={{
            background: 'var(--surface-soft)',
            borderRadius: 10,
            padding: 12,
            margin: '12px 0 16px',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {attendee.name} さん
          </div>
          {deptTitle && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-mute)',
                marginTop: 2,
              }}
            >
              {deptTitle}
            </div>
          )}
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span className={`status-badge ${afterClass}`}>
              懇親会: {AFTER_LABEL[after]}
            </span>
          </div>
        </div>
        <div
          style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}
        >
          懇親会会費を徴収しますか?
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-mute)',
            marginBottom: 12,
            whiteSpace: 'pre-line',
          }}
        >
          {feeText}
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <button
            type="button"
            onClick={() => void onAction('paid')}
            style={{ width: '100%' }}
          >
            会費を受領しました
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => void onAction('defer')}
            style={{ width: '100%' }}
          >
            後払い (今は受領しない)
          </button>
        </div>
      </div>
    </div>
  );
}
