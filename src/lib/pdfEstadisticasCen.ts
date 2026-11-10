import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReporteEstadisticasProps {
  tituloCentro: string;
  subtituloCentro: string;
  fechaDatos: string;
  esAdminOrCoord: boolean;
  esCAPS: boolean;
  isMaternidad: boolean;
  data: any;
  periodoComparativa?: number;
  sortedCaps?: any[];
  totalCaps?: any;
  tipoEfectorTabla?: string;
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

export async function generarReporteEstadisticasPDF(props: ReporteEstadisticasProps) {
  const {
    tituloCentro,
    subtituloCentro,
    fechaDatos,
    esAdminOrCoord,
    esCAPS,
    isMaternidad,
    data,
    periodoComparativa = 30,
    sortedCaps = [],
    totalCaps = null,
    tipoEfectorTabla = "CAPS",
    usuarioGenerador,
  } = props;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const fechaHoy = new Date().toLocaleDateString("es-AR");
  const horaHoy = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  // 1. Cabecera institucional SegEm
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
  doc.setFontSize(18);
  doc.setTextColor(118, 159, 211);
  doc.text("SegEm", brandX + logoBoxSize + 3, brandY + 7.2);

  doc.setFontSize(11);
  doc.setTextColor(43, 76, 126);
  const maxTitleW = contentWidth - 65;
  const tituloCortado = doc.getTextWidth(cleanText(tituloCentro)) > maxTitleW
    ? `${cleanText(tituloCentro).substring(0, 52)}...`
    : cleanText(tituloCentro);

  doc.text(tituloCortado, brandX + logoBoxSize + 28, brandY + 4.2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(cleanText(subtituloCentro), brandX + logoBoxSize + 28, brandY + 8);

  doc.setFontSize(7.5);
  doc.text(`Generado: ${fechaHoy} ${horaHoy}`, pageWidth - margin, brandY + 4, { align: "right" });
  doc.text(`Datos al: ${fechaDatos || "Actual"}`, pageWidth - margin, brandY + 7.5, { align: "right" });
  doc.text(`Usuario: ${usuarioGenerador || "Administrador"}`, pageWidth - margin, brandY + 11, { align: "right" });

  let cursorY = brandY + 15;

  if (esAdminOrCoord) {
    // Reporte Provincial y Capital (Admin)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(43, 76, 126);
    doc.text("Métricas Provinciales y Departamento Capital", margin, cursorY);
    cursorY += 4;

    const totalPadron = data?.general?.total || 1;
    const totalRiesgo = data?.riesgo?.total || 0;
    const riesgoCtrl = data?.gestion?.riesgoControladas || 0;
    const controladas = data?.gestion?.controladas || 0;
    const segAdecuado = data?.gestion?.seguimientoAdecuado || 0;

    const capPadron = data?.general?.desgloseZona?.capital || 1;
    const capRiesgo = data?.riesgo?.desgloseZona?.capital || 0;
    const capRiesgoCtrl = data?.gestion?.desgloseZona?.riesgoControladas?.capital || 0;
    const capControladas = data?.gestion?.desgloseZona?.controladas?.capital || 0;
    const capSegAdecuado = data?.gestion?.desgloseZona?.seguimientoAdecuado?.capital || 0;

    const kpiRows = [
      ["Padrón Activo", `${data?.general?.total || 0} (100%)`, `${capPadron} (${((capPadron * 100) / totalPadron).toFixed(1)}%)`],
      ["Total en Alto Riesgo", `${totalRiesgo} (${((totalRiesgo * 100) / totalPadron).toFixed(1)}%)`, `${capRiesgo} (${((capRiesgo * 100) / capPadron).toFixed(1)}%)`],
      ["Riesgo Controladas", `${riesgoCtrl} (${totalRiesgo > 0 ? ((riesgoCtrl * 100) / totalRiesgo).toFixed(1) : 0}%)`, `${capRiesgoCtrl} (${capRiesgo > 0 ? ((capRiesgoCtrl * 100) / capRiesgo).toFixed(1) : 0}%)`],
      ["Total Controladas (<=40d)", `${controladas} (${((controladas * 100) / totalPadron).toFixed(1)}%)`, `${capControladas} (${((capControladas * 100) / capPadron).toFixed(1)}%)`],
      ["Seguimiento Adecuado", `${segAdecuado} (${((segAdecuado * 100) / totalPadron).toFixed(1)}%)`, `${capSegAdecuado} (${((capSegAdecuado * 100) / capPadron).toFixed(1)}%)`],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Indicador Clínico / Gestión", "Total Provincial", "Departamento Capital"]],
      body: kpiRows,
      theme: "striped",
      headStyles: { fillColor: [69, 106, 157], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: 50, halign: "center" },
        2: { cellWidth: 53, halign: "center" },
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 8;

    if (sortedCaps.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(43, 76, 126);
      doc.text(`Desempeño y Evolución de Cobertura por ${tipoEfectorTabla} (Últimos ${periodoComparativa} días)`, margin, cursorY);
      cursorY += 4;

      const capsRows = sortedCaps.map((c: any) => [
        cleanText(c.displayName),
        `${c.padronAnt} -> ${c.padronAct}`,
        `${c.ctrlAnt} -> ${c.ctrlAct}`,
        `${c.cobAct}% (${c.variacionCob >= 0 ? "+" : ""}${c.variacionCob} p.p.)`,
        `${c.pctSeguimientoAdecuado}%`,
        `${c.pctGestion}%`,
        c.turnosAsignadosCaps,
      ]);

      if (totalCaps) {
        capsRows.push([
          `TOTAL ${tipoEfectorTabla} (${totalCaps.capsCount})`,
          `${totalCaps.padronAnt} -> ${totalCaps.padronAct}`,
          `${totalCaps.ctrlAnt} -> ${totalCaps.ctrlAct}`,
          `${totalCaps.cobAct}% (${totalCaps.variacionCob >= 0 ? "+" : ""}${totalCaps.variacionCob} p.p.)`,
          `${totalCaps.pctSeguimientoAdecuado}%`,
          `${totalCaps.pctGestion}%`,
          totalCaps.turnosAsignadosCaps,
        ]);
      }

      autoTable(doc, {
        startY: cursorY,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [["Efector", "Padrón", "Controladas", "% Cobertura", "% Seg. Adecuado", "% Gestión", "Turnos"]],
        body: capsRows,
        theme: "striped",
        headStyles: { fillColor: [69, 106, 157], fontSize: 7.5, fontStyle: "bold" },
        bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold" },
          1: { cellWidth: 26, halign: "center" },
          2: { cellWidth: 26, halign: "center" },
          3: { cellWidth: 30, halign: "center" },
          4: { cellWidth: 24, halign: "center" },
          5: { cellWidth: 22, halign: "center" },
          6: { cellWidth: 20, halign: "center" },
        },
      });
    }
  } else {
    // Reporte Específico para Centro de Salud (CAPS) o Maternidad
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(43, 76, 126);
    doc.text("1. Embarazadas General", margin, cursorY);
    cursorY += 4;

    const gen = data?.general || {};
    const genRows = [
      ["Total Activas", gen.total || 0],
      ["Menores a 15 años", gen.sub15 || 0],
      ["15 a 19 años", gen.age15_19 || 0],
      ["20 a 34 años", gen.age20_34 || 0],
      ["Mayores a 34 años", gen.age34plus || 0],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Rango Etario / Demografía General", "Cantidad de Pacientes"]],
      body: genRows,
      theme: "striped",
      headStyles: { fillColor: [69, 106, 157], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 63, halign: "center" } },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(43, 76, 126);
    doc.text("2. Embarazadas en Riesgo", margin, cursorY);
    cursorY += 4;

    const rsg = data?.riesgo || {};
    const rsgRows = [
      ["Total Riesgo", rsg.total || 0],
      ["Menores a 15 años", rsg.sub15 || 0],
      ["15 a 19 años", rsg.age15_19 || 0],
      ["20 a 34 años", rsg.age20_34 || 0],
      ["Mayores a 34 años", rsg.age34plus || 0],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Rango Etario / Alto Riesgo", "Cantidad de Pacientes"]],
      body: rsgRows,
      theme: "striped",
      headStyles: { fillColor: [69, 106, 157], fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 63, halign: "center" } },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 6;

    if (esCAPS) {
      if (cursorY > 210) {
        doc.addPage();
        cursorY = 15;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(43, 76, 126);
      doc.text("3. Gestión Prioritaria del Centro", margin, cursorY);
      cursorY += 4;

      const gst = data?.gestion || {};
      const desg = gst.desgloseZona || {};
      const gestionRows = [
        ["Partos en 30 días", gst.proximosPartos || 0, "Recta final (sem 36+ o FPP próxima)"],
        ["Riesgo sin Control", desg.riesgoSinControl || 0, "Riesgo alto/moderado >30d sin control"],
        ["Controles Atrasados", gst.controlesPendientes || 0, ">30 días desde último control"],
        ["Requieren Contacto", gst.sinContactoReciente || 0, ">30 días sin contacto o turno perdido"],
        ["Sin Teléfono", gst.sinTelefono || 0, "Sin número de contacto válido"],
        ["Seguimiento Adecuado", desg.seguimientoAdecuadoCaps || 0, "Controles y contactos al día en el mes"],
        ["Turnos Asignados x Tablero", desg.turnosAsignadosCaps || 0, "Agendadas desde acciones del tablero"],
        ["Derivadas", gst.derivadas || 0, "Derivadas a complejidad superior"],
        ["Captación Precoz (<12 sem)", desg.captacionPrecozCaps || 0, "Inicio controles en 1er trimestre"],
      ];

      autoTable(doc, {
        startY: cursorY,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [["Métrica Operativa", "Cantidad", "Descripción / Criterio Clínico"]],
        body: gestionRows,
        theme: "striped",
        headStyles: { fillColor: [69, 106, 157], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 55, fontStyle: "bold" },
          1: { cellWidth: 20, halign: "center", fontStyle: "bold" },
          2: { cellWidth: 98 },
        },
      });
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("SegEm · Panel de Estadísticas e Indicadores · Ministerio de Salud Pública de Corrientes", margin, pageHeight - 6);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const fechaIso = new Date().toISOString().split("T")[0];
  doc.save(`SegEm_Estadisticas_${fechaIso}.pdf`);
}