import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { ApiError, api } from '../api/client';

interface MastersResponse {
  departments: string[];
  titles: string[];
}

type Kind = 'department' | 'title';

const KIND_LABEL: Record<Kind, string> = {
  department: '委員会',
  title: '役職',
};

interface Props {
  onClose: () => void;
}

// 委員会・役職マスター編集モーダル (legacy modal-master 相当)
export function MastersModal({ onClose }: Props) {
  const [departments, setDepartments] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [originalDepartments, setOriginalDepartments] = useState<string[]>([]);
  const [originalTitles, setOriginalTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<MastersResponse>('/api/masters');
      setDepartments(d.departments);
      setTitles(d.titles);
      setOriginalDepartments([...d.departments]);
      setOriginalTitles([...d.titles]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    !arrayEqual(departments, originalDepartments) ||
    !arrayEqual(titles, originalTitles);

  async function save() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      if (!arrayEqual(departments, originalDepartments)) {
        await api('/api/masters/department', {
          method: 'PUT',
          body: JSON.stringify({ values: departments }),
        });
      }
      if (!arrayEqual(titles, originalTitles)) {
        await api('/api/masters/title', {
          method: 'PUT',
          body: JSON.stringify({ values: titles }),
        });
      }
      setSavedMsg('保存しました');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
    }
  }

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
        <h2>マスター設定</h2>
        <p
          className="note"
          style={{ margin: '0 0 14px', fontSize: 12 }}
        >
          委員会と役職の選択肢を管理します。
        </p>

        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="success">{savedMsg}</p>}

        {loading ? (
          <p>読込中...</p>
        ) : (
          <>
            <ListSection
              kind="department"
              values={departments}
              onChange={setDepartments}
            />
            <ListSection kind="title" values={titles} onChange={setTitles} />
          </>
        )}

        <div className="action-row" style={{ marginTop: 16, gap: 8 }}>
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1 }}
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            style={{ flex: 1 }}
          >
            {saving ? '保存中...' : dirty ? '変更を保存' : '変更なし'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListSection({
  kind,
  values,
  onChange,
}: {
  kind: Kind;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [newValue, setNewValue] = useState('');

  function add() {
    const v = newValue.trim();
    if (!v) return;
    if (values.includes(v)) {
      setNewValue('');
      return;
    }
    onChange([...values, v]);
    setNewValue('');
  }

  function remove(i: number) {
    const v = values[i];
    if (
      !window.confirm(
        `「${v}」を削除しますか?\n既存のユーザー/イベントの委員会・役職表示には残ります。`,
      )
    )
      return;
    onChange(values.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }

  function onAddKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    setNewValue(e.target.value);
  }

  return (
    <section className="master-section">
      <h2 style={{ fontSize: 16, margin: '12px 0' }}>{KIND_LABEL[kind]}</h2>
      {values.length === 0 ? (
        <p className="note" style={{ margin: '0 0 12px' }}>
          まだ登録がありません。
        </p>
      ) : (
        <ul className="master-list">
          {values.map((v, i) => (
            <li key={`${i}-${v}`} className="master-row">
              <span className="master-value">{v}</span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="上へ"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => move(i, 1)}
                disabled={i === values.length - 1}
                aria-label="下へ"
              >
                ↓
              </button>
              <button
                type="button"
                className="danger btn-sm"
                onClick={() => remove(i)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="master-add">
        <input
          type="text"
          value={newValue}
          onChange={onInputChange}
          onKeyDown={onAddKey}
          placeholder={`新しい${KIND_LABEL[kind]}名`}
          maxLength={60}
        />
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={add}
          disabled={!newValue.trim()}
        >
          追加
        </button>
      </div>
    </section>
  );
}

function arrayEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
