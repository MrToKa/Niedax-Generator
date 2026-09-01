import { AppHeader } from "./app-header";
import { ProjectList } from "./project-list";

export default function Home() {
  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">
        <ProjectList />
      </main>
    </div>
  );
}
