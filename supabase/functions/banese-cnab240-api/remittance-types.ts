import type {
  BaneseCnab240RemittanceInput,
  BaneseCnab240RemittanceTitleInput,
} from "../gateways/api/banese-cnab240.remittance.ts";
import type { CnabEnvironment } from "./policy.ts";

export type PreparedRemittance = {
  environment: CnabEnvironment;
  convenio: string;
  edi7Code: string;
  beneficiary: BaneseCnab240RemittanceInput["beneficiary"];
  receivables: any[];
  titles: BaneseCnab240RemittanceTitleInput[];
  fingerprint: string;
};
