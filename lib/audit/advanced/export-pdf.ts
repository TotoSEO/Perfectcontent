// PDF export for the advanced audit deck.
//
// APPROACH (v3) : deterministic, programmatic generation. We do NOT use
// window.print() any more. The print dialog could never be full-bleed
// without the user manually setting "Margins: None" + disabling headers/
// footers + forcing 100% scale — three settings we cannot control from
// code, which is why every previous print-based attempt showed margins,
// auto-scaling and split/blank pages.
//
// Instead we:
//   1. Clone each [data-pdf-slide] into an off-screen container forced to
//      the NATIVE design size (1600×900). At that size the fixed-px design
//      (80px padding, 36px titles…) lays out exactly as intended, and
//      overflow:hidden guarantees nothing spills onto a 2nd page.
//   2. Rasterise each clone with html2canvas (scale 2 = crisp).
//   3. Assemble a jsPDF where 1 slide = 1 full-bleed 1600×900 page.
//
// Result : a real downloaded .pdf, edge-to-edge, no dialog, no margins,
// no missing/split slides, identical on every machine.

const SLIDE_W = 1600;
const SLIDE_H = 900;

export type PdfProgressFn = (current: number, total: number) => void;

export async function exportDeckToPdf(
  auditName: string,
  containerSelector: string,
  onProgress?: PdfProgressFn,
): Promise<void> {
  const container = document.querySelector(containerSelector);
  if (!container) {
    throw new Error(`Conteneur '${containerSelector}' introuvable dans le DOM.`);
  }
  const slides = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-slide]"));
  if (slides.length === 0) {
    throw new Error("Aucune slide à exporter. Attendez que les slides soient affichées avant de lancer l'export.");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Make sure the brand fonts (Calistoga / Montserrat / Poppins / mono)
  // are loaded before rasterising, otherwise text falls back mid-capture.
  try {
    await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* fonts.ready unsupported : proceed anyway */
  }

  // Off-screen staging host. position:fixed + far off-screen keeps real
  // layout (html2canvas needs laid-out, non-display:none nodes) without
  // any visible flicker on the live page.
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    "margin:0",
    "padding:0",
    "background:#FFFCF7",
    `width:${SLIDE_W}px`,
    "z-index:-1",
    "pointerEvents:none",
  ].join(";");
  document.body.appendChild(stage);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  });

  const failures: number[] = [];

  try {
    for (let i = 0; i < slides.length; i++) {
      onProgress?.(i + 1, slides.length);

      // Build a fixed-size frame and clone the slide into it.
      const frame = document.createElement("div");
      frame.style.cssText = [
        `width:${SLIDE_W}px`,
        `height:${SLIDE_H}px`,
        "overflow:hidden",
        "background:#FFFCF7",
        "position:relative",
      ].join(";");

      // Scale factor from the on-screen slide width to the 1600px design.
      const srcRect = slides[i].getBoundingClientRect();
      const scale = srcRect.width > 0 ? SLIDE_W / srcRect.width : 1;

      const clone = slides[i].cloneNode(true) as HTMLElement;
      // The on-screen slide uses aspect-ratio + fluid width. Force the
      // clone to the exact design box so the fixed-px content renders at
      // its intended scale, and flatten the rounded card to fill the page.
      clone.style.width = `${SLIDE_W}px`;
      clone.style.height = `${SLIDE_H}px`;
      clone.style.aspectRatio = "auto";
      clone.style.margin = "0";
      const inner = clone.firstElementChild as HTMLElement | null;
      if (inner) {
        inner.style.borderRadius = "0";
        inner.style.boxShadow = "none";
        inner.style.border = "none";
        inner.style.width = "100%";
        inner.style.height = "100%";
      }

      // html2canvas renders percentage-sized inline <svg> at ZERO size,
      // which both blanks the charts AND can trigger the historical
      // createPattern crash. Give every cloned SVG an explicit pixel size
      // derived from its real on-screen size, scaled to the 1600px design.
      const srcSvgs = slides[i].querySelectorAll("svg");
      const cloneSvgs = clone.querySelectorAll("svg");
      for (let k = 0; k < cloneSvgs.length && k < srcSvgs.length; k++) {
        const oRect = srcSvgs[k].getBoundingClientRect();
        if (oRect.width > 0 && oRect.height > 0) {
          const svg = cloneSvgs[k] as SVGElement;
          const w = Math.round(oRect.width * scale);
          const h = Math.round(oRect.height * scale);
          svg.setAttribute("width", String(w));
          svg.setAttribute("height", String(h));
          (svg as unknown as HTMLElement).style.width = `${w}px`;
          (svg as unknown as HTMLElement).style.height = `${h}px`;
        }
      }

      frame.appendChild(clone);
      stage.appendChild(frame);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const canvas = await html2canvas(frame, {
          width: SLIDE_W,
          height: SLIDE_H,
          windowWidth: SLIDE_W,
          windowHeight: SLIDE_H,
          scale: 2,
          backgroundColor: "#FFFCF7",
          useCORS: true,
          logging: false,
          imageTimeout: 0,
        } as any);

        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        if (i > 0) doc.addPage([SLIDE_W, SLIDE_H], "landscape");
        doc.addImage(imgData, "JPEG", 0, 0, SLIDE_W, SLIDE_H, undefined, "FAST");
      } catch (e) {
        // Never let one bad slide abort the whole export : emit a labelled
        // placeholder page and keep going.
        console.error(`PDF: slide ${i + 1} capture failed`, e);
        failures.push(i + 1);
        if (i > 0) doc.addPage([SLIDE_W, SLIDE_H], "landscape");
        doc.setFillColor(255, 252, 247);
        doc.rect(0, 0, SLIDE_W, SLIDE_H, "F");
        doc.setTextColor(133, 56, 47);
        doc.setFontSize(28);
        doc.text(`Slide ${i + 1} : rendu indisponible`, SLIDE_W / 2, SLIDE_H / 2, { align: "center" });
      } finally {
        stage.removeChild(frame);
      }
    }

    const safeName = auditName.replace(/[^\w-]+/g, "-").toLowerCase();
    const date = new Date().toISOString().slice(0, 10);
    doc.save(`audit-avance-${safeName || "seo"}-${date}.pdf`);
  } finally {
    document.body.removeChild(stage);
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} slide(s) n'ont pas pu être rendues (n° ${failures.join(", ")}). ` +
      "Le reste du PDF a été généré. Réessaie : si le problème persiste, signale-le.",
    );
  }
}
