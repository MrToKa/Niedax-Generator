import { FoundationDashboard } from "./foundation-dashboard";
import { versions } from "../lib/versions";

export default function Home() {
  return <FoundationDashboard versions={versions} />;
}
