import { jsPDF } from 'jspdf';

const CONTENT_LEFT = 14;
const CONTENT_RIGHT = 11;
const CONTENT_WIDTH = 297 - CONTENT_LEFT - CONTENT_RIGHT;
const NAVY = '#071a33';
const GRID = '#202735';
const PALE_BLUE = '#eef4fa';
const ROW_ALT = '#f8fafc';

interface TableOptions {
  headers: string[];
  headerSecondary?: string[];
  rows: string[][];
  rowSecondary?: string[][];
  widths: number[];
  startY: number;
  endY?: number;
  fontSize?: number;
  alignments?: Array<'left' | 'center' | 'right'>;
  rowHeight?: number;
  rowHeights?: number[];
  wrapColumns?: number[];
}

interface FrequencyHeaderMeeting {
  label: string;
  secondary: string;
  sessions: Array<{ label: string; secondary: string }>;
}

interface GroupedFrequencyTableOptions {
  meetings: FrequencyHeaderMeeting[];
  rows: string[][];
  rowSecondary?: string[][];
  widths: number[];
  startY: number;
  endY?: number;
  fontSize?: number;
  rowHeight?: number;
}

const CELL_PADDING = 1.2;
const MM_PER_POINT = 25.4 / 72;
const LINE_HEIGHT_FACTOR = 1.15;

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
  pdf.setTextColor(...hexToRgb(color));
};

const setFillColor = (pdf: jsPDF, color: string) => {
  pdf.setFillColor(...hexToRgb(color));
};

export const fitText = (pdf: jsPDF, value: unknown, maxWidth: number) => {
  const text = String(value ?? '—');
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = '...';
  let shortened = text;
  while (
    shortened.length > 1
    && pdf.getTextWidth(`${shortened}${ellipsis}`) > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}${ellipsis}`;
};

const normalizeWidths = (widths: number[]) => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * CONTENT_WIDTH);
};

const splitCellText = (pdf: jsPDF, value: unknown, maxWidth: number): string[] => {
  const lines = pdf.splitTextToSize(String(value ?? '—'), Math.max(1, maxWidth));
  return Array.isArray(lines) ? lines : [String(lines)];
};

export const measureTableRowHeights = (
  pdf: jsPDF,
  rows: string[][],
  widths: number[],
  fontSize: number,
  wrapColumns: number[],
  minRowHeight = 7,
) => {
  const normalizedWidths = normalizeWidths(widths);
  const wrappedColumnSet = new Set(wrapColumns);
  const lineHeight = fontSize * MM_PER_POINT * LINE_HEIGHT_FACTOR;

  pdf.setFontSize(fontSize);

  return rows.map((row) => row.reduce((height, cell, columnIndex) => {
    if (!wrappedColumnSet.has(columnIndex)) return height;

    pdf.setFont('helvetica', columnIndex === 1 ? 'bold' : 'normal');
    const lines = splitCellText(
      pdf,
      cell,
      normalizedWidths[columnIndex] - CELL_PADDING * 2,
    );
    return Math.max(height, lines.length * lineHeight + CELL_PADDING * 2);
  }, minRowHeight));
};

const drawCellText = (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right',
  wrap = false,
) => {
  const availableWidth = Math.max(1, width - CELL_PADDING * 2);
  const textX = align === 'center'
    ? x + width / 2
    : align === 'right'
      ? x + width - CELL_PADDING
      : x + CELL_PADDING;

  if (wrap) {
    const lines = splitCellText(pdf, text, availableWidth);
    const fontHeight = pdf.getFontSize() * MM_PER_POINT;
    const lineHeight = fontHeight * LINE_HEIGHT_FACTOR;
    const blockHeight = fontHeight + Math.max(0, lines.length - 1) * lineHeight;
    const firstBaseline = y + Math.max(CELL_PADDING, (height - blockHeight) / 2) + fontHeight * 0.8;
    pdf.text(lines, textX, firstBaseline, {
      align,
      lineHeightFactor: LINE_HEIGHT_FACTOR,
    });
    return;
  }

  const fitted = fitText(pdf, text, availableWidth);
  const baseline = y + height / 2 + pdf.getFontSize() * 0.13;
  pdf.text(fitted, textX, baseline, { align, baseline: 'middle' });
};

const drawInlineCellText = (
  pdf: jsPDF,
  primaryText: string,
  secondaryText: string,
  x: number,
  y: number,
  width: number,
  height: number,
  align: 'left' | 'center' | 'right',
  primaryFontSize: number,
  primaryFontStyle: 'normal' | 'bold',
  primaryColor = '#111827',
) => {
  const availableWidth = Math.max(1, width - CELL_PADDING * 2);
  const hasSecondaryText = secondaryText.trim().length > 0;
  let resolvedPrimarySize = primaryFontSize;
  let resolvedSecondarySize = Math.max(3.8, resolvedPrimarySize - 1.4);
  let primaryWidth = 0;
  let secondaryWidth = 0;
  let gapWidth = 0;

  const measure = () => {
    pdf.setFont('helvetica', primaryFontStyle);
    pdf.setFontSize(resolvedPrimarySize);
    primaryWidth = pdf.getTextWidth(primaryText);
    gapWidth = hasSecondaryText ? pdf.getTextWidth(' ') : 0;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(resolvedSecondarySize);
    secondaryWidth = hasSecondaryText ? pdf.getTextWidth(secondaryText) : 0;
  };

  measure();
  while (
    primaryWidth + gapWidth + secondaryWidth > availableWidth
    && resolvedPrimarySize > 4.4
  ) {
    resolvedPrimarySize -= 0.2;
    resolvedSecondarySize = Math.max(3.6, resolvedPrimarySize - 1.4);
    measure();
  }

  const secondary = hasSecondaryText
    ? fitText(pdf, secondaryText, Math.min(secondaryWidth, availableWidth * 0.3))
    : '';
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(resolvedSecondarySize);
  secondaryWidth = pdf.getTextWidth(secondary);

  pdf.setFont('helvetica', primaryFontStyle);
  pdf.setFontSize(resolvedPrimarySize);
  const primary = fitText(
    pdf,
    primaryText,
    Math.max(1, availableWidth - gapWidth - secondaryWidth),
  );
  primaryWidth = pdf.getTextWidth(primary);

  const groupWidth = primaryWidth + gapWidth + secondaryWidth;
  const startX = align === 'center'
    ? x + (width - groupWidth) / 2
    : align === 'right'
      ? x + width - CELL_PADDING - groupWidth
      : x + CELL_PADDING;
  const baseline = y + height / 2 + resolvedPrimarySize * 0.13;

  setTextColor(pdf, primaryColor);
  pdf.text(primary, startX, baseline, { baseline: 'middle' });

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(resolvedSecondarySize);
  setTextColor(pdf, '#64748b');
  pdf.text(secondary, startX + primaryWidth + gapWidth, baseline, { baseline: 'middle' });
};

export const drawTable = (pdf: jsPDF, options: TableOptions) => {
  const {
    headers,
    headerSecondary = [],
    rows,
    rowSecondary = [],
    startY,
    endY = 198,
    fontSize = 6.5,
    alignments = [],
    rowHeights,
    wrapColumns = [],
  } = options;
  const widths = normalizeWidths(options.widths);
  const wrappedColumnSet = new Set(wrapColumns);
  const headerHeight = 8;
  const availableHeight = endY - startY - headerHeight;
  const defaultRowHeight = rows.length ? availableHeight / rows.length : 7;
  const resolvedHeights = rowHeights
    || (wrapColumns.length > 0
      ? measureTableRowHeights(
        pdf,
        rows,
        options.widths,
        fontSize,
        wrapColumns,
        options.rowHeight || defaultRowHeight,
      )
      : rows.map(() => options.rowHeight || defaultRowHeight));

  pdf.setLineWidth(0.2);
  pdf.setDrawColor(...hexToRgb(GRID));
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.5));
  setTextColor(pdf, NAVY);

  let x = CONTENT_LEFT;
  headers.forEach((header, index) => {
    setFillColor(pdf, PALE_BLUE);
    pdf.rect(x, startY, widths[index], headerHeight, 'FD');
    const secondary = headerSecondary[index];
    if (secondary) {
      drawInlineCellText(
        pdf,
        header.toUpperCase(),
        secondary,
        x,
        startY,
        widths[index],
        headerHeight,
        'center',
        Math.min(fontSize, 6.5),
        'bold',
        NAVY,
      );
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(Math.min(fontSize, 6.5));
      setTextColor(pdf, NAVY);
      drawCellText(
        pdf,
        header.toUpperCase(),
        x,
        startY,
        widths[index],
        headerHeight,
        'center',
      );
    }
    x += widths[index];
  });

  pdf.setFontSize(fontSize);
  let y = startY + headerHeight;
  rows.forEach((row, rowIndex) => {
    const height = resolvedHeights[rowIndex] || defaultRowHeight;
    x = CONTENT_LEFT;
    row.forEach((cell, columnIndex) => {
      setFillColor(pdf, rowIndex % 2 === 0 ? '#ffffff' : ROW_ALT);
      pdf.rect(x, y, widths[columnIndex], height, 'FD');
      const alignment = alignments[columnIndex] || (columnIndex === 1 ? 'left' : 'center');
      const secondary = rowSecondary[rowIndex]?.[columnIndex];
      if (secondary) {
        drawInlineCellText(
          pdf,
          cell,
          secondary,
          x,
          y,
          widths[columnIndex],
          height,
          alignment,
          fontSize,
          columnIndex === 1 ? 'bold' : 'normal',
        );
      } else {
        pdf.setFont('helvetica', columnIndex === 1 ? 'bold' : 'normal');
        pdf.setFontSize(fontSize);
        setTextColor(pdf, '#111827');
        drawCellText(
          pdf,
          cell,
          x,
          y,
          widths[columnIndex],
          height,
          alignment,
          wrappedColumnSet.has(columnIndex),
        );
      }
      x += widths[columnIndex];
    });
    y += height;
  });
};

export const drawGroupedFrequencyTable = (
  pdf: jsPDF,
  options: GroupedFrequencyTableOptions,
) => {
  const {
    meetings,
    rows,
    rowSecondary = [],
    startY,
    endY = 198,
    fontSize = 6,
  } = options;
  const widths = normalizeWidths(options.widths);
  const topHeaderHeight = 5;
  const sessionHeaderHeight = 4.5;
  const headerHeight = topHeaderHeight + sessionHeaderHeight;
  const availableHeight = endY - startY - headerHeight;
  const rowHeight = options.rowHeight || (rows.length ? availableHeight / rows.length : 7);
  const lastColumn = widths.length - 1;

  pdf.setLineWidth(0.2);
  pdf.setDrawColor(...hexToRgb(GRID));
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.2));
  setTextColor(pdf, NAVY);

  let x = CONTENT_LEFT;
  setFillColor(pdf, PALE_BLUE);
  pdf.rect(x, startY, widths[0], headerHeight, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.2));
  setTextColor(pdf, NAVY);
  drawCellText(pdf, 'Nº', x, startY, widths[0], headerHeight, 'center');
  x += widths[0];

  setFillColor(pdf, PALE_BLUE);
  pdf.rect(x, startY, widths[1], headerHeight, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.2));
  setTextColor(pdf, NAVY);
  drawCellText(pdf, 'ALUNO(A)', x, startY, widths[1], headerHeight, 'center');
  x += widths[1];

  let sessionColumn = 2;
  meetings.forEach((meeting) => {
    const meetingWidth = meeting.sessions.reduce(
      (total, _session, index) => total + widths[sessionColumn + index],
      0,
    );
    setFillColor(pdf, PALE_BLUE);
    pdf.rect(x, startY, meetingWidth, topHeaderHeight, 'FD');
    drawInlineCellText(
      pdf,
      meeting.label,
      meeting.secondary,
      x,
      startY,
      meetingWidth,
      topHeaderHeight,
      'center',
      Math.min(fontSize, 6.2),
      'bold',
      NAVY,
    );
    let sessionX = x;
    meeting.sessions.forEach((session) => {
      const sessionWidth = widths[sessionColumn];
      setFillColor(pdf, ROW_ALT);
      pdf.rect(sessionX, startY + topHeaderHeight, sessionWidth, sessionHeaderHeight, 'FD');
      drawInlineCellText(
        pdf,
        session.label,
        session.secondary,
        sessionX,
        startY + topHeaderHeight,
        sessionWidth,
        sessionHeaderHeight,
        'center',
        Math.max(4.4, fontSize - 0.4),
        'bold',
        '#1d4ed8',
      );
      sessionX += sessionWidth;
      sessionColumn += 1;
    });
    x += meetingWidth;
  });

  setFillColor(pdf, PALE_BLUE);
  pdf.rect(x, startY, widths[lastColumn], headerHeight, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.min(fontSize, 6.2));
  setTextColor(pdf, NAVY);
  drawCellText(pdf, 'FALTAS', x, startY, widths[lastColumn], headerHeight, 'center');

  let y = startY + headerHeight;
  rows.forEach((row, rowIndex) => {
    x = CONTENT_LEFT;
    row.forEach((cell, columnIndex) => {
      setFillColor(pdf, rowIndex % 2 === 0 ? '#ffffff' : ROW_ALT);
      pdf.rect(x, y, widths[columnIndex], rowHeight, 'FD');
      const alignment = columnIndex === 1 ? 'left' : 'center';
      const secondary = rowSecondary[rowIndex]?.[columnIndex];
      if (secondary) {
        drawInlineCellText(
          pdf,
          cell,
          secondary,
          x,
          y,
          widths[columnIndex],
          rowHeight,
          alignment,
          fontSize,
          columnIndex === 1 ? 'bold' : 'normal',
        );
      } else {
        pdf.setFont('helvetica', columnIndex === 1 ? 'bold' : 'normal');
        pdf.setFontSize(fontSize);
        setTextColor(pdf, '#111827');
        drawCellText(pdf, cell, x, y, widths[columnIndex], rowHeight, alignment);
      }
      x += widths[columnIndex];
    });
    y += rowHeight;
  });
};
