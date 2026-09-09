import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { SCREENS, projectPath } from '@/app/navigation';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { EmptyProjectState, ProjectInfoView } from '@/project/ProjectInfoView';
import { ImportComponentsView } from '@/screens/02-import-components/ImportComponentsView';
import { ComponentManagerView } from '@/screens/04-component-manager/ComponentManagerView';
import { ThermalPathBuilderView } from '@/screens/05-thermal-path-builder/ThermalPathBuilderView';
import { BoundaryConditionsView } from '@/screens/06-boundary-conditions/BoundaryConditionsView';
import { ThermalNetworkView } from '@/screens/07-thermal-network/ThermalNetworkView';
import { BottleneckAnalysisView } from '@/screens/08-bottleneck-analysis/BottleneckAnalysisView';
import { ResultsOverviewView } from '@/screens/10-results-overview/ResultsOverviewView';
import { ReportPreviewView } from '@/screens/11-report-preview/ReportPreviewView';
import { ExportCenterView } from '@/screens/12-export-center/ExportCenterView';
import { useProjectStore } from '@/data/projectStore';

/** A path that no longer has a screen, sent to the one that took its job over. */
function RetiredScreen({ to }: { to: string }) {
  const { projectId } = useParams();
  return <Navigate to={projectId ? projectPath(projectId, to) : '/'} replace />;
}

/** Opens the most recently updated project, or shows the empty state (01 §20). */
function Landing() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    const loaded = useProjectStore.getState().refreshProjects();
    const active = loaded
      .filter((p) => p.status === 'active')
      .sort((a, b) => b.meta.updated_at.localeCompare(a.meta.updated_at));
    if (active.length > 0) {
      navigate(`/project/${encodeURIComponent(active[0].project_id)}/info`, { replace: true });
    }
  }, [navigate]);

  if (projects.length > 0) return null;
  return <EmptyProjectState />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/project/:projectId/info" element={<ProjectInfoView />} />
        <Route
          path="/project/:projectId/import-components"
          element={<ImportComponentsView />}
        />
        <Route path="/project/:projectId/components" element={<ComponentManagerView />} />
        <Route path="/project/:projectId/thermal-path" element={<ThermalPathBuilderView />} />
        <Route path="/project/:projectId/boundary" element={<BoundaryConditionsView />} />
        <Route path="/project/:projectId/network" element={<ThermalNetworkView />} />
        <Route path="/project/:projectId/bottleneck" element={<BottleneckAnalysisView />} />
        <Route path="/project/:projectId/results" element={<ResultsOverviewView />} />
        <Route path="/project/:projectId/report" element={<ReportPreviewView />} />
        <Route path="/project/:projectId/export" element={<ExportCenterView />} />
        {/* Screen 09 (Temperature Distribution) was removed: it binned NODES,
            which counts how finely the network was drawn rather than how hot
            the machine runs. A bookmark to it lands on Screen 07, which now
            carries the one reading it was worth — the highest usable ambient. */}
        <Route path="/project/:projectId/temperature" element={<RetiredScreen to="network" />} />
        {SCREENS.filter((screen) => !screen.implemented).map((screen) => (
          <Route
            key={screen.code}
            path={`/project/:projectId/${screen.path}`}
            element={<PlaceholderScreen code={screen.code} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
