import jsPDF from "jspdf";
import type { CellHookData } from "jspdf-autotable";
import { drawPdfBrandHeader, drawPdfKpiCard, drawPdfSectionTitle, loadPdfInstitutionalLogo, PDF_COLORS as colors, styledAutoTable as autoTable } from "./pdfTheme";

type TerritorialRow = {
  nombre: string;
  departamento?: string;
  localidad?: string;
  embarazos: number;
  controladas: number;
  efectores?: number;
};

type TopInteriorRow = Omit<TerritorialRow, "nombre"> & {
  codigoSisa: string;
  efector: string;
  localidad: string;
};

type TerritorialData = {
  fechaCorte: string | null;
  ventanaInicio: string | null;
  batchId: string | null;
  fuenteBatchEtl: string | null;
  resumen: {
    embarazos: number;
    controladas: number;
    cobertura: number;
    efectoresConEmbarazos: number;
    efectoresConControl: number;
    codigosSinCatalogo: number;
    embarazosSinSisa: number;
    controladasSinSisa: number;
  };
  conciliacion: {
    embarazosVigentes: number;
    controladasVigentes: number;
    diferenciaEmbarazos: number;
    diferenciaControladas: number;
  };
  departamentos: TerritorialRow[];
  localidades: TerritorialRow[];
  topInterior: TopInteriorRow[];
};

const formatNumber = (value: number) => value.toLocaleString("es-AR");
const formatPercent = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const formatDifference = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value)}`;

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin dato";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function coverage(row: Pick<TerritorialRow, "embarazos" | "controladas">) {
  return row.embarazos > 0 ? (row.controladas * 100) / row.embarazos : 0;
}

export async function generarReporteTerritorialPDF(data: TerritorialData, rangoTexto = "") {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 13;
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = new Date();
  const generatedDate = generatedAt.toLocaleDateString("es-AR");
  const generatedTime = generatedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const logoInstitucional = await loadPdfInstitutionalLogo();
  const windowLabel = data.ventanaInicio && data.fechaCorte
    ? `${formatDate(data.ventanaInicio)} al ${formatDate(data.fechaCorte)}`
    : rangoTexto || "Sin ventana informada";

  doc.setProperties({
    title: "Alcance territorial del seguimiento de embarazos",
    subject: `Corte ${formatDate(data.fechaCorte)}`,
    author: "SegEm · Ministerio de Salud Pública de Corrientes",
  });

  const addHeader = () => {
    drawPdfBrandHeader(doc, logoInstitucional, margin, [`Corte ${formatDate(data.fechaCorte)} · Controles ${windowLabel}`]);
  };

  const addSectionTitle = (title: string, subtitle?: string) => {
    const y = 33;
    drawPdfSectionTitle(doc, title, margin, y, subtitle, 15);
  };

  const addFooter = () => {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      doc.setDrawColor(...colors.rule);
      doc.setLineWidth(0.35);
      doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...colors.muted);
      doc.text("La falta de control reportado no demuestra ausencia de atención. No incluye HCE.", margin, pageHeight - 8);
      doc.text(`Generado ${generatedDate} ${generatedTime} · ${page}/${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }
  };

  const coverageBar = (coverageValues: number[], coverageColumn = 3) => ({
    didDrawCell: ({ doc: tableDoc, column, row, cell }: CellHookData) => {
      if (row.section !== "body" || column.index !== coverageColumn) return;
      const value = Math.max(0, Math.min(100, coverageValues[row.index] || 0));
      const x = cell.x + 3;
      const y = cell.y + cell.height - 1.7;
      const width = Math.max(2, cell.width - 6);
      tableDoc.setFillColor(...colors.paleBlue);
      tableDoc.rect(x, y, width, 1, "F");
      tableDoc.setFillColor(...colors.green);
      tableDoc.rect(x, y, width * value / 100, 1, "F");
    },
  });

  addHeader();
  addSectionTitle("Alcance territorial del seguimiento de embarazos", `Provincia de Corrientes · Corte ${formatDate(data.fechaCorte)} · Controles reportados del ${windowLabel}`);

  const summaryY = 48;
  const summaryGap = 4;
  const summaryWidth = (contentWidth - summaryGap * 2) / 3;
  const coverageValue = data.resumen.embarazos > 0
    ? (data.resumen.controladas * 100) / data.resumen.embarazos
    : 0;
  const summaryCards = [
    { label: "EMBARAZOS EN CURSO", value: formatNumber(data.resumen.embarazos), color: colors.navy },
    { label: "CONTROLADAS EN VENTANA", value: formatNumber(data.resumen.controladas), color: colors.green },
    { label: "COBERTURA REPORTADA", value: formatPercent(coverageValue), color: colors.navy },
  ];

  summaryCards.forEach((card, index) => {
    const x = margin + index * (summaryWidth + summaryGap);
    drawPdfKpiCard(doc, {
      x,
      y: summaryY,
      width: summaryWidth,
      height: 24,
      label: card.label,
      value: card.value,
      accent: card.color,
    });
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.muted);
  doc.text(
    `${formatNumber(data.resumen.efectoresConControl)} de ${formatNumber(data.resumen.efectoresConEmbarazos)} centros de origen tuvieron al menos una controlada en la ventana.`,
    margin,
    78
  );

  const departmentCoverage = data.departamentos.map(coverage);
  const departmentTotals = data.departamentos.reduce((totals, row) => ({
    embarazos: totals.embarazos + row.embarazos,
    controladas: totals.controladas + row.controladas,
    efectores: totals.efectores + (row.efectores || 0),
  }), { embarazos: 0, controladas: 0, efectores: 0 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...colors.navy);
  doc.text("Embarazos en curso por departamento", margin, 85);
  autoTable(doc, {
    tableWidth: "wrap",
    startY: 89,
    margin: { left: margin, right: margin, bottom: 17, top: 28 },
    head: [["Departamento", "En curso", "Controladas", "Cobertura", "Efectores"]],
    body: data.departamentos.map((row, index) => [
      row.nombre,
      formatNumber(row.embarazos),
      formatNumber(row.controladas),
      formatPercent(departmentCoverage[index]),
      formatNumber(row.efectores || 0),
    ]),
    foot: [[
      "TOTAL PROVINCIAL",
      formatNumber(departmentTotals.embarazos),
      formatNumber(departmentTotals.controladas),
      formatPercent(coverage({ embarazos: departmentTotals.embarazos, controladas: departmentTotals.controladas })),
      formatNumber(departmentTotals.efectores),
    ]],
    theme: "striped",
    footStyles: { fillColor: [229, 236, 243], textColor: colors.navy, fontSize: 7.5, fontStyle: "bold" },
    headStyles: { fillColor: colors.navy, fontSize: 7.2, fontStyle: "bold", cellPadding: 1.5 },
    bodyStyles: { fontSize: 7.2, textColor: colors.text, cellPadding: 1.4 },
    alternateRowStyles: { fillColor: [243, 246, 249] },
    columnStyles: {
      0: { cellWidth: 74, fontStyle: "bold" },
      1: { cellWidth: 28, halign: "right" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 34, halign: "right", fontStyle: "bold" },
      4: { cellWidth: 20, halign: "right" },
    },
    didDrawPage: () => addHeader(),
    ...coverageBar(departmentCoverage),
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...colors.muted);
  doc.text(
    `Fuente: snapshot final ${data.batchId || "sin identificador de lote"}. La asignación territorial se realiza con efectores_sisa; los territorios no identificados se conservan.`,
    margin,
    pageHeight - 18,
    { maxWidth: contentWidth }
  );

  doc.addPage();
  addHeader();
  addSectionTitle("Cobertura reportada por localidad", `${data.localidades.length} localidades · orden provincial por embarazos en curso`);
  const localityCoverage = data.localidades.map(coverage);
  const localityTotals = data.localidades.reduce((totals, row) => ({
    embarazos: totals.embarazos + row.embarazos,
    controladas: totals.controladas + row.controladas,
  }), { embarazos: 0, controladas: 0 });
  autoTable(doc, {
    tableWidth: "wrap",
    startY: 42,
    margin: { left: margin, right: margin, bottom: 17, top: 28 },
    head: [["Localidad", "Departamento", "En curso", "Controladas", "Cobertura"]],
    body: data.localidades.map((row, index) => [
      row.nombre,
      row.departamento || "Sin departamento",
      formatNumber(row.embarazos),
      formatNumber(row.controladas),
      formatPercent(localityCoverage[index]),
    ]),
    foot: [[
      "TOTAL PROVINCIAL",
      "",
      formatNumber(localityTotals.embarazos),
      formatNumber(localityTotals.controladas),
      formatPercent(coverage(localityTotals)),
    ]],
    showHead: "everyPage",
    showFoot: "lastPage",
    theme: "striped",
    headStyles: { fillColor: colors.navy, fontSize: 7.5, fontStyle: "bold" },
    footStyles: { fillColor: [229, 236, 243], textColor: colors.navy, fontSize: 7.2, fontStyle: "bold" },
    bodyStyles: { fontSize: 7.2, textColor: colors.text, cellPadding: 1.8 },
    alternateRowStyles: { fillColor: [243, 246, 249] },
    columnStyles: {
      0: { cellWidth: 54, fontStyle: "bold" },
      1: { cellWidth: 50 },
      2: { cellWidth: 23, halign: "right" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 31, halign: "right", fontStyle: "bold" },
    },
    didDrawPage: () => addHeader(),
    ...coverageBar(localityCoverage, 4),
  });

  doc.addPage();
  addHeader();
  addSectionTitle("Top 20 efectores del Interior", "Departamentos fuera de Capital · orden por embarazos en curso");
  const topRows = data.topInterior;
  const topCoverage = topRows.map(coverage);
  const topTotals = topRows.reduce((totals, row) => ({
    embarazos: totals.embarazos + row.embarazos,
    controladas: totals.controladas + row.controladas,
  }), { embarazos: 0, controladas: 0 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.text);
  doc.text(
    `En conjunto, estos ${formatNumber(topRows.length)} efectores suman ${formatNumber(topTotals.embarazos)} embarazos y ${formatNumber(topTotals.controladas)} controladas.`,
    margin,
    43
  );
  autoTable(doc, {
    tableWidth: "wrap",
    startY: 47,
    margin: { left: margin, right: margin, bottom: 17, top: 28 },
    head: [["Efector", "Localidad / departamento", "En curso", "Controladas", "Cobertura"]],
    body: topRows.map((row, index) => [
      row.efector,
      `${row.localidad} · ${row.departamento}`,
      formatNumber(row.embarazos),
      formatNumber(row.controladas),
      formatPercent(topCoverage[index]),
    ]),
    theme: "striped",
    headStyles: { fillColor: colors.navy, fontSize: 7.2, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: colors.text, cellPadding: 1.4 },
    alternateRowStyles: { fillColor: [243, 246, 249] },
    columnStyles: {
      0: { cellWidth: 54, fontStyle: "bold" },
      1: { cellWidth: 59 },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 27, halign: "right", fontStyle: "bold" },
    },
    didDrawPage: () => addHeader(),
    didDrawCell: ({ doc: tableDoc, column, row, cell }: CellHookData) => {
      if (row.section !== "body" || column.index !== 4) return;
      const value = Math.max(0, Math.min(100, topCoverage[row.index] || 0));
      const x = cell.x + 3;
      const y = cell.y + cell.height - 1.7;
      const width = Math.max(2, cell.width - 6);
      tableDoc.setFillColor(...colors.paleBlue);
      tableDoc.rect(x, y, width, 1, "F");
      tableDoc.setFillColor(...colors.green);
      tableDoc.rect(x, y, width * value / 100, 1, "F");
    },
  });

  doc.addPage();
  addHeader();
  addSectionTitle("Alcance por centro de origen", "Conteo de centros identificados con embarazos en curso en el snapshot");
  const sourceRows = [
    ["Embarazos en curso · snapshot final", formatNumber(data.resumen.embarazos)],
    ["Controladas en ventana · snapshot final", formatNumber(data.resumen.controladas)],
    ["Embarazos vigentes · pacientes_gold al exportar", formatNumber(data.conciliacion.embarazosVigentes)],
    ["Controladas vigentes · pacientes_gold al exportar", formatNumber(data.conciliacion.controladasVigentes)],
    ["Diferencia snapshot − padrón vigente · embarazos", formatDifference(data.conciliacion.diferenciaEmbarazos)],
    ["Diferencia snapshot − padrón vigente · controladas", formatDifference(data.conciliacion.diferenciaControladas)],
    ["Centros de origen con embarazos en snapshot", formatNumber(data.resumen.efectoresConEmbarazos)],
    ["Centros con al menos una controlada reportada", formatNumber(data.resumen.efectoresConControl)],
    ["Códigos SISA sin coincidencia en efectores_sisa", formatNumber(data.resumen.codigosSinCatalogo)],
    ["Embarazos sin código SISA de origen", formatNumber(data.resumen.embarazosSinSisa)],
    ["Controladas entre embarazos sin SISA", formatNumber(data.resumen.controladasSinSisa)],
  ];
  let sourceTableEndY = 44;
  autoTable(doc, {
    tableWidth: "wrap",
    startY: 44,
    margin: { left: margin, right: margin, bottom: 17, top: 28 },
    head: [["Identificación del origen", "Cantidad"]],
    body: sourceRows,
    theme: "striped",
    headStyles: { fillColor: colors.navy, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: colors.text, cellPadding: 3 },
    alternateRowStyles: { fillColor: [243, 246, 249] },
    columnStyles: { 0: { cellWidth: 135, fontStyle: "bold" }, 1: { cellWidth: 49, halign: "right" } },
    didDrawPage: ({ cursor }) => {
      if (cursor) sourceTableEndY = cursor.y;
      addHeader();
    },
  });

  const finalY = sourceTableEndY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...colors.navy);
  doc.text("Criterios y salvedades", margin, finalY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...colors.text);
  const notes = [
    `Fuente territorial: snapshot final ${data.batchId || "sin lote informado"}; lote de ETL fuente ${data.fuenteBatchEtl || "no informado"}. Corte ${formatDate(data.fechaCorte)} y ventana de controles ${windowLabel}.`,
    "Las tablas territoriales usan exclusivamente el snapshot. La conciliación con pacientes_gold se presenta aparte: las diferencias no se suman ni se asignan a centros.",
    "Departamento y localidad se asignan por el efector SISA del snapshot, no por el domicilio. Las derivaciones se presentan según la atribución ya registrada en el corte.",
    "Cobertura = controladas reportadas en ventana / embarazos en curso. La falta de control reportado no demuestra ausencia de atención.",
    "Base consolidada de la red MSP; controles reportados en POF. No incluye HCE, conforme al alcance informado para este reporte.",
    "Se conservan los territorios no identificados. El informe es un panorama de registros disponibles; no es un padrón completo ni valida requisitos individuales para ayudas.",
  ];
  let noteY = finalY + 6;
  notes.forEach((note) => {
    const lines = doc.splitTextToSize(`• ${note}`, contentWidth);
    doc.text(lines, margin, noteY);
    noteY += lines.length * 4 + 2;
  });

  addFooter();
  const dateStamp = String(data.fechaCorte || generatedAt.toISOString()).slice(0, 10);
  doc.save(`SegEm_Alcance_Territorial_${dateStamp}.pdf`);
}