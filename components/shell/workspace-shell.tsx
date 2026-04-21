import { LeftNavigation } from "@/components/shell/nav";
import { TopTransport } from "@/components/shell/top-transport";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <LeftNavigation />
      <div className="main">
        <TopTransport />
        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}
