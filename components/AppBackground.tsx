"use client";

import { useEffect, useRef } from "react";

/**
 * Full-viewport mouse-tracked depth background. Mounted once in the app
 * layout — every page gets the same premium feel without re-implementing it.
 *
 * Three depth layers:
 *  1. far  — three slowly-drifting aurora orbs that parallax with the cursor
 *  2. mid  — faint topographic relief grid (dotted) that parallaxes lightly
 *  3. near — accent halo glued to the cursor position
 *
 * Honors prefers-reduced-motion (drops the parallax + orb animations).
 */
export function AppBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let raf = 0;
    let tx = 0,
      ty = 0;
    function onMove(e: MouseEvent) {
      // window-relative position so the bg follows the cursor everywhere,
      // including inside scrollable panes.
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    }
    function apply() {
      raf = 0;
      el!.style.setProperty("--mx", tx.toFixed(3));
      el!.style.setProperty("--my", ty.toFixed(3));
      el!.style.setProperty(
        "--mxp",
        `${((tx + 0.5) * 100).toFixed(2)}%`,
      );
      el!.style.setProperty(
        "--myp",
        `${((ty + 0.5) * 100).toFixed(2)}%`,
      );
    }
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="app-bg pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={
        {
          // Defaults so SSR doesn't render with empty CSS vars
          ["--mx" as string]: 0,
          ["--my" as string]: 0,
          ["--mxp" as string]: "50%",
          ["--myp" as string]: "50%",
        } as React.CSSProperties
      }
    >
      {/* Far depth — drifting aurora orbs */}
      <div
        className="absolute inset-0 app-bg-far"
        style={{
          transform:
            "translate3d(calc(var(--mx) * -22px), calc(var(--my) * -22px), 0)",
        }}
      >
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      {/* Mid depth — topographic dot relief */}
      <div
        className="absolute inset-0 app-bg-mid"
        style={{
          transform:
            "translate3d(calc(var(--mx) * -10px), calc(var(--my) * -10px), 0)",
        }}
      />

      {/* Near depth — accent halo glued to the cursor */}
      <div className="absolute inset-0 app-bg-near" />

      <style jsx>{`
        .app-bg {
          contain: strict;
        }
        .app-bg-far,
        .app-bg-mid {
          transition: transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform;
        }
        .orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(120px);
          mix-blend-mode: screen;
        }
        .orb-1 {
          top: -10%;
          left: -8%;
          width: 55vw;
          height: 55vw;
          opacity: 0.7;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(124, 132, 255, 0.45),
            transparent 65%
          );
          animation: float1 22s ease-in-out infinite;
        }
        .orb-2 {
          top: 5%;
          right: -18%;
          width: 60vw;
          height: 60vw;
          opacity: 0.6;
          background: radial-gradient(
            circle at 70% 30%,
            rgba(168, 85, 247, 0.36),
            transparent 65%
          );
          animation: float2 26s ease-in-out infinite;
        }
        .orb-3 {
          bottom: -25%;
          left: 18%;
          width: 70vw;
          height: 70vw;
          opacity: 0.5;
          background: radial-gradient(
            circle at 50% 70%,
            rgba(56, 189, 248, 0.28),
            transparent 65%
          );
          animation: float3 30s ease-in-out infinite;
        }
        .app-bg-mid {
          opacity: 0.16;
          background-image: radial-gradient(
            circle at 1px 1px,
            rgba(255, 255, 255, 0.18) 1px,
            transparent 1.5px
          );
          background-size: 44px 44px;
          -webkit-mask-image: radial-gradient(
            ellipse 70% 60% at 50% 35%,
            black 0%,
            transparent 80%
          );
          mask-image: radial-gradient(
            ellipse 70% 60% at 50% 35%,
            black 0%,
            transparent 80%
          );
        }
        .app-bg-near {
          background: radial-gradient(
            520px circle at var(--mxp) var(--myp),
            rgba(124, 132, 255, 0.12),
            transparent 55%
          );
          transition: background 200ms linear;
        }
        @keyframes float1 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(4%, 6%) scale(1.06);
          }
        }
        @keyframes float2 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-5%, 4%) scale(1.05);
          }
        }
        @keyframes float3 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(3%, -4%) scale(1.06);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .app-bg-far,
          .app-bg-mid {
            transition: none;
            transform: none !important;
          }
          .orb {
            animation: none !important;
          }
          .app-bg-near {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
