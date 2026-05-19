"use client";

// Lucide-flavoured SVG icons used throughout the advanced audit deck (4.2).
// Inlined so they remain crisp when printed and don't require external assets.
// Names match Lucide for predictability.

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  className?: string;
};

function svg(size: number, strokeWidth: number, color: string, fill: string, children: React.ReactNode, className?: string) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function FileSpreadsheetIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h2" />
      <path d="M14 13h2" />
      <path d="M8 17h2" />
      <path d="M14 17h2" />
    </>
  ), className);
}

export function ChevronRightIcon({ size = 14, color = "currentColor", strokeWidth = 2.4, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, <path d="m9 18 6-6-6-6" />, className);
}

export function ArrowRightIcon({ size = 14, color = "currentColor", strokeWidth = 2.2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ), className);
}

export function ImagePlusIcon({ size = 40, color = "currentColor", strokeWidth = 1.8, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <path d="M21 11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ), className);
}

export function AlertTriangleIcon({ size = 16, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ), className);
}

export function CheckCircleIcon({ size = 16, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ), className);
}

export function InfoIcon({ size = 16, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ), className);
}

export function PrinterIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </>
  ), className);
}

export function DownloadIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ), className);
}

export function TrendingUpIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ), className);
}

export function FlameIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ), className);
}

export function ZapIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  ), className);
}

export function ClockIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ), className);
}

export function HammerIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
    </>
  ), className);
}

export function QuoteIcon({ size = 24, color = "currentColor", strokeWidth = 2, fill = "currentColor", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h2c0 4-2 5-2 5z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h2c0 4-2 5-2 5z" />
    </>
  ), className);
}

export function SparklesIcon({ size = 14, color = "currentColor", strokeWidth = 2, fill = "none", className }: IconProps) {
  return svg(size, strokeWidth, color, fill, (
    <>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </>
  ), className);
}
