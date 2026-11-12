import type { NfseScope } from '../../types/nfse.types';
import type { DanfseDocument } from '../danfse.types';
import { loadDanfseAssets } from '../danfse.assets';
import { createDanfsePdf } from '../danfse.pdf';
import { danfseComponents, needsDanfseProjection } from '../danfse.projection';
import { resolveDanfseMunicipalities } from './danfse-municipalities.service';
import { getDanfseProjection } from './danfse-projection.service';
import type { IssuedDanfseDocument } from './nfse-issued-presentation';

/** One compositor and asset/projection pipeline for preview, individual download and ZIP. */
export async function prepareIssuedDanfsePdf(scope: NfseScope, document: DanfseDocument | IssuedDanfseDocument, signal: AbortSignal) {
  signal.throwIfAborted();
  const components = danfseComponents(document);
  const [assets, projection, presentedDocument] = await Promise.all([
    loadDanfseAssets(),
    needsDanfseProjection(components) ? getDanfseProjection(scope, components, signal) : undefined,
    resolveDanfseMunicipalities(document, signal),
  ]);
  signal.throwIfAborted();
  return createDanfsePdf(presentedDocument, assets, projection, 'renderOptions' in document ? document.renderOptions : undefined);
}
