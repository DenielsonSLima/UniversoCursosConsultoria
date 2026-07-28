import type { EmissionLog } from './historico-emissoes.types';
import type { IssuedDocumentValidation } from '../../../shared/document-validation/document-validation.types';

export type PreviewCacheMode = 'shared' | 'fresh';

export const shouldUseSharedPreviewCache = (mode: PreviewCacheMode): boolean =>
  mode === 'shared';

export const getEmissionRenderKey = (emission: EmissionLog): string => [
  emission.codigo,
  emission.quantidade_emissoes,
  emission.ultima_emissao_em,
].join('::');

export const isEmissionAlignedWithIssue = (
  emission: EmissionLog,
  issued: Pick<IssuedDocumentValidation, 'code' | 'issueCount' | 'lastIssuedAt'>,
): boolean => {
  if (emission.codigo.trim().toUpperCase() !== issued.code.trim().toUpperCase()) return false;
  if (
    issued.issueCount !== undefined
    && emission.quantidade_emissoes !== issued.issueCount
  ) return false;
  if (issued.lastIssuedAt) {
    return new Date(emission.ultima_emissao_em).getTime()
      === new Date(issued.lastIssuedAt).getTime();
  }
  return true;
};

export const assertEmissionAlignedWithIssue = (
  emission: EmissionLog,
  issued: Pick<IssuedDocumentValidation, 'code' | 'issueCount' | 'lastIssuedAt'>,
) => {
  if (!isEmissionAlignedWithIssue(emission, issued)) {
    throw new Error(
      'A confirmação da reemissão divergiu do documento capturado. Nenhum arquivo foi entregue.',
    );
  }
};

export const isCanonicalEmissionRendered = (
  container: Pick<HTMLElement, 'dataset'> | null,
  expectedRenderKey: string,
): boolean =>
  Boolean(container && container.dataset.emissionRenderKey === expectedRenderKey);

const waitForNextFrame = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => resolve());
    return;
  }
  setTimeout(resolve, 16);
});

export const waitForCanonicalEmissionRender = async <Element extends HTMLElement>(
  getContainer: () => Element | null,
  expectedRenderKey: string,
  timeoutMs = 15_000,
): Promise<Element> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const container = getContainer();
    if (isCanonicalEmissionRendered(container, expectedRenderKey)) {
      await waitForNextFrame();
      return container;
    }
    await waitForNextFrame();
  }

  throw new Error(
    'A versão canônica atualizada do documento não foi confirmada na prévia. Nenhum arquivo foi gerado.',
  );
};
