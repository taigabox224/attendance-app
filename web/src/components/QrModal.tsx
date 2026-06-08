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
        <h2 style={{ marginTop: 0 }}>受付用 QR コード</h2>
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
        <button className="secondary" onClick={onClose} style={{ width: '100%' }}>
          閉じる
        </button>
      </div>
    </div>
  );
}
