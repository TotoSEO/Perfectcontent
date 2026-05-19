// PDF export for the advanced audit deck.
//
// Constraints from the user :
//   • One slide = one PDF page (no aggregation, no margins, no extra pages)
//   • The PDF must look EXACTLY like the visualisation : same fonts, same
//     positioning, same colours. Pixel-perfect when possible.
//   • No drift in dimensions : the slide's 16:9 ratio must be preserved
//     end-to-end, with NO empty bands at top/bottom.
//
// Implementation :
//   • Each slide is rendered in the DOM at a fixed design size (1600×900,
//     the same canvas we use everywhere). We snapshot each slide with
//     html2canvas at scale=2 (Retina-friendly, ~3200×1800 raw).
//   • We create a jsPDF document whose page size is EXACTLY the slide's
//     pixel size (in jsPDF "px" units), so the embedded image lays out
//     1:1 with no scaling artefact and no margin.
//   • Each slide becomes one PDF page (pdf.addPage(...) for subsequent
//     slides).
//
// Loading the heavy deps (jsPDF, html2canvas) is deferred behind dynamic
// import() so the main bundle stays small until the user actually clicks
// "Exporter en PDF".

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
  const { default: html2canvas } = await import("html2canvas");

  // Grab every slide currently in the DOM. We rely on the data-attribute
  // hook added by the viewer (the AdvSlide wrapper sets data-pdf-slide).
  const container = document.querySelector(containerSelector);
  if (!container) {
    throw new Error(`Conteneur '${containerSelector}' introuvable dans le DOM.`);
  }
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-pdf-slide]"),
  );
  if (nodes.length === 0) {
    throw new Error("Aucune slide à exporter. Attends que les slides soient affichées avant de lancer l'export.");
  }

  // PDF page sized to match the slide pixel-for-pixel — no margins, no
  // empty bands, no aspect-ratio drift.
  const pdf = new jsPDF({
    orientation: SLIDE_W >= SLIDE_H ? "landscape" : "portrait",
    unit: "px",
    format: [SLIDE_W, SLIDE_H],
    compress: true,
    hotfixes: ["px_scaling"],
  });

  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i, nodes.length);
    const node = nodes[i];
    // Wait for layout / fonts / images to settle before snapshot.
    await waitForImagesAndFonts(node);

    const canvas = await html2canvas(node, {
      scale: RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
      // Pin the rendering width/height to the design size so the canvas
      // never gets resized by the responsive scaling of the page —
      // ensures the PDF page matches the visualisation 1:1.
      width: node.offsetWidth,
      height: node.offsetHeight,
      windowWidth: node.offsetWidth,
      windowHeight: node.offsetHeight,
    });

    // High-quality JPEG keeps file size manageable for 30-50 slide decks.
    // Quality 0.92 = visually lossless but ~5-8× smaller than PNG.
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (i > 0) {
      pdf.addPage([SLIDE_W, SLIDE_H], "landscape");
    }
    // Position at (0, 0) with the full page size — zero margins.
    pdf.addImage(imgData, "JPEG", 0, 0, SLIDE_W, SLIDE_H, undefined, "FAST");
  }

  onProgress?.(nodes.length, nodes.length);
  const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  pdf.save(`audit-avance-${safeName || "seo"}-${date}.pdf`);
}

// Make sure every <img> in the node is loaded and the page's fonts are
// applied before we snapshot — otherwise html2canvas captures missing
// glyphs or broken images.
async function waitForImagesAndFonts(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  const imgPromises = imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
      // safety timeout : never block forever on a missing asset
      setTimeout(resolve, 3000);
    });
  });
  const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    || Promise.resolve();
  await Promise.all([fontsReady, ...imgPromises]);
}
