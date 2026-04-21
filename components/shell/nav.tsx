"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/", "Dashboard"], ["/studio/demo-project", "Studio"], ["/ai-create", "AI Create"], ["/my-sound", "My Sound"], ["/vocal-lab", "Vocal Lab"], ["/sampler", "Sampler"], ["/performance", "Performance"], ["/mastering", "Mastering"], ["/exports", "Exports"], ["/settings", "Settings"]
] as const;

export function LeftNavigation() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <h2>MWS</h2>
      {items.map(([href, label]) => (
        <Link key={href} href={href} className="nav-link" style={{ background: pathname === href ? "#24324b" : undefined }}>
          {label}
        </Link>
      ))}
    </aside>
  );
}
