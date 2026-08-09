import type {
  CanonicalDocumentRenderPayload,
  CanonicalDocumentRenderedContent,
  CanonicalDocumentRenderedPage,
  CanonicalDocumentWatermark,
  CanonicalDocumentQr,
} from './canonical-document-render.types';

type UnknownRecord = Record<string, unknown>;

export const canonicalAsRecord = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

export const canonicalText = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim() : '';
};

export const canonicalNullableText = (...values: unknown[]) => canonicalText(...values) || null;

/**
 * A validade já é calculada e rotulada pela RPC. A interface apenas escolhe
 * essa representação canônica para evitar diferenças de fuso ou relógio.
 */
export const canonicalDocumentValidityLabel = (payload: CanonicalDocumentRenderPayload | null) => {
  const snapshot = canonicalAsRecord(payload?.snapshot);
  const validation = canonicalAsRecord(snapshot.validacao || snapshot.validacao_documento);
  return canonicalText(
    payload?.rendered?.qr?.validityLabel,
    validation.validadeExibicao,
    validation.validityLabel,
  ) || null;
};

const canonicalBoolean = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'boolean' || item === 'true' || item === 'false');
  return value === undefined ? null : value === true || value === 'true';
};

const canonicalNumber = (...values: unknown[]) => {
  const value = values.find((item) => item !== null && item !== undefined && item !== '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePage = (value: unknown): CanonicalDocumentRenderedPage => {
  const page = canonicalAsRecord(value);
  return {
    header: canonicalNullableText(page.header, page.cabecalho),
    title: canonicalNullableText(page.title, page.titulo),
    body: canonicalNullableText(page.body, page.corpo),
    footer: canonicalNullableText(page.footer, page.rodape),
  };
};

const normalizeWatermark = (value: unknown): CanonicalDocumentWatermark | null => {
  const watermark = canonicalAsRecord(value);
  if (!Object.keys(watermark).length) return null;
  return {
    enabled: canonicalBoolean(watermark.enabled, watermark.habilitada) === true,
    label: canonicalNullableText(watermark.label, watermark.rotulo, watermark.text),
    imageUrl: canonicalNullableText(watermark.image_url, watermark.imageUrl, watermark.url),
    opacity: canonicalNumber(watermark.opacity, watermark.opacidade),
    scale: canonicalNumber(watermark.scale, watermark.escala),
    rotate: canonicalBoolean(watermark.rotate, watermark.rotacionar),
  };
};

const normalizeQr = (value: unknown): CanonicalDocumentQr | null => {
  const qr = canonicalAsRecord(value);
  if (!Object.keys(qr).length) return null;
  return {
    enabled: canonicalBoolean(qr.enabled, qr.habilitado) === true,
    label: canonicalNullableText(qr.label, qr.rotulo),
    validityLabel: canonicalNullableText(
      qr.validity_label,
      qr.validityLabel,
      qr.validade_exibicao,
      qr.validadeExibicao,
    ),
  };
};

const normalizeRendered = (value: unknown): CanonicalDocumentRenderedContent | null => {
  const rendered = canonicalAsRecord(value);
  if (!Object.keys(rendered).length) return null;
  const rawPages = Array.isArray(rendered.pages) ? rendered.pages : [];
  return {
    kind: canonicalNullableText(rendered.kind, rendered.tipo),
    pages: rawPages.map(normalizePage),
    watermark: normalizeWatermark(rendered.watermark || rendered.marca_dagua || rendered.marcaDagua),
    qr: normalizeQr(rendered.qr),
    front: Object.keys(canonicalAsRecord(rendered.front)).length ? canonicalAsRecord(rendered.front) : null,
    back: Object.keys(canonicalAsRecord(rendered.back)).length ? canonicalAsRecord(rendered.back) : null,
  };
};

/** Normaliza apenas a forma do JSON já emitido pela RPC, sem resolver variáveis. */
export const normalizeCanonicalDocumentRenderPayload = (
  value: unknown,
): CanonicalDocumentRenderPayload | null => {
  const payload = canonicalAsRecord(value);
  if (!Object.keys(payload).length) return null;
  const template = canonicalAsRecord(payload.template);
  const snapshot = canonicalAsRecord(payload.snapshot);
  return {
    template: Object.keys(template).length ? template : null,
    snapshot: Object.keys(snapshot).length ? snapshot : null,
    templateRevision: canonicalNumber(payload.template_revision, payload.templateRevision, payload.revision),
    rendered: normalizeRendered(payload.rendered),
  };
};
