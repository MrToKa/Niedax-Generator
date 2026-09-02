import { AppHeader } from "../../app-header";
import { ProjectEditor } from "../../project-editor";
import { RetainedProjectHistory } from "../../retained-project-history";

export default async function ProjectPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string | string[] | undefined }>;
}>) {
  const { projectId } = await params;
  const { view } = await searchParams;
  const historyOnly = view === "history";
  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">
        {historyOnly ? (
          <RetainedProjectHistory key={projectId} projectId={projectId} />
        ) : (
          <ProjectEditor key={projectId} projectId={projectId} />
        )}
      </main>
    </div>
  );
}
