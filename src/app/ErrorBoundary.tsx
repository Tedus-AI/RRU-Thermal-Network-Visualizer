/**
 * Screen-level error boundary.
 *
 * A React render error unmounts the whole tree, which shows the user a blank
 * page with no explanation and no way back. Every screen renders inside this so
 * a crash degrades to a readable, recoverable message instead.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Remounts the boundary when the route changes, clearing a stale error. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info: info.componentStack ?? null });
    // Keep the real stack in the console for debugging.
    console.error('Screen crashed:', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null });
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center overflow-y-auto p-8">
        <div className="w-full max-w-xl rounded-lg border border-danger-500/30 bg-surface p-7">
          <div className="mb-3 flex items-center gap-2.5">
            <AlertTriangle size={20} className="text-danger-600" />
            <h1 className="text-[16px] font-bold text-ink-900">
              This screen ran into a problem.
              <span className="block text-[13px] font-normal text-ink-500">
                此畫面發生錯誤，尚未儲存的變更可能未寫入。
              </span>
            </h1>
          </div>

          <p className="text-[13px] leading-relaxed text-ink-500">
            Your saved project data is untouched. Reloading usually clears it; if it keeps
            happening, the details below help diagnose it.
            <span className="block text-ink-400">
              已儲存的專案資料不受影響。重新載入通常即可恢復；若持續發生，請提供下方訊息。
            </span>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center rounded-md border border-accent-600 bg-accent-600 px-3.5 text-[13px] font-semibold text-white hover:bg-accent-700"
            >
              Reload / 重新載入
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = import.meta.env.BASE_URL;
              }}
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink-700 hover:bg-surface-muted"
            >
              Back to Project List / 回專案清單
            </button>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-[12px] text-ink-400">
              Show technical details / 顯示技術細節
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-ink-700">
              {error.message}
              {info ? `\n${info}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
