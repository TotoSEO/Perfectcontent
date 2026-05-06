import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PerfectContent",
  description: "Pipeline SEO single-user.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
