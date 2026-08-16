import { versions } from "@/lib/versions";

import { FoundationDashboard } from "../foundation-dashboard";

export default function AdminPage() {
  return <FoundationDashboard versions={versions} />;
}
