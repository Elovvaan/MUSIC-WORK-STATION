import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Music Work Station",
  description: "Desktop-first private creator workstation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
