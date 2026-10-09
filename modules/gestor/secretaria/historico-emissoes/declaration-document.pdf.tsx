import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { jsPDF, GState } from 'jspdf';
import EmissionDocumentPages from './components/EmissionDocumentPages';
import { prepareCardImages } from '../../../shared/pdf/student-card/assets';
import { drawStudentCard } from '../../../shared/pdf/student-card/render';
import { waitForDocumentAssets } from '../../../shared/qrcode/document-assets';
import { drawCanonicalPdfWatermark } from '../shared/canonical-document-vector-pdf';
import { drawCanonicalInstitutionalHeader, normalizeCanonicalInstitutionalHeader } from '../shared/canonical-institutional-header-pdf';
import type { CanonicalDocumentPdfBuildOptions, CanonicalDocumentPdfResult } from '../shared/canonical-document-pdf.types';
import type { EmissionPdfSource } from './emission-pdf-core';

export const isDeclarationPdf = (documento: string) => (
  documento === 'declaracao_matricula' || documento === 'declaracao_frequencia'
);

function assertCompletePage(page: HTMLElement) {
  const bounds = page.getBoundingClientRect();
  if (bounds.width <= 0 || Math.abs(bounds.width / bounds.height - 210 / 297) > 0.01) {
    throw new Error('A declaração não possui a geometria A4 configurada.');
  }
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (!text.data.trim() || !text.parentElement
      || text.parentElement.closest('[data-emission-header], [data-emission-watermark]')) continue;
    if (/\{\{[^}]+\}\}/.test(text.data)) throw new Error('A declaração contém um campo sem valor oficial.');
    const style = window.getComputedStyle(text.parentElement);
    if (style.display === 'none' || style.visibility !== 'visible') continue;
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1
        || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) {
        throw new Error('O texto da declaração excede a página configurada.');
      }
      let parent: HTMLElement | null = text.parentElement;
      while (parent && parent !== page) {
        const parentStyle = window.getComputedStyle(parent);
        const clip = parent.getBoundingClientRect();
        if ((['hidden', 'clip'].includes(parentStyle.overflowX)
          && (rect.left < clip.left - 1 || rect.right > clip.right + 1))
          || (['hidden', 'clip'].includes(parentStyle.overflowY)
          && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1))) {
          throw new Error('Um campo da declaração cortaria o texto configurado.');
        }
        parent = parent.parentElement;
      }
    }
  }
  range.detach();
}

function drawWatermark(pdf: jsPDF, page: HTMLElement, assets: Awaited<ReturnType<typeof prepareCardImages>>) {
  const image = page.querySelector<HTMLImageElement>('[data-emission-watermark] img');
  if (!image) return;
  const asset = assets.images.get(image.currentSrc || image.src);
  if (!asset) throw new Error('A marca d’água configurada não ficou disponível.');
  const style = window.getComputedStyle(image);
  const bounds = page.getBoundingClientRect();
  const rect = image.getBoundingClientRect();
  const factor = 210 / bounds.width;
  const width = Number.parseFloat(style.width) * factor;
  const height = Number.parseFloat(style.height) * factor;
  const transform = style.transform === 'none' ? null : new window.DOMMatrixReadOnly(style.transform);
  const rotation = transform ? -Math.atan2(transform.b, transform.a) * 180 / Math.PI : 0;
  const centerX = (rect.left + rect.width / 2 - bounds.left) * factor;
  const centerY = (rect.top + rect.height / 2 - bounds.top) * factor;
  drawCanonicalPdfWatermark(pdf, GState, {
    enabled: true, imageUrl: asset.dataUrl, image: asset,
    label: null, opacity: Number(style.opacity), scale: 100, rotate: rotation,
  }, { x: centerX - width / 2, y: centerY - height / 2, width, height, textSize: 0 });
}

async function finishPdf(pdf: jsPDF) {
  // Signatures retain their configured Multiply blend without changing image bytes.
  const { PDFDocument, PDFDict, PDFName } = await import('pdf-lib');
  const document = await PDFDocument.load(pdf.output('arraybuffer'), { updateMetadata: false });
  const multiply = document.context.register(document.context.obj({ Type: 'ExtGState', BM: 'Multiply' }));
  for (const page of document.getPages()) {
    const resources = page.node.Resources();
    if (!resources) throw new Error('Os recursos vetoriais da declaração não foram preparados.');
    let states = resources.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    if (!states) {
      states = document.context.obj({});
      resources.set(PDFName.of('ExtGState'), states);
    }
    states.set(PDFName.of('CardMultiply'), multiply);
  }
  return new Blob([new Uint8Array(await document.save()).buffer], { type: 'application/pdf' });
}

/** Measure the saved HTML model without wrapping or modifying any text node.
 * Text, rules and fields are native PDF objects; only original assets are images.
 * The isolated A4 source does not depend on the portal viewport or DevTools width.
 */
export async function createDeclarationDocumentsPdf(
  sources: readonly EmissionPdfSource[],
  options: CanonicalDocumentPdfBuildOptions = {},
): Promise<CanonicalDocumentPdfResult> {
  if (!sources.length || sources.some(source => !isDeclarationPdf(source.emission.documento))) {
    throw new Error('A seleção não contém somente declarações acadêmicas.');
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: '794px',
    fontSize: '12px', fontFamily: '"Times New Roman", Times, serif', pointerEvents: 'none' });
  document.body.appendChild(host);
  const root = createRoot(host);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4',
    compress: true, precision: 6, putOnlyUsedFonts: true });
  pdf.setProperties({ title: 'Declaração acadêmica', author: 'Universo Cursos e Consultoria' });
  let pageCount = 0;
  try {
    for (const [sourceIndex, { emission, preview }] of sources.entries()) {
      if (!preview.template || typeof preview.template !== 'object') {
        throw new Error('O modelo oficial da declaração não foi localizado.');
      }
      flushSync(() => root.render(<EmissionDocumentPages key={sourceIndex} emission={emission}
        templateConfig={preview.template} certificatePreview={null}
        watermark={preview.watermark} poloInfo={preview.polo} academicPreviewData={preview.academicData} />));
      await waitForDocumentAssets(host);
      await document.fonts.ready;
      const pages = [...host.querySelectorAll<HTMLElement>('.print-page')];
      if (!pages.length) throw new Error('Nenhuma página foi preparada para a declaração.');
      const assets = await prepareCardImages(pages);
      for (const page of pages) {
        assertCompletePage(page);
        if (pageCount++) pdf.addPage('a4', 'portrait');
        pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, 210, 297, 'F');
        drawWatermark(pdf, page, assets);
        const header = page.querySelector<HTMLElement>('[data-emission-header]');
        const logo = header?.querySelector<HTMLImageElement>('img');
        drawCanonicalInstitutionalHeader(pdf, normalizeCanonicalInstitutionalHeader(preview.polo || {}),
          logo ? assets.images.get(logo.currentSrc || logo.src) || null : null, { orientation: 'portrait' });
        // These layers are drawn by their canonical exporters, with the same source assets.
        page.querySelectorAll<HTMLElement>('[data-emission-header], [data-emission-watermark]')
          .forEach(node => { node.style.visibility = 'hidden'; });
        page.style.backgroundColor = 'transparent';
        page.style.borderColor = 'transparent';
        drawStudentCard(pdf, page, 0, 0, assets, { width: 210, height: 297 });
      }
      options.onProgress?.({ current: sourceIndex + 1, total: sources.length });
    }
    return { blob: await finishPdf(pdf), fileName: sources.length > 1
      ? `declaracoes-lote-${sources.length}.pdf`
      : `emissao-${sources[0].emission.documento}-${sources[0].emission.codigo}.pdf` };
  } finally {
    root.unmount();
    host.remove();
  }
}
