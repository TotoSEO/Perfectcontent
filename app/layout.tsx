import type { Metadata } from "next";
import { Montserrat, Poppins } from "next/font/google";
import "./globals.css";

// Visibili'tea brand fonts — exposed as CSS variables, opt-in inside the audit
// slide viewer via inline style. The rest of the app continues to use the
// system stack defined in globals.css.
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
    <html lang="fr" className={`dark ${montserrat.variable} ${poppins.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
