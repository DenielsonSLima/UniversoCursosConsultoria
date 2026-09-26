import { type jsPDF } from 'jspdf';
import { drawCanonicalPdfText, normalizeCanonicalPdfText } from '../shared/canonical-document-vector-pdf';
import { emissionHtmlToVectorText, pxToMmX, pxToMmY, assertTextFits } from './emission-pdf-core';

interface BalancedHtmlElement {
  openTag: string;
  inner: string;
  full: string;
}

const parseInlineStyle = (tag: string) => {
  const match = tag.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  if (!match) return {} as Record<string, string>;
  return Object.fromEntries(match[2]
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter((parts) => parts.length >= 2)
    .map(([property, ...value]) => [property.trim().toLowerCase(), value.join(':').trim()]));
};

const extractBalancedElement = (
  html: string,
  tagName: 'section' | 'div' | 'h4' | 'strong',
  startIndex: number,
): BalancedHtmlElement | null => {
  const opening = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
  opening.lastIndex = startIndex;
  const openMatch = opening.exec(html);
  if (!openMatch || openMatch.index !== startIndex) return null;

  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'ig');
  tokenPattern.lastIndex = opening.lastIndex;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    if (/^<\//.test(token[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return {
        openTag: openMatch[0],
        inner: html.slice(opening.lastIndex, token.index),
        full: html.slice(startIndex, tokenPattern.lastIndex),
      };
    }
  }
  return null;
};

const findBalancedElement = (
  html: string,
  tagName: 'section' | 'div' | 'h4' | 'strong',
  predicate: (element: BalancedHtmlElement) => boolean = () => true,
) => {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const element = extractBalancedElement(html, tagName, match.index);
    if (element && predicate(element)) return element;
  }
  return null;
};

const collectDirectDivs = (html: string) => {
  const result: BalancedHtmlElement[] = [];
  const tokenPattern = /<\/?div\b[^>]*>/ig;
  let depth = 0;
  let start = -1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    if (!/^<\//.test(token[0])) {
      if (depth === 0) start = token.index;
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      const element = extractBalancedElement(html, 'div', start);
      if (element) result.push(element);
      start = -1;
    }
  }
  return result;
};

const cssPixels = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const expandGridColumns = (value: string | undefined) => {
  const source = String(value || '').replace(
    /repeat\(\s*(\d+)\s*,\s*([^()]+)\)/gi,
    (_match, count, unit) => Array.from({ length: Number(count) }, () => unit.trim()).join(' '),
  );
  const columns = source
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part) && part > 0);
  return columns.length ? columns : [1];
};

const parseGridRows = (value: string | undefined, cellCount: number, columnCount: number) => {
  const repeated = String(value || '').match(/repeat\(\s*(\d+)/i);
  if (repeated) return Math.max(1, Number(repeated[1]));
  return Math.max(1, Math.ceil(cellCount / columnCount));
};

const parseSpacing = (value: string | undefined) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  const vertical = cssPixels(parts[0]);
  const horizontal = cssPixels(parts[1], vertical);
  return { vertical, horizontal };
};

const assertCellLines = (
  pdf: jsPDF,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  maxLines: number,
  context: string,
) => {
  const lines = pdf.splitTextToSize(normalizeCanonicalPdfText(text), width) as string[];
  const requiredHeight = lines.length * fontSize * 0.352778 * 1.12;
  if (lines.length > maxLines || requiredHeight > height + 0.3) {
    throw new Error(
      `${context} ultrapassa a célula canônica do modelo. Revise a geometria ou o conteúdo antes de emitir.`,
    );
  }
  return lines;
};

// A célula conserva sua geometria. Só textos extensos voltam gradualmente
// aos tamanhos anteriores; conteúdo que nem assim cabe continua sendo rejeitado.
const fitCellTypography = (
  pdf: jsPDF,
  label: string,
  value: string,
  width: number,
  height: number,
  enlarged: boolean,
) => {
  for (let step = enlarged ? 0 : 24; step <= 24; step += 1) {
    const scale = 1 - step / 24;
    const labelSize = 4.8 + 1.2 * scale;
    const valueSize = 6.2 + 2.3 * scale;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(labelSize);
    const labelLines = label ? pdf.splitTextToSize(normalizeCanonicalPdfText(label), width) as string[] : [];
    pdf.setFont('times', 'normal');
    pdf.setFontSize(valueSize);
    const valueLines = value ? pdf.splitTextToSize(normalizeCanonicalPdfText(value), width) as string[] : [];
    const labelHeight = labelLines.length ? labelLines.length * labelSize * 0.352778 * 1.1 + 0.45 : 0;
    const valueHeight = valueLines.length * valueSize * 0.352778 * 1.12;
    const labelFits = labelLines.length * labelSize * 0.352778 * 1.12 <= height + 0.3;
    if (labelFits && labelLines.length <= 2 && valueLines.length <= 2 && labelHeight + valueHeight <= height + 0.3) {
      return { labelSize, valueSize };
    }
  }
  return { labelSize: 4.8, valueSize: 6.2 };
};

export const drawRegistrationGrid = (
  pdf: jsPDF,
  html: string,
  x: number,
  y: number,
  width: number,
  height: number,
  context: string,
  enlargedTypography = false,
) => {
  const sectionStart = html.search(/<section\b/i);
  if (sectionStart < 0) return false;
  const section = extractBalancedElement(html, 'section', sectionStart);
  if (!section) return false;
  const sectionStyle = parseInlineStyle(section.openTag);
  const header = findBalancedElement(section.inner, 'h4');
  const sectionIsGrid = sectionStyle.display === 'grid';
  const grid = sectionIsGrid
    ? section
    : findBalancedElement(section.inner, 'div', (element) => (
      parseInlineStyle(element.openTag).display === 'grid'
    ));

  const hasBackground = Boolean(sectionStyle['background-color'] || sectionStyle.background);
  const hasBorder = Boolean(sectionStyle.border);
  pdf.setFillColor(255, 255, 255);
  if (sectionStyle.border?.includes('#94a3b8')) pdf.setDrawColor(148, 163, 184);
  else pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.22);
  const radius = sectionStyle['border-radius'] ? Math.min(2.2, pxToMmX(cssPixels(sectionStyle['border-radius']))) : 0;
  const panelStyle = hasBackground && hasBorder ? 'FD' : hasBackground ? 'F' : hasBorder ? 'S' : null;
  if (panelStyle && radius > 0) pdf.roundedRect(x, y, width, height, radius, radius, panelStyle);
  else if (panelStyle) pdf.rect(x, y, width, height, panelStyle);

  if (!grid) {
    const padding = parseSpacing(sectionStyle.padding || '6px 8px');
    const paddingX = pxToMmX(padding.horizontal);
    const paddingY = pxToMmY(padding.vertical);
    const text = emissionHtmlToVectorText(section.inner);
    if (!text) return true;
    pdf.setFont('times', 'normal');
    const textWidth = Math.max(1, width - paddingX * 2);
    const textHeight = Math.max(1, height - paddingY * 2);
    let fontSize = enlargedTypography ? 8.5 : 7;
    while (fontSize > 7) {
      pdf.setFontSize(fontSize);
      const lineCount = (pdf.splitTextToSize(normalizeCanonicalPdfText(text), textWidth) as string[]).length;
      if (lineCount * fontSize * 0.352778 * 1.2 <= textHeight + 0.3) break;
      fontSize = Math.max(7, fontSize - 0.1);
    }
    pdf.setFontSize(fontSize);
    pdf.setTextColor(15, 23, 42);
    const lines = assertTextFits(
      pdf,
      text,
      textWidth,
      textHeight,
      fontSize,
      1.2,
      context,
    );
    pdf.text(lines, x + paddingX, y + paddingY, { baseline: 'top', lineHeightFactor: 1.2 });
    return true;
  }

  let gridY = y + pxToMmY(cssPixels(sectionStyle['margin-top']));
  let gridHeight = height - (gridY - y);
  if (gridHeight <= 0) {
    throw new Error(`${context} não possui área útil após a margem superior.`);
  }
  if (header) {
    const headerHeight = Math.min(gridHeight, pxToMmY(18));
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(x, y, width, headerHeight, radius, radius, 'F');
    pdf.rect(x, y + Math.max(0, headerHeight - radius), width, Math.min(radius, headerHeight), 'F');
    pdf.setDrawColor(219, 234, 254);
    pdf.line(x, y + headerHeight, x + width, y + headerHeight);
    pdf.setFont('helvetica', 'bold');
    const headerText = emissionHtmlToVectorText(header.inner).toUpperCase();
    const headerWidth = width - pxToMmX(14);
    let headerFontSize = enlargedTypography ? 7 : 5.6;
    pdf.setFontSize(headerFontSize);
    while (headerFontSize > 5.6 && pdf.getTextWidth(headerText) > headerWidth) {
      headerFontSize = Math.max(5.6, headerFontSize - 0.1);
      pdf.setFontSize(headerFontSize);
    }
    pdf.setTextColor(0, 26, 51);
    drawCanonicalPdfText(pdf, headerText, x + pxToMmX(7), y + pxToMmY(4), {
      maxWidth: headerWidth,
      maxLines: 1,
    });
    gridY += headerHeight;
    gridHeight -= headerHeight;
  }

  const gridStyle = parseInlineStyle(grid.openTag);
  const inheritedTextAlignSource = gridStyle['text-align'] || sectionStyle['text-align'];
  const inheritedTextAlign = inheritedTextAlignSource === 'center' || inheritedTextAlignSource === 'right'
    ? inheritedTextAlignSource
    : 'left';
  const cells = collectDirectDivs(grid.inner);
  if (!cells.length) return false;
  const columns = expandGridColumns(gridStyle['grid-template-columns']);
  const rows = parseGridRows(gridStyle['grid-template-rows'], cells.length, columns.length);
  const gap = parseSpacing(gridStyle.gap);
  const padding = parseSpacing(gridStyle.padding || sectionStyle.padding);
  const gapX = pxToMmX(gap.horizontal);
  const gapY = pxToMmY(gap.vertical);
  const paddingX = pxToMmX(padding.horizontal);
  const paddingY = pxToMmY(padding.vertical);
  const availableWidth = width - paddingX * 2 - gapX * (columns.length - 1);
  const availableHeight = gridHeight - paddingY * 2 - gapY * (rows - 1);
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error(`${context} possui uma grade vetorial sem área útil.`);
  }
  const columnUnit = availableWidth / columns.reduce((total, current) => total + current, 0);
  const columnWidths = columns.map((column) => column * columnUnit);
  const rowHeight = availableHeight / rows;
  const occupied = Array.from({ length: rows }, () => Array(columns.length).fill(false));

  const locateCell = (span: number) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column <= columns.length - span; column += 1) {
        if (occupied[row].slice(column, column + span).every((value) => !value)) {
          for (let index = column; index < column + span; index += 1) occupied[row][index] = true;
          return { row, column };
        }
      }
    }
    return null;
  };

  cells.forEach((cell, cellIndex) => {
    const cellStyle = parseInlineStyle(cell.openTag);
    const spanMatch = cellStyle['grid-column']?.match(/span\s+(\d+)/i);
    const span = Math.min(columns.length, Math.max(1, Number(spanMatch?.[1] || 1)));
    const position = locateCell(span);
    if (!position) throw new Error(`${context} possui células além da grade canônica configurada.`);
    const cellX = x + paddingX
      + columnWidths.slice(0, position.column).reduce((total, current) => total + current, 0)
      + gapX * position.column;
    const cellY = gridY + paddingY + position.row * (rowHeight + gapY);
    const cellWidth = columnWidths
      .slice(position.column, position.column + span)
      .reduce((total, current) => total + current, 0)
      + gapX * (span - 1);
    const borderTop = String(cellStyle['border-top'] || '');
    const cellPadding = parseSpacing(cellStyle.padding);
    const paddingTop = pxToMmY(cssPixels(cellStyle['padding-top'], cellPadding.vertical));
    if (borderTop && !/\bnone\b/i.test(borderTop)) {
      const color = borderTop.match(/#([0-9a-f]{6})\b/i)?.[1];
      if (color) {
        pdf.setDrawColor(
          Number.parseInt(color.slice(0, 2), 16),
          Number.parseInt(color.slice(2, 4), 16),
          Number.parseInt(color.slice(4, 6), 16),
        );
      } else {
        pdf.setDrawColor(15, 23, 42);
      }
      pdf.setLineWidth(Math.max(0.1, pxToMmY(cssPixels(borderTop, 1))));
      pdf.line(cellX, cellY, cellX + cellWidth, cellY);
    }
    const strong = findBalancedElement(cell.inner, 'strong');
    const label = strong ? emissionHtmlToVectorText(strong.inner) : '';
    const value = emissionHtmlToVectorText(strong ? cell.inner.replace(strong.full, '') : cell.inner);
    const innerX = cellX + 0.2;
    const textWidth = Math.max(1, cellWidth - 0.4);
    const cellTextAlign = cellStyle['text-align'] === 'center' || cellStyle['text-align'] === 'right'
      ? cellStyle['text-align']
      : inheritedTextAlign;
    let cursorY = cellY + paddingTop;
    const { labelSize, valueSize } = fitCellTypography(
      pdf, label.toUpperCase(), value, textWidth,
      Math.max(0.5, cellY + rowHeight - cursorY), enlargedTypography,
    );

    if (label) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(labelSize);
      pdf.setTextColor(15, 23, 42);
      const labelLines = assertCellLines(
        pdf,
        label.toUpperCase(),
        textWidth,
        Math.max(0.5, cellY + rowHeight - cursorY),
        labelSize,
        2,
        `${context}, rótulo ${cellIndex + 1}`,
      );
      const labelX = cellTextAlign === 'center'
        ? cellX + cellWidth / 2
        : cellTextAlign === 'right'
          ? cellX + cellWidth - 0.2
          : innerX;
      pdf.text(labelLines, labelX, cursorY, {
        align: cellTextAlign,
        baseline: 'top',
        lineHeightFactor: 1.1,
      });
      cursorY += labelLines.length * labelSize * 0.352778 * 1.1 + 0.45;
    }
    if (value) {
      pdf.setFont('times', 'normal');
      pdf.setFontSize(valueSize);
      pdf.setTextColor(51, 65, 85);
      const valueHeight = Math.max(0.5, cellY + rowHeight - cursorY);
      const valueLines = assertCellLines(pdf, value, textWidth, valueHeight, valueSize, 2, `${context}, valor ${cellIndex + 1}`);
      const valueX = cellTextAlign === 'center'
        ? cellX + cellWidth / 2
        : cellTextAlign === 'right'
          ? cellX + cellWidth - 0.2
          : innerX;
      pdf.text(valueLines, valueX, cursorY, {
        align: cellTextAlign,
        baseline: 'top',
        lineHeightFactor: 1.12,
      });
    }
  });
  return true;
};
