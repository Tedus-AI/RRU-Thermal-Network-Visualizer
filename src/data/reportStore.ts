/**
 * Report configuration store — 11 §33, §46.
 *
 * Store contracts (11 §46):
 *   overviewStore      [read snapshot]
 *   projectStore       [read metadata]
 *   scenarioStore      [read metadata]
 *   reportStore        [read/write config]  — this
 *   solver/analysis/distribution stores [read freshness metadata]
 *
 * "Thermal master data is not stored in `reportStore`" (§46) is the rule this
 * store keeps: it persists a layout, a set of report-only notes, and an export
 * payload of metadata. Every engineering number stays where it was computed.
 */

import { create } from 'zustand';

import {
  loadExportPayloads,
  loadReportConfigs,
  loadReportTemplates,
  saveExportPayload,
  saveReportConfig,
  saveReportTemplate,
} from './persistence';

import type {
  ReportExportPayload,
  ReportTemplate,
  ThermalReportConfig,
} from '@/report/reportTypes';
import { toTemplate } from '@/report/reportConfig';

interface ReportStoreState {
  /** One config per scenario. */
  configs: Record<string, ThermalReportConfig>;
  templates: ReportTemplate[];
  payloads: Record<string, ReportExportPayload>;
  activeScenarioId: string | null;
  loaded: boolean;
  /** A config exists in memory that has not been written to storage. */
  dirty: boolean;
  lastSavedAt: string | null;

  loadFor: (projectId: string, scenarioId: string | null) => void;
  clear: () => void;

  current: () => ThermalReportConfig | null;
  currentPayload: () => ReportExportPayload | null;

  /** Replace the in-memory config without persisting — layout edits are drafts. */
  setConfig: (config: ThermalReportConfig) => void;
  save: (projectId: string) => void;
  saveAsTemplate: (name: string) => ReportTemplate | null;
  storePayload: (projectId: string, payload: ReportExportPayload) => void;
}

export const useReportStore = create<ReportStoreState>((set, get) => ({
  configs: {},
  templates: [],
  payloads: {},
  activeScenarioId: null,
  loaded: false,
  dirty: false,
  lastSavedAt: null,

  loadFor: (projectId, scenarioId) => {
    const configs: Record<string, ThermalReportConfig> = {};
    for (const config of loadReportConfigs(projectId)) configs[config.scenario_id] = config;

    const payloads: Record<string, ReportExportPayload> = {};
    for (const payload of loadExportPayloads(projectId)) payloads[payload.scenario_id] = payload;

    set({
      configs,
      payloads,
      templates: loadReportTemplates(),
      activeScenarioId: scenarioId,
      loaded: true,
      dirty: false,
      lastSavedAt: scenarioId ? (configs[scenarioId]?.updated_at ?? null) : null,
    });
  },

  clear: () =>
    set({
      configs: {},
      templates: [],
      payloads: {},
      activeScenarioId: null,
      loaded: false,
      dirty: false,
      lastSavedAt: null,
    }),

  current: () => {
    const { configs, activeScenarioId } = get();
    if (!activeScenarioId) return null;
    return configs[activeScenarioId] ?? null;
  },

  currentPayload: () => {
    const { payloads, activeScenarioId } = get();
    if (!activeScenarioId) return null;
    return payloads[activeScenarioId] ?? null;
  },

  setConfig: (config) =>
    set((state) => ({
      configs: { ...state.configs, [config.scenario_id]: config },
      activeScenarioId: config.scenario_id,
      dirty: true,
    })),

  save: (projectId) => {
    const config = get().current();
    if (!config) return;
    saveReportConfig(projectId, config);
    set({ dirty: false, lastSavedAt: config.updated_at });
  },

  saveAsTemplate: (name) => {
    const config = get().current();
    if (!config) return null;
    const template = toTemplate(config, name);
    saveReportTemplate(template);
    set((state) => ({ templates: [...state.templates, template] }));
    return template;
  },

  storePayload: (projectId, payload) => {
    saveExportPayload(projectId, payload);
    set((state) => ({ payloads: { ...state.payloads, [payload.scenario_id]: payload } }));
  },
}));
