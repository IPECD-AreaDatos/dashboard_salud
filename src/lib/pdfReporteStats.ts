import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReporteStatsProps {
  tipoEfector: "CAPS" | "SAPS";
  rangoTexto: string;
  padronProvincial: number;
  capital: { TOTAL: number; CAPS: number; SAPS: number; HOSPITAL: number };
  interior: { TOTAL: number; CAPS_SAPS?: number; CAPS?: number; SAPS?: number; HOSPITAL: number };
  totalBase: number;
  totalCtrl: number;
  pctCobertura: string;
  totalAtrasadas: number;
  pctAtrasadas: string;
  porVencerCount: number;
  pctSegAdecuado: string;
  coberturaSalud: { publica: number; obraSocial: number; sinRegistro: number };
  efectores: any[];
  usuarioGenerador: string;
}

// Carga asíncrona de recursos desde /public
const cargarImagen = (url: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export async function generarReporteStatsPDF(props: ReporteStatsProps) {
  const {
    tipoEfector,
    rangoTexto,
    padronProvincial,
    capital,
    interior,
    totalBase,
    totalCtrl,
    pctCobertura,
    totalAtrasadas,
    pctAtrasadas,
    porVencerCount,
    pctSegAdecuado,
    efectores,
    usuarioGenerador
  } = props;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  let currentY = 10;

  const basePath = typeof window !== "undefined" && window.location.pathname.startsWith("/salud-dashboard")
    ? "/salud-dashboard"
    : "";

  // Precarga del isotipo oficial ministerial
  const logoGobierno = await cargarImagen(`${basePath}/logo_nuevo.png`);

  // =========================================================================
  // 1. HEADER INSTITUCIONAL: SegEm BRAND + LOGO GOBIERNO
  // =========================================================================
  const brandX = marginX;
  const brandY = currentY;
  const logoBoxSize = 9.5;
  const logoRadius = 2.4;

  // Caja de isotipo SegEm (#769FD3)
  doc.setFillColor(118, 159, 211);
  doc.roundedRect(brandX, brandY, logoBoxSize, logoBoxSize, logoRadius, logoRadius, "F");

  // Pulso cardíaco blanco (Activity icon)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.85);
  doc.setLineCap("round");
  doc.setLineJoin("round");

  const midY = brandY + logoBoxSize / 2;
  doc.lines(
    [
      [1.7, 0],
      [1.1, -2.7],
      [1.6, 5.4],
      [1.3, -3.7],
      [1.2, 1.0],
      [1.2, 0]
    ],
    brandX + 0.8,
    midY
  );

  // Tipografía SegEm (Extra Bold / Heavy)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(118, 159, 211);      // Relleno celeste (#769FD3)
  doc.setDrawColor(118, 159, 211);     // Contorno celeste (#769FD3)
  doc.setLineWidth(0.45);              // Grosor extra de la letra
  
  // Imprime con modo "fill then stroke" (2) para engrosar el texto
  doc.text("SegEm", brandX + logoBoxSize + 3, brandY + 7.6, { renderingMode: "fillThenStroke" } as any);

  // Logo institucional oficial a la derecha
  if (logoGobierno) {
    const logoW = 86;
    const logoH = 12;
    doc.addImage(logoGobierno, "PNG", pageWidth - marginX - logoW, brandY - 1, logoW, logoH);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(50, 60, 75);
    doc.text("GOBIERNO DE CORRIENTES", pageWidth - marginX, brandY + 2, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Ministerio de Salud Pública · Instituto de Modernización e Innovación", pageWidth - marginX, brandY + 5.5, { align: "right" });
  }

  currentY += 13.5;

  // Línea divisoria
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 4.5;

  // Título y Período
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(`Monitoreo y Cobertura de Embarazos · ${tipoEfector} Capital`, marginX, currentY);

  currentY += 4.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Corte de datos: ${new Date().toLocaleDateString("es-AR")}  |  Período evaluado: ${rangoTexto}  |  Controles en ventana de 40 días`,
    marginX,
    currentY
  );

  currentY += 5.5;

  // =========================================================================
  // 2. BLOQUE PADRÓN PROVINCIAL (IDÉNTICO AL TABLERO WEB)
  // =========================================================================
  const padronCardH = 29;
  const padronCardW = pageWidth - marginX * 2;

  // Contenedor general del Padrón
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, padronCardW, padronCardH, 2, 2, "FD");

  // Columna Izquierda: Total Provincial
  const colIzqW = 44;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("PADRÓN PROVINCIAL", marginX + 4, currentY + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 41, 59);
  doc.text(padronProvincial.toLocaleString("es-AR"), marginX + 4, currentY + 14.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("embarazadas activas", marginX + 4, currentY + 19);

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(`Datos al ${new Date().toLocaleDateString("es-AR")}`, marginX + 4, currentY + 24.5);

  // Línea vertical separadora
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX + colIzqW, currentY + 3, marginX + colIzqW, currentY + padronCardH - 3);

  // Columna Derecha: Barras Proporcionales de Capital e Interior
  const barrasX = marginX + colIzqW + 5;
  const barrasW = padronCardW - colIzqW - 9;
  const pctCap = padronProvincial > 0 ? ((capital.TOTAL * 100) / padronProvincial).toFixed(1).replace(".", ",") : "41,3";
  const pctInt = padronProvincial > 0 ? ((interior.TOTAL * 100) / padronProvincial).toFixed(1).replace(".", ",") : "58,7";
  const intPrimerNivel = interior.CAPS_SAPS ?? ((interior.CAPS || 0) + (interior.SAPS || 0));
  const intHosp = interior.HOSPITAL || 0;

  // --- Barra 1: Capital ---
  let bY = currentY + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text("Capital", barrasX, bY);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${capital.TOTAL.toLocaleString("es-AR")}  (${pctCap}%)`, barrasX + barrasW, bY, { align: "right" });

  bY += 2;
  const barH = 6;
  const capTotal = capital.TOTAL || 1;
  const wCapCaps = Math.max(3, (capital.CAPS / capTotal) * barrasW);
  const wCapSaps = Math.max(3, (capital.SAPS / capTotal) * barrasW);
  const wCapHosp = Math.max(3, barrasW - wCapCaps - wCapSaps);

  // CAPS Capital (#2B4C7E)
  doc.setFillColor(43, 76, 126);
  doc.rect(barrasX, bY, wCapCaps, barH, "F");
  // SAPS Capital (#4E79B5)
  doc.setFillColor(78, 121, 181);
  doc.rect(barrasX + wCapCaps, bY, wCapSaps, barH, "F");
  // Hospitales Capital (#719AD4)
  doc.setFillColor(113, 154, 212);
  doc.rect(barrasX + wCapCaps + wCapSaps, bY, wCapHosp, barH, "F");

  // Rótulos blancos dentro de los segmentos de Capital
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  if (wCapCaps > 15) doc.text(`CAPS ${capital.CAPS}`, barrasX + wCapCaps / 2, bY + 4.2, { align: "center" });
  if (wCapSaps > 15) doc.text(`SAPS ${capital.SAPS}`, barrasX + wCapCaps + wCapSaps / 2, bY + 4.2, { align: "center" });
  if (wCapHosp > 14) doc.text(`Hosp. ${capital.HOSPITAL}`, barrasX + wCapCaps + wCapSaps + wCapHosp / 2, bY + 4.2, { align: "center" });

  // --- Barra 2: Interior ---
  bY += barH + 3.8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text("Interior", barrasX, bY);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${interior.TOTAL.toLocaleString("es-AR")}  (${pctInt}%)`, barrasX + barrasW, bY, { align: "right" });

  bY += 2;
  const intTotal = interior.TOTAL || 1;
  const wIntPrimerNivel = Math.max(3, (intPrimerNivel / intTotal) * barrasW);
  const wIntHosp = Math.max(3, barrasW - wIntPrimerNivel);

  // CAPS/SAPS Interior (#2B4C7E)
  doc.setFillColor(43, 76, 126);
  doc.rect(barrasX, bY, wIntPrimerNivel, barH, "F");
  // Hospitales Interior (#719AD4)
  doc.setFillColor(113, 154, 212);
  doc.rect(barrasX + wIntPrimerNivel, bY, wIntHosp, barH, "F");

  // Rótulos blancos dentro de los segmentos del Interior
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.setTextColor(255, 255, 255);
  if (wIntPrimerNivel > 18) doc.text(`CAPS/SAPS ${intPrimerNivel}`, barrasX + wIntPrimerNivel / 2, bY + 4.2, { align: "center" });
  if (wIntHosp > 18) doc.text(`Hosp. ${intHosp}`, barrasX + wIntPrimerNivel + wIntHosp / 2, bY + 4.2, { align: "center" });

  currentY += padronCardH + 5.5;

  // =========================================================================
  // 3. TARJETAS DE INDICADORES CLAVE DEL EFECTOR (CAPS / SAPS)
  // =========================================================================
  const cardW = (pageWidth - marginX * 2 - 9) / 4;
  const cardH = 20;

  const kpis = [
    {
      label: "CONTROLES AL DÍA",
      val: totalCtrl.toLocaleString("es-AR"),
      pct: `${pctCobertura}%`,
      sub: "En últimos 40 días",
      topColor: [46, 125, 50] as [number, number, number], // Verde
      valColor: [46, 125, 50] as [number, number, number],
    },
    {
      label: "CONTROLES ATRASADOS",
      val: totalAtrasadas.toLocaleString("es-AR"),
      pct: `${pctAtrasadas}%`,
      sub: "Sin control > 40 días",
      topColor: [198, 40, 40] as [number, number, number], // Rojo
      valColor: [198, 40, 40] as [number, number, number],
    },
    {
      label: "POR VENCER SIN TURNO",
      val: porVencerCount.toLocaleString("es-AR"),
      pct: "",
      sub: "Vence en 10 días",
      topColor: [230, 81, 0] as [number, number, number], // Ámbar
      valColor: [230, 81, 0] as [number, number, number],
    },
    {
      label: "SEGUIMIENTO ADECUADO",
      val: pctSegAdecuado,
      pct: "",
      sub: "Pauta según trimestre",
      topColor: [43, 76, 126] as [number, number, number], // Azul institucional
      valColor: [43, 76, 126] as [number, number, number],
    },
  ];

  kpis.forEach((k, i) => {
    const x = marginX + i * (cardW + 3);

    // Fondo blanco con borde tenue
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, currentY, cardW, cardH, 1.8, 1.8, "FD");

    // Filete superior del color del indicador
    doc.setFillColor(...k.topColor);
    doc.roundedRect(x, currentY, cardW, 1.3, 0.6, 0.6, "F");

    // 1. Etiqueta superior
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(k.label, x + 3.5, currentY + 5.2);

    // 2. Número principal en grande
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...k.valColor);
    doc.text(k.val, x + 3.5, currentY + 12.5);

    // 3. Porcentaje al lado con separación garantizada
    if (k.pct) {
      const valorWidth = doc.getTextWidth(k.val);
      const pctX = x + 3.5 + valorWidth + 2.5; // Espaciado de 2.5 mm exactos
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(...k.valColor);
      doc.text(k.pct, pctX, currentY + 12.5);
    }

    

    // Leyenda inferior
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(k.sub, x + 3.2, currentY + 16.8);
  });

  currentY += cardH + 7;

  // =========================================================================
  // 4. TABLA NOMINAL: BARRAS CON PORCENTAJE EN BLANCO
  // =========================================================================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Detalle por ${tipoEfector} - Controles al Día`, marginX, currentY);

  currentY += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text("La barra completa representa el padrón activo; el relleno verde indica las controladas con el % impreso dentro.", marginX, currentY);

  currentY += 2;

  const maxPadron = Math.max(1, ...efectores.map((e) => Number(e.p1 ?? e.padronAct ?? 0)));

  const tableRows = efectores.map((e) => {
    const rawNombre = e.name || e.capsName || "";
    const nombreLimpio = rawNombre.replace(/[""]+/g, '"').trim();

    const pAct = Number(e.p1 ?? e.padronAct ?? 0);
    const cAct = Number(e.ctrlAct ?? e.controladas_act ?? 0);
    const cov = Number(e.cov ?? e.cobAct ?? (pAct > 0 ? (cAct * 100) / pAct : 0));
    const covTxt = e.covTxt || `${cov.toFixed(1).replace(".", ",")}%`;

    return [
      nombreLimpio,
      "", // Espacio donde didDrawCell dibuja la barra con el porcentaje
      `${pAct} (${cAct})`,
      covTxt,
      e.ultimoUsoTexto || "Sin dato",
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX, bottom: 16 },
    head: [[
      `Establecimiento (${tipoEfector})`,
      "Proporción de Cobertura (40 días)",
      "Padrón (Ctrl)",
      "Cobertura",
      "Último Uso"
    ]],
    body: tableRows,
    theme: "grid",
    styles: {
      fontSize: 6.8,
      cellPadding: 1.8,
      valign: "middle",
      lineColor: [241, 245, 249],
      lineWidth: 0.2,
      textColor: [51, 65, 85],
    },
    headStyles: {
      fillColor: [35, 73, 127], // Azul institucional oscuro
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 70, halign: "left", fontStyle: "bold" },
      1: { cellWidth: 54 },
      2: { cellWidth: 22, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 18, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 18, halign: "center" },
    },
    didDrawCell: (dataCell) => {
      // 🌟 DIBUJADO DE BARRA CON ESCALA PROPORCIONAL Y DIFERENCIADA
      if (dataCell.section === "body" && dataCell.column.index === 1) {
        const rowData = efectores[dataCell.row.index];
        if (!rowData) return;

        const p1 = Number(rowData.p1 ?? rowData.padronAct ?? 0);
        const ctrlAct = Number(rowData.ctrlAct ?? rowData.controladas_act ?? 0);
        const covVal = Number(rowData.cov ?? rowData.cobAct ?? (p1 > 0 ? (ctrlAct * 100) / p1 : 0));
        const covTexto = `${covVal.toFixed(1).replace(".", ",")}%`;

        const barX = dataCell.cell.x + 2;
        const barY = dataCell.cell.y + dataCell.cell.height / 2 - 2.5;
        const barMaxW = dataCell.cell.width - 4;
        const barH = 5;

        if (p1 > 0) {
          // 1. Pista de fondo con base mínima de 16mm para dar margen de diferenciación
          const baseTrackW = 16;
          const trackW = baseTrackW + (p1 / maxPadron) * (barMaxW - baseTrackW);
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(barX, barY, trackW, barH, 0.8, 0.8, "F");

          // 2. Relleno verde proporcional a la cobertura real
          let fillW = (ctrlAct / p1) * trackW;
          if (ctrlAct > 0) {
            fillW = Math.max(12, fillW); // Asegura espacio cómodo para el texto
            doc.setFillColor(46, 125, 50); // Verde salud
            doc.roundedRect(barX, barY, Math.min(trackW, fillW), barH, 0.8, 0.8, "F");
          }

          // 3. Texto del porcentaje: siempre en blanco y alineado a la izquierda
          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.5);
          doc.setTextColor(255, 255, 255);
          doc.text(covTexto, barX + 2, barY + 3.5);
        } else {
          // Si no tiene padrón
          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.5);
          doc.setTextColor(148, 163, 184);
          doc.text("0,0%", barX + 2, barY + 3.5);
        }
      }

      // Colores de la columna Cobertura
      if (dataCell.section === "body" && dataCell.column.index === 3) {
        const rowData = efectores[dataCell.row.index];
        if (rowData) {
          const covVal = Number(rowData.cov ?? rowData.cobAct ?? 0);
          if (covVal >= 85) {
            dataCell.cell.styles.textColor = [46, 125, 50]; // Verde
          } else if (covVal >= 70) {
            dataCell.cell.styles.textColor = [217, 119, 6];  // Ámbar
          } else {
            dataCell.cell.styles.textColor = [198, 40, 40];  // Rojo
          }
        }
      }
    },
  });

  // =========================================================================
  // 5. PIE DE PÁGINA Y NOTAS METODOLÓGICAS (EN TODAS LAS PÁGINAS)
  // =========================================================================
  const totalPages = (doc as any).internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    if (i === totalPages) {
      const finalY = (doc as any).lastAutoTable.finalY + 5;
      if (finalY < pageHeight - 15) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text("Aclaración metodológica y reglas de conteo oficial:", marginX, finalY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.setTextColor(100, 116, 139);
        doc.text("• Cobertura: controles registrados en los últimos 40 días sobre total de embarazadas en padrón activo.", marginX, finalY + 3.2);
        doc.text("• Derivaciones: no se computan al efector barrial las pacientes derivadas a maternidades u hospitales cabecera.", marginX, finalY + 6.2);
        doc.text("• Fuente oficial: Padrón SUMAR y base nominal provincial POF conciliada en SegEm.", marginX, finalY + 9.2);
      }
    }

    // Línea divisoria de pie
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 9, pageWidth - marginX, pageHeight - 9);

    // Metadatos
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `SegEm · Corte ${new Date().toLocaleDateString("es-AR")} | Generado por: ${usuarioGenerador || "Administrador"}`,
      marginX,
      pageHeight - 5.5
    );

    doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginX, pageHeight - 5.5, { align: "right" });
  }

  // Descarga del PDF
  const fechaStr = new Date().toISOString().split("T")[0];
  doc.save(`SegEm_Reporte_${tipoEfector}_${fechaStr}.pdf`);
}