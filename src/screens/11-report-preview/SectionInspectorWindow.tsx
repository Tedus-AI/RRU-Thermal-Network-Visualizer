/**
 * The section inspector, as a window.
 *
 * It used to hold a 22 rem column of the right rail for the whole session,
 * describing whichever section happened to be selected — usually the cover,
 * because nothing had been clicked yet. It is a detail view: it opens from the
 * header when the reader wants it, and Escape closes it.
 *
 * `autoHeight` because the sections are not the same size: the cover has seven
 * fields, Critical Components five options, and Overall Thermal Status none at
 * all. One fixed height gives the short ones a field of empty surface and the
 * tall ones a scrollbar, so the panel measures what is in it instead.
 */

import { useEffect } from 'react';

import { Badge } from '@/ui/primitives';
import { FloatingPanel } from '@/ui/FloatingPanel';
import type {
  ReportCoverConfig,
  ReportSectionConfig,
  SectionContentOptions,
  SectionDisplayOptions,
  SectionId,
  SnapshotSummary,
} from '@/report/reportTypes';
import { sectionDefinition } from '@/report/sectionRegistry';

import { ReportSectionInspector, type CoverInput } from './ReportSectionInspector';

export function SectionInspectorWindow({
  sections,
  selectedId,
  snapshot,
  unavailable,
  cover,
  onSelect,
  onContent,
  onDisplay,
  onNote,
  onCover,
  onClose,
}: {
  sections: ReportSectionConfig[];
  selectedId: SectionId;
  snapshot: SnapshotSummary;
  unavailable: SectionId[];
  cover: CoverInput;
  onSelect: (id: SectionId) => void;
  onContent: (id: SectionId, patch: Partial<SectionContentOptions>) => void;
  onDisplay: (id: SectionId, patch: Partial<SectionDisplayOptions>) => void;
  onNote: (id: SectionId, note: string) => void;
  onCover: (patch: {
    title?: string;
    subtitle?: string;
    cover?: Partial<ReportCoverConfig>;
  }) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const section = sections.find((entry) => entry.id === selectedId) ?? sections[0];
  const definition = section ? sectionDefinition(section.id) : null;

  return (
    <FloatingPanel
      title="章節檢視器"
      subtitle={definition ? `${definition.zh} · ${definition.title}` : 'Section Inspector'}
      badge={<Badge tone="neutral">來自 {definition?.source_screen ?? '—'}</Badge>}
      storageKey="tnv.11.inspector"
      defaultWidth={440}
      defaultHeight={620}
      autoHeight
      onClose={onClose}
    >
      <div className="p-3">
        <ReportSectionInspector
          sections={sections}
          selectedId={selectedId}
          snapshot={snapshot}
          unavailable={unavailable}
          readOnly={false}
          cover={cover}
          onSelect={onSelect}
          onContent={onContent}
          onDisplay={onDisplay}
          onNote={onNote}
          onCover={onCover}
        />
      </div>
    </FloatingPanel>
  );
}
