import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { jsPDF } from 'jspdf';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocumentHeader } from './DocumentHeader.tsx';
import {
  LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT,
  PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT,
  drawCanonicalInstitutionalHeader,
} from '../secretaria/shared/canonical-institutional-header-pdf.ts';
import {
  resolveInstitutionalHeader,
  type InstitutionalDocumentMeta,
} from './institutional-header.model.ts';

interface TextRecord {
  text: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  width: number;
}

interface RectRecord {
  x: number;
  y: number;
  width: number;
  height: number;
}

class PdfProbe {
  readonly texts: TextRecord[] = [];
  readonly rects: RectRecord[] = [];
  private fontSize = 12;
  private fontStyle = 'normal';

  readonly internal: { pageSize: { getWidth: () => number } };

  constructor(readonly pageWidth: number) {
    this.internal = { pageSize: { getWidth: () => pageWidth } };
  }

  setFont(_family: string, style: string) {
    this.fontStyle = style;
    return this;
  }

  setFontSize(size: number) {
    this.fontSize = size;
    return this;
  }

  getFontSize() {
    return this.fontSize;
  }

  getTextWidth(value: string) {
    const weightFactor = this.fontStyle === 'bold' ? 0.19 : 0.18;
    return String(value).length * this.fontSize * weightFactor;
  }

  text(
    value: string,
    x: number,
    y: number,
    options: { align?: 'left' | 'center' | 'right' } = {},
  ) {
    this.texts.push({
      text: value,
      x,
      y,
      align: options.align ?? 'left',
      width: this.getTextWidth(value),
    });
    return this;
  }

  roundedRect(x: number, y: number, width: number, height: number) {
    this.rects.push({ x, y, width, height });
    return this;
  }

  setFillColor() { return this; }
  setDrawColor() { return this; }
  setTextColor() { return this; }
  setLineWidth() { return this; }
  line() { return this; }
}

const renderProbe = (
  orientation: 'portrait' | 'landscape',
  fields: Parameters<typeof resolveInstitutionalHeader>[0]['overrides'],
  meta: InstitutionalDocumentMeta,
) => {
  const pageWidth = orientation === 'portrait' ? 210 : 297;
  const probe = new PdfProbe(pageWidth);
  const institution = resolveInstitutionalHeader({ overrides: fields });
  const result = drawCanonicalInstitutionalHeader(
    probe as unknown as jsPDF,
    institution,
    null,
    { orientation, meta },
  );
  return { institution, probe, result };
};

const assertTextsInOrder = (records: readonly TextRecord[], expected: readonly string[]) => {
  let cursor = -1;
  expected.forEach((text) => {
    cursor = records.findIndex((record, index) => index > cursor && record.text === text);
    assert.notEqual(cursor, -1, `texto ausente ou fora de ordem: ${text}`);
  });
};

const visibleReactText = (markup: string) => markup
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const assertFragmentsInOrder = (text: string, expected: readonly string[]) => {
  let cursor = -1;
  expected.forEach((fragment) => {
    cursor = text.indexOf(fragment, cursor + 1);
    assert.notEqual(cursor, -1, `texto React ausente ou fora de ordem: ${fragment}`);
  });
};

test('React e PDF preservam ordem, textos, meta e altura nas duas orientações', async () => {
  const [reactSource, pdfSource] = await Promise.all([
    readFile(new URL('./DocumentHeader.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../secretaria/shared/canonical-institutional-header-pdf.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(reactSource, /detailColumns = \[institution\.leftLines, institution\.rightLines\]/);
  assert.match(reactSource, /h-\[35mm\].*min-h-\[35mm\].*max-h-\[35mm\]/);
  assert.match(reactSource, /h-\[10\.5mm\].*min-h-\[10\.5mm\].*max-h-\[10\.5mm\]/);
  assert.match(reactSource, /className="truncate text-\[9px\]/);
  assert.match(pdfSource, /roundedRect\(left, top, width, 10\.5/);
  assert.match(pdfSource, /contentTop: options\.meta \? metaTop \+ 13\.5 : bottom \+ 5/);

  const fields = {
    nomeFantasia: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    telefone: '(79) 99999-9999',
    endereco: 'Rua A',
    numero: '10',
    complemento: 'Sala 1',
    bairro: 'Centro',
    cidade: 'Japoatã',
    uf: 'SE',
    cep: '49950-000',
    isMatriz: true,
  };
  const meta = {
    eyebrow: 'Relatório institucional',
    title: 'Matrículas ativas',
    label: 'Competência',
    value: 'Agosto de 2026',
  };

  for (const orientation of ['portrait', 'landscape'] as const) {
    const { institution, probe, result } = renderProbe(orientation, fields, meta);
    const expectedDetails = [...institution.leftLines, ...institution.rightLines]
      .flatMap((line) => [`${line.label}: `, line.value]);
    const reactText = visibleReactText(renderToStaticMarkup(React.createElement(
      DocumentHeader,
      { polo: fields, orientation, meta },
    )));

    assertFragmentsInOrder(reactText, expectedDetails.map((text) => text.trim()));
    assertFragmentsInOrder(reactText, [
      meta.eyebrow,
      meta.title,
      meta.label,
      meta.value,
    ]);
    assertTextsInOrder(probe.texts, expectedDetails);
    assertTextsInOrder(probe.texts, [
      meta.eyebrow.toUpperCase(),
      meta.title.toUpperCase(),
      meta.label.toUpperCase(),
      meta.value.toUpperCase(),
    ]);
    assert.equal(institution.leftLines.length, 3);
    assert.equal(institution.rightLines.length, 3);
    const layout = orientation === 'portrait'
      ? PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT
      : LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT;
    assert.equal(result.contentTop, layout.bottom + 15.5);
    assert.ok(probe.rects.some((rect) => rect.height === 10.5 && rect.y === layout.bottom + 2));
  }
});

test('PDF extremo reduz e elide sem cruzar os limites das colunas', () => {
  const repeated = 'CONTEÚDO INSTITUCIONAL MUITO EXTENSO '.repeat(12);
  const meta = {
    eyebrow: repeated,
    title: repeated,
    label: repeated,
    value: repeated,
  };

  for (const orientation of ['portrait', 'landscape'] as const) {
    const { institution, probe, result } = renderProbe(orientation, {
      nomeFantasia: repeated,
      cnpj: repeated,
      telefone: repeated,
      endereco: repeated,
      numero: repeated,
      complemento: repeated,
      bairro: repeated,
      cidade: repeated,
      uf: repeated,
      cep: repeated,
      isMatriz: true,
    }, meta);
    const layout = orientation === 'portrait'
      ? PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT
      : LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT;
    const contentX = layout.left + layout.logoSize + 5;
    const detailsGap = orientation === 'landscape' ? 9 : 5;
    const detailsWidth = (probe.pageWidth - layout.right - contentX - detailsGap) / 2;
    const columnXs = [contentX, contentX + detailsWidth + detailsGap] as const;
    let cursor = 0;

    [institution.leftLines, institution.rightLines].forEach((lines, columnIndex) => {
      lines.forEach((line) => {
        const label = `${line.label}: `;
        const labelIndex = probe.texts.findIndex(
          (record, index) => index >= cursor && record.text === label,
        );
        assert.notEqual(labelIndex, -1, `rótulo ausente: ${label}`);
        const labelRecord = probe.texts[labelIndex];
        const valueRecord = probe.texts[labelIndex + 1];
        const columnRight = columnXs[columnIndex] + detailsWidth;
        assert.ok(labelRecord.x + labelRecord.width <= columnRight + 0.001);
        assert.ok(valueRecord.x + valueRecord.width <= columnRight + 0.001);
        if (line.label === 'E-mail') {
          assert.equal(valueRecord.text, line.value);
        } else {
          assert.ok(valueRecord.text.endsWith('...'));
        }
        cursor = labelIndex + 2;
      });
    });

    assert.equal(probe.texts.filter((record) => /^(CNPJ|Contato|E-mail|Cidade\/UF|Endereço|Bairro): $/.test(record.text)).length, 6);
    assert.ok(probe.texts.every((record) => !record.text.includes('\n')));
    assert.ok(probe.texts.some((record) => record.text.endsWith('...')));
    assert.equal(result.contentTop, layout.bottom + 15.5);
  }
});
