import { AppHeader } from "../../app-header";
import { ProjectEditor } from "../../project-editor";

export default async function ProjectPage({
  params
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">
        <ProjectEditor key={projectId} projectId={projectId} />
      </main>
    </div>
  );
}
