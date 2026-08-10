import { create } from 'zustand';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { useEffect } from 'react';

export type ToastTone = 'success' | 'warning' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message) =>
    set((state) => ({ toasts: [...state.toasts, { id: nextId++, tone, message }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  warning: (message: string) => useToastStore.getState().push('warning', message),
  error: (message: string) => useToastStore.getState().push('error', message),
};

const TONE_STYLES: Record<ToastTone, { className: string; icon: typeof CheckCircle2 }> = {
  success: { className: 'border-ok-500/40 text-ok-600', icon: CheckCircle2 },
  warning: { className: 'border-warn-500/40 text-warn-600', icon: AlertTriangle },
  error: { className: 'border-danger-500/40 text-danger-600', icon: XCircle },
};

function ToastItem({ item }: { item: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { className, icon: Icon } = TONE_STYLES[item.tone];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 4000);
    return () => clearTimeout(timer);
  }, [item.id, dismiss]);

  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 rounded-lg border bg-surface px-3.5 py-2.5 shadow-lg ${className}`}
    >
      <Icon size={16} />
      <span className="text-[13px] font-medium text-ink-900">{item.message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(item.id)}
        className="ml-2 text-ink-400 hover:text-ink-900"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItem item={item} />
        </div>
      ))}
    </div>
  );
}
