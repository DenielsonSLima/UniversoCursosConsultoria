/**
 * Snapshot visual retornado pela RPC de emissão. Ele não é uma instrução para
 * o navegador calcular dados: conteúdo, páginas, QR, validade e marca d'água
 * são definidos no backend antes de chegar à Secretaria.
 */
export interface CanonicalDocumentWatermark {
  enabled: boolean;
  label: string | null;
  imageUrl: string | null;
  opacity: number | null;
  scale?: number | null;
  rotate?: boolean | null;
}

export interface CanonicalDocumentQr {
  enabled: boolean;
  label: string | null;
  validityLabel: string | null;
}

export interface CanonicalDocumentRenderedPage {
  header: string | null;
  title: string | null;
  body: string | null;
  footer: string | null;
}

export interface CanonicalDocumentRenderedContent {
  kind: string | null;
  pages: CanonicalDocumentRenderedPage[];
  watermark: CanonicalDocumentWatermark | null;
  qr: CanonicalDocumentQr | null;
  front: Record<string, unknown> | null;
  back: Record<string, unknown> | null;
}

export interface CanonicalDocumentRenderPayload {
  template: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  templateRevision: number | null;
  rendered: CanonicalDocumentRenderedContent | null;
}

export interface CanonicalDocumentPreviewItem {
  emissionId: string;
  title: string;
  targetName: string;
  validationCode: string | null;
  validationUrl: string | null;
  validUntil: string | null;
  renderPayload: CanonicalDocumentRenderPayload | null;
}
