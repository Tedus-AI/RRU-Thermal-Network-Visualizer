/**
 * Screen 01's link to an AI-Thermal project: reading the database, what it says
 * about the project, and the update plan (`domain/projectAiLink.ts`).
 *
 * A linked project is checked once per visit in the background when SharePoint
 * can be read without a popup, so the header can say AI-Thermal moved; a
 * sign-in popup only ever comes from a click. Linking reads on demand.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyProjectAiPlan,
  baselineOf,
  planProjectAiUpdate,
  projectAiLinkOf,
  projectAiPending,
  roomTempScenarioOffer,
  suggestedAiProject,
  type ProjectAiFresh,
  type ProjectAiLink,
  type ProjectAiPlan,
} from '@/domain/projectAiLink';
import { readAiThermalFromFile, readAiThermalFromSharePoint, type AiDbRead } from '@/data/aiThermalDb';
import { useComponentStore } from '@/data/componentStore';
import { useProjectStore } from '@/data/projectStore';
import { useScenarioStore } from '@/data/scenarioStore';
import { projectAiFresh } from '@/importers/component/aiThermalProject';
import {
  listAiThermalProjects,
  type AiThermalDb,
  type AiThermalProjectSummary,
} from '@/importers/component/parseAiThermal';
import { addRoomTempScenario, commitProjectAiWrite } from './projectAiActions';

export type ProjectAiStatus = 'idle' | 'reading' | 'ready' | 'error';

export interface ProjectAiLinkState {
  link: ProjectAiLink | null;
  /** The AI-Thermal project 04's components came from, when the project is not linked. */
  suggested: string | null;
  /** The one being compared: the linked one, else the one picked, else the suggestion. */
  target: string | null;
  setTarget: (id: string) => void;
  status: ProjectAiStatus;
  message: string;
  source: { label: string; at: string } | null;
  projects: AiThermalProjectSummary[];
  /** The target is not in the database that was read. */
  missing: boolean;
  fresh: ProjectAiFresh | null;
  plan: ProjectAiPlan | null;
  /** What the header counts: fields an update would change by default (linked projects only). */
  pending: number;
  /** AI-Thermal states room-temperature powers and the project has no such scenario yet. */
  roomTemp: { parts: number } | null;
  readSharePoint: () => Promise<void>;
  readFile: (file: File) => Promise<void>;
  /** Use a database read elsewhere (Screen 02 already has one). */
  adoptDb: (db: AiThermalDb, label: string) => void;
  /**
   * Applies the plan with these picks, and creates the room-temperature scenario
   * when asked; returns how many fields changed and the scenario's name.
   */
  apply: (
    picks: Record<string, boolean>,
    extras?: { roomTemp?: boolean },
  ) => { changed: number; scenario: string | null };
}

interface Read {
  db: AiThermalDb;
  label: string;
  at: string;
}

const now = () => new Date().toLocaleString('zh-TW', { hour12: false });

export function useProjectAiLink(options: { background?: boolean } = {}): ProjectAiLinkState {
  const background = options.background ?? true;
  const draft = useProjectStore((s) => s.draft);
  const scenarios = useScenarioStore((s) => s.scenarios);
  const components = useComponentStore((s) => s.components);
  const link = projectAiLinkOf(draft);
  const suggested = useMemo(() => (link ? null : suggestedAiProject(components)), [link, components]);
  const [chosen, setTarget] = useState<string | null>(null);
  const target = link?.project_id ?? chosen ?? suggested ?? null;

  const [read, setRead] = useState<Read | null>(null);
  const [status, setStatus] = useState<ProjectAiStatus>('idle');
  const [message, setMessage] = useState('');

  const adopt = useCallback((result: AiDbRead, quiet = false) => {
    if (result.ok) {
      setRead({ db: result.db, label: result.label, at: now() });
      setStatus('ready');
      setMessage('');
    } else if (quiet) {
      setStatus('idle');
    } else {
      setStatus('error');
      setMessage(result.message);
    }
  }, []);

  const checked = useRef(false);
  const linked = !!link;
  useEffect(() => {
    if (!background || !linked || checked.current) return;
    checked.current = true;
    let cancelled = false;
    void readAiThermalFromSharePoint(false).then((result) => {
      if (!cancelled) adopt(result, true);
    });
    return () => {
      cancelled = true;
    };
  }, [background, linked, adopt]);

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
  const adoptDb = useCallback((db: AiThermalDb, label: string) => {
    setRead({ db, label, at: now() });
    setStatus('ready');
    setMessage('');
  }, []);

  const projects = useMemo(() => (read ? listAiThermalProjects(read.db) : []), [read]);
  const missing = !!read && !!target && !read.db.projects[target];
  const materials = draft?.materials;
  const fresh = useMemo(
    () => (read && target && materials ? projectAiFresh(read.db, target, materials) : null),
    [read, target, materials],
  );
  const baseline = baselineOf(scenarios);
  const plan = useMemo(
    () => (fresh && draft ? planProjectAiUpdate(draft, baseline, fresh) : null),
    [fresh, draft, baseline],
  );
  const pending = link && plan && !plan.first ? projectAiPending(plan) : 0;
  const roomTemp = useMemo(() => roomTempScenarioOffer(scenarios, fresh), [scenarios, fresh]);

  const apply = useCallback(
    (picks: Record<string, boolean>, extras: { roomTemp?: boolean } = {}) => {
      const current = useProjectStore.getState().draft;
      if (!current || !fresh || !plan) return { changed: 0, scenario: null };
      const result = applyProjectAiPlan(current, fresh, plan, picks);
      commitProjectAiWrite(result);
      const scenario =
        extras.roomTemp && roomTemp ? addRoomTempScenario(current.project_id.trim()) : null;
      return { changed: result.changed.length, scenario };
    },
    [fresh, plan, roomTemp],
  );

  return {
    link,
    suggested,
    target,
    setTarget,
    status,
    message,
    source: read ? { label: read.label, at: read.at } : null,
    projects,
    missing,
    fresh,
    plan,
    pending,
    roomTemp,
    readSharePoint,
    readFile,
    adoptDb,
    apply,
  };
}
