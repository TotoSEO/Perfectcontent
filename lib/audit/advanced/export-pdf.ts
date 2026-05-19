// PDF export for the advanced audit deck.
//
// IMPORTANT: we use window.print() with an injected `@media print`
// stylesheet, NOT html2canvas. After multiple rounds of trying to make
// html2canvas behave (it kept crashing on createPattern, breaking the
// layout, producing oversized pages with black bands), I switched to
// browser-native print-to-PDF which gives:
//
//   • Pixel-perfect rendering (browser's own engine, same as on screen)
//   • Vector text (selectable, searchable, crisp at any zoom)
//   • Bullet-proof CSS support (no missing features, no quirks)
//   • Smaller file size than rasterised JPEGs
//
// The tradeoff: the user sees the browser's print dialog and has to
// pick "Save as PDF" from the destination dropdown. This is the
// standard pattern for printing to PDF from a web app (Notion, Linear,
// Stripe Dashboard all do it this way) and is universally familiar.

const SLIDE_W = 1600;
const SLIDE_H = 900;

export type PdfProgressFn = (current: number, total: number) => void;

export async function exportDeckToPdf(
  auditName: string,
  containerSelector: string,
  _onProgress?: PdfProgressFn, // unused with print-based export but kept for API stability
): Promise<void> {
  const container = document.querySelector(containerSelector);
  if (!container) {
    throw new Error(`Conteneur '${containerSelector}' introuvable dans le DOM.`);
  }
  const slides = container.querySelectorAll<HTMLElement>("[data-pdf-slide]");
  if (slides.length === 0) {
    throw new Error("Aucune slide à exporter. Attendez que les slides soient affichées avant de lancer l'export.");
  }

  // Set the document title — most browsers use it as the default PDF
  // filename in the "Save as" dialog.
  const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  const previousTitle = document.title;
  document.title = `audit-avance-${safeName || "seo"}-${date}`;

  // Build a *print-only* mirror container at body level. Cloning the
  // slide DOM means the live audit page keeps its layout intact while
  // print renders only our mirror. We position it off-screen so it
  // doesn't visibly flicker during the brief moment before window.print
  // takes over.
  const printRoot = document.createElement("div");
  printRoot.id = "audit-pdf-print-root";
  printRoot.style.cssText = "position: fixed; top: -100000px; left: 0; visibility: hidden;";
  for (const slide of Array.from(slides)) {
    const clone = slide.cloneNode(true) as HTMLElement;
    // Make sure the clone keeps its identity so the print CSS can
    // target it. cloneNode preserves data-* attributes.
    printRoot.appendChild(clone);
  }
  document.body.appendChild(printRoot);

  // Inject the print stylesheet. Everything visible-but-not-a-slide is
  // hidden in print mode; each cloned slide becomes one fixed-size page.
  const styleEl = document.createElement("style");
  styleEl.id = "audit-pdf-print-style";
  styleEl.textContent = `
    @media print {
      /* Page size matches the slide design canvas. 1600 × 900 CSS px
         maps to ~423 × 238 mm at 96 DPI — a sizeable PDF page, but
         that's what makes the slide content lay out at its intended
         size with no rescaling. */
      @page {
        size: ${SLIDE_W}px ${SLIDE_H}px;
        margin: 0;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #FFFCF7 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      /* Hide every direct child of body except the print root. */
      body > *:not(#audit-pdf-print-root) {
        display: none !important;
      }
      #audit-pdf-print-root {
        position: static !important;
        top: auto !important;
        left: auto !important;
        visibility: visible !important;
        background: transparent !important;
      }
      #audit-pdf-print-root [data-pdf-slide] {
        /* Each cloned slide fills the page exactly — no margins, no
           gaps, no aspect-ratio drift. The page-break-after directive
           forces a clean separation between slides. */
        position: relative !important;
        display: block !important;
        width: ${SLIDE_W}px !important;
        height: ${SLIDE_H}px !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        break-after: page !important;
        break-inside: avoid !important;
        overflow: hidden !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }
      #audit-pdf-print-root [data-pdf-slide]:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      /* Make every nested child visible (the body > * rule cascades). */
      #audit-pdf-print-root [data-pdf-slide] * {
        visibility: visible !important;
      }
      /* Belt-and-braces: kill the body grain and any decorative
         pseudo-elements that might leak into a printed page. */
      body::before, body::after { display: none !important; content: none !important; }
    }
  `;
  document.head.appendChild(styleEl);

  // Trigger the browser print dialog. afterprint fires when the user
  // closes the dialog — either by saving or by cancelling.
  try {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener("afterprint", done);
        resolve();
      };
      window.addEventListener("afterprint", done, { once: true });
      // Some browsers (Safari) fire afterprint reliably; others (older
      // Firefox) may not. Safety timeout so we always clean up.
      setTimeout(done, 60_000);
      window.print();
    });
  } finally {
    styleEl.remove();
    printRoot.remove();
    document.title = previousTitle;
  }
}
