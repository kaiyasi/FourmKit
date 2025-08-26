import { useEffect, useMemo, useState } from 'react';
import { getSelectedSchoolSlug, setSelectedSchoolSlug, type School } from '@/utils/school';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm?: (slug: string | null) => void;
};

export default function SchoolSwitcher({ open, onClose, onConfirm }: Props) {
  const [items, setItems] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(getSelectedSchoolSlug());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/schools')
      .then(r => r.json())
      .then(json => setItems(json?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = useMemo(() => sel, [sel]);

  if (!open) return null;

  const confirm = () => {
    setSelectedSchoolSlug(selected);
    onConfirm?.(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/40">
      <div role="dialog" aria-modal className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden">
        <div className="px-4 py-3 text-base font-semibold border-b border-zinc-200 dark:border-zinc-800">
          切換學校
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
          <button
            className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${!selected ? 'ring-2 ring-indigo-500 rounded-lg' : ''}`}
            onClick={() => setSel(null)}
          >
            <div className="flex items-center justify-between">
              <span>跨校（不指定學校）</span>
              {!selected && <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">選擇中</span>}
            </div>
          </button>
          {loading && (
            <div className="p-4 text-sm text-zinc-500">載入中…</div>
          )}
          {!loading && items.map(s => (
            <button
              key={s.id}
              className={`w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${selected === s.slug ? 'ring-2 ring-indigo-500 rounded-lg' : ''}`}
              onClick={() => setSel(s.slug)}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{s.name} <span className="text-zinc-400">({s.slug})</span></span>
                {selected === s.slug && <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">選擇中</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="sticky bottom-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex gap-2 justify-end">
          <button className="px-3 py-2 rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" onClick={onClose}>取消</button>
          <button className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500" onClick={confirm}>確定</button>
        </div>
      </div>
    </div>
  );
}

