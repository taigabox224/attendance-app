import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ApiError, api } from '../api/client';

interface Props {
  eventId: string;
  onClose: () => void;
}

export function QrModal({ eventId, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ token: string }>(`/api/events/${eventId}/qr-token`)
      .then((d) => setToken(d.token))
      .catch((e) => setError(e instanceof ApiError ? e.message : '通信エラー'));
  }, [eventId]);

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
        <h2>受付用 QR コード</h2>
        {error ? (
          <p className="error">{error}</p>
        ) : !token ? (
          <p>生成中...</p>
        ) : (
          <div className="qr-wrap">
            <QRCodeSVG value={token} size={240} level="M" />
          </div>
        )}
        <p className="note">
          当日、受付担当にこの画面を見せてスキャンしてもらってください。
        </p>
      </div>
    </div>
  );
}
