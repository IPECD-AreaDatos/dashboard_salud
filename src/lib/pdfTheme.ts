import type jsPDF from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";

type RGB = [number, number, number];

export const PDF_COLORS = {
  brand: [118, 159, 211] as RGB,
  navy: [43, 76, 126] as RGB,
  green: [30, 137, 104] as RGB,
  paleBlue: [219, 231, 242] as RGB,
  text: [40, 48, 57] as RGB,
  muted: [96, 108, 120] as RGB,
  rule: [213, 221, 229] as RGB,
  row: [243, 246, 249] as RGB,
  total: [229, 236, 243] as RGB,
  amber: [217, 119, 6] as RGB,
  red: [198, 40, 40] as RGB,
  white: [255, 255, 255] as RGB,
};

export const PDF_TABLE_THEME = {
  theme: "striped" as const,
  styles: {
    font: "helvetica" as const,
    fontSize: 7.2,
    cellPadding: 1.6,
    textColor: PDF_COLORS.text,
    lineColor: PDF_COLORS.rule,
    lineWidth: 0.15,
    valign: "middle" as const,
  },
  headStyles: {
    fillColor: PDF_COLORS.navy,
    textColor: PDF_COLORS.white,
    fontStyle: "bold" as const,
    cellPadding: 1.8,
  },
  bodyStyles: {
    textColor: PDF_COLORS.text,
    cellPadding: 1.6,
  },
  alternateRowStyles: {
    fillColor: PDF_COLORS.row,
  },
  footStyles: {
    fillColor: PDF_COLORS.total,
    textColor: PDF_COLORS.navy,
    fontStyle: "bold" as const,
  },
};

export function styledAutoTable(doc: jsPDF, options: UserOptions) {
  autoTable(doc, {
    ...options,
    theme: PDF_TABLE_THEME.theme,
    styles: { ...options.styles, ...PDF_TABLE_THEME.styles },
    headStyles: { ...options.headStyles, ...PDF_TABLE_THEME.headStyles },
    bodyStyles: { ...options.bodyStyles, ...PDF_TABLE_THEME.bodyStyles },
    alternateRowStyles: { ...options.alternateRowStyles, ...PDF_TABLE_THEME.alternateRowStyles },
    footStyles: { ...options.footStyles, ...PDF_TABLE_THEME.footStyles },
  });
}

export function drawSegEmMark(doc: jsPDF, x: number, y: number, size = 9) {
  const scale = size / 9;
  doc.setFillColor(...PDF_COLORS.brand);
  doc.roundedRect(x, y, size, size, 1.8 * scale, 1.8 * scale, "F");
  doc.setDrawColor(...PDF_COLORS.white);
  doc.setLineWidth(0.7 * scale);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.lines(
    [[1.5, 0], [1, -2.8], [1.5, 5.2], [1.4, -4], [1, 1.6], [1.6, 0]].map(([dx, dy]) => [dx * scale, dy * scale]),
    x + 0.8 * scale,
    y + size / 2,
  );
}

export function loadPdfInstitutionalLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const basePath = window.location.pathname.startsWith("/salud-dashboard") ? "/salud-dashboard" : "";
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `${basePath}/logo_nuevo.png`;
  });
}

export function drawPdfBrandHeader(doc: jsPDF, logo: HTMLImageElement | null, margin: number, metadata: string[] = []) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const logoWidth = Math.min(92, contentWidth * 0.5);
  const logoX = pageWidth - margin - logoWidth;

  drawSegEmMark(doc, margin, 7.5, 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...PDF_COLORS.brand);
  doc.text("SegEm", margin + 12, 14.5);

  if (logo) {
    doc.addImage(logo, "PNG", logoX, 7, logoWidth, logoWidth * (290 / 2610));
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text("GOBIERNO DE CORRIENTES", pageWidth - margin, 10.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.text("Ministerio de Salud Pública · Instituto de Modernización e Innovación", pageWidth - margin, 14, {
      align: "right",
      maxWidth: logoWidth,
    });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(...PDF_COLORS.muted);
  metadata.slice(0, 3).forEach((line, index) => {
    doc.text(line, pageWidth - margin, 18.5 + index * 2.5, {
      align: "right",
      maxWidth: logoWidth,
    });
  });

  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.4);
  doc.line(margin, 27, pageWidth - margin, 27);
}

export function drawPdfTitleBlock(doc: jsPDF, title: string, subtitle: string, margin: number, y = 33) {
  const contentWidth = doc.internal.pageSize.getWidth() - margin * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...PDF_COLORS.navy);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  doc.text(titleLines, margin, y);

  let nextY = y + titleLines.length * 5.5;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    const subtitleLines = doc.splitTextToSize(subtitle, contentWidth);
    doc.text(subtitleLines, margin, nextY);
    nextY += subtitleLines.length * 3.6;
  }
  return nextY + 3;
}

export function drawPdfSectionTitle(doc: jsPDF, title: string, x: number, y: number, subtitle?: string, fontSize = 10) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(title, x, y);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(subtitle, x, y + 5);
  }
}

export function drawPdfKpiCard(
  doc: jsPDF,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    value: string;
    caption?: string;
    valueSuffix?: string;
    accent?: RGB;
  },
) {
  const { x, y, width, height, label, value, caption, valueSuffix, accent = PDF_COLORS.navy } = options;
  doc.setFillColor(...PDF_COLORS.white);
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, 1, 1, "FD");
  doc.setFillColor(...accent);
  doc.rect(x, y, width, 1.3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(label, x + 3.5, y + 4.8, { maxWidth: width - 7 });

  let valueFontSize = 14;
  doc.setFontSize(valueFontSize);
  while (valueFontSize > 8 && doc.getTextWidth(value) > width - 7) {
    valueFontSize -= 0.5;
    doc.setFontSize(valueFontSize);
  }
  const valueY = y + height * 0.72;
  const valueWidth = doc.getTextWidth(value);
  doc.setTextColor(...accent);
  doc.text(value, x + 3.5, valueY);
  if (valueSuffix) {
    doc.setFontSize(7.5);
    doc.text(valueSuffix, x + 3.5 + valueWidth + 2, valueY);
  }
  if (caption) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(caption, x + 3.5, y + height - 2.5, { maxWidth: width - 7 });
  }
}