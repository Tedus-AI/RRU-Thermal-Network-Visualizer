import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { SCREENS, projectPath } from '@/app/navigation';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { EmptyProjectState, ProjectInfoView } from '@/project/ProjectInfoView';
import { ImportComponentsView } from '@/screens/02-import-components/ImportComponentsView';
import { ComponentManagerView } from '@/screens/04-component-manager/ComponentManagerView';
import { ThermalPathBuilderView } from '@/screens/05-thermal-path-builder/ThermalPathBuilderView';
import { ThermalNetworkView } from '@/screens/07-thermal-network/ThermalNetworkView';
import { BottleneckAnalysisView } from '@/screens/08-bottleneck-analysis/BottleneckAnalysisView';
import { ReportPreviewView } from '@/screens/11-report-preview/ReportPreviewView';
import { useProjectStore } from '@/data/projectStore';

/**
 * A path that no longer has a screen, sent to the one that took its job over.
 * The query string goes along: an "Edit in" link carries what to select.
 */
function RetiredScreen({ to, query }: { to: string; query?: string }) {
  const { projectId } = useParams();
  const { search } = useLocation();
  // `query` is what the new screen needs to open where the old one was (11
  // Export Center → 10's drawer); the link's own query string goes along too.
  const params = new URLSearchParams(search);
  if (query) for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
  const tail = params.toString();
  return (
    <Navigate to={projectId ? `${projectPath(projectId, to)}${tail ? `?${tail}` : ''}` : '/'} replace />
  );
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
        {/* 06 Boundary Conditions is the surface half of 05 now (06 §22). */}
        <Route path="/project/:projectId/boundary" element={<RetiredScreen to="thermal-path" />} />
        <Route path="/project/:projectId/network" element={<ThermalNetworkView />} />
        <Route path="/project/:projectId/bottleneck" element={<BottleneckAnalysisView />} />
        {/* 09 Results Overview is part of 07 求解與結果 now (07 §59). */}
        <Route path="/project/:projectId/results" element={<RetiredScreen to="network" />} />
        <Route path="/project/:projectId/report" element={<ReportPreviewView />} />
        {/* 11 Export Center is part of 10 報告與匯出 now (12 §61): the old
            address opens 10 with its 匯出設定 drawer. */}
        <Route path="/project/:projectId/export" element={<RetiredScreen to="report" query="panel=export" />} />
        {/* The Temperature Distribution screen was removed: it binned NODES,
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
