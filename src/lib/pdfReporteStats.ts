interface ReporteDataProps {
  tipoEfector: "CAPS" | "SAPS";
  rangoTexto: string;
  padronProvincial: number;
  capital: { TOTAL: number; CAPS: number; SAPS: number; HOSPITAL: number };
  interior: { TOTAL: number; CAPS: number; SAPS: number; HOSPITAL: number };
  totalBase: number;
  totalCtrl: number;
  pctCobertura: string;
  totalAtrasadas: number;
  pctAtrasadas: string;
  porVencerCount: number;
  pctSegAdecuado: string;
  coberturaSalud: { publica: number; obraSocial: number; sinRegistro: number };
  efectores: any[];
  usuarioGenerador?: string;
}

// Helper para convertir imágenes de /public a Base64 sin romper SSR
async function cargarImagenBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generarReporteStatsPDF({
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
  coberturaSalud,
  efectores,
  usuarioGenerador = "Administrador"
}: ReporteDataProps) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // Paleta oficial de reportes SegEm / Tony
  const cAzulHeader: [number, number, number] = [30, 58, 110];      // #1E3A6E
  const cVerde: [number, number, number] = [34, 115, 45];          // #22732D
  const cRojo: [number, number, number] = [185, 28, 28];           // #B91C1C
  const cAmbar: [number, number, number] = [217, 119, 6];          // #D97706
  const cAzulPetroleo: [number, number, number] = [29, 78, 137];   // #1D4E89
  const cGrisBarra: [number, number, number] = [225, 233, 240];    // Fondo barra no controlada
  const cTexto: [number, number, number] = [33, 37, 41];
  const cMuted: [number, number, number] = [108, 117, 125];
  const cBorder: [number, number, number] = [222, 226, 230];

  const basePath = window.location.pathname.startsWith("/salud-dashboard") ? "/salud-dashboard" : "";

  // Intentamos cargar el logo oficial de la provincia
  const logoData = await cargarImagenBase64(`${basePath}/logo_nuevo.png`) || 
                   await cargarImagenBase64(`${basePath}/encabezados.png`);

  let currentY = 10;

  // ==========================================
  // 1. CABECERA INSTITUCIONAL
  // ==========================================
  if (logoData) {
    try {
      // Si cargó logo_nuevo.png, lo renderizamos proporcional
      doc.addImage(logoData, "PNG", 14, currentY, 85, 12, undefined, "FAST");
    } catch {
      // Fallback tipográfico institucional si falla la imagen
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...cTexto);
      doc.text("GOBIERNO DE CORRIENTES · MSP · IMI", 14, currentY + 6);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...cTexto);
    doc.text("GOBIERNO DE CORRIENTES · MINISTERIO DE SALUD PÚBLICA · IMI", 14, currentY + 6);
  }

  currentY += 16;

  // Título SegEm estilo Informe Provincial
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...cAzulHeader);
  doc.text("SegEm", 14, currentY);

  doc.setFontSize(12);
  doc.setTextColor(...cTexto);
  doc.text(`Monitoreo y Cobertura de Embarazos · ${tipoEfector} Capital`, 14, currentY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...cMuted);
  doc.text(`Corte de datos: ${new Date().toLocaleDateString("es-AR")} | Período: ${rangoTexto} | Controles en ventana de 40 días`, 14, currentY + 10.5);

  currentY += 15;

  // ==========================================
  // 2. CARDS SUPERIORES CON FRANJA DE COLOR (ESTILO TONY)
  // ==========================================
  const cardW = 43.5;
  const cardH = 22;
  const gap = 2.6;

  interface MiniCard {
    titulo: string;
    valor: string;
    sub: string;
    color: [number, number, number];
  }

  const cardsFila1: MiniCard[] = [
    {
      titulo: `PADRÓN ${tipoEfector}`,
      valor: totalBase.toLocaleString("es-AR"),
      sub: "Bajo seguimiento activo",
      color: cAzulPetroleo
    },
    {
      titulo: "CONTROLADAS EN 40 DÍAS",
      valor: totalCtrl.toLocaleString("es-AR"),
      sub: `${pctCobertura}% de cobertura`,
      color: cVerde
    },
    {
      titulo: "CONTROLES ATRASADOS",
      valor: totalAtrasadas.toLocaleString("es-AR"),
      sub: `${pctAtrasadas}% sin control`,
      color: cRojo
    },
    {
      titulo: "POR VENCER (10 DÍAS)",
      valor: porVencerCount.toLocaleString("es-AR"),
      sub: "Sin turno asignado",
      color: cAmbar
    }
  ];

  cardsFila1.forEach((c, i) => {
    const x = 14 + i * (cardW + gap);
    
    // Fondo de la card y borde
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...cBorder);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, currentY, cardW, cardH, 1.5, 1.5, "FD");

    // Franja superior de color característica de Tony
    doc.setFillColor(...c.color);
    doc.roundedRect(x, currentY, cardW, 2.5, 1, 1, "F");

    // Textos internos
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...cMuted);
    doc.text(c.titulo, x + 3.5, currentY + 6.5);

    doc.setFontSize(14);
    doc.setTextColor(...cTexto);
    doc.text(c.valor, x + 3.5, currentY + 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...cMuted);
    doc.text(c.sub, x + 3.5, currentY + 19);
  });

  currentY += cardH + 7;

  // ==========================================
  // 3. SECCIÓN: CONTEXTO PROVINCIAL Y CAPITAL
  // ==========================================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...cAzulHeader);
  doc.text("Distribución General y Cobertura de Salud", 14, currentY);

  currentY += 3;

  autoTable(doc, {
    startY: currentY,
    theme: "plain",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: cTexto,
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "center"
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: cTexto,
      halign: "center",
      cellPadding: 1.8
    },
    head: [["Padrón Provincial", "Total Capital", `CAPS Cap.`, `SAPS Cap.`, `Hosp. Cap.`, "Total Interior", "Pública Exclusiva", "Con Obra Social"]],
    body: [[
      padronProvincial.toLocaleString("es-AR"),
      capital.TOTAL.toLocaleString("es-AR"),
      capital.CAPS.toString(),
      capital.SAPS.toString(),
      capital.HOSPITAL.toString(),
      interior.TOTAL.toLocaleString("es-AR"),
      `${coberturaSalud.publica}%`,
      `${coberturaSalud.obraSocial}%`
    ]],
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // ==========================================
  // 4. DETALLE DE EFECTORES CON BARRAS HORIZONTALES (FORMATO TONY)
  // ==========================================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...cAzulHeader);
  doc.text(`Detalle por ${tipoEfector} - Controles al Día`, 14, currentY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...cMuted);
  doc.text("La barra completa representa los embarazos en curso; el tramo verde identifica las controladas en ventana.", 14, currentY + 4);

  currentY += 6;

  // Preparamos datos ordenados por volumen de embarazos como en el reporte modelo
  const maxPadron = Math.max(1, ...efectores.map((e) => e.p1 || 0));

  const tableBody = efectores.map((ef) => {
    const nombreLimpio = (ef.name || "").replace(/["*]/g, "").trim();
    return [
      nombreLimpio,
      "", // Espacio reservado para dibujar la barra horizontal con hooks de autoTable
      `${ef.p1 || 0} (${ef.ctrlAct || 0})`,
      ef.covTxt || "0%",
      ef.ultimoUsoTexto || "Sin dato"
    ];
  });

  autoTable(doc, {
    startY: currentY,
    theme: "grid",
    headStyles: {
      fillColor: cAzulHeader,
      textColor: 255,
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 2
    },
    bodyStyles: {
      fontSize: 7.2,
      textColor: cTexto,
      cellPadding: 2
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 62 },
      1: { cellWidth: 58 }, // Columna donde se dibuja la barra visual
      2: { halign: "center", cellWidth: 24, fontStyle: "bold" },
      3: { halign: "center", cellWidth: 18 },
      4: { halign: "center", cellWidth: 20 }
    },
    head: [[
      `Establecimiento (${tipoEfector})`,
      "Proporción de Cobertura (40 días)",
      "En curso (Ctrl)",
      "Cobertura",
      "Último Uso"
    ]],
    body: tableBody,
    margin: { left: 14, right: 14 },

    // DIBUJO DE LA BARRA BICOLOR ESTILO REPORTE TONY
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const ef = efectores[data.row.index];
        if (!ef) return;

        const cell = data.cell;
        const padron = ef.p1 || 0;
        const controladas = ef.ctrlAct || 0;

        if (padron > 0) {
          const barMaxW = cell.width - 4;
          const barH = 3.8;
          const barX = cell.x + 2;
          const barY = cell.y + (cell.height - barH) / 2;

          // Ancho total proporcional al centro con más pacientes
          const currentTotalW = Math.max(3, (padron / maxPadron) * barMaxW);
          // Tramo verde proporcional a la cobertura
          const pct = Math.min(1, Math.max(0, controladas / padron));
          const currentGreenW = currentTotalW * pct;

          // 1. Tramo gris (Total no controladas)
          doc.setFillColor(...cGrisBarra);
          doc.rect(barX, barY, currentTotalW, barH, "F");

          // 2. Tramo verde (Controladas al día)
          if (currentGreenW > 0) {
            doc.setFillColor(...cVerde);
            doc.rect(barX, barY, currentGreenW, barH, "F");
          }
        }
      }
    },

    didParseCell: (data) => {
      // Color y negrita en la columna de Cobertura
      if (data.section === "body" && data.column.index === 3) {
        const val = parseFloat(String(data.cell.raw).replace("%", "").replace(",", "."));
        if (!isNaN(val)) {
          if (val >= 85) {
            data.cell.styles.textColor = cVerde;
            data.cell.styles.fontStyle = "bold";
          } else if (val >= 70) {
            data.cell.styles.textColor = cAmbar;
          } else {
            data.cell.styles.textColor = cRojo;
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    }
  });

  // ==========================================
  // 5. BLOQUE METODOLÓGICO Y PIE DE PÁGINA
  // ==========================================
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Solo en la última página incluimos la aclaración metodológica si hay espacio
    if (i === pageCount) {
      const finalY = (doc as any).lastAutoTable?.finalY || 240;
      if (finalY < 255) {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(...cBorder);
        doc.setLineWidth(0.2);
        doc.roundedRect(14, finalY + 4, 182, 18, 1, 1, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(...cTexto);
        doc.text("Aclaración metodológica y reglas de conteo:", 17, finalY + 8.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.3);
        doc.setTextColor(...cMuted);
        doc.text(
          "• Cobertura = controladas con fecha en los últimos 40 días sobre total de embarazos en curso activos al corte.",
          17,
          finalY + 12.5
        );
        doc.text(
          "• No se cuentan al CAPS/SAPS de origen las pacientes derivadas a maternidades u hospitales habilitados.",
          17,
          finalY + 16
        );
        doc.text(
          "• Fuentes: Padrón SUMAR y base nominal provincial POF conciliada en SegEm. Sin historia clínica electrónica (HCE).",
          17,
          finalY + 19.5
        );
      }
    }

    // Pie de página institucional en todas las hojas
    doc.setDrawColor(...cBorder);
    doc.setLineWidth(0.3);
    doc.line(14, 287, 196, 287);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...cMuted);
    doc.text(
      `SegEm · Corte ${new Date().toLocaleDateString("es-AR")} | Generado por: ${usuarioGenerador}`,
      14,
      291
    );
    doc.text(`Página ${i} de ${pageCount}`, 196, 291, { align: "right" });
  }

  // Descarga del PDF
  const fechaStr = new Date().toISOString().split("T")[0];
  doc.save(`SegEm_Reporte_${tipoEfector}_${fechaStr}.pdf`);
}