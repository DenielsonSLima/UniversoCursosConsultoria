// Fachada estável: os contratos públicos permanecem neste caminho enquanto a
// implementação é dividida por responsabilidade para facilitar manutenção.
export { applyReturn, retryReturnActivation } from "./return-apply.ts";
export { previewReturn } from "./return-import.ts";
export {
  assertCnabFileScope,
  assertCnabReturnPayloadSafety,
  assertReturnAgreement,
  canProcessNextCnabRecord,
  isCnabProcessingLeaseExpired,
  resolveCnabFailureTransition,
} from "./return-policy.ts";
export { revalidateReturn } from "./return-processing.ts";
export {
  hasConfirmedBaneseSubmission,
  previewReturnEvent,
} from "./return-preview.ts";
export {
  createSignedCnabDownload,
  getCnabFileDetails,
  listCnabFiles,
} from "./file-service.ts";
export { loadCnabContext } from "./shared.ts";
