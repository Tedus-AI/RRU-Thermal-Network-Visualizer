/**
 * Card ② 散熱表面: where the heat leaves the machine.
 *
 * Usually one surface, the heat sink's fins: its geometry is the project's
 * (shared by every scenario, linked to 5G-RRU's design), and the panel is
 * 06's boundary inspector. A design with several surfaces lists them first.
 * Surface properties (emissivity, absorptivity) sit at the bottom, folded.
 */

import { Copy, Sparkles } from 'lucide-react';

import { Badge, Button } from '@/ui/primitives';
import type { Project } from '@/domain/project';
import { useBoundaryStore } from '@/data/boundaryStore';
import type { BoundaryPort } from '@/thermal/boundary/types';

import { BoundaryInspector } from '@/screens/06-boundary-conditions/BoundaryInspector';
import { SurfacePropertiesPanel } from '@/screens/06-boundary-conditions/SurfacePropertiesPanel';
import {
  PORT_STATUS_LABELS,
  portStatus,
  profilesForPort,
} from '@/screens/06-boundary-conditions/boundaryViewModel';

import { CardDisclosure, WorkspaceCard, type CardTone } from './WorkspaceCard';
import { verdictOf, type BoundaryWorkspace } from './useBoundaryWorkspace';

export function SurfaceCard({
  boundary,
  draft,
  readOnly,
  open,
  onToggle,
  onShowPort,
  onEditAmbient,
}: {
  boundary: BoundaryWorkspace;
  draft: Project;
  readOnly: boolean;
  open: boolean;
  onToggle: () => void;
  /** Points the graph at a surface. */
  onShowPort: (port: BoundaryPort) => void;
  onEditAmbient: () => void;
}) {
  const {
    set,
    surfaces,
    finPort,
    selectedPort,
    preferredProfileId,
    assumptionChecks,
    summary,
    surfaceGroups,
    validation,
    solarEnabled,
    similarCount,
  } = boundary;

  const statusOf = (port: BoundaryPort) => portStatus(set, port, verdictOf(assumptionChecks.get(port.id)));
  const incomplete = surfaces.filter((port) => {
    const status = statusOf(port);
    return status === 'unassigned' || status === 'blocked';
  }).length;
  const tone: CardTone =
    surfaces.length === 0 ? 'neutral' : incomplete > 0 ? 'warn' : 'ok';
  const status =
    surfaces.length === 0
      ? '沒有表面'
      : incomplete > 0
        ? `${incomplete} 個待完成`
        : `${summary.portsAssigned} / ${summary.portsTotal} 已設定`;

  return (
    <WorkspaceCard
      id="card-surface"
      index={2}
      title="散熱表面"
      subtitle={finPort ? '鰭片陣列・所有情境共用' : '對流、輻射與日照'}
      status={status}
      tone={tone}
      open={open}
      onToggle={onToggle}
    >
      {surfaces.length === 0 || !set ? (
        <p className="text-[11.5px] leading-relaxed text-ink-500">
          熱網路還沒有散熱表面。先在 ① 依 04 產生熱網路，散熱器的鰭片表面就會出現在這裡。
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {surfaces.length > 1 && (
            <ul className="flex flex-col gap-0.5 rounded-md border border-line p-1" data-surface-list>
              {surfaces.map((port) => {
                const label = PORT_STATUS_LABELS[statusOf(port)];
                const active = selectedPort?.id === port.id;
                return (
                  <li key={port.id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => {
                        boundary.selectPort(port.id);
                        onShowPort(port);
                      }}
                      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] ${
                        active ? 'bg-accent-100 font-semibold text-accent-700' : 'text-ink-700 hover:bg-surface-muted'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{port.name.replace(/ Boundary$/, '')}</span>
                      <Badge tone={label.tone as 'ok'}>{label.zh}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedPort && (
            <BoundaryInspector
              key={selectedPort.id}
              port={selectedPort}
              status={statusOf(selectedPort)}
              assumptionCheck={assumptionChecks.get(selectedPort.id) ?? null}
              profiles={profilesForPort(set, selectedPort.id)}
              preferredProfileId={preferredProfileId}
              preview={set.derived_preview.find((entry) => entry.boundary_port_id === selectedPort.id)}
              validation={validation}
              ambientTemperature_C={set.ambient.external_ambient_C}
              solarEnabled={solarEnabled}
              heatSinkBase={{
                L_mm: draft.materials.hsk_base_L_mm?.value ?? null,
                W_mm: draft.materials.hsk_base_W_mm?.value ?? null,
                // A die-cast fin is the base's own metal.
                k_W_mK: draft.materials.hsk_base_k_W_mK?.value ?? null,
              }}
              readOnly={readOnly}
              onEditAmbient={onEditAmbient}
              onUpsertProfile={(profile) => useBoundaryStore.getState().upsertProfile(profile)}
              onRemoveProfile={boundary.removeProfile}
              onAddProfile={(type) => boundary.addProfileToPort(selectedPort.id, type)}
            />
          )}

          {(incomplete > 0 || similarCount > 0) && (
            <div className="flex flex-wrap gap-2">
              {incomplete > 0 && (
                <Button
                  className="h-8"
                  icon={<Sparkles size={14} aria-hidden />}
                  disabled={readOnly}
                  title="替還沒有邊界條件的表面建立預設的條件，並打開第一個還要填的欄位"
                  onClick={() => {
                    const port = boundary.createBoundaryProfiles();
                    if (port) onShowPort(port);
                  }}
                >
                  建立缺少的邊界條件
                </Button>
              )}
              {similarCount > 0 && (
                <Button
                  className="h-8"
                  icon={<Copy size={14} aria-hidden />}
                  disabled={readOnly}
                  title="把這個表面的邊界條件複製到方位相同的表面"
                  onClick={boundary.applyToSimilar}
                >
                  套用到同方位的 {similarCount} 個表面
                </Button>
              )}
            </div>
          )}

          <CardDisclosure
            name="surface-properties"
            title="表面性質"
            hint={finPort ? '發射率、吸收率（鰭片表面的輻射已含在 h_rad 裡）' : '發射率、吸收率'}
          >
            <SurfacePropertiesPanel
              groups={surfaceGroups}
              properties={set.surface_properties}
              solarEnabled={solarEnabled}
              solarIrradiance_W_m2={set.site.solar_irradiance_W_m2 ?? null}
              readOnly={readOnly}
              onChange={(property) => useBoundaryStore.getState().setSurfaceProperty(property)}
            />
          </CardDisclosure>
        </div>
      )}
    </WorkspaceCard>
  );
}
