import { Html5Qrcode } from 'html5-qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { formatDateTime } from '../lib/format';

interface CheckinAttendee {
  id: string;
  name: string;
  checked_in_at: string;
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
  onClose: () => void;
  onScanned: () => void;
}

const QR_REGION_ID = 'qr-scanner-region';

// 受付モード内で開く QR スキャナ (legacy openScanner 相当)
export function QrScannerModal({ eventId, onClose, onScanned }: Props) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
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
      // 同じ QR の連続スキャンを 2 秒抑止 (legacy 仕様)
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
        setTimeout(() => {
          pausedRef.current = false;
        }, 600);
      }
    },
    [eventId, onScanned, showToast],
  );

  useEffect(() => {
    // StrictMode の二重マウントや modal アニメーション中の初期化を避けるため、
    // 100ms 遅延後に scanner を起動 (legacy も同じく遅延を入れている)
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
        // 状態に関わらず stop を試みる。.start() が未完了でも .stop() が
        // throw しないよう個別に握りつぶす
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
        <h2>QRコードをスキャン</h2>
        <p style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 12 }}>
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
  );
}
