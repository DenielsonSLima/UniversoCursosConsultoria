import { createNfseAccountingPdf } from './nfse-accounting.pdf';
import type { NfseAccountingReport } from './nfse-accounting.types';
import { normalizeCanonicalInstitutionalHeader } from '../../secretaria/shared/canonical-institutional-header-pdf';

export async function prepareNfseAccountingPdf(report: NfseAccountingReport) {
  const snapshot = globalThis.structuredClone(report);
  const [{ polosService }, { supabase }, { resolveCanonicalPdfPhoto }] = await Promise.all([
    import('../../configuracoes/polos/polos.service'), import('../../../../lib/supabase'),
    import('../../secretaria/shared/canonical-document-vector-pdf'),
  ]);
  const [polo, watermarkQuery] = await Promise.all([
    polosService.getById(snapshot.scope.poloId),
    supabase.from('documentos_templates').select('conteudo').eq('id', `watermark_landscape_${snapshot.scope.poloId}`).maybeSingle(),
  ]);
  if (!polo || polo.id !== snapshot.scope.poloId || typeof polo.is_matriz !== 'boolean'
    || (report.mode === 'GERAL' && !polo.is_matriz)) throw new Error('Identificação institucional incompatível com o relatório.');
  if (watermarkQuery.error) throw new Error('Não foi possível conferir a marca d’água paisagem configurada.');
  const landscape = watermarkQuery.data?.conteudo as { url?: string; opacity?: number; scale?: number; rotate?: boolean } | undefined;
  const watermarkUrl = landscape?.url || polo.watermark_url;
  const [logo, watermark] = await Promise.all([resolveCanonicalPdfPhoto(polo.logoUrl), resolveCanonicalPdfPhoto(watermarkUrl)]);
  if ((polo.logoUrl && !logo) || (watermarkUrl && !watermark)) throw new Error('Não foi possível carregar os recursos institucionais configurados.');
  return createNfseAccountingPdf(snapshot, {
    institution: normalizeCanonicalInstitutionalHeader({ ...polo }), logo,
    watermark: watermark ? { enabled: true, image: watermark, imageUrl: null, label: null,
      opacity: landscape?.url ? landscape.opacity ?? 0.1 : polo.watermark_opacity ?? 0.1,
      scale: landscape?.url ? landscape.scale ?? 50 : polo.watermark_scale ?? 50,
      rotate: landscape?.url ? landscape.rotate === true : polo.watermark_rotate !== false } : null,
  });
}
