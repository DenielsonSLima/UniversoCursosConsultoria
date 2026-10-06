import type { jsPDF } from 'jspdf';
import { resolveCanonicalPdfPhoto } from '../../secretaria/shared/canonical-document-vector-pdf';
import type { CalendarioAulasExportacaoPayload } from './types';
import { getPrintableCalendarioAulasDocumento } from './calendarioAulasExportacao.pdf.layout';

export interface PdfInlineImage {
  dataUri: string;
  format: 'PNG' | 'JPEG' | 'WEBP';
}

export type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

const getInlinePdfImage = (dataUri: string | null): PdfInlineImage | null => {
  if (!dataUri) return null;

  const match = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUri);
  if (!match) return null;
  const imageType = match[1]?.toLowerCase();
  const format = imageType === 'png'
    ? 'PNG'
    : imageType === 'webp'
      ? 'WEBP'
      : 'JPEG';

  return { dataUri, format };
};

const isTrustedInstitutionalAssetUrl = (source: string | null) => {
  if (!source) return false;
  try {
    const url = new URL(source);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.supabase.co')
      && url.pathname.startsWith('/storage/v1/object/');
  } catch {
    return false;
  }
};

/**
 * Logo e marca são ativos institucionais isolados, nunca a página inteira.
 * URLs vêm exclusivamente do payload autorizado pela RPC e são submetidas ao
 * mesmo limite/tipo aceitos pelo compositor canônico antes de entrar no PDF.
 */
export const resolvePdfBrandImage = async (source: string | null): Promise<PdfInlineImage | null> => {
  const inline = getInlinePdfImage(source);
  if (inline) return inline;
  if (!isTrustedInstitutionalAssetUrl(source)) return null;

  const resolved = await resolveCanonicalPdfPhoto(source);
  return resolved ? { dataUri: resolved.dataUrl, format: resolved.format } : null;
};

const normalizeOpacity = (value: number | null, fallback = 0.1) => {
  const raw = Number(value);
  const normalized = Number.isFinite(raw) ? (raw > 1 ? raw / 100 : raw) : fallback;
  return Math.min(1, Math.max(0, normalized));
};

const normalizeScale = (value: number | null) => {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.min(100, Math.max(5, raw)) : 50;
};

/**
 * A prévia do editor define a escala da marca pela largura da folha e deixa a
 * camada ser recortada pela própria A4. Repetimos a regra no PDF para que a
 * marca institucional não seja encolhida pelas margens de conteúdo.
 */
const scaleImageToWidth = (
  pdf: jsPDF,
  image: PdfInlineImage,
  width: number,
) => {
  const properties = pdf.getImageProperties(image.dataUri);
  const factor = width / properties.width;
  return {
    width,
    height: properties.height * factor,
  };
};

/**
 * `jsPDF#addImage` gira a partir do canto superior esquerdo. O editor CSS
 * gira pelo centro. Ajustar a origem mantém os dois resultados equivalentes
 * e evita que uma marca rotacionada deslize para um dos cantos da página.
 */
const getCenteredRotatedImageOrigin = (
  pageWidth: number,
  pageHeight: number,
  width: number,
  height: number,
  rotationDegrees: number,
) => {
  if (!rotationDegrees) {
    return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2 };
  }

  const radians = rotationDegrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  return {
    x: centerX - (width / 2) * cosine + (height / 2) * sine,
    y: centerY - (width / 2) * sine - (height / 2) * cosine,
  };
};

export const drawWatermark = (
  pdf: jsPDF,
  GState: PdfGStateConstructor,
  payload: CalendarioAulasExportacaoPayload,
  watermark: PdfInlineImage | null,
) => {
  const documento = getPrintableCalendarioAulasDocumento(payload);
  if (!documento.exibirMarcaDagua) return;
  if (!watermark) {
    throw new Error('A marca-d’água institucional deste polo não pôde ser preparada para o calendário.');
  }

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = normalizeScale(documento.marcaDaguaEscala);
  const size = scaleImageToWidth(pdf, watermark, pageWidth * (scale / 100));
  const rotation = documento.marcaDaguaRotacionar === false ? 0 : -45;
  const origin = getCenteredRotatedImageOrigin(
    pageWidth,
    pageHeight,
    size.width,
    size.height,
    rotation,
  );

  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity: normalizeOpacity(documento.marcaDaguaOpacidade) }) as never);
  pdf.addImage(
    watermark.dataUri,
    watermark.format,
    origin.x,
    origin.y,
    size.width,
    size.height,
    'calendario-marca-dagua',
    'FAST',
    rotation,
  );
  pdf.restoreGraphicsState();
};

