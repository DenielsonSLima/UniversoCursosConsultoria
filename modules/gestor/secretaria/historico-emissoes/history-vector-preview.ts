import type { EmissionLog, PreviewResources } from './historico-emissoes.types';

type PreparedVectorPreview = { blob: Blob; emissionKey: string };
type BuildVectorPdf = (sources: Array<{ emission: EmissionLog; preview: PreviewResources }>) => Promise<{ blob: Blob }>;

/** O boletim relê seu modelo; os outros documentos preservam o PDF exibido na segunda via. */
export const getHistoryVectorPreviewKey = (
  emission: EmissionLog,
  preview: PreviewResources,
) => emission.documento === 'boletim'
  ? JSON.stringify({ emission, preview })
  : `${emission.documento}:${emission.codigo || emission.id}`;

export const prepareHistoryVectorPreview = async (
  emission: EmissionLog,
  preview: PreviewResources,
  cached: PreparedVectorPreview | null,
  buildPdf: BuildVectorPdf,
): Promise<PreparedVectorPreview> => {
  const emissionKey = getHistoryVectorPreviewKey(emission, preview);
  if (cached?.emissionKey === emissionKey) return { blob: cached.blob, emissionKey };
  const { blob } = await buildPdf([{ emission, preview }]);
  return { blob, emissionKey };
};
