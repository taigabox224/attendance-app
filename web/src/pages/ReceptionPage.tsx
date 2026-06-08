import { Html5Qrcode } from 'html5-qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { formatDateTime } from '../lib/format';

interface CheckinAttendee {
  id: string;
  name: string;
  checked_in_at: string;
}

interface ScanResult {
  kind: 'success' | 'duplicate' | 'error';
  message: string;
  attendee?: CheckinAttendee;
}

interface EventSummary {
  title: string;
}

interface AttendeeRow {
  checked_in_at: string | null;
}

const QR_REGION_ID = 'reception-qr-region';

export function ReceptionPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [counts, setCounts] = useState({ checkedIn: 0, total: 0 });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pausedRef = useRef(false);

  const reloadCounts = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api<{
        event: EventSummary;
        attendees: AttendeeRow[];
      }>(`/api/events/${id}`);
      setEvent(d.event);
      setCounts({
        checkedIn: d.attendees.filter((a) => a.checked_in_at).length,
        total: d.attendees.length,
      });
    } catch {
      // 集計の失敗は致命的じゃない、UI 側で counts が古いまま
    }
  }, [id]);

  useEffect(() => {
    reloadCounts();
  }, [reloadCounts]);

  const handleScan = useCallback(
    async (decodedText: string) => {
      if (!id || pausedRef.current) return;
      pausedRef.current = true;

      try {
        const data = await api<{ ok: boolean; attendee: CheckinAttendee }>(
          `/api/events/${id}/checkin`,
          {
            method: 'POST',
            body: JSON.stringify({ token: decodedText }),
          },
        );
        setResult({
          kind: 'success',
          message: `${data.attendee.name} さんを受付しました`,
          attendee: data.attendee,
        });
        await reloadCounts();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const dup = (e.data as { attendee?: CheckinAttendee } | undefined)
            ?.attendee;
          setResult({
            kind: 'duplicate',
            message: dup
              ? `${dup.name} さんは ${formatDateTime(dup.checked_in_at)} に受付済みです`
              : '既に受付済みです',
            attendee: dup,
          });
        } else {
          setResult({
            kind: 'error',
            message: e instanceof ApiError ? e.message : '通信エラー',
          });
        }
      } finally {
        // 2.5 秒は同じ QR の再スキャンを抑止
        setTimeout(() => {
          pausedRef.current = false;
        }, 2500);
      }
    },
    [id, reloadCounts],
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
          // フレーム毎の "QR not detected" を吐くのでここでは何もしない
        },
      )
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : String(err);
        setCameraError(
          `カメラを起動できませんでした (${msg})。ブラウザのカメラ権限を確認してください。`,
        );
      });

    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            // 既に止まっていたら無視
          });
      }
    };
  }, [handleScan]);

  return (
    <div className="screen">
      <Link to={`/events/${id}`} className="back-link">
        イベント詳細へ
      </Link>

      <header className="screen-header">
        <h1 className="screen-title">受付モード</h1>
        <p className="screen-sub">
          {event?.title ?? '...'} ・ 受付済 {counts.checkedIn} / {counts.total} 名
        </p>
      </header>

      {cameraError ? (
        <p className="error">{cameraError}</p>
      ) : (
        <div className="qr-scanner-wrap">
          <div id={QR_REGION_ID} className="qr-scanner-region" />
          <p className="note" style={{ marginTop: 8 }}>
            参加者の QR コードをカメラに向けてください。
          </p>
        </div>
      )}

      {result && (
        <div
          className={`scan-result scan-result-${result.kind}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {result.kind === 'success'
              ? '✓ 受付完了'
              : result.kind === 'duplicate'
                ? '! 既に受付済み'
                : 'エラー'}
          </strong>
          <p style={{ margin: '6px 0 0' }}>{result.message}</p>
          {result.attendee && result.kind === 'success' && (
            <p
              className="mono"
              style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}
            >
              {formatDateTime(result.attendee.checked_in_at)}
            </p>
          )}
          <button
            className="secondary"
            onClick={() => setResult(null)}
            style={{ marginTop: 12, minHeight: 36, fontSize: 13 }}
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
