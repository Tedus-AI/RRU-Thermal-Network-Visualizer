/**
 * Add a component by picking one out of the library — 04 §26, AC-04-11.
 *
 * The library already knew how to take a component in ("Save to Library" on the
 * Source tab); until now nothing could take one back out, which made it a
 * write-only drawer. This is the other half.
 *
 * What comes back is the thermal spec and nothing project-specific: base zone,
 * FloTHERM mapping and graph ids are left at their defaults, because they
 * describe where a part sat in a different radio.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { Button, Modal, NumberInput, TextInput } from '@/ui/primitives';
import type { LibraryEntry } from '@/data/componentLibraryStore';

export function AddFromLibraryModal({
  entries,
  existingNames,
  onClose,
  onAdd,
}: {
  entries: LibraryEntry[];
  existingNames: string[];
  onClose: () => void;
  onAdd: (entry: LibraryEntry, qty: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [qty, setQty] = useState(1);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) =>
      `${entry.name} ${entry.category}`.toLowerCase().includes(needle),
    );
  }, [entries, search]);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  // Two components with one name is legal but confusing, so it is said up front.
  const duplicate = selected != null && existingNames.includes(selected.name);

  return (
    <Modal
      title="Add from Library / 從元件庫新增"
      description="Pick a saved part. Its thermal spec comes across; base zone and external mapping stay project-specific and are not copied."
      width="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel / 取消</Button>
          <Button
            variant="primary"
            disabled={!selected || !Number.isInteger(qty) || qty < 1}
            onClick={() => selected && onAdd(selected, qty)}
          >
            Add / 新增
          </Button>
        </>
      }
    >
      {entries.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-ink-500">
          The library is empty. Save a component from its Source tab first.
          <span className="mt-1 block text-[12px] text-ink-400">
            元件庫是空的。請先在元件的「Source 來源」分頁按「存入元件庫」。
          </span>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400"
            />
            <TextInput
              aria-label="Search the component library"
              className="pl-8"
              placeholder="Search / 搜尋…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" role="listbox">
            {visible.length === 0 && (
              <li className="px-2 py-4 text-center text-[12px] text-ink-400">
                No saved part matches. / 沒有符合的元件。
              </li>
            )}
            {visible.map((entry) => {
              const active = entry.id === selectedId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(entry.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-accent-600 bg-accent-50'
                        : 'border-line bg-surface hover:border-ink-400'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink-900">{entry.name}</span>
                      <span className="text-[11px] text-ink-400">{entry.category}</span>
                    </span>
                    <span className="tabular mt-0.5 block text-[11px] text-ink-400">
                      {entry.default_power_W == null ? '— W' : `${entry.default_power_W} W`} ·{' '}
                      {entry.thermal_spec.heat_path.type} ·{' '}
                      {entry.thermal_spec.limit_C?.value == null
                        ? '—'
                        : `${entry.thermal_spec.limit_C.value} °C`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-end gap-3">
            <div className="w-28">
              <label
                htmlFor="lib-qty"
                className="mb-1 block text-[12px] font-medium text-ink-700"
              >
                Qty / 數量
              </label>
              <NumberInput
                id="lib-qty"
                min={1}
                value={qty}
                onChange={(event) => setQty(Number(event.target.value))}
              />
            </div>
            {duplicate && (
              <p className="flex-1 text-[11px] leading-relaxed text-warn-600">
                This project already has a component with that name — it will be added as a second
                one.
                <span className="block">此專案已有同名元件，將另外新增一筆。</span>
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
