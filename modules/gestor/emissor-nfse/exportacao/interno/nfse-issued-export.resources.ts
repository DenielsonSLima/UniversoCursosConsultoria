import { assertNfseIssuedExportReport, type NfseIssuedExportReport } from './nfse-issued-export.types';
import { createNfseIssuedExportPdf } from './nfse-issued-export.pdf';
import { normalizeCanonicalInstitutionalHeader } from '../../../secretaria/shared/canonical-institutional-header-pdf';

/** Resolve only the queried unit's configured identity, portrait logo and watermark. */
export async function prepareNfseIssuedExportPdf(report: NfseIssuedExportReport) {
  assertNfseIssuedExportReport(report);
  const snapshot = globalThis.structuredClone(report);
  const [{ polosService }, { resolveCanonicalPdfPhoto }] = await Promise.all([
    import('../../../configuracoes/polos/polos.service'),
    import('../../../secretaria/shared/canonical-document-vector-pdf'),
  ]);
  const polo = await polosService.getById(snapshot.scope.poloId);
  if (!polo || polo.id !== snapshot.scope.poloId || typeof polo.is_matriz !== 'boolean') {
    throw new Error('Não foi possível conferir os dados institucionais da unidade.');
  }
  const [logo, watermark] = await Promise.all([
    resolveCanonicalPdfPhoto(polo.logoUrl), resolveCanonicalPdfPhoto(polo.watermark_url),
  ]);
  if ((polo.logoUrl && !logo) || (polo.watermark_url && !watermark)) {
    throw new Error('Não foi possível carregar os recursos institucionais configurados.');
  }
  return createNfseIssuedExportPdf(snapshot, {
    institution: normalizeCanonicalInstitutionalHeader({ ...polo }),
    logo,
    watermark: watermark ? {
      enabled: true, image: watermark, imageUrl: null, label: null,
      opacity: polo.watermark_opacity ?? null, scale: polo.watermark_scale, rotate: polo.watermark_rotate,
    } : null,
  });
}
