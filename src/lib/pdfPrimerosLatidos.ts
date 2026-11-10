import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  // ---------------------------------------------------------------------------
  // 1. CABECERA INSTITUCIONAL LIMPIA
  // ---------------------------------------------------------------------------
  const brandX = margin;
  const brandY = 10;
  const logoBoxSize = 9;

  // Cuadrado del logo SegEm
  doc.setFillColor(118, 159, 211);
  doc.roundedRect(brandX, brandY, logoBoxSize, logoBoxSize, 2, 2, "F");

  // Pulso blanco
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.7);
  doc.lines(
    [
      [1.5, 0],
      [1.0, -2.8],
      [1.5, 5.2],
      [1.4, -4.0],
      [1.0, 1.6],
      [1.6, 0],
    ],
    brandX + 0.8,
    brandY + logoBoxSize / 2
  );

  // Tipografía SegEm sólida (modo fill puro)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(118, 159, 211);
  doc.text("SegEm", brandX + logoBoxSize + 3, brandY + 7.2);

  // Título
  doc.setFontSize(13);
  doc.setTextColor(43, 76, 126);
  doc.text("Primeros Latidos — Padrón y Control de Prestaciones", brandX + logoBoxSize + 30, brandY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Auditoría de controles prenatales para asignación, suspensión o continuidad del beneficio", brandX + logoBoxSize + 30, brandY + 8.5);

  // Metadatos derecha
  doc.setFontSize(7.5);
  doc.text(`Fecha de corte: ${fechaHoy} ${horaHoy} hs`, pageWidth - margin, brandY + 4, { align: "right" });
  doc.text(`Operador: ${usuarioGenerador || "Administrador"}`, pageWidth - margin, brandY + 8, { align: "right" });

  // ---------------------------------------------------------------------------
  // 2. CARDS DE KPIS CORREGIDAS (SIN LETRAS SEPARADAS)
  // ---------------------------------------------------------------------------
  const cardY = 21;
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
      color: [43, 76, 126],
      bg: [248, 250, 252],
      borderColor: [203, 213, 225],
    },
    {
      label: "APTAS (<= 40 DÍAS)",
      val: aptas40.toLocaleString("es-AR"),
      sub: `${pct40}% del padrón`,
      color: [21, 128, 61],
      bg: [240, 253, 244],
      borderColor: [187, 247, 208],
    },
    {
      label: "APTAS (<= 60 DÍAS)",
      val: aptas60.toLocaleString("es-AR"),
      sub: `${pct60}% ventana flexible`,
      color: [29, 78, 216],
      bg: [239, 246, 255],
      borderColor: [191, 219, 254],
    },
    {
      label: "APTAS (<= 90 DÍAS)",
      val: aptas90.toLocaleString("es-AR"),
      sub: `${pct90}% ventana extendida`,
      color: [126, 34, 206],
      bg: [250, 245, 255],
      borderColor: [233, 213, 255],
    },
    {
      label: "INACTIVAS / SIN CTRL",
      val: noAptas.toLocaleString("es-AR"),
      sub: "Atraso > 90d o S/D",
      color: [100, 116, 139],
      bg: [248, 250, 252],
      borderColor: [226, 232, 240],
    },
  ];

  cardsData.forEach((c, idx) => {
    const x = margin + idx * (cardWidth + gap);

    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    doc.setDrawColor(c.borderColor[0], c.borderColor[1], c.borderColor[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    doc.text(c.label, x + 3.5, cardY + 4.2);

    // Número
    doc.setFontSize(13);
    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    doc.text(c.val, x + 3.5, cardY + 10.3);

    // Subtítulo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, x + 3.5, cardY + 14.3);
  });

  // ---------------------------------------------------------------------------
  // 3. BARRA DE FILTROS DETALLADA (LISTA TODOS LOS MUNICIPIOS)
  // ---------------------------------------------------------------------------
  const filtroY = cardY + cardHeight + 3.5;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, filtroY, contentWidth, 7, 1.2, 1.2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(43, 76, 126);
  doc.text("Filtros aplicados:", margin + 3.5, filtroY + 4.7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

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
  doc.setTextColor(43, 76, 126);
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
      fillColor: [69, 106, 157], // #456A9D SegEm
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 1.8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
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
          dataCell.cell.styles.textColor = [21, 128, 61];
          dataCell.cell.styles.fontStyle = "bold";
        } else if (val.includes("Atraso")) {
          dataCell.cell.styles.textColor = [180, 83, 9];
        } else if (val.includes("Severo") || val.includes("Crítico")) {
          dataCell.cell.styles.textColor = [185, 28, 28];
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
      doc.setTextColor(148, 163, 184);

      doc.text("SegEm · Programa Provincial Primeros Latidos · Ministerio de Salud Pública de Corrientes", margin, pageHeight - 6);
      doc.text(strPagina, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
  });

  const fechaDescarga = new Date().toISOString().split("T")[0];
  doc.save(`Primeros_Latidos_Reporte_${fechaDescarga}.pdf`);
}