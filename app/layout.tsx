import type { Metadata } from "next";
import { Montserrat, Poppins } from "next/font/google";
import "./globals.css";

// Visibili'tea brand fonts (from the design system : Montserrat for titles,
// Poppins for body). Both are pulled via next/font so they are served from
// the same origin and visible to html2canvas / print exports.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-vbt-title",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
    <html
      lang="fr"
      className={`dark ${montserrat.variable} ${poppins.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
