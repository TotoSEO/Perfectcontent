import type { Metadata } from "next";
import { Montserrat, Poppins, Calistoga, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Visibili'tea brand fonts — exposed as CSS variables, opt-in inside the audit
// slide viewer via inline style. The rest of the app continues to use the
// system stack defined in globals.css.
//
// Editorial tri-stack for the audit deck (premium, non-"auto-generated" feel):
//   • Calistoga    — warm display serif for hero numbers + big titles
//   • Montserrat   — geometric sans for precise tabular data / KPI values
//   • Poppins      — humanist sans for body copy
//   • JetBrains Mono — technical mono for uppercase micro-labels / badges
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-vbt-title",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-vbt-body",
  display: "swap",
});
const calistoga = Calistoga({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-vbt-display",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-vbt-mono",
  display: "swap",
});

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
    <html
      lang="fr"
      className={`dark ${montserrat.variable} ${poppins.variable} ${calistoga.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
