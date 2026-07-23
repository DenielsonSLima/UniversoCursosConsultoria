// Fachada estável: mantém os imports existentes e delega cada responsabilidade
// da contingência CNAB a um módulo menor e testável.
export { generateRemittance } from "./remittance-generation.ts";
export { getCnabOverview } from "./remittance-overview.ts";
export {
  isConfirmedRemittanceClaimState,
  previewRemittance,
} from "./remittance-policy.ts";
export { toBaneseCivilDate } from "./remittance-preparation.ts";
