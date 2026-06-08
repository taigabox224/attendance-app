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
  onScanned: () => void; // 親側でデータ再取得用
}

const QR_REGION_ID = 'qr-scanner-region';

// 受付モード内で開く QR スキャナー (legacy openScanner 相当)
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
    const el = document.getElementById(QR_REGION_ID);
    if (!el) return;
    const scanner = new Html5Qrcode(QR_REGION_ID, { verbose: false });
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          void handleScan(decoded);
        },
        () => {
          /* QR not detected per frame, no-op */
        },
      )
      .catch((err: unknown) => {
        setCameraError(
          err instanceof Error
            ? err.message
            : 'カメラを起動できませんでした',
        );
      });

    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* 既に停止 */
          });
      }
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [handleScan]);

  return (
    <div
      className="modal-overlay show"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" aria-hidden="true" />
        <h2>QRコードをスキャン</h2>
        <p style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 12 }}>
          参加者のQRコードをカメラで読み取ってください
        </p>
        {cameraError ? (
          <div className="error" style={{ padding: 16 }}>
            カメラが使えません: {cameraError}
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
