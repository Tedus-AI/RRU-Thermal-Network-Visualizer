/**
 * Whether AI-Thermal has news for this project's linked components (04's
 * 「從 AI-Thermal 更新」, `aiThermalLink.ts`).
 *
 * When SharePoint can be read without a popup, the database is read once in
 * the background as 04 opens, and the header says so if anything AI-Thermal
 * owns has moved. Otherwise nothing happens until the engineer asks — a
 * sign-in popup only ever comes from a click.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Component } from '@/domain/component';
import type { MaterialDefaults } from '@/domain/materials';
import {
  aiPlanPending,
  isAiFirstLink,
  linkedAiProjects,
  planAiUpdate,
  type AiUpdatePlan,
} from '@/domain/aiThermalLink';
import { readAiThermalFromFile, readAiThermalFromSharePoint, type AiDbRead } from '@/data/aiThermalDb';
import { freshAiThermalComponents, type AiThermalFresh } from '@/importers/component/aiThermalFresh';
import type { AiThermalDb } from '@/importers/component/parseAiThermal';

export type AiUpdateStatus = 'idle' | 'reading' | 'ready' | 'error';

export interface AiThermalUpdate {
  /** AI-Thermal projects the components are linked to, most components first. */
  linked: Array<{ id: string; count: number }>;
  /** The one being compared. */
  target: string | null;
  setTarget: (id: string) => void;
  status: AiUpdateStatus;
  message: string;
  /** Where the database was read from, and when. */
  source: { label: string; at: string } | null;
  /** The project is not in the database that was read. */
  missing: boolean;
  fresh: AiThermalFresh | null;
  plan: AiUpdatePlan | null;
  /** What the header reminder counts: linked components with ticked changes, plus deleted ones. */
  pending: number;
  /** Imported from AI-Thermal before links were recorded: waiting for their first link (no read needed). */
  unlinked: number;
  readSharePoint: () => Promise<void>;
  readFile: (file: File) => Promise<void>;
}

interface Read {
  db: AiThermalDb;
  label: string;
  at: string;
}

export function useAiThermalUpdate(components: Component[], materials: MaterialDefaults): AiThermalUpdate {
  const linked = useMemo(() => linkedAiProjects(components), [components]);
  const [chosen, setTarget] = useState<string | null>(null);
  const target = chosen && linked.some((p) => p.id === chosen) ? chosen : (linked[0]?.id ?? null);

  const [read, setRead] = useState<Read | null>(null);
  const [status, setStatus] = useState<AiUpdateStatus>('idle');
  const [message, setMessage] = useState('');

  const adopt = useCallback((result: AiDbRead, quiet = false) => {
    if (result.ok) {
      setRead({ db: result.db, label: result.label, at: new Date().toLocaleString('zh-TW', { hour12: false }) });
      setStatus('ready');
      setMessage('');
    } else if (quiet) {
      // A background check that could not run is not an error the engineer caused.
      setStatus('idle');
    } else {
      setStatus('error');
      setMessage(result.message);
    }
  }, []);

  // Once per visit, silently, and only for a project with linked components.
  const checked = useRef(false);
  const hasLinked = linked.length > 0;
  useEffect(() => {
    if (!hasLinked || checked.current) return;
    checked.current = true;
    let cancelled = false;
    void readAiThermalFromSharePoint(false).then((result) => {
      if (!cancelled) adopt(result, true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasLinked, adopt]);

  const readSharePoint = useCallback(async () => {
    setStatus('reading');
    adopt(await readAiThermalFromSharePoint(true));
  }, [adopt]);
  const readFile = useCallback(
    async (file: File) => {
      setStatus('reading');
      adopt(await readAiThermalFromFile(file));
    },
    [adopt],
  );

  const missing = !!read && !!target && !read.db.projects[target];
  // Built once per read: the comparison below is the only part that follows edits.
  const fresh = useMemo(() => {
    if (!read || !target || !read.db.projects[target]) return null;
    try {
      return freshAiThermalComponents(read.db, target, materials, [], read.label);
    } catch {
      return null;
    }
  }, [read, target, materials]);
  const plan = useMemo(
    () => (fresh && target ? planAiUpdate(components, fresh.components, target) : null),
    [components, fresh, target],
  );
  const pending = plan ? aiPlanPending(plan).components + plan.removed.length : 0;
  const unlinked = useMemo(() => components.filter(isAiFirstLink).length, [components]);

  return {
    linked,
    target,
    setTarget,
    status,
    message,
    source: read ? { label: read.label, at: read.at } : null,
    missing,
    fresh,
    plan,
    pending,
    unlinked,
    readSharePoint,
    readFile,
  };
}
