import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { SCREENS } from '@/app/navigation';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { EmptyProjectState, ProjectInfoView } from '@/project/ProjectInfoView';
import { ImportComponentsView } from '@/screens/02-import-components/ImportComponentsView';
import { useProjectStore } from '@/data/projectStore';

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
