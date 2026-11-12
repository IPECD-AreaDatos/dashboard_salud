import jsPDF from "jspdf";
import { drawPdfBrandHeader, drawPdfTitleBlock, loadPdfInstitutionalLogo, PDF_COLORS, styledAutoTable as autoTable } from "./pdfTheme";

export interface ReporteSeguimientoProps {
  institucion: string;
  filtrosTexto: string;
  pacientes: any[];
  totalEncontradas: number;
  totalRegistradas: number;
  usuarioGenerador?: string;
}

function cleanText(str: string): string {
  if (!str) return "-";
  return String(str)
    .replace(/[""]+/g, '"')
    .replace(/Ã©/g, "é")
    .replace(/Ã¡/g, "á")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Â/g, "")
    .trim();
}

export async function generarReporteSeguimientoPDF(props: ReporteSeguimientoProps) {
  const { institucion, filtrosTexto, pacientes, totalEncontradas, totalRegistradas, usuarioGenerador } = props;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const fechaHoy = new Date().toLocaleDateString("es-AR");
  const horaHoy = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  const tituloBase = `Listado Operativo de Seguimiento Clínico · ${cleanText(institucion)}`;
  const logoInstitucional = await loadPdfInstitutionalLogo();
  drawPdfBrandHeader(doc, logoInstitucional, margin, [
    `Generado: ${fechaHoy} ${horaHoy} hs`,
    `Usuario: ${usuarioGenerador || "Personal de Salud"}`,
  ]);
  const titleBottomY = drawPdfTitleBlock(
    doc,
    tituloBase,
    "Nómina nominal activa para rescate de controles, gestión de turnos y contacto con beneficiarias",
    margin,
  );

  // 2. Barra de Contexto y Filtros
  const bannerY = titleBottomY + 2;
  doc.setFillColor(...PDF_COLORS.row);
  doc.setDrawColor(...PDF_COLORS.rule);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, bannerY, contentWidth, 7.5, 1.2, 1.2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text("Filtro aplicado:", margin + 3.5, bannerY + 5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(filtrosTexto, margin + 25, bannerY + 5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(
    `Pacientes en nómina: ${totalEncontradas.toLocaleString("es-AR")} de ${totalRegistradas.toLocaleString("es-AR")}`,
    pageWidth - margin - 3.5,
    bannerY + 5,
    { align: "right" }
  );

  // 3. Tabla Nominal (AutoTable)
  const tableRows = pacientes.map((p) => {
    const fppTxt = p.fpp ? new Date(p.fpp).toLocaleDateString("es-AR") : "-";
    const ultCtrlTxt = p.ultimo_control ? new Date(p.ultimo_control).toLocaleDateString("es-AR") : "Sin Registro";
    const diasTxt = p.dias !== null && p.dias !== undefined ? `${p.dias} d` : "S/D";
    const ultContactoTxt = p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto).toLocaleDateString("es-AR") : "Sin contacto";
    const proxTurnoTxt = p.proximo_turno ? new Date(p.proximo_turno).toLocaleDateString("es-AR") : "Sin Turno";
    const telTxt = cleanText(p.telefono);
    const egTxt = p.semanas_gestacion ? `${Number(p.semanas_gestacion).toFixed(1)}s` : "-";

    return [
      cleanText(p.nombre || p.paciente),
      p.dni || "-",
      fppTxt,
      egTxt,
      ultCtrlTxt,
      diasTxt,
      ultContactoTxt,
      proxTurnoTxt,
      telTxt,
      cleanText(p.domicilio || p.calle_domicilio || "-"),
    ];
  });

  autoTable(doc, {
    startY: bannerY + 10,
    margin: { left: margin, right: margin, bottom: 12 },
    head: [
      [
        "Paciente / Embarazada",
        "DNI",
        "FPP",
        "EG",
        "Último Control",
        "Atraso",
        "Último Contacto",
        "Próximo Turno",
        "Teléfono",
        "Domicilio Declarado",
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
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.row,
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold" },
      1: { cellWidth: 20 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      6: { cellWidth: 22, halign: "center" },
      7: { cellWidth: 22, halign: "center" },
      8: { cellWidth: 27 },
      9: { cellWidth: 60 },
    },
    didParseCell: (dataCell) => {
      // Semáforo en la columna Atraso (días)
      if (dataCell.section === "body" && dataCell.column.index === 5) {
        const val = String(dataCell.cell.raw);
        const diasNum = parseInt(val);
        if (!isNaN(diasNum)) {
          if (diasNum > 60) {
            dataCell.cell.styles.textColor = PDF_COLORS.red;
          } else if (diasNum > 40) {
            dataCell.cell.styles.textColor = PDF_COLORS.amber;
          } else {
            dataCell.cell.styles.textColor = PDF_COLORS.green;
          }
        }
      }
    },
    didDrawPage: (dataPage) => {
      const strPagina = `Página ${dataPage.pageNumber} de ${doc.getNumberOfPages()}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_COLORS.muted);

      doc.text("SegEm · Sistema de Seguimiento de Embarazadas · Gobierno de Corrientes", margin, pageHeight - 6);
      doc.text(strPagina, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
  });

  const fechaIso = new Date().toISOString().split("T")[0];
  doc.save(`SegEm_Seguimiento_${cleanText(institucion)}_${fechaIso}.pdf`);
}