import type { jsPDF } from 'jspdf';
import type { PdfGStateConstructor, TemplateField } from './emission-pdf-core';

const multiplyDocuments = new WeakSet<jsPDF>();
const MULTIPLY_RESOURCE = 'EmissionMultiply';
const EDITOR_DEFAULT_FIELD_Z_INDEX = 30;

/** Match the editor's z-30 field containers; ties retain their configured order. */
export const orderedEmissionFields = (fields: readonly TemplateField[]) => {
  const stackingOrder = (field: TemplateField) => {
    const source = field.style?.zIndex;
    if (source === null || source === undefined || source === '') return EDITOR_DEFAULT_FIELD_Z_INDEX;
    const value = Number(source);
    return Number.isInteger(value) ? value : EDITOR_DEFAULT_FIELD_Z_INDEX;
  };
  return [...fields].sort((left, right) => stackingOrder(left) - stackingOrder(right));
};

const fieldOpacity = (field: TemplateField) => {
  const source = String(field.style?.opacity ?? '').trim();
  if (!source) return 1;
  const value = source.endsWith('%') ? Number(source.slice(0, -1)) / 100 : Number(source);
  if (!Number.isFinite(value)) {
    throw new Error(`A opacidade do campo “${field.id || 'visual'}” não é válida.`);
  }
  return Math.min(1, Math.max(0, value));
};

/** A native graphics layer preserves white pixels and scopes blend/opacity. */
export const drawEmissionFieldLayer = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  field: TemplateField,
  draw: () => void,
) => {
  const opacity = fieldOpacity(field);
  if (opacity === 0) return;
  const blend = field.style?.mixBlendMode || 'normal';
  if (blend !== 'normal' && blend !== 'multiply') {
    throw new Error(`O modo de mesclagem do campo “${field.id || 'visual'}” não é suportado pelo PDF nativo.`);
  }
  pdf.saveGraphicsState();
  const state = { opacity, 'stroke-opacity': opacity };
  pdf.setGState(new GState(state) as never);
  try {
    if (blend === 'multiply') {
      multiplyDocuments.add(pdf);
      (pdf.internal as unknown as { write: (value: string) => void }).write(`/${MULTIPLY_RESOURCE} gs`);
    }
    draw();
  } finally {
    pdf.restoreGraphicsState();
  }
};

/** jsPDF supports alpha only; add the same native BM resource used by EAD. */
export const saveEmissionPdfWithFieldLayers = async (pdf: jsPDF): Promise<Blob> => {
  if (!multiplyDocuments.has(pdf)) return pdf.output('blob');
  const { PDFDocument, PDFDict, PDFName } = await import('pdf-lib');
  const document = await PDFDocument.load(pdf.output('arraybuffer'), { updateMetadata: false });
  const multiply = document.context.register(document.context.obj({ Type: 'ExtGState', BM: 'Multiply' }));
  for (const page of document.getPages()) {
    const resources = page.node.Resources();
    if (!resources) throw new Error('Os recursos vetoriais da emissão não foram preparados.');
    let states = resources.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
    if (!states) {
      states = document.context.obj({});
      resources.set(PDFName.of('ExtGState'), states);
    }
    states.set(PDFName.of(MULTIPLY_RESOURCE), multiply);
  }
  return new Blob([new Uint8Array(await document.save()).buffer], { type: 'application/pdf' });
};
