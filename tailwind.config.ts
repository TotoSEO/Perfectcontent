import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#06070a",
          900: "#0a0b10",
          850: "#0e1018",
          800: "#10121a",
          750: "#161823",
          700: "#1d1f2c",
          600: "#2b2e3d",
          500: "#3d4053",
        },
        accent: {
          50: "#eef0ff",
          100: "#dde1ff",
          200: "#bcc3ff",
          300: "#959fff",
          400: "#7c84ff",
          500: "#6366f1",
          600: "#5b5fe0",
          700: "#4338ca",
          800: "#3730a3",
          900: "#1e1b4b",
        },
      },
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      transitionTimingFunction: {
        expo: "cubic-bezier(0.16, 1, 0.3, 1)",
        back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      boxShadow: {
        glow: "0 0 32px -6px rgba(124, 132, 255, 0.45), 0 0 0 1px rgba(124, 132, 255, 0.3)",
        cta: "0 8px 24px -8px rgba(124, 132, 255, 0.55), 0 0 0 1px rgba(124, 132, 255, 0.25)",
        glass: "0 1px 0 0 rgba(255,255,255,0.10) inset, 0 24px 48px -28px rgba(0,0,0,0.55)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 0 3px rgba(124,132,255,0.18), 0 0 16px -4px rgba(124,132,255,0.4)" },
          "50%": { boxShadow: "0 0 0 6px rgba(124,132,255,0.10), 0 0 32px -4px rgba(124,132,255,0.6)" },
        },
      },
      animation: {
        fadein: "fadeIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
        glow: "glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
