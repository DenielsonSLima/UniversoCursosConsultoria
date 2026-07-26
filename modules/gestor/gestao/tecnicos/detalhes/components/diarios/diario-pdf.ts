import { jsPDF } from 'jspdf';
import capaDiarioPadrao from '../../../../../../../Documentos/Capa-Diario.jpg';
import {
  getDocumentValidationQrUrl,
  getDocumentValidationUrl,
} from '../../../../../../shared/document-validation/document-validation.url';
import type { DiarioGradeResult, DiarioPrintDocumentProps } from './diario-classe.types';
import { getDiarioValidationCode, getStudentStats } from './diario-classe.utils';
import { DEFAULT_ACTIVE_INSTRUMENTS } from './diario-instruments';
import { chunks, moduloNumero } from './diario-print.utils';
import { drawTable, fitText } from './diario-pdf-table';

const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_LEFT = 14;
const CONTENT_RIGHT = 11;
const CONTENT_WIDTH = PAGE_WIDTH - CONTENT_LEFT - CONTENT_RIGHT;
const NAVY = '#071a33';

type PdfImage = { bytes: Uint8Array; format: 'PNG' | 'JPEG' | 'WEBP' };

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
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

const imageFormat = (contentType: string, url: string): PdfImage['format'] => {
  const type = contentType.toLowerCase();
  const path = url.toLowerCase();
  if (type.includes('png') || path.includes('.png')) return 'PNG';
  if (type.includes('webp') || path.includes('.webp')) return 'WEBP';
  return 'JPEG';
};

const loadImage = async (url?: string | null): Promise<PdfImage | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      format: imageFormat(response.headers.get('content-type') || '', url),
    };
  } catch {
    return null;
  }
};

const loadFirstImage = async (urls: Array<string | null | undefined>) => {
  for (const url of urls) {
    const image = await loadImage(url);
    if (image) return image;
  }
  return null;
};

const addPage = (pdf: jsPDF) => {
  if (pdf.getNumberOfPages() > 0) pdf.addPage('a4', 'landscape');
};

const addFullPageImage = (pdf: jsPDF, image: PdfImage | null) => {
  if (!image) return;
  pdf.addImage(image.bytes, image.format, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, 'FAST');
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
  pdf.setFont('helvetica', 'bold');
  pdf.text(label, x, y);
  const labelWidth = pdf.getTextWidth(label);
  pdf.setFont('helvetica', 'normal');
  pdf.text(fitText(pdf, value, Math.max(1, maxWidth - labelWidth)), x + labelWidth, y);
};

const drawHeaderLogo = (pdf: jsPDF, logo: PdfImage | null) => {
  if (!logo) return;
  const properties = pdf.getImageProperties(logo.bytes);
  const height = 10;
  const width = Math.min(50, height * (properties.width / properties.height));
  pdf.addImage(logo.bytes, logo.format, PAGE_WIDTH - CONTENT_RIGHT - width, 8, width, height, undefined, 'FAST');
};

const drawStandardPage = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  title: string,
  pageLabel: string,
  logo: PdfImage | null,
) => {
  addPage(pdf);
  setFillColor(pdf, '#0879d8');
  pdf.rect(0, 0, 7, PAGE_HEIGHT, 'F');
  setFillColor(pdf, '#e30613');
  pdf.rect(8.5, 0, 1.5, PAGE_HEIGHT, 'F');
  drawHeaderLogo(pdf, logo);

  setTextColor(pdf);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(title.toUpperCase(), PAGE_WIDTH / 2, 14, { align: 'center' });

  const metaY = 20;
  const metaHeight = 13;
  const columnWidths = normalizeWidths([1.1, 1, 1.4]);
  const meta = [
    ['Curso: ', props.turma.cursoNome || '—'],
    ['Turma: ', props.turma.nome || props.turma.codigo || '—'],
    ['Professor(a): ', props.disciplina.professor || 'Não atribuído'],
    ['Módulo: ', props.moduloNome],
    ['Unidade educacional: ', props.disciplina.nome],
    ['Carga horária: ', `${props.disciplina.cargaHoraria || 0}h`],
  ];
  pdf.setDrawColor(...hexToRgb('#172033'));
  pdf.setLineWidth(0.25);
  meta.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = CONTENT_LEFT + columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const y = metaY + row * (metaHeight / 2);
    pdf.rect(x, y, columnWidths[column], metaHeight / 2);
    drawLabelValue(pdf, label, value, x + 1.5, y + 4.2, columnWidths[column] - 3, 6.8);
  });

  pdf.setDrawColor(...hexToRgb('#94a3b8'));
  pdf.line(CONTENT_LEFT, 202, PAGE_WIDTH - CONTENT_RIGHT, 202);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.2);
  setTextColor(pdf, '#64748b');
  pdf.text(props.template.rodape || 'Documento Oficial - Diário de Classe emitido eletronicamente', CONTENT_LEFT, 205);
  pdf.text(pageLabel, PAGE_WIDTH - CONTENT_RIGHT, 205, { align: 'right' });
  if (props.exportMode === 'EM_BRANCO') {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.2);
    setTextColor(pdf, '#b45309');
    pdf.text('MODELO PARA PREENCHIMENTO MANUAL - SEM REGISTROS ACADÊMICOS', PAGE_WIDTH / 2, 205, { align: 'center' });
  }
};

const coverFieldValue = (props: DiarioPrintDocumentProps, id: string) => {
  if (id === 'curso') return props.turma.cursoNome || '—';
  if (id === 'modulo') return moduloNumero(props.moduloNome);
  if (id === 'areaTematica') return props.moduloNome.replace(/^M[ÓO]DULO\s+[IVXLC]+\s*[-–—]?\s*/i, '');
  if (id === 'disciplina') return props.disciplina.nome;
  if (id === 'turma') return props.turma.nome || props.turma.codigo || '—';
  if (id === 'professor') {
    return props.disciplina.professor && props.disciplina.professor !== 'Não atribuído'
      ? props.disciplina.professor
      : 'Professor(a)';
  }
  return '—';
};

const drawCover = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  background: PdfImage | null,
) => {
  addFullPageImage(pdf, background);
  const fields = props.template.capaCampos?.filter((field) => field.visible) || [];
  const resolvedFields = fields.length > 0
    ? fields
    : [
        { id: 'curso', label: 'CURSO: ', x: 29.6, y: 52.8, width: 50.5, fontSize: 11, color: NAVY, bold: true, align: 'left' as const },
        { id: 'modulo', label: 'MÓDULO: ', x: 29.6, y: 58.8, width: 50.5, fontSize: 11, color: NAVY, bold: true, align: 'left' as const },
        { id: 'areaTematica', label: 'ÁREA TEMÁTICA: ', x: 29.6, y: 64.8, width: 50.5, fontSize: 11, color: NAVY, bold: true, align: 'left' as const },
        { id: 'disciplina', label: 'UNIDADE EDUCACIONAL: ', x: 29.6, y: 70.8, width: 50.5, fontSize: 11, color: NAVY, bold: true, align: 'left' as const },
        { id: 'turma', label: 'TURMA: ', x: 29.6, y: 76.8, width: 50.5, fontSize: 11, color: NAVY, bold: true, align: 'left' as const },
        { id: 'professor', label: '', x: 66.3, y: 83.5, width: 23.5, fontSize: 10, color: NAVY, bold: false, borderTop: true, align: 'center' as const },
      ];

  resolvedFields.forEach((field) => {
    const x = (field.x / 100) * PAGE_WIDTH;
    const y = (field.y / 100) * PAGE_HEIGHT;
    const width = (field.width / 100) * PAGE_WIDTH;
    setTextColor(pdf, field.color || NAVY);
    pdf.setFontSize(field.fontSize || 10);
    pdf.setFont('helvetica', field.bold ? 'bold' : 'normal');
    const hasBorderTop = 'borderTop' in field && field.borderTop;
    if (hasBorderTop) {
      pdf.setDrawColor(...hexToRgb(field.color || NAVY));
      pdf.line(x, y - 3.5, x + width, y - 3.5);
    }
    const text = fitText(pdf, `${field.label || ''}${coverFieldValue(props, field.id)}`, width);
    const align = field.align || 'left';
    const textY = hasBorderTop ? y + 1.5 : y;
    pdf.text(text, align === 'center' ? x + width / 2 : align === 'right' ? x + width : x, textY, { align });
  });

  if (props.exportMode === 'EM_BRANCO') {
    const badgeWidth = 104;
    const badgeX = PAGE_WIDTH - badgeWidth - 13;
    setFillColor(pdf, '#fff7ed');
    pdf.setDrawColor(...hexToRgb('#f59e0b'));
    pdf.roundedRect(badgeX, 8, badgeWidth, 9, 1.5, 1.5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    setTextColor(pdf, '#9a3412');
    pdf.text(
      'MODELO MANUAL - NOTAS E FREQUÊNCIA EM BRANCO',
      badgeX + badgeWidth / 2,
      13.5,
      { align: 'center' },
    );
  }
};

const drawBackCover = (
  pdf: jsPDF,
  props: DiarioPrintDocumentProps,
  background: PdfImage | null,
  qrCode: PdfImage | null,
) => {
  addPage(pdf);
  addFullPageImage(pdf, background);
  const validationCode = getDiarioValidationCode(props.turma, props.disciplina);
  const left = 20;
  const top = 14;
  const width = PAGE_WIDTH - 35;
  const height = PAGE_HEIGHT - 28;
  pdf.setDrawColor(...hexToRgb('#94a3b8'));
  pdf.roundedRect(left, top, width, height, 3, 3);
  setTextColor(pdf);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(['REGISTRO DE VALIDAÇÃO', 'E ASSINATURA ELETRÔNICA'], left + 8, top + 13);
  pdf.line(left + 8, top + 26, left + width - 8, top + 26);

  drawLabelValue(pdf, 'CURSO: ', props.turma.cursoNome || '—', left + 8, top + 55, 95, 8);
  drawLabelValue(pdf, 'TURMA: ', props.turma.nome || props.turma.codigo || '—', left + 108, top + 55, 70, 8);
  drawLabelValue(pdf, 'UNIDADE EDUCACIONAL: ', props.disciplina.nome, left + 8, top + 64, 155, 8);
  drawLabelValue(pdf, 'MÓDULO: ', moduloNumero(props.moduloNome), left + 8, top + 73, 70, 8);
  drawLabelValue(pdf, 'PROFESSOR(A): ', props.disciplina.professor || '—', left + 108, top + 73, 70, 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  setTextColor(pdf, '#475569');
  const message = props.template.mensagemValidacao
    || 'Este diário de classe eletrônico foi gerado e assinado digitalmente nos termos do Regimento Escolar da instituição e da legislação de validação de documentos acadêmicos do Ministério da Educação.';
  pdf.text(pdf.splitTextToSize(message, 180), left + 8, top + 92);
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(7);
  pdf.text(`Chave de autenticação: ${validationCode}`, left + 8, top + 118);
  pdf.text(fitText(pdf, `Endereço de validação: ${getDocumentValidationUrl(validationCode)}`, 180), left + 8, top + 126);

  if (qrCode) {
    const qrSize = Math.min(38, props.template.qrCodeSize || 28);
    pdf.addImage(qrCode.bytes, qrCode.format, left + width - qrSize - 14, top + 48, qrSize, qrSize);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6);
    setTextColor(pdf, '#64748b');
    pdf.text('ESCANEIE PARA VALIDAR', left + width - qrSize / 2 - 14, top + 90, { align: 'center' });
  }

  const signatureY = top + height - 28;
  pdf.setDrawColor(...hexToRgb('#64748b'));
  pdf.line(left + 12, signatureY, left + 100, signatureY);
  pdf.line(left + width - 100, signatureY, left + width - 12, signatureY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  setTextColor(pdf, '#64748b');
  pdf.text('ASSINATURA DO PROFESSOR', left + 56, signatureY + 6, { align: 'center' });
  pdf.text('ASSINATURA DO COORDENADOR DO CURSO', left + width - 56, signatureY + 6, { align: 'center' });
};

const drawFrequencyPages = (pdf: jsPDF, props: DiarioPrintDocumentProps, logo: PdfImage | null) => {
  const isBlank = props.exportMode === 'EM_BRANCO';
  chunks(props.aulas, 10).forEach((aulaGroup, aulaIndex) => {
    const rowsPerPage = aulaGroup.length <= 4 ? 30 : aulaGroup.length <= 6 ? 24 : aulaGroup.length <= 8 ? 22 : 18;
    chunks(props.students, rowsPerPage).forEach((students, studentIndex) => {
      drawStandardPage(pdf, props, 'Registro de Frequência', `Frequência ${aulaIndex + 1}.${studentIndex + 1}`, logo);
      const rows = students.map((student, index) => {
        const totalFaltas = props.gradesMap[student.id]?.total_faltas;
        return [
          String(studentIndex * rowsPerPage + index + 1),
          `${student.nome} (${student.matricula})`,
          ...aulaGroup.map((aula) => isBlank ? '' : props.attendanceMap[student.id]?.[aula.id] || '—'),
          isBlank || totalFaltas === null || totalFaltas === undefined ? '' : String(totalFaltas),
        ];
      });
      drawTable(pdf, {
        headers: ['Nº', 'Aluno(a)', ...aulaGroup.map((aula) => `${aula.dataLabel} (${String(aula.cargaHoraria).padStart(2, '0')}hrs)`), 'Faltas'],
        rows,
        widths: [8, 60, ...aulaGroup.map(() => 30), 15],
        startY: 36,
        fontSize: aulaGroup.length > 8 ? 5.4 : 6,
        rowHeight: (198 - 36 - 8) / rowsPerPage,
      });
    });
  });
};

const drawResultPages = (pdf: jsPDF, props: DiarioPrintDocumentProps, logo: PdfImage | null) => {
  const active = props.activeInstruments || DEFAULT_ACTIVE_INSTRUMENTS;
  const isBlank = props.exportMode === 'EM_BRANCO';
  chunks(props.students, 30).forEach((students, groupIndex) => {
    drawStandardPage(pdf, props, 'Notas e Resultado Final', `Resultados ${groupIndex + 1}`, logo);
    const value = (enabled: boolean, grade: number | null | undefined) =>
      isBlank ? '' : enabled && grade !== null && grade !== undefined ? Number(grade).toFixed(1) : '—';
    const rows = students.map((student, index) => {
      const grade: Partial<DiarioGradeResult> = props.gradesMap[student.id] || {};
      const stats = getStudentStats(props.gradesMap, student.id);
      return [
        String(groupIndex * 30 + index + 1),
        student.nome,
        value(active.p, grade.p),
        value(active.ti, grade.ti),
        value(active.tg, grade.tg),
        value(active.s, grade.s),
        value(active.cq, grade.cq),
        value(active.o, grade.o),
        isBlank ? '' : stats.mediaParcial === null ? '—' : stats.mediaParcial.toFixed(1),
        isBlank ? '' : grade.rec === null || grade.rec === undefined ? '—' : Number(grade.rec).toFixed(1),
        isBlank ? '' : stats.mediaFinal === null ? '—' : stats.mediaFinal.toFixed(1),
        isBlank ? '' : String(stats.faltas),
        isBlank ? '' : stats.frequencia === null ? '—' : `${stats.frequencia}%`,
        isBlank ? '' : stats.resultado.replaceAll('_', ' '),
      ];
    });
    drawTable(pdf, {
      headers: ['Nº', 'Aluno(a)', 'P', 'TI', 'TG', 'S', 'CQ', 'O', 'Média', 'Rec.', 'Final', 'Faltas', 'Freq.', 'Resultado'],
      rows,
      widths: [7, 75, 12, 12, 12, 12, 12, 12, 13, 13, 13, 12, 14, 35],
      startY: 36,
      fontSize: 5.4,
      rowHeight: (198 - 36 - 8) / 30,
    });
  });
};

const drawContentPages = (pdf: jsPDF, props: DiarioPrintDocumentProps, logo: PdfImage | null) => {
  chunks(props.aulas, 10).forEach((aulas, groupIndex, groups) => {
    drawStandardPage(pdf, props, 'Conteúdo Programático e Prática Pedagógica', `Conteúdo ${groupIndex + 1}`, logo);
    const last = groupIndex === groups.length - 1;
    const tableEndY = last ? 151 : 198;
    const contentRowHeight = (tableEndY - 36 - 8) / 10;
    drawTable(pdf, {
      headers: ['Dia/Mês', 'Conteúdo programático', 'Prática pedagógica', 'C.H.'],
      rows: aulas.map((aula) => [
        aula.dataLabel,
        aula.titulo,
        props.praticasMap[aula.id] || '—',
        `${aula.cargaHoraria}h`,
      ]),
      widths: [24, 115, 115, 18],
      startY: 36,
      endY: tableEndY,
      fontSize: 7,
      rowHeight: contentRowHeight,
      alignments: ['center', 'left', 'left', 'center'],
    });
    if (last) {
      const tableBottom = 36 + 8 + aulas.length * contentRowHeight;
      const observationsY = tableBottom + 6;
      const observationsHeight = 23;
      pdf.setDrawColor(...hexToRgb('#94a3b8'));
      setFillColor(pdf, '#f8fafc');
      pdf.roundedRect(CONTENT_LEFT, observationsY, CONTENT_WIDTH, observationsHeight, 1.5, 1.5, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      setTextColor(pdf);
      pdf.text('OBSERVAÇÕES:', CONTENT_LEFT + 3, observationsY + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      const observations = pdf.splitTextToSize(
        props.exportMode === 'EM_BRANCO' ? '' : props.observacoes || 'Sem observações registradas.',
        CONTENT_WIDTH - 6,
      ).slice(0, 3);
      pdf.text(observations, CONTENT_LEFT + 3, observationsY + 12);

      const signatureY = Math.min(181, Math.max(observationsY + observationsHeight + 20, 131));
      pdf.setDrawColor(...hexToRgb('#172033'));
      pdf.line(CONTENT_LEFT + 18, signatureY, CONTENT_LEFT + 105, signatureY);
      pdf.line(PAGE_WIDTH - CONTENT_RIGHT - 105, signatureY, PAGE_WIDTH - CONTENT_RIGHT - 18, signatureY);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);
      setTextColor(pdf, '#64748b');
      pdf.text('ASSINATURA DO PROFESSOR', CONTENT_LEFT + 61.5, signatureY + 6, { align: 'center' });
      pdf.text('ASSINATURA DO COORDENADOR DO CURSO', PAGE_WIDTH - CONTENT_RIGHT - 61.5, signatureY + 6, { align: 'center' });
    }
  });
};

const drawInstructions = (pdf: jsPDF, props: DiarioPrintDocumentProps, logo: PdfImage | null) => {
  drawStandardPage(pdf, props, 'Instruções de Preenchimento', 'Instruções', logo);
  const instructions = [
    '1. Registre o conteúdo e a prática pedagógica na mesma data da aula.',
    '2. Na frequência, utilize P para presença e F para falta.',
    '3. Confira todos os lançamentos antes do fechamento do período.',
    '4. Alterações após o fechamento exigem reabertura formal e justificativa.',
    '5. O resultado final é calculado pelo sistema conforme as regras acadêmicas.',
    '6. Professor e coordenação devem validar o diário ao término da unidade.',
  ];
  instructions.forEach((instruction, index) => {
    const column = index < 3 ? 0 : 1;
    const row = index % 3;
    const x = 22 + column * 134;
    const y = 43 + row * 45;
    const cardWidth = 122;
    const cardHeight = 35;

    pdf.setDrawColor(...hexToRgb('#cbd5e1'));
    setFillColor(pdf, row % 2 === 0 ? '#f8fafc' : '#ffffff');
    pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

    setFillColor(pdf, '#0879d8');
    pdf.circle(x + 10, y + 10, 5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    setTextColor(pdf, '#ffffff');
    pdf.text(String(index + 1), x + 10, y + 10.8, { align: 'center', baseline: 'middle' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    setTextColor(pdf);
    const text = instruction.replace(/^\d+\.\s*/, '');
    pdf.text(pdf.splitTextToSize(text, cardWidth - 25), x + 19, y + 9);
  });
};

export const buildDiarioPdf = async (props: DiarioPrintDocumentProps) => {
  const isBlank = props.exportMode === 'EM_BRANCO';
  const validationCode = getDiarioValidationCode(props.turma, props.disciplina);
  const [cover, backCover, logo, qrCode] = await Promise.all([
    loadFirstImage([props.template.capaUrl, capaDiarioPadrao]),
    loadImage(props.template.contracapaUrl),
    loadFirstImage([props.template.cabecalhoLogoUrl, '/LogoUniverso.png']),
    !isBlank && props.template.imprimirValidacaoContracapa
      ? loadImage(getDocumentValidationQrUrl(validationCode, 240))
      : Promise.resolve(null),
  ]);

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: `Diário de Classe - ${props.disciplina.nome}`,
    subject: `${props.turma.cursoNome || 'Curso'} - ${props.turma.codigo || props.turma.nome || 'Turma'}`,
    author: 'Universo Cursos e Consultoria',
    creator: 'Universo Cursos e Consultoria',
  });

  drawCover(pdf, props, cover);
  if (!isBlank && (props.template.contracapaUrl || props.template.imprimirValidacaoContracapa)) {
    drawBackCover(pdf, props, backCover, qrCode);
  }
  drawFrequencyPages(pdf, props, logo);
  drawResultPages(pdf, props, logo);
  drawContentPages(pdf, props, logo);
  if (props.template.imprimirInstrucoes) drawInstructions(pdf, props, logo);

  return pdf;
};
