/**
 * 頁面設定 — everything the Page Layout panel held, in a window.
 *
 * It was a permanent panel in the left column: orientation, language, title,
 * six header/footer checkboxes and Save As Template, sitting under the outline
 * for the whole session. Every one of them is set once and then not touched
 * again, and the column they were holding is where the report's actual
 * structure is read. So they open from a button and close again.
 *
 * Page Size went with the panel: it is A4. Offering Letter meant offering a
 * choice nobody makes on a page that already had five other controls.
 */

import { useEffect } from 'react';

import { Button, Select, TextInput } from '@/ui/primitives';
import { EngineeringInfo } from '@/ui/FieldLabel';
import { FloatingPanel } from '@/ui/FloatingPanel';
import {
  LANGUAGE_MODES,
  LANGUAGE_MODE_LABELS,
  ORIENTATIONS,
  type HeaderFooterConfig,
  type LanguageMode,
  type Orientation,
  type ThermalReportConfig,
} from '@/report/reportTypes';

import { T11 } from './tooltips';

const HEADER_FOOTER_OPTIONS: Array<{
  key: keyof Omit<HeaderFooterConfig, 'footer_text'>;
  label: string;
  zh: string;
}> = [
  { key: 'show_project_name', label: 'Project Name', zh: '專案名稱' },
  { key: 'show_scenario', label: 'Scenario', zh: '情境' },
  { key: 'show_report_title', label: 'Report Title', zh: '報告標題' },
  { key: 'show_page_number', label: 'Page Number', zh: '頁碼' },
  { key: 'show_prepared_date', label: 'Prepared Date', zh: '製作日期' },
  { key: 'show_confidentiality', label: 'Confidentiality', zh: '機密等級' },
];

function Field({
  htmlFor,
  label,
  info,
  children,
}: {
  htmlFor: string;
  label: string;
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[11px] font-semibold text-ink-700">
        {label}
        {info}
      </label>
      {children}
    </div>
  );
}

export function PageSetupWindow({
  config,
  onChange,
  onSaveTemplate,
  onClose,
}: {
  config: ThermalReportConfig;
  onChange: (patch: Partial<ThermalReportConfig>) => void;
  onSaveTemplate: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <FloatingPanel
      title="頁面設定"
      subtitle="Page setup · A4"
      storageKey="tnv.11.pagesetup"
      defaultWidth={380}
      defaultHeight={480}
      onClose={onClose}
    >
      <div className="grid gap-2 p-3">
        <Field htmlFor="rp-orient" label="紙張方向">
          <Select
            id="rp-orient"
            className="h-8 !text-[11px]"
            value={config.orientation}
            items={ORIENTATIONS.map((entry) => ({
              value: entry,
              label: entry === 'portrait' ? '直式' : '橫式',
            }))}
            onChange={(event) => onChange({ orientation: event.target.value as Orientation })}
          />
        </Field>

        <Field
          htmlFor="rp-language"
          label="語言"
          info={<EngineeringInfo zh={T11.languageMode} label="Language Mode" align="left" />}
        >
          <Select
            id="rp-language"
            className="h-8 !text-[11px]"
            value={config.language_mode}
            items={LANGUAGE_MODES.map((entry) => ({
              value: entry,
              label: LANGUAGE_MODE_LABELS[entry].label,
            }))}
            onChange={(event) => onChange({ language_mode: event.target.value as LanguageMode })}
          />
        </Field>

        <Field htmlFor="rp-title" label="報告標題">
          <TextInput
            id="rp-title"
            className="h-8 !text-[11px]"
            value={config.title}
            invalid={config.title.trim().length === 0}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </Field>

        <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
          <p className="text-[11px] font-semibold text-ink-700">頁首頁尾</p>
          {HEADER_FOOTER_OPTIONS.map(({ key, label, zh }) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2 text-[11px] text-ink-700"
            >
              <span className="min-w-0 truncate">
                {zh} <span className="text-[10px] text-ink-400">{label}</span>
              </span>
              <input
                type="checkbox"
                className="size-3.5 shrink-0 accent-accent-600"
                checked={config.header_footer[key]}
                aria-label={`${label} in header or footer`}
                onChange={(event) =>
                  onChange({
                    header_footer: { ...config.header_footer, [key]: event.target.checked },
                  })
                }
              />
            </label>
          ))}
          <TextInput
            className="h-7 !text-[11px]"
            aria-label="Footer text"
            value={config.header_footer.footer_text}
            placeholder="Confidential — Engineering Use Only"
            onChange={(event) =>
              onChange({
                header_footer: { ...config.header_footer, footer_text: event.target.value },
              })
            }
          />
        </div>

        <span className="flex items-center gap-1">
          <Button className="!h-7 flex-1 !text-[11px]" onClick={onSaveTemplate}>
            另存為模板
          </Button>
          <EngineeringInfo zh={T11.saveAsTemplate} label="Save As Template" />
        </span>
      </div>
    </FloatingPanel>
  );
}
