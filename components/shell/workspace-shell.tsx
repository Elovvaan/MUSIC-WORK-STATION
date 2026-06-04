"use client";

import { usePathname } from "next/navigation";
import { LeftNavigation } from "@/components/shell/nav";
import { TopTransport } from "@/components/shell/top-transport";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStudio = pathname.startsWith("/studio/");

  return (
    <div className={isStudio ? "shell studio-shell" : "shell"}>
      <LeftNavigation />
      <div className="main">
        {isStudio ? null : <TopTransport />}
        <main className={isStudio ? "workspace studio-workspace" : "workspace"}>{children}</main>
      </div>
    </div>
  );
}
