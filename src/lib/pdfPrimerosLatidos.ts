import jsPDF from "jspdf";
import { drawPdfBrandHeader, drawPdfKpiCard, drawPdfTitleBlock, loadPdfInstitutionalLogo, PDF_COLORS, styledAutoTable as autoTable } from "./pdfTheme";

export interface ReportePrimerosLatidosProps {
  kpis: {
    total_activas?: number;
    aptas_40?: number;
    aptas_60?: number;
    aptas_90?: number;
    no_aptas_mas_90?: number;
  };
  filtros: {
    corteTexto: string;
    zonaTexto: string;
    deptosTexto: string;
    busquedaTexto?: string;
  };
  pacientes: any[];
  totalResultados: number;
  usuarioGenerador?: string;
}

// Helper para normalizar caracteres corruptos y evitar desbordes
function sanitizeText(str: string): string {
  if (!str) return "";
  return str
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[""]+/g, '"')
    .replace(/Ã©/g, "é")
    .replace(/Ã¡/g, "á")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã‘/g, "Ñ")
    .replace(/Â/g, "")
    .trim();
}

export async function generarReportePrimerosLatidosPDF(props: ReportePrimerosLatidosProps) {
  const { kpis, filtros, pacientes, totalResultados, usuarioGenerador } = props;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 273 mm

  const fechaHoy = new Date().toLocaleDateString("es-AR");
  const horaHoy = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  const logoInstitucional = await loadPdfInstitutionalLogo();
  drawPdfBrandHeader(doc, logoInstitucional, margin, [
    `Fecha de corte: ${fechaHoy} ${horaHoy} hs`,
    `Operador: ${usuarioGenerador || "Administrador"}`,
  ]);
  const titleBottomY = drawPdfTitleBlock(
    doc,
    "Primeros Latidos — Padrón y Control de Prestaciones",
    "Auditoría de controles prenatales para asignación, suspensión o continuidad del beneficio",
    margin,
  );

  // ---------------------------------------------------------------------------
  // 2. CARDS DE KPIS CORREGIDAS (SIN LETRAS SEPARADAS)
  // ---------------------------------------------------------------------------
  const cardY = titleBottomY + 1;
  const cardHeight = 16.5;
  const gap = 3.5;
  const cardWidth = (contentWidth - gap * 4) / 5;

  const totalActivas = Number(kpis.total_activas || 0);
  const aptas40 = Number(kpis.aptas_40 || 0);
  const aptas60 = Number(kpis.aptas_60 || 0);
  const aptas90 = Number(kpis.aptas_90 || 0);
  const noAptas = Number(kpis.no_aptas_mas_90 || 0);

  const pct40 = totalActivas > 0 ? ((aptas40 * 100) / totalActivas).toFixed(1).replace(".", ",") : "0";
  const pct60 = totalActivas > 0 ? ((aptas60 * 100) / totalActivas).toFixed(1).replace(".", ",") : "0";
  const pct90 = totalActivas > 0 ? ((aptas90 * 100) / totalActivas).toFixed(1).replace(".", ",") : "0";

  const cardsData = [
    {
      label: "TOTAL PADRÓN ACTIVO",
      val: totalActivas.toLocaleString("es-AR"),
      sub: "Universo provincial",
      color: PDF_COLORS.navy,
    },
    {
      label: "APTAS (<= 40 DÍAS)",
      val: aptas40.toLocaleString("es-AR"),
      sub: `${pct40}% del padrón`,
      color: PDF_COLORS.green,
    },
    {
      label: "APTAS (<= 60 DÍAS)",
      val: aptas60.toLocaleString("es-AR"),
      sub: `${pct60}% ventana flexible`,
      color: PDF_COLORS.navy,
    },
    {
      label: "APTAS (<= 90 DÍAS)",
      val: aptas90.toLocaleString("es-AR"),
      sub: `${pct90}% ventana extendida`,
      color: PDF_COLORS.amber,
    },
    {
      label: "INACTIVAS / SIN CTRL",
      val: noAptas.toLocaleString("es-AR"),
      sub: "Atraso > 90d o S/D",
      color: PDF_COLORS.red,
    },
  ];

  cardsData.forEach((c, idx) => {
    const x = margin + idx * (cardWidth + gap);
    drawPdfKpiCard(doc, {
      x,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      label: c.label,
      value: c.val,
      caption: c.sub,
      accent: c.color,
    });
  });

  // ---------------------------------------------------------------------------
  // 3. BARRA DE FILTROS DETALLADA (LISTA TODOS LOS MUNICIPIOS)
  // ---------------------------------------------------------------------------
  const filtroY = cardY + cardHeight + 3.5;
  doc.setFillColor(...PDF_COLORS.row);
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, filtroY, contentWidth, 7, 1.2, 1.2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text("Filtros aplicados:", margin + 3.5, filtroY + 4.7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.text);

  const deptoLimpio = sanitizeText(filtros.deptosTexto);
  const corteLimpio = sanitizeText(filtros.corteTexto);
  let textoFiltro = `Corte: ${corteLimpio}  |  Zona: ${filtros.zonaTexto}  |  Municipios: ${deptoLimpio}`;
  
  if (filtros.busquedaTexto) {
    textoFiltro += `  |  Búsqueda: "${sanitizeText(filtros.busquedaTexto)}"`;
  }

  // Si el texto de municipios es largo, recortamos suavemente con ellipsis para que no pise el contador
  const maxChars = 145;
  const textoVisible = textoFiltro.length > maxChars ? `${textoFiltro.substring(0, maxChars)}...` : textoFiltro;
  doc.text(textoVisible, margin + 26, filtroY + 4.7);

  // Contador de registros a la derecha
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(`Listado: ${totalResultados.toLocaleString("es-AR")} beneficiarias`, pageWidth - margin - 3.5, filtroY + 4.7, { align: "right" });

  // ---------------------------------------------------------------------------
  // 4. TABLA NOMINAL (AutoTable)
  // ---------------------------------------------------------------------------
  const tableRows = pacientes.map((p) => {
    const dias = p.dias_ultimo_control;
    let estadoTexto = "Al día (Apta)";
    if (dias === null) {
      estadoTexto = "Sin control";
    } else if (dias > 90) {
      estadoTexto = "Crítico (>90d)";
    } else if (dias > 60) {
      estadoTexto = "Severo (>60d)";
    } else if (dias > 40) {
      estadoTexto = "Atraso (>40d)";
    }

    const fechaFpp = p.fecha_probable_parto ? new Date(p.fecha_probable_parto).toLocaleDateString("es-AR") : "-";
    const fechaCtrl = p.fecha_ultimo_control ? new Date(p.fecha_ultimo_control).toLocaleDateString("es-AR") : "Sin registro";
    const diasTxt = dias !== null ? `${dias} d` : "-";
    const nombreCompleto = sanitizeText(`${p.apellido || ""}, ${p.nombre || ""}`);

    return [
      p.dni || "-",
      nombreCompleto,
      fechaFpp,
      fechaCtrl,
      diasTxt,
      estadoTexto,
      sanitizeText(p.nombre_establecimiento || "-"),
      sanitizeText(p.localidad || "-"),
      sanitizeText(p.telefono || "-"),
    ];
  });

  autoTable(doc, {
    startY: filtroY + 9,
    margin: { left: margin, right: margin, bottom: 12 },
    head: [
      [
        "DNI",
        "Paciente / Beneficiaria",
        "FPP",
        "Último Control",
        "Días",
        "Estado Prestación",
        "Establecimiento",
        "Localidad",
        "Teléfono",
      ],
    ],
    body: tableRows,
    theme: "striped",
    headStyles: {
      fillColor: PDF_COLORS.navy,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: PDF_COLORS.text,
      cellPadding: 1.8,
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.row,
    },
    columnStyles: {
      0: { cellWidth: 20, fontStyle: "bold" },
      1: { cellWidth: 52 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 28, halign: "center" },
      6: { cellWidth: 60 },
      7: { cellWidth: 32 },
      8: { cellWidth: 25 },
    },
    didParseCell: (dataCell) => {
      if (dataCell.section === "body" && dataCell.column.index === 5) {
        const val = String(dataCell.cell.raw);
        if (val.includes("Apta")) {
          dataCell.cell.styles.textColor = PDF_COLORS.green;
          dataCell.cell.styles.fontStyle = "bold";
        } else if (val.includes("Atraso")) {
          dataCell.cell.styles.textColor = PDF_COLORS.amber;
        } else if (val.includes("Severo") || val.includes("Crítico")) {
          dataCell.cell.styles.textColor = PDF_COLORS.red;
          dataCell.cell.styles.fontStyle = "bold";
        } else {
          dataCell.cell.styles.textColor = [100, 116, 139];
        }
      }
    },
    didDrawPage: (dataPage) => {
      const strPagina = `Página ${dataPage.pageNumber} de ${doc.getNumberOfPages()}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_COLORS.muted);

      doc.text("SegEm · Programa Provincial Primeros Latidos · Ministerio de Salud Pública de Corrientes", margin, pageHeight - 6);
      doc.text(strPagina, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
  });

  const fechaDescarga = new Date().toISOString().split("T")[0];
  doc.save(`Primeros_Latidos_Reporte_${fechaDescarga}.pdf`);
}