import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  // 1. Cabecera SegEm
  const brandX = margin;
  const brandY = 10;
  const logoBoxSize = 9;

  doc.setFillColor(118, 159, 211);
  doc.roundedRect(brandX, brandY, logoBoxSize, logoBoxSize, 2, 2, "F");

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.7);
  doc.lines(
    [[1.5, 0], [1.0, -2.8], [1.5, 5.2], [1.4, -4.0], [1.0, 1.6], [1.6, 0]],
    brandX + 0.8,
    brandY + logoBoxSize / 2
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(118, 159, 211);
  doc.text("SegEm", brandX + logoBoxSize + 3, brandY + 7.2);

  // Título principal con límite de ancho para no pisar la derecha
  doc.setFontSize(10.5); // 👈 Reducido de 13 a 11 para mejor proporción
  doc.setTextColor(43, 76, 126);

  const tituloBase = `Listado Operativo de Seguimiento Clínico · ${cleanText(institucion)}`;
  // Max ancho permitido para el título (dejando libre espacio para la fecha a la derecha)
  const maxTituloWidth = contentWidth - 88; 
  const tituloCortado = doc.getTextWidth(tituloBase) > maxTituloWidth 
    ? `${tituloBase.substring(0, 52)}...` 
    : tituloBase;

  doc.text(tituloCortado, brandX + logoBoxSize + 30, brandY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Nómina nominal activa para rescate de controles, gestión de turnos y contacto con beneficiarias", brandX + logoBoxSize + 30, brandY + 8.5);

  // Metadatos derecha alineados
  doc.setFontSize(7.5);
  doc.text(`Generado: ${fechaHoy} ${horaHoy} hs`, pageWidth - margin, brandY + 4, { align: "right" });
  doc.text(`Usuario: ${usuarioGenerador || "Personal de Salud"}`, pageWidth - margin, brandY + 8, { align: "right" });

  // 2. Barra de Contexto y Filtros
  const bannerY = 22;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, bannerY, contentWidth, 7.5, 1.2, 1.2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(43, 76, 126);
  doc.text("Filtro aplicado:", margin + 3.5, bannerY + 5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(filtrosTexto, margin + 25, bannerY + 5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(43, 76, 126);
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
      fillColor: [69, 106, 157],
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
      fillColor: [248, 250, 252],
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
            dataCell.cell.styles.textColor = [185, 28, 28]; // Rojo
          } else if (diasNum > 40) {
            dataCell.cell.styles.textColor = [180, 83, 9];  // Ámbar
          } else {
            dataCell.cell.styles.textColor = [21, 128, 61]; // Verde
          }
        }
      }
    },
    didDrawPage: (dataPage) => {
      const strPagina = `Página ${dataPage.pageNumber} de ${doc.getNumberOfPages()}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);

      doc.text("SegEm · Sistema de Seguimiento de Embarazadas · Gobierno de Corrientes", margin, pageHeight - 6);
      doc.text(strPagina, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
  });

  const fechaIso = new Date().toISOString().split("T")[0];
  doc.save(`SegEm_Seguimiento_${cleanText(institucion)}_${fechaIso}.pdf`);
}