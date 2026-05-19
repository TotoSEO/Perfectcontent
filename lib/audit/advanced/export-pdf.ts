// PDF export for the advanced audit deck.
//
// Constraints from the user:
//   • 1 slide = 1 PDF page (no aggregation, no extra pages)
//   • PDF must look EXACTLY like the visualisation: same fonts, colours,
//     positioning. The image must FILL the page — no black bands.
//   • No drift in dimensions: the slide's 16:9 ratio must be preserved
//     end-to-end.
//
// Implementation notes:
//   • We pick a fixed 16:9 PAGE SIZE IN MM (the most reliable unit in
//     jsPDF — pt and px both have version-dependent quirks). 297 mm wide
//     × 167.0625 mm tall = perfect 16:9.
//   • Each slide is captured at the size it currently occupies in the
//     DOM, with html2canvas at scale 2 for Retina quality. The resulting
//     canvas is downscaled to fit the PDF page exactly. No empty bands
//     because the page is the same aspect ratio as the slide and the
//     image is drawn at (0, 0, PAGE_W, PAGE_H).
//   • Each slide is scroll-into-viewed before capture so the browser has
//     done a full layout pass (and any virtualised content is rendered).
//   • Heavy deps (jspdf, html2canvas) are dynamic-imported so they don't
//     ship in the main bundle.

// 16:9 landscape page sized to match A4-width. Any 16:9 size would work,
// what matters is that the aspect ratio matches the slide so the image
// fills the page without bars.
const PAGE_W_MM = 297;
const PAGE_H_MM = (297 * 9) / 16; // 167.0625
// Slide design canvas. Every snapshot is forced to this resolution
// regardless of the user's viewport so the captured layout is identical
// across desktop / laptop / external monitor / Vercel preview iframe.
const SLIDE_W = 1600;
const SLIDE_H = 900;
const RENDER_SCALE = 2;

export type PdfProgressFn = (current: number, total: number) => void;

export async function exportDeckToPdf(
  auditName: string,
  containerSelector: string,
  onProgress?: PdfProgressFn,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const container = document.querySelector(containerSelector);
  if (!container) {
    throw new Error(`Conteneur '${containerSelector}' introuvable dans le DOM.`);
  }
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-pdf-slide]"),
  );
  if (nodes.length === 0) {
    throw new Error("Aucune slide à exporter. Attendez que les slides soient affichées avant de lancer l'export.");
  }

  // The page is a 16:9 landscape page in millimetres. mm is the safest
  // unit in jsPDF (px and pt have version-dependent scaling bugs).
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [PAGE_W_MM, PAGE_H_MM],
    compress: true,
  });

  const failedSlides: number[] = [];

  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i, nodes.length);
    const node = nodes[i];

    // Bring the slide into view first. Lazy / off-screen elements
    // sometimes report wrong dimensions until they hit the viewport.
    node.scrollIntoView({ block: "center", behavior: "auto" });
    // One animation frame is enough for layout to settle.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await waitForImagesAndFonts(node);

    let canvas: HTMLCanvasElement;
    try {
      canvas = await captureSlide(node);
      // Defensive: if html2canvas somehow returned a 0×0 canvas, treat
      // as a failure rather than silently producing a blank page.
      if (!canvas.width || !canvas.height) {
        throw new Error(`canvas reçu en ${canvas.width}×${canvas.height}`);
      }
    } catch (err) {
      console.warn(`[pdf] slide ${i + 1} capture failed:`, err);
      failedSlides.push(i + 1);
      if (i > 0) pdf.addPage([PAGE_W_MM, PAGE_H_MM], "landscape");
      pdf.setFontSize(16);
      pdf.text(
        `Slide ${i + 1} non capturée. Capture manuelle requise.`,
        PAGE_W_MM / 2,
        PAGE_H_MM / 2,
        { align: "center" },
      );
      continue;
    }
    // High-quality JPEG keeps file size manageable for 30-50 slide decks.
    // Quality 0.92 = visually lossless but ~5-8× smaller than PNG.
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (i > 0) {
      pdf.addPage([PAGE_W_MM, PAGE_H_MM], "landscape");
    }
    // (0, 0) with the FULL page size = zero margins, fills the page.
    pdf.addImage(imgData, "JPEG", 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, "FAST");
  }

  onProgress?.(nodes.length, nodes.length);
  const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  pdf.save(`audit-avance-${safeName || "seo"}-${date}.pdf`);

  if (failedSlides.length > 0) {
    throw new Error(
      `PDF généré, mais ${failedSlides.length} slide(s) non capturée(s) : ${failedSlides.join(", ")}. ` +
        "Captures manuelles à intégrer dans les pages correspondantes.",
    );
  }
}

async function captureSlide(node: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(node, {
    scale: RENDER_SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#FFFCF7", // paper colour: avoids transparent areas that some PDF viewers render black
    logging: false,
    // Force the snapshot to render the slide at its DESIGN resolution
    // (1600×900), not at the user's current viewport size. Without this,
    // the layout looked broken on narrower screens (overlapping flex
    // items, charts spilling over, etc.) because Tailwind responsive
    // breakpoints didn't fire.
    width: SLIDE_W,
    height: SLIDE_H,
    windowWidth: SLIDE_W,
    windowHeight: SLIDE_H,
    // The cloned DOM is mutated only for the snapshot; the on-screen
    // slide is untouched.
    //   • Pin the slide to 1600×900 explicitly (Tailwind's aspect-ratio
    //     based sizing doesn't always survive html2canvas's
    //     re-layout pass).
    //   • Strip CSS features that crash html2canvas: dashed/dotted
    //     borders + outlines (createPattern with 0×0), backdrop-filter
    //     (no-op + artefacts), bitmap url() backgrounds.
    onclone: (clonedDoc) => {
      // Pin every slide root to design size before html2canvas walks it.
      const slides = clonedDoc.querySelectorAll<HTMLElement>("[data-pdf-slide]");
      slides.forEach((s) => {
        s.style.width = SLIDE_W + "px";
        s.style.height = SLIDE_H + "px";
        s.style.maxWidth = "none";
        s.style.aspectRatio = "auto";
      });
      const els = clonedDoc.querySelectorAll<HTMLElement>("*");
      els.forEach((el) => {
        const s = el.style;
        if (s.borderStyle === "dashed" || s.borderStyle === "dotted") s.borderStyle = "solid";
        if (s.outlineStyle === "dashed" || s.outlineStyle === "dotted") s.outlineStyle = "solid";
        for (const prop of ["border", "borderTop", "borderRight", "borderBottom", "borderLeft", "outline"] as const) {
          const v = (s as unknown as Record<string, string>)[prop];
          if (v && /\b(dashed|dotted)\b/.test(v)) {
            (s as unknown as Record<string, string>)[prop] = v
              .replace(/\bdashed\b/g, "solid")
              .replace(/\bdotted\b/g, "solid");
          }
        }
        if (s.backdropFilter) s.backdropFilter = "";
        const wkBackdrop = (s as unknown as Record<string, string>)["webkitBackdropFilter"];
        if (wkBackdrop) (s as unknown as Record<string, string>)["webkitBackdropFilter"] = "";
        if (s.backgroundImage && /\burl\s*\(/i.test(s.backgroundImage)) {
          s.backgroundImage = "none";
        }
      });
      // Remove the body::after grain so it can't leak into the capture,
      // and force every slide to a known background.
      const style = clonedDoc.createElement("style");
      style.textContent = `body::after, body::before { display: none !important; content: none !important; }
        [data-pdf-slide] { background: #FFFCF7; }`;
      clonedDoc.head.appendChild(style);
    },
  });
}

async function waitForImagesAndFonts(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  const imgPromises = imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
      setTimeout(resolve, 3000);
    });
  });
  const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    || Promise.resolve();
  await Promise.all([fontsReady, ...imgPromises]);
}
