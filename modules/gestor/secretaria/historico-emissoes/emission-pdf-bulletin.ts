import { type jsPDF } from 'jspdf';
import { normalizeCanonicalPdfText } from '../shared/canonical-document-vector-pdf';
import { canonicalText } from '../shared/canonical-document-render.utils';
import { type AcademicComponentRow } from './historico-emissoes.types';
import {
  PAGE_WIDTH_MM,
  PAGE_HEIGHT_MM,
  TEMPLATE_HEIGHT_PX,
  PAGE_LEFT_MM,
  PAGE_RIGHT_MM,
  PAGE_BOTTOM_MM,
  BODY_TOP_MM,
  type TemplateField,
  type VectorPage,
  type VectorDocument,
  decodeHtmlEntities,
  assertNoResidualTemplateTokens,
  pxToMmY,
} from './emission-pdf-core';
import { resolveEmissionVectorTemplate } from './emission-registration-snapshot';

const BULLETIN_TABLE_TOKEN = '{{TABELA_BOLETIM_TECNICO}}';
const BULLETIN_BODY_GAP_MM = 2.5;
const BULLETIN_FOOTER_GAP_MM = 4;
const BULLETIN_TABLE_COLUMN_WIDTHS = [78, 14, 16, 30, 32] as const;
const BULLETIN_TABLE_HEADERS = [
  'Componente Curricular',
  'CH',
  'Nota',
  'Frequência',
  'Situação',
] as const;

const getBulletinBodyBottom = (
  fields: TemplateField[],
  pageIndex: number,
) => {
  const fieldTops = fields
    .map((field) => pxToMmY(Number(field.y || 0) - pageIndex * TEMPLATE_HEIGHT_PX))
    .filter((value) => Number.isFinite(value) && value > BODY_TOP_MM);
  return fieldTops.length
    ? Math.min(...fieldTops) - BULLETIN_FOOTER_GAP_MM
    : PAGE_HEIGHT_MM - PAGE_BOTTOM_MM;
};

const isBulletinHeading = (line: string) => (
  /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/u.test(line)
  && line === line.toLocaleUpperCase('pt-BR')
);

interface BulletinTextRun {
  text: string;
  bold: boolean;
}

const BULLETIN_BOLD_OPEN = '\u0001';
const BULLETIN_BOLD_CLOSE = '\u0002';

const bulletinHtmlToStyledParagraphs = (html: string): BulletinTextRun[][] => {
  const marked = decodeHtmlEntities(String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<(?:strong|b)\b[^>]*>/gi, BULLETIN_BOLD_OPEN)
    .replace(/<\/(?:strong|b)\s*>/gi, BULLETIN_BOLD_CLOSE)
    .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));

  return marked
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && Boolean(lines[index - 1])))
    .map((line) => {
      if (!line) return [];
      const runs: BulletinTextRun[] = [];
      let bold = false;
      let buffer = '';
      const flush = () => {
        if (buffer) runs.push({ text: buffer, bold });
        buffer = '';
      };
      [...line].forEach((character) => {
        if (character === BULLETIN_BOLD_OPEN) {
          flush();
          bold = true;
        } else if (character === BULLETIN_BOLD_CLOSE) {
          flush();
          bold = false;
        } else {
          buffer += character;
        }
      });
      flush();
      return runs;
    });
};

const wrapBulletinRuns = (
  pdf: jsPDF,
  runs: BulletinTextRun[],
  width: number,
  forceBold: boolean,
) => {
  const lines: BulletinTextRun[][] = [];
  let currentLine: BulletinTextRun[] = [];
  let currentWidth = 0;

  const appendRun = (text: string, bold: boolean) => {
    const previous = currentLine.at(-1);
    if (previous?.bold === bold) {
      previous.text += text;
    } else {
      currentLine.push({ text, bold });
    }
  };

  const commitLine = () => {
    if (currentLine.length) lines.push(currentLine);
    currentLine = [];
    currentWidth = 0;
  };

  runs.forEach((run) => {
    const bold = forceBold || run.bold;
    run.text.split(/(\s+)/).filter(Boolean).forEach((token) => {
      const isSpace = /^\s+$/.test(token);
      if (isSpace && !currentLine.length) return;
      pdf.setFont('times', bold ? 'bold' : 'normal');
      const tokenWidth = pdf.getTextWidth(token);
      if (!isSpace && currentLine.length && currentWidth + tokenWidth > width) {
        commitLine();
      }
      if (isSpace && currentWidth + tokenWidth > width) {
        commitLine();
        return;
      }
      appendRun(token, bold);
      currentWidth += tokenWidth;
    });
  });
  commitLine();
  return lines;
};

const drawBulletinText = (
  pdf: jsPDF,
  html: string,
  startY: number,
  maximumY: number,
  context: string,
) => {
  const paragraphs = bulletinHtmlToStyledParagraphs(html);
  if (!paragraphs.length) return startY;

  let cursorY = startY;
  const width = PAGE_WIDTH_MM - PAGE_LEFT_MM - PAGE_RIGHT_MM;
  paragraphs.forEach((runs) => {
    if (!runs.length) {
      cursorY += 2;
      return;
    }
    const text = runs.map((run) => run.text).join('').trim();
    const heading = isBulletinHeading(text);
    const fontSize = heading ? 10.2 : 9.5;
    const lineHeight = heading ? 1.2 : 1.3;
    pdf.setFontSize(fontSize);
    pdf.setTextColor(15, 23, 42);
    const lines = wrapBulletinRuns(pdf, runs, width, heading);
    const height = lines.length * fontSize * 0.352778 * lineHeight;
    if (cursorY + height > maximumY + 0.01) {
      throw new Error(
        `${context} invade a faixa reservada aos campos inferiores do boletim. `
        + 'Revise a quantidade de componentes ou a geometria do modelo antes de emitir.',
      );
    }
    const lineHeightMm = fontSize * 0.352778 * lineHeight;
    lines.forEach((line, lineIndex) => {
      let cursorX = PAGE_LEFT_MM;
      line.forEach((run) => {
        pdf.setFont('times', run.bold ? 'bold' : 'normal');
        pdf.text(normalizeCanonicalPdfText(run.text), cursorX, cursorY + lineIndex * lineHeightMm, {
          baseline: 'top',
        });
        cursorX += pdf.getTextWidth(run.text);
      });
    });
    cursorY += height + (heading ? 2.2 : 1.25);
  });
  return cursorY;
};

interface BulletinTableRowPlan {
  kind: 'header' | 'module' | 'component';
  values: string[];
  lines: string[][];
  height: number;
}

const getBulletinCellLines = (
  pdf: jsPDF,
  value: string,
  width: number,
  fontSize: number,
  bold: boolean,
  context: string,
) => {
  pdf.setFont('times', bold ? 'bold' : 'normal');
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(
    normalizeCanonicalPdfText(value),
    Math.max(1, width - 3),
  ) as string[];
  if (lines.length > 3) {
    throw new Error(`${context} não cabe na largura canônica da tabela do boletim.`);
  }
  return lines.length ? lines : ['—'];
};

const buildBulletinTablePlan = (
  pdf: jsPDF,
  components: AcademicComponentRow[],
) => {
  const plans: BulletinTableRowPlan[] = [];
  const headerFontSize = 6.7;
  const headerLines = BULLETIN_TABLE_HEADERS.map((value, index) => (
    getBulletinCellLines(
      pdf,
      value,
      BULLETIN_TABLE_COLUMN_WIDTHS[index],
      headerFontSize,
      true,
      `O cabeçalho “${value}”`,
    )
  ));
  plans.push({
    kind: 'header',
    values: [...BULLETIN_TABLE_HEADERS],
    lines: headerLines,
    height: Math.max(7, ...headerLines.map((lines) => lines.length * 2.65 + 2.2)),
  });

  let currentModule: string | null = null;
  components.forEach((component) => {
    const moduleName = canonicalText(component.moduleName, 'Módulo');
    if (moduleName !== currentModule) {
      const moduleLabel = moduleName.toLocaleUpperCase('pt-BR');
      const moduleLines = getBulletinCellLines(
        pdf,
        moduleLabel,
        BULLETIN_TABLE_COLUMN_WIDTHS.reduce((total, width) => total + width, 0),
        6.8,
        true,
        `O módulo “${moduleName}”`,
      );
      plans.push({
        kind: 'module',
        values: [moduleLabel],
        lines: [moduleLines],
        height: Math.max(6.2, moduleLines.length * 2.7 + 2),
      });
      currentModule = moduleName;
    }

    const workload = Number(component.cargaHoraria || 0);
    const values = [
      canonicalText(component.discipline, 'Componente não informado'),
      workload > 0 ? `${workload}h` : '—',
      component.nota === null || component.nota === undefined
        ? '—'
        : Number(component.nota).toFixed(1),
      component.frequencia === null || component.frequencia === undefined
        ? '—'
        : `${Number(component.frequencia).toFixed(0)}%`,
      canonicalText(component.situacao, 'Em análise'),
    ];
    const lines = values.map((value, index) => getBulletinCellLines(
      pdf,
      value,
      BULLETIN_TABLE_COLUMN_WIDTHS[index],
      6.8,
      false,
      `O valor “${value}”`,
    ));
    plans.push({
      kind: 'component',
      values,
      lines,
      height: Math.max(6.2, ...lines.map((cellLines) => cellLines.length * 2.7 + 2)),
    });
  });
  return plans;
};

const drawBulletinTableCell = (
  pdf: jsPDF,
  lines: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    align: 'left' | 'center';
    bold: boolean;
    fill?: [number, number, number];
    fontSize: number;
  },
) => {
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.2);
  if (options.fill) {
    pdf.setFillColor(...options.fill);
    pdf.rect(x, y, width, height, 'FD');
  } else {
    pdf.rect(x, y, width, height, 'S');
  }
  pdf.setFont('times', options.bold ? 'bold' : 'normal');
  pdf.setFontSize(options.fontSize);
  pdf.setTextColor(15, 23, 42);
  const lineHeightMm = options.fontSize * 0.352778 * 1.1;
  const textY = y + Math.max(1, (height - lines.length * lineHeightMm) / 2);
  pdf.text(
    lines,
    options.align === 'center' ? x + width / 2 : x + 1.5,
    textY,
    {
      align: options.align,
      baseline: 'top',
      lineHeightFactor: 1.1,
    },
  );
};

const drawBulletinTable = (
  pdf: jsPDF,
  components: AcademicComponentRow[],
  startY: number,
  maximumY: number,
) => {
  if (!components.length) {
    return drawBulletinText(
      pdf,
      '<p>Não há componentes curriculares disponíveis no momento.</p>',
      startY,
      maximumY,
      'A mensagem de componentes curriculares',
    );
  }

  const plan = buildBulletinTablePlan(pdf, components);
  const requiredHeight = plan.reduce((total, row) => total + row.height, 0);
  if (startY + requiredHeight > maximumY + 0.01) {
    throw new Error(
      'A tabela do boletim invade a faixa reservada aos campos inferiores. '
      + 'Revise a quantidade de componentes ou a geometria canônica antes de emitir.',
    );
  }

  const totalWidth = BULLETIN_TABLE_COLUMN_WIDTHS.reduce((total, width) => total + width, 0);
  let cursorY = startY;
  plan.forEach((row) => {
    if (row.kind === 'module') {
      drawBulletinTableCell(
        pdf,
        row.lines[0],
        PAGE_LEFT_MM,
        cursorY,
        totalWidth,
        row.height,
        { align: 'left', bold: true, fill: [241, 245, 249], fontSize: 6.8 },
      );
      cursorY += row.height;
      return;
    }

    let cursorX = PAGE_LEFT_MM;
    row.lines.forEach((lines, columnIndex) => {
      const width = BULLETIN_TABLE_COLUMN_WIDTHS[columnIndex];
      drawBulletinTableCell(
        pdf,
        lines,
        cursorX,
        cursorY,
        width,
        row.height,
        {
          align: columnIndex === 0 ? 'left' : 'center',
          bold: row.kind === 'header',
          fill: row.kind === 'header' ? [248, 250, 252] : undefined,
          fontSize: row.kind === 'header' ? 6.7 : 6.8,
        },
      );
      cursorX += width;
    });
    cursorY += row.height;
  });
  return cursorY;
};

export const drawAcademicBulletinBody = (
  pdf: jsPDF,
  visual: VectorDocument,
  page: VectorPage,
  pageIndex: number,
) => {
  const tokenCount = page.bodyTemplate.split(BULLETIN_TABLE_TOKEN).length - 1;
  if (tokenCount > 1) {
    throw new Error('O modelo do boletim contém mais de uma tabela acadêmica na mesma página.');
  }
  const [beforeTemplate, afterTemplate = ''] = page.bodyTemplate.split(BULLETIN_TABLE_TOKEN);
  const beforeHtml = resolveEmissionVectorTemplate(visual.source, beforeTemplate);
  const afterHtml = resolveEmissionVectorTemplate(visual.source, afterTemplate);
  assertNoResidualTemplateTokens(beforeHtml, 'O conteúdo anterior à tabela do boletim');
  assertNoResidualTemplateTokens(afterHtml, 'O conteúdo posterior à tabela do boletim');

  const maximumY = getBulletinBodyBottom(page.fields, pageIndex);
  if (maximumY <= BODY_TOP_MM) {
    throw new Error('Os campos inferiores do boletim invadem a área reservada ao conteúdo acadêmico.');
  }

  let cursorY = drawBulletinText(
    pdf,
    beforeHtml,
    BODY_TOP_MM,
    maximumY,
    'O cabeçalho acadêmico',
  );
  if (tokenCount === 1) {
    const components = visual.source.preview.academicData?.componentes;
    if (!Array.isArray(components)) {
      throw new Error('O payload canônico do boletim não retornou os componentes estruturados da tabela.');
    }
    cursorY = drawBulletinTable(
      pdf,
      components,
      cursorY + BULLETIN_BODY_GAP_MM,
      maximumY,
    );
  }
  drawBulletinText(
    pdf,
    afterHtml,
    cursorY + BULLETIN_BODY_GAP_MM,
    maximumY,
    'O resumo acadêmico',
  );
};

