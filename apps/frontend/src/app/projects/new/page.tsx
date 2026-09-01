import { AppHeader } from "../../app-header";
import { ProjectCreateForm } from "../../project-create-form";

export default function NewProjectPage() {
  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">
        <ProjectCreateForm />
      </main>
    </div>
  );
}
