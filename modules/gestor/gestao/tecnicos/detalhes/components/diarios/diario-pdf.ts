import { GState, jsPDF } from "jspdf";
import type {
  DiarioPdfLessonSnapshot,
  DiarioPdfRenderableData,
  DiarioPdfRenderableGradeSnapshot,
} from "./diario-pdf.contract.ts";
import {
  assertValidDiarioPdfAcademicSnapshot,
  formatDiarioPdfAcademicDate,
} from "./diario-pdf.contract.ts";
import {
  chunks,
  DIARIO_RESULT_LEGEND_TEXT,
  DIARIO_RESULT_LEGEND_TITLE,
  moduloNumero,
} from "./diario-print.utils.ts";
import {
  drawGroupedFrequencyTable,
  drawTable,
  fitText,
  measureTableRowHeights,
} from "./diario-pdf-table.ts";
import { assertValidPdfImage, type PdfImage } from "./diario-pdf-image.core.ts";
import {
  createDiaryPdfSemanticManifest,
  type DiaryPdfSemanticManifest,
} from "../../../../../../shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts";
import {
  type CanonicalPdfImage,
  drawCanonicalPdfWatermark,
} from "../../../../../secretaria/shared/canonical-document-vector-pdf.core.ts";
import {
  type CanonicalInstitutionalHeader,
  drawCanonicalInstitutionalHeader,
} from "../../../../../secretaria/shared/canonical-institutional-header-pdf.ts";

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_LEFT = 14;
const CONTENT_RIGHT = 11;
const CONTENT_WIDTH = PAGE_WIDTH - CONTENT_LEFT - CONTENT_RIGHT;
const NAVY = "#071a33";
const STANDARD_CONTENT_TOP = 82;
const STANDARD_CONTENT_BOTTOM = 198;

type DiarioPrintDocumentProps = DiarioPdfRenderableData;
type DiarioGradeResult = DiarioPdfRenderableGradeSnapshot;
type DiarioAula = DiarioPdfLessonSnapshot;

export interface DiarioPdfTrustedQrAsset {
  image: PdfImage;
  /** Conteúdo exato codificado pelo QR, produzido fora do core puro. */
  payload: string;
  generatedBy: "TRUSTED_ADAPTER";
}

export interface DiarioPdfValidationEndpoint {
  /** Origem HTTPS confiável, sem path, query, fragmento ou credenciais. */
  origin: string;
  /** Path absoluto canônico do validador, sem query ou fragmento. */
  pathname: string;
  /** O core nunca deriva este endpoint do snapshot acadêmico. */
  generatedBy: "TRUSTED_ADAPTER";
}

export interface DiarioPdfResolvedAssets {
  logo: PdfImage;
  watermark: PdfImage | null;
  qrCode: DiarioPdfTrustedQrAsset | null;
  validationEndpoint: DiarioPdfValidationEndpoint | null;
  validationUrl: string | null;
  /** Compatibilidade do adaptador web; snapshot server-side usa sua identidade. */
  institution?: CanonicalInstitutionalHeader;
}

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

const resolveCanonicalValidationUrl = (
  validationCode: string,
  endpoint: DiarioPdfValidationEndpoint | null,
) => {
  if (!endpoint) {
    throw new Error(
      "A origem e o path canônicos do validador do Diário não foram informados.",
    );
  }
  if (endpoint.generatedBy !== "TRUSTED_ADAPTER") {
    throw new Error(
      "O endpoint canônico de validação não foi fornecido pelo adaptador confiável.",
    );
  }
  try {
    const origin = new URL(endpoint.origin);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin !== endpoint.origin ||
      !endpoint.pathname.startsWith("/") ||
      endpoint.pathname.includes("?") ||
      endpoint.pathname.includes("#")
    ) {
      throw new Error("invalid");
    }
    const expected = new URL(endpoint.pathname, origin.origin);
    if (
      expected.pathname !== endpoint.pathname || expected.search ||
      expected.hash
    ) {
      throw new Error("invalid");
    }
    expected.searchParams.set("code", validationCode);
    return expected.href;
  } catch {
    throw new Error(
      "A origem ou o path canônico de validação do Diário é inválido.",
    );
  }
};

const validateResolvedAssets = (
  props: DiarioPrintDocumentProps,
  assets: DiarioPdfResolvedAssets,
) => {
  const logo = assertValidPdfImage(assets?.logo ?? null, "O logo do Diário");
  if (!logo) {
    throw new Error(
      "O logo institucional do Diário precisa ser fornecido como bytes válidos.",
    );
  }
  const watermark = assertValidPdfImage(
    assets.watermark,
    "A marca-d’água do Diário",
  );
  if (
    Boolean(watermark) !== Boolean(props.institutionalIdentity.watermarkUrl)
  ) {
    throw new Error(
      "O recurso isolado da marca-d’água diverge do snapshot do Diário.",
    );
  }
  const qrCode = (() => {
    if (!assets.qrCode) return null;
    const image = assertValidPdfImage(
      assets.qrCode.image,
      "O QR Code do Diário",
    );
    if (!image) {
      throw new Error(
        "O QR Code do Diário precisa ser fornecido como bytes válidos.",
      );
    }
    return { ...assets.qrCode, image };
  })();
  const isBlank = props.exportMode === "EM_BRANCO";
  const validationCode = props.validationCode?.trim() || "";
  if (!isBlank && props.template.imprimirValidacaoContracapa) {
    if (!validationCode) {
      throw new Error("O código canônico do Diário não foi informado.");
    }
    if (!qrCode?.image || qrCode.generatedBy !== "TRUSTED_ADAPTER") {
      throw new Error(
        "O QR Code canônico do Diário não foi fornecido pelo adaptador confiável.",
      );
    }
    const expectedUrl = resolveCanonicalValidationUrl(
      validationCode,
      assets.validationEndpoint,
    );
    if (assets.validationUrl !== expectedUrl) {
      throw new Error("A URL canônica de validação do Diário é inválida.");
    }
    if (qrCode.payload !== expectedUrl) {
      throw new Error(
        "O conteúdo do QR Code diverge da URL canônica de validação do Diário.",
      );
    }
  }
  return {
    logo,
    watermark,
    qrCode,
    validationUrl: assets.validationUrl,
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

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [7, 26, 51];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const setTextColor = (pdf: jsPDF, color = NAVY) => {
  const [red, green, blue] = hexToRgb(color);
  pdf.setTextColor(red, green, blue);
};

const setFillColor = (pdf: jsPDF, color: string) => {
  const [red, green, blue] = hexToRgb(color);
  pdf.setFillColor(red, green, blue);
};

const addPage = (pdf: jsPDF) => {
  if (pdf.getNumberOfPages() > 0) pdf.addPage("a4", "landscape");
};

const normalizeWidths = (widths: number[]) => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * CONTENT_WIDTH);
};

const drawLabelValue = (
  pdf: jsPDF,
  label: string,
  value: unknown,
  x: number,
  y: number,
  maxWidth: number,
  fontSize = 7,
) => {
  pdf.setFontSize(fontSize);
  pdf.setFont("helvetica", "bold");
  pdf.text(label, x, y);
  const labelWidth = pdf.getTextWidth(label);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    fitText(pdf, value, Math.max(1, maxWidth - labelWidth)),
    x + labelWidth,
    y,
  );
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
};

const toCanonicalPdfImage = (image: PdfImage): CanonicalPdfImage => ({
  dataUrl: `data:image/${
    image.format === "JPEG" ? "jpeg" : image.format.toLowerCase()
  };base64,${encodeBase64(image.bytes)}`,
  format: image.format,
});

const drawPageWatermark = (pdf: jsPDF, watermark: PdfImage | null) => {
  if (!watermark) return;
  drawCanonicalPdfWatermark(
    pdf,
    GState as unknown as new (parameters: { opacity: number }) => unknown,
    {
      enabled: true,
      imageUrl: toCanonicalPdfImage(watermark).dataUrl,
      label: null,
      opacity: 0.06,
    },
    {
      x: 64,
      y: 50,
      width: 178,
      height: 116,
      textSize: 58,
      rotate: 35,
    },
  );
};

const resolveInstitution = (
  props: DiarioPrintDocumentProps,
  fallback?: CanonicalInstitutionalHeader,
): CanonicalInstitutionalHeader => {
  const institution = props.institutionalIdentity?.institution || fallback;
  if (!institution) {
    throw new Error(
      "A identidade institucional canônica do Diário não foi informada.",
    );
  }
  return institution;
};

const drawStandardPage = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  title: string,
  pageLabel: string,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  addPage(pdf);
  drawPageWatermark(pdf, watermark);
  const header = drawCanonicalInstitutionalHeader(
    pdf,
    institution,
    toCanonicalPdfImage(logo),
    {
      orientation: "landscape",
      alias: "diario-institutional-logo",
      meta: {
        eyebrow: "DIÁRIO DE CLASSE",
        title,
        label: "PÁGINA",
        value: pageLabel,
      },
    },
  );

  const metaY = header.contentTop + 1;
  const metaHeight = 13;
  const columnWidths = normalizeWidths([1.1, 1, 1.4]);
  const meta = [
    ["Curso: ", props.turma.cursoNome],
    ["Turma: ", props.turma.nome],
    ["Professor(a): ", props.disciplina.professor],
    ["Módulo: ", props.moduloNome],
    ["Unidade educacional: ", props.disciplina.nome],
    ["Carga horária: ", `${props.disciplina.cargaHoraria}h`],
  ];
  pdf.setDrawColor(...hexToRgb("#172033"));
  pdf.setLineWidth(0.25);
  meta.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = CONTENT_LEFT +
      columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const y = metaY + row * (metaHeight / 2);
    pdf.rect(x, y, columnWidths[column], metaHeight / 2);
    drawLabelValue(
      pdf,
      label,
      value,
      x + 1.5,
      y + 4.2,
      columnWidths[column] - 3,
      6.8,
    );
  });

  pdf.setDrawColor(...hexToRgb("#94a3b8"));
  pdf.line(CONTENT_LEFT, 202, PAGE_WIDTH - CONTENT_RIGHT, 202);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.2);
  setTextColor(pdf, "#64748b");
  pdf.text(props.template.rodape, CONTENT_LEFT, 205);
  pdf.text(pageLabel, PAGE_WIDTH - CONTENT_RIGHT, 205, { align: "right" });
  if (props.exportMode === "EM_BRANCO") {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    setTextColor(pdf, "#b45309");
    pdf.text(
      "MODELO PARA PREENCHIMENTO MANUAL - SEM REGISTROS ACADÊMICOS",
      PAGE_WIDTH / 2,
      205,
      { align: "center" },
    );
  }
};

const coverFieldValue = (props: DiarioPrintDocumentProps, id: string) => {
  if (id === "curso") return props.turma.cursoNome;
  if (id === "modulo") return moduloNumero(props.moduloNome);
  if (id === "areaTematica") {
    return props.moduloNome.replace(/^M[ÓO]DULO\s+[IVXLC]+\s*[-–—]?\s*/i, "");
  }
  if (id === "disciplina") return props.disciplina.nome;
  if (id === "turma") return props.turma.nome;
  if (id === "professor") {
    return props.disciplina.professor;
  }
  return "";
};

const drawCover = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
) => {
  setFillColor(pdf, "#f8fafc");
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
  setFillColor(pdf, "#0879d8");
  pdf.rect(0, 0, 7, PAGE_HEIGHT, "F");
  setFillColor(pdf, "#e30613");
  pdf.rect(8.5, 0, 1.5, PAGE_HEIGHT, "F");
  drawPageWatermark(pdf, watermark);
  drawCanonicalInstitutionalHeader(
    pdf,
    institution,
    toCanonicalPdfImage(logo),
    {
      orientation: "landscape",
      alias: "diario-institutional-logo",
    },
  );

  setTextColor(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("DIÁRIO DE CLASSE", PAGE_WIDTH / 2, 76, { align: "center" });
  pdf.setDrawColor(...hexToRgb("#2563eb"));
  pdf.setLineWidth(0.8);
  pdf.line(PAGE_WIDTH / 2 - 48, 81, PAGE_WIDTH / 2 + 48, 81);
  setFillColor(pdf, "#ffffff");
  pdf.setDrawColor(...hexToRgb("#cbd5e1"));
  pdf.setLineWidth(0.25);
  pdf.roundedRect(48, 91, PAGE_WIDTH - 96, 94, 3, 3, "FD");

  const resolvedFields = props.template.capaCampos.filter((field) =>
    field.visible
  );

  resolvedFields.forEach((field) => {
    const x = (field.x / 100) * PAGE_WIDTH;
    const y = (field.y / 100) * PAGE_HEIGHT;
    const width = (field.width / 100) * PAGE_WIDTH;
    setTextColor(pdf, field.color || NAVY);
    pdf.setFontSize(field.fontSize || 10);
    pdf.setFont("helvetica", field.bold ? "bold" : "normal");
    const hasBorderTop = "borderTop" in field && field.borderTop;
    if (hasBorderTop) {
      pdf.setDrawColor(...hexToRgb(field.color || NAVY));
      pdf.line(x, y - 3.5, x + width, y - 3.5);
    }
    const text = fitText(
      pdf,
      `${field.label}${coverFieldValue(props, field.id)}`,
      width,
    );
    const align = field.align || "left";
    const textY = hasBorderTop ? y + 1.5 : y;
    pdf.text(
      text,
      align === "center" ? x + width / 2 : align === "right" ? x + width : x,
      textY,
      { align },
    );
  });

  if (props.exportMode === "EM_BRANCO") {
    const badgeWidth = 104;
    const badgeX = PAGE_WIDTH - badgeWidth - 13;
    setFillColor(pdf, "#fff7ed");
    pdf.setDrawColor(...hexToRgb("#f59e0b"));
    pdf.roundedRect(badgeX, 8, badgeWidth, 9, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    setTextColor(pdf, "#9a3412");
    pdf.text(
      "MODELO MANUAL - NOTAS E FREQUÊNCIA EM BRANCO",
      badgeX + badgeWidth / 2,
      13.5,
      { align: "center" },
    );
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.2);
  setTextColor(pdf, "#64748b");
  pdf.text(props.template.rodape, CONTENT_LEFT, 203);
  pdf.text("Capa", PAGE_WIDTH - CONTENT_RIGHT, 203, { align: "right" });
};

const drawBackCover = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  logo: PdfImage,
  watermark: PdfImage | null,
  institution: CanonicalInstitutionalHeader,
  qrCode: DiarioPdfTrustedQrAsset | null,
  validationUrl: string | null,
) => {
  addPage(pdf);
  drawPageWatermark(pdf, watermark);
  drawCanonicalInstitutionalHeader(
    pdf,
    institution,
    toCanonicalPdfImage(logo),
    {
      orientation: "landscape",
      alias: "diario-institutional-logo",
      meta: {
        eyebrow: "DIÁRIO DE CLASSE",
        title: "Registro de validação e assinatura eletrônica",
        label: "PÁGINA",
        value: "Validação",
      },
    },
  );
  if (!props.template.imprimirValidacaoContracapa) return;
  const validationCode = props.validationCode?.trim();
  if (!validationCode) {
    throw new Error(
      "O código canônico do Diário não foi confirmado. Nenhum PDF foi gerado.",
    );
  }
  const left = 20;
  const top = 69;
  const width = PAGE_WIDTH - 40;
  const height = 116;
  pdf.setDrawColor(...hexToRgb("#94a3b8"));
  pdf.roundedRect(left, top, width, height, 3, 3);
  setTextColor(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("DADOS DO DOCUMENTO", left + 8, top + 10);
  if (props.validationPreview) {
    const badgeWidth = 88;
    const badgeX = left + width - badgeWidth - 8;
    setFillColor(pdf, "#eff6ff");
    pdf.setDrawColor(...hexToRgb("#60a5fa"));
    pdf.roundedRect(badgeX, top + 7, badgeWidth, 9, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    setTextColor(pdf, "#1d4ed8");
    pdf.text(
      "PRÉVIA - CÓDIGO OFICIAL NA EMISSÃO",
      badgeX + badgeWidth / 2,
      top + 12.5,
      { align: "center" },
    );
    setTextColor(pdf);
  }
  pdf.line(left + 8, top + 18, left + width - 8, top + 18);

  drawLabelValue(
    pdf,
    "CURSO: ",
    props.turma.cursoNome,
    left + 8,
    top + 28,
    95,
    7.2,
  );
  drawLabelValue(
    pdf,
    "TURMA: ",
    props.turma.nome,
    left + 108,
    top + 28,
    70,
    7.2,
  );
  drawLabelValue(
    pdf,
    "UNIDADE EDUCACIONAL: ",
    props.disciplina.nome,
    left + 8,
    top + 37,
    155,
    7.2,
  );
  drawLabelValue(
    pdf,
    "MÓDULO: ",
    moduloNumero(props.moduloNome),
    left + 8,
    top + 46,
    70,
    7.2,
  );
  drawLabelValue(
    pdf,
    "PROFESSOR(A): ",
    props.disciplina.professor,
    left + 108,
    top + 46,
    70,
    7.2,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  setTextColor(pdf, "#475569");
  const message = props.template.mensagemValidacao;
  pdf.text(pdf.splitTextToSize(message, 180).slice(0, 3), left + 8, top + 58);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(6.5);
  pdf.text(`Chave de autenticação: ${validationCode}`, left + 8, top + 78);
  pdf.text(
    fitText(pdf, `Endereço de validação: ${validationUrl}`, 180),
    left + 8,
    top + 86,
  );

  if (qrCode?.image) {
    const qrSize = Math.min(38, props.template.qrCodeSize);
    pdf.addImage(
      qrCode.image.bytes,
      qrCode.image.format,
      left + width - qrSize - 14,
      top + 34,
      qrSize,
      qrSize,
      "diario-validation-qr",
      "FAST",
    );
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6);
    setTextColor(pdf, "#64748b");
    pdf.text(
      "ESCANEIE PARA VALIDAR",
      left + width - qrSize / 2 - 14,
      top + 76,
      { align: "center" },
    );
  }

  const signatureY = top + height - 17;
  pdf.setDrawColor(...hexToRgb("#64748b"));
  pdf.line(left + 12, signatureY, left + 100, signatureY);
  pdf.line(left + width - 100, signatureY, left + width - 12, signatureY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  setTextColor(pdf, "#64748b");
  pdf.text("ASSINATURA DO PROFESSOR", left + 56, signatureY + 6, {
    align: "center",
  });
  pdf.text(
    "ASSINATURA DO COORDENADOR DO CURSO",
    left + width - 56,
    signatureY + 6,
    { align: "center" },
  );
};

const drawFrequencyPages = (
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

const drawResultPages = (
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
        "Nº",
        "Aluno(a)",
        "P",
        "TI",
        "TG",
        "S",
        "CQ",
        "O",
        "Média",
        "Rec.",
        "Final",
        "Faltas",
        "Freq.",
        "Resultado",
      ],
      rows,
      widths: [7, 75, 12, 12, 12, 12, 12, 12, 13, 13, 13, 12, 14, 35],
      startY: STANDARD_CONTENT_TOP,
      fontSize: 5.4,
      rowHeight,
    });

    if (isLastGroup) {
      const legendY = STANDARD_CONTENT_TOP + 8 + students.length * rowHeight +
        5;
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

const drawContentPages = (
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
  const regularPageCapacity = STANDARD_CONTENT_BOTTOM - STANDARD_CONTENT_TOP -
    8;
  const finalPageCapacity = 145 - STANDARD_CONTENT_TOP - 8;
  const maxRowsPerPage = 8;
  let lastContentPageIndex: number | null = null;
  let finalGroupStart = entries.length;
  let finalGroupHeight = 0;

  while (
    finalGroupStart > 0 &&
    entries.length - finalGroupStart < maxRowsPerPage &&
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
      headers: [
        "Dia/Mês",
        "Conteúdo programático",
        "Prática pedagógica",
        "C.H.",
      ],
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

      const signatureY = Math.min(
        190,
        Math.max(observationsY + observationsHeight + 16, 171),
      );
      pdf.setDrawColor(...hexToRgb("#172033"));
      pdf.line(CONTENT_LEFT + 18, signatureY, CONTENT_LEFT + 105, signatureY);
      pdf.line(
        PAGE_WIDTH - CONTENT_RIGHT - 105,
        signatureY,
        PAGE_WIDTH - CONTENT_RIGHT - 18,
        signatureY,
      );
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6);
      setTextColor(pdf, "#64748b");
      pdf.text("ASSINATURA DO PROFESSOR", CONTENT_LEFT + 61.5, signatureY + 6, {
        align: "center",
      });
      pdf.text(
        "ASSINATURA DO COORDENADOR DO CURSO",
        PAGE_WIDTH - CONTENT_RIGHT - 61.5,
        signatureY + 6,
        { align: "center" },
      );
    }
  });
  return lastContentPageIndex;
};

const drawInstructions = (
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

export interface BuiltDiarioPdfWithManifest {
  /** Mantido somente para a prévia web; o Edge deve persistir `bytes`. */
  pdf: jsPDF;
  bytes: Uint8Array;
  sha256: string;
  manifest: DiaryPdfSemanticManifest;
}

const buildDiarioPdfInternal = (
  props: DiarioPrintDocumentProps,
  resolvedAssets: DiarioPdfResolvedAssets,
) => {
  const isBlank = props.exportMode === "EM_BRANCO";
  const validationCode = props.validationCode?.trim() || "";
  if (
    !isBlank && props.template.imprimirValidacaoContracapa && !validationCode
  ) {
    throw new Error(
      "O código canônico do Diário não foi confirmado. Nenhum PDF foi gerado.",
    );
  }
  const {
    logo,
    watermark,
    qrCode,
    validationUrl,
  } = validateResolvedAssets(props, resolvedAssets);
  const institution = resolveInstitution(props, resolvedAssets.institution);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: `Diário de Classe - ${props.disciplina.nome}`,
    subject: `${props.turma.cursoNome || "Curso"} - ${
      props.turma.codigo || props.turma.nome || "Turma"
    }`,
    author: "Universo Cursos e Consultoria",
    creator: "Universo Cursos e Consultoria",
  });

  drawCover(pdf, props, logo, watermark, institution);
  if (!isBlank && props.template.imprimirValidacaoContracapa) {
    drawBackCover(
      pdf,
      props,
      logo,
      watermark,
      institution,
      qrCode,
      validationUrl,
    );
  }
  drawFrequencyPages(pdf, props, logo, watermark, institution);
  drawResultPages(pdf, props, logo, watermark, institution);
  const targetPageIndex = drawContentPages(
    pdf,
    props,
    logo,
    watermark,
    institution,
  );
  if (props.template.imprimirInstrucoes) {
    drawInstructions(pdf, props, logo, watermark, institution);
  }

  return {
    pdf,
    targetPageIndex,
  };
};

export const composeDiarioPdfWithManifest = async (
  props: DiarioPrintDocumentProps,
  assets: DiarioPdfResolvedAssets,
): Promise<BuiltDiarioPdfWithManifest> => {
  const snapshot = assertValidDiarioPdfAcademicSnapshot(props);
  const built = buildDiarioPdfInternal(snapshot, assets);
  if (built.targetPageIndex === null) {
    throw new Error(
      "O Diário não possui página de conteúdo apta a receber os carimbos.",
    );
  }
  // O artefato original precisa ser reproduzível em retries concorrentes da
  // Edge. O jsPDF gera ID e CreationDate variáveis por padrão; ambos são
  // derivados exclusivamente do snapshot congelado antes de serializar.
  built.pdf.setFileId(
    `${snapshot.source.academicRevisionSha256.slice(0, 16)}${
      snapshot.templateSource.sha256.slice(0, 16)
    }`
      .toUpperCase(),
  );
  built.pdf.setCreationDate(new Date(snapshot.generatedAt));
  const bytes = new Uint8Array(built.pdf.output("arraybuffer"));
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  );
  const sha256 = [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    pdf: built.pdf,
    bytes,
    sha256,
    manifest: createDiaryPdfSemanticManifest({
      pageCount: built.pdf.getNumberOfPages(),
      targetPageIndex: built.targetPageIndex,
      instructionsPageIndex: props.template.imprimirInstrucoes
        ? built.pdf.getNumberOfPages() - 1
        : null,
    }),
  };
};

export const composeDiarioPdf = async (
  props: DiarioPrintDocumentProps,
  assets: DiarioPdfResolvedAssets,
) =>
  (
    await buildDiarioPdfInternal(props, assets)
  ).pdf;
