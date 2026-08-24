import type { jsPDF } from "jspdf";

import type {
  DiarioPdfLessonSnapshot,
  DiarioPdfRenderableGradeSnapshot,
} from "./diario-pdf.contract.ts";
import { formatDiarioPdfAcademicDate } from "./diario-pdf.contract.ts";
import {
  chunks,
  DIARIO_RESULT_LEGEND_TEXT,
  DIARIO_RESULT_LEGEND_TITLE,
} from "./diario-print.utils.ts";
import {
  drawGroupedFrequencyTable,
  drawTable,
  measureTableRowHeights,
} from "./diario-pdf-table.ts";
import type { PdfImage } from "./diario-pdf-image.core.ts";
import type { CanonicalInstitutionalHeader } from "../../../../../secretaria/shared/canonical-institutional-header-pdf.ts";
import {
  CONTENT_LEFT,
  CONTENT_WIDTH,
  drawStandardPage,
  hexToRgb,
  NAVY,
  setFillColor,
  setTextColor,
  STANDARD_CONTENT_BOTTOM,
  STANDARD_CONTENT_TOP,
  type DiarioPrintDocumentProps,
} from "./diario-pdf-layout.ts";

type DiarioGradeResult = DiarioPdfRenderableGradeSnapshot;
type DiarioAula = DiarioPdfLessonSnapshot;

const getStudentStats = (
  gradesMap: DiarioPrintDocumentProps["gradesMap"],
  studentId: string,
) => {
  const grade = gradesMap[studentId];
  if (!grade) {
    throw new Error(
      `O snapshot do Diário não possui resultado para o aluno ${studentId}.`,
    );
  }
  return {
    faltas: grade.total_faltas,
    frequencia: grade.frequencia_percent,
    mediaParcial: grade.media_parcial,
    mediaFinal: grade.media_final,
    resultado: grade.resultado_final,
  };
};

const groupAulasBySessionLimit = (aulas: DiarioAula[], limit: number) => {
  const groups: DiarioAula[][] = [];
  let current: DiarioAula[] = [];
  let sessions = 0;
  aulas.forEach((aula) => {
    if (current.length > 0 && sessions + aula.sessoes.length > limit) {
      groups.push(current);
      current = [];
      sessions = 0;
    }
    current.push(aula);
    sessions += aula.sessoes.length;
  });
  if (current.length > 0) groups.push(current);
  return groups;
};

export const drawFrequencyPages = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  const isBlank = props.exportMode === "EM_BRANCO";
  groupAulasBySessionLimit(props.aulas, 10).forEach((aulaGroup, aulaIndex) => {
    const sessoesNoBloco = aulaGroup.reduce(
      (total, aula) => total + aula.sessoes.length,
      0,
    );
    const rowsPerPage = sessoesNoBloco <= 4
      ? 20
      : sessoesNoBloco <= 6
      ? 18
      : sessoesNoBloco <= 8
      ? 16
      : 14;
    chunks(props.students, rowsPerPage).forEach((students, studentIndex) => {
      drawStandardPage(
        pdf,
        props,
        "Registro de Frequência",
        `Frequência ${aulaIndex + 1}.${studentIndex + 1}`,
        logo,
        watermark,
        institution,
      );
      const rows = students.map((student, index) => {
        const grade = props.gradesMap[student.id];
        if (!grade) {
          throw new Error(
            `O Diário não possui resultado para o aluno ${student.id}.`,
          );
        }
        return [
          String(studentIndex * rowsPerPage + index + 1),
          student.nome,
          ...aulaGroup.flatMap((aula) =>
            aula.sessoes.map(
              (sessao) =>
                isBlank
                  ? ""
                  : props.attendanceMap[student.id]?.[sessao.id] ?? "",
            )
          ),
          isBlank ? "" : String(grade.total_faltas),
        ];
      });
      drawGroupedFrequencyTable(pdf, {
        meetings: aulaGroup.map((aula) => ({
          label: formatDiarioPdfAcademicDate(aula.dataSource).slice(0, 5),
          secondary: `(${String(aula.cargaHoraria).padStart(2, "0")}HRS)`,
          sessions: aula.sessoes.map((sessao) => ({
            label: sessao.periodo === "U" ? "ÚNICA" : sessao.periodo,
            secondary: "",
          })),
        })),
        rows,
        rowSecondary: students.map((student) => [
          "",
          `(${student.matricula})`,
          ...aulaGroup.flatMap((aula) => aula.sessoes.map(() => "")),
          "",
        ]),
        widths: [
          8,
          60,
          ...aulaGroup.flatMap((aula) => aula.sessoes.map(() => 30)),
          15,
        ],
        startY: STANDARD_CONTENT_TOP,
        fontSize: sessoesNoBloco > 8 ? 5.4 : 6,
        rowHeight: (STANDARD_CONTENT_BOTTOM - STANDARD_CONTENT_TOP - 9.5) /
          rowsPerPage,
      });
    });
  });
};

export const drawResultPages = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  const active = props.activeInstruments;
  const isBlank = props.exportMode === "EM_BRANCO";
  const studentsPerPage = 18;
  const studentGroups = chunks(props.students, studentsPerPage);
  const defaultRowHeight =
    (STANDARD_CONTENT_BOTTOM - STANDARD_CONTENT_TOP - 8) / studentsPerPage;
  const finalTableBottomLimit = 174;

  studentGroups.forEach((students, groupIndex) => {
    const isLastGroup = groupIndex === studentGroups.length - 1;
    const finalPageRowHeight = students.length > 0
      ? (finalTableBottomLimit - STANDARD_CONTENT_TOP - 8) / students.length
      : defaultRowHeight;
    const rowHeight = isLastGroup
      ? Math.min(defaultRowHeight, finalPageRowHeight)
      : defaultRowHeight;

    drawStandardPage(
      pdf,
      props,
      "Notas e Resultado Final",
      `Resultados ${groupIndex + 1}`,
      logo,
      watermark,
      institution,
    );
    const value = (enabled: boolean, grade: number | null | undefined) =>
      isBlank
        ? ""
        : enabled && grade !== null && grade !== undefined
        ? Number(grade).toFixed(1)
        : "—";
    const rows = students.map((student, index) => {
      const grade: DiarioGradeResult | undefined = props.gradesMap[student.id];
      if (!grade) {
        throw new Error(
          `O Diário não possui resultado para o aluno ${student.id}.`,
        );
      }
      const stats = getStudentStats(props.gradesMap, student.id);
      return [
        String(groupIndex * studentsPerPage + index + 1),
        student.nome,
        value(active.p, grade.p),
        value(active.ti, grade.ti),
        value(active.tg, grade.tg),
        value(active.s, grade.s),
        value(active.cq, grade.cq),
        value(active.o, grade.o),
        isBlank
          ? ""
          : stats.mediaParcial === null
          ? "—"
          : stats.mediaParcial.toFixed(1),
        isBlank
          ? ""
          : grade.rec === null || grade.rec === undefined
          ? "—"
          : Number(grade.rec).toFixed(1),
        isBlank
          ? ""
          : stats.mediaFinal === null
          ? "—"
          : stats.mediaFinal.toFixed(1),
        isBlank ? "" : String(stats.faltas),
        isBlank ? "" : stats.frequencia === null ? "—" : `${stats.frequencia}%`,
        isBlank ? "" : stats.resultado.replaceAll("_", " "),
      ];
    });
    drawTable(pdf, {
      headers: [
        "Nº", "Aluno(a)", "P", "TI", "TG", "S", "CQ", "O", "Média",
        "Rec.", "Final", "Faltas", "Freq.", "Resultado",
      ],
      rows,
      widths: [7, 75, 12, 12, 12, 12, 12, 12, 13, 13, 13, 12, 14, 35],
      startY: STANDARD_CONTENT_TOP,
      fontSize: 5.4,
      rowHeight,
    });

    if (isLastGroup) {
      const legendY = STANDARD_CONTENT_TOP + 8 + students.length * rowHeight + 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.4);
      setTextColor(pdf, NAVY);
      pdf.text(DIARIO_RESULT_LEGEND_TITLE, CONTENT_LEFT, legendY);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.2);
      const legendLines = pdf.splitTextToSize(
        DIARIO_RESULT_LEGEND_TEXT,
        CONTENT_WIDTH,
      );
      pdf.text(legendLines, CONTENT_LEFT, legendY + 4.2, {
        lineHeightFactor: 1.35,
      });
    }
  });
};

export const drawContentPages = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  const widths = [24, 115, 115, 18];
  const fontSize = 7;
  const contentRows = props.aulas.map((aula) => [
    formatDiarioPdfAcademicDate(aula.dataSource).slice(0, 5),
    aula.titulo,
    props.praticasMap[aula.id],
    `${aula.cargaHoraria}h`,
  ]);
  const rowHeights = measureTableRowHeights(
    pdf,
    contentRows,
    widths,
    fontSize,
    [1, 2],
    9,
  );
  const entries = props.aulas.map((aula, index) => ({
    aula,
    row: contentRows[index],
    height: rowHeights[index],
  }));
  const regularPageCapacity = STANDARD_CONTENT_BOTTOM - STANDARD_CONTENT_TOP - 8;
  const finalPageCapacity = 145 - STANDARD_CONTENT_TOP - 8;
  const maxRowsPerPage = 8;
  let lastContentPageIndex: number | null = null;
  let finalGroupStart = entries.length;
  let finalGroupHeight = 0;

  while (
    finalGroupStart > 0 && entries.length - finalGroupStart < maxRowsPerPage &&
    finalGroupHeight + entries[finalGroupStart - 1].height <= finalPageCapacity
  ) {
    finalGroupStart -= 1;
    finalGroupHeight += entries[finalGroupStart].height;
  }
  if (entries.length > 0 && finalGroupStart === entries.length) {
    finalGroupStart -= 1;
  }

  const contentGroups: typeof entries[] = [];
  let currentGroup: typeof entries = [];
  let currentGroupHeight = 0;
  entries.slice(0, finalGroupStart).forEach((entry) => {
    const wouldOverflow = currentGroup.length >= maxRowsPerPage ||
      currentGroupHeight + entry.height > regularPageCapacity;
    if (wouldOverflow && currentGroup.length > 0) {
      contentGroups.push(currentGroup);
      currentGroup = [];
      currentGroupHeight = 0;
    }
    currentGroup.push(entry);
    currentGroupHeight += entry.height;
  });
  if (currentGroup.length > 0) contentGroups.push(currentGroup);
  if (entries.length > 0) contentGroups.push(entries.slice(finalGroupStart));

  contentGroups.forEach((group, groupIndex, groups) => {
    drawStandardPage(
      pdf,
      props,
      "Conteúdo Programático e Prática Pedagógica",
      `Conteúdo ${groupIndex + 1}`,
      logo,
      watermark,
      institution,
    );
    lastContentPageIndex = pdf.getNumberOfPages() - 1;
    const last = groupIndex === groups.length - 1;
    const tableEndY = last ? 145 : STANDARD_CONTENT_BOTTOM;
    drawTable(pdf, {
      headers: ["Dia/Mês", "Conteúdo programático", "Prática pedagógica", "C.H."],
      rows: group.map((entry) => entry.row),
      widths,
      startY: STANDARD_CONTENT_TOP,
      endY: tableEndY,
      fontSize,
      rowHeights: group.map((entry) => entry.height),
      wrapColumns: [1, 2],
      alignments: ["center", "left", "left", "center"],
    });
    if (last) {
      const tableBottom = STANDARD_CONTENT_TOP + 8 +
        group.reduce((sum, entry) => sum + entry.height, 0);
      const observationsY = tableBottom + 6;
      const observationsHeight = 18;
      pdf.setDrawColor(...hexToRgb("#94a3b8"));
      setFillColor(pdf, "#f8fafc");
      pdf.roundedRect(
        CONTENT_LEFT,
        observationsY,
        CONTENT_WIDTH,
        observationsHeight,
        1.5,
        1.5,
        "FD",
      );
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      setTextColor(pdf);
      pdf.text("OBSERVAÇÕES:", CONTENT_LEFT + 3, observationsY + 6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      const observations = pdf.splitTextToSize(
        props.exportMode === "EM_BRANCO" ? "" : props.observacoes,
        CONTENT_WIDTH - 6,
      ).slice(0, 3);
      pdf.text(observations, CONTENT_LEFT + 3, observationsY + 12);

    }
  });
  return lastContentPageIndex;
};

export const drawInstructions = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  drawStandardPage(
    pdf,
    props,
    "Instruções de Preenchimento",
    "Instruções",
    logo,
    watermark,
    institution,
  );
  const instructions = [
    "1. Registre o conteúdo e a prática pedagógica na mesma data da aula.",
    "2. Na frequência, utilize P para presença, F para falta e J para falta justificada.",
    "3. Confira todos os lançamentos antes do fechamento do período.",
    "4. Alterações após o fechamento exigem reabertura formal e justificativa.",
    "5. O resultado final é calculado pelo sistema conforme as regras acadêmicas.",
    "6. Professor e coordenação devem validar o diário ao término da unidade.",
  ];
  instructions.forEach((instruction, index) => {
    const column = index < 3 ? 0 : 1;
    const row = index % 3;
    const x = 22 + column * 134;
    const y = 86 + row * 34;
    const cardWidth = 122;
    const cardHeight = 27;
    pdf.setDrawColor(...hexToRgb("#cbd5e1"));
    setFillColor(pdf, row % 2 === 0 ? "#f8fafc" : "#ffffff");
    pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "FD");
    setFillColor(pdf, "#0879d8");
    pdf.circle(x + 10, y + 10, 5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    setTextColor(pdf, "#ffffff");
    pdf.text(String(index + 1), x + 10, y + 10.8, {
      align: "center",
      baseline: "middle",
    });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    setTextColor(pdf);
    const text = instruction.replace(/^\d+\.\s*/, "");
    pdf.text(pdf.splitTextToSize(text, cardWidth - 25), x + 19, y + 9);
  });
};
