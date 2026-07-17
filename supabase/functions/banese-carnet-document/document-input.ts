import type {
  BaneseBoletoDocumentInput,
  BaneseDocumentAddress,
} from "../banese/internal/types.ts";
import type { BaneseCarnetReceivableRow } from "./document-policy.ts";

type PartyRecord = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const addressFrom = (party: PartyRecord): BaneseDocumentAddress => ({
  street: [text(party.endereco), text(party.numero), text(party.complemento)]
    .filter(Boolean)
    .join(", "),
  district: text(party.bairro),
  city: text(party.cidade),
  state: text(party.estado || party.uf).toUpperCase(),
  postalCode: digits(party.cep),
});

const beneficiaryIdentity = (
  issuer: PartyRecord,
  metadata: Record<string, unknown>,
) => {
  const issuerDocument = digits(issuer.cnpj);
  const configuredDocument = digits(metadata.baneseBeneficiarioInscricao);
  if (
    issuerDocument && configuredDocument &&
    issuerDocument !== configuredDocument
  ) {
    throw new Error(
      "O beneficiário configurado diverge do emissor dos títulos Banese.",
    );
  }
  return {
    name: text(metadata.baneseBeneficiarioNome || issuer.nome),
    document: configuredDocument || issuerDocument,
  };
};

const pixFrom = (
  row: BaneseCarnetReceivableRow,
  environment: "sandbox" | "production",
) => {
  if (environment !== "production") return null;
  const copyAndPaste = text(row.gateway_pix_payload);
  const qrCodeBase64 = text(row.gateway_pix_encoded_image);
  if (Boolean(copyAndPaste) !== Boolean(qrCodeBase64)) {
    throw new Error(
      "Uma parcela possui retorno Pix Banese incompleto para o carnê.",
    );
  }
  return copyAndPaste && qrCodeBase64 ? { copyAndPaste, qrCodeBase64 } : null;
};

export const buildBaneseCarnetDocumentInputs = (
  rows: BaneseCarnetReceivableRow[],
  payer: PartyRecord,
  issuer: PartyRecord,
  rawMetadata: unknown,
): BaneseBoletoDocumentInput[] => {
  const metadata = asRecord(rawMetadata);
  const beneficiary = beneficiaryIdentity(issuer, metadata);

  return rows.map((row) => {
    const environment = text(row.gateway_environment).toLowerCase() ===
        "production"
      ? "production"
      : "sandbox";
    const amount = Number(row.valor);
    const dueDate = text(row.data_vencimento).slice(0, 10);
    const issueDate = text(row.gateway_boleto_issued_at).slice(0, 10);
    const ourNumber = digits(row.gateway_boleto_nosso_numero);
    const installment = Number(row.parcela_numero);
    const documentNumber = Number.isInteger(installment) && installment > 0
      ? `PARC-${String(installment).padStart(2, "0")}`
      : `B${ourNumber}`;

    return {
      receivableId: row.id,
      environment,
      digitableLine: digits(row.gateway_boleto_linha_digitavel),
      barcode: digits(row.gateway_boleto_codigo_barras),
      ourNumber,
      documentNumber: documentNumber.slice(0, 15),
      issueDate,
      processingDate: issueDate,
      dueDate,
      amount,
      beneficiary: {
        ...beneficiary,
        address: addressFrom(issuer),
        agency: digits(row.gateway_boleto_agencia),
        account: text(metadata.baneseConta || metadata.baneseContaDisplay),
        agreement: digits(row.gateway_boleto_convenio),
        beneficiaryCode: text(metadata.baneseCodigoBeneficiario),
        wallet: text(metadata.baneseCarteira) || null,
      },
      payer: {
        name: text(payer.nome),
        document: digits(payer.cpf_cnpj),
        address: addressFrom(payer),
      },
      speciesCode: Number(metadata.baneseCodigoEspecie || 21),
      speciesLabel: "ME",
      acceptance: "A",
      instructions: environment === "sandbox"
        ? [
          "CARNÊ DE HOMOLOGAÇÃO - NÃO REALIZAR PAGAMENTO.",
          text(row.descricao),
        ]
        : [text(row.descricao)],
      financialTerms: {
        ...asRecord(row.gateway_financial_terms),
        nominalAmount: amount,
        dueDate,
      },
      pix: pixFrom(row, environment),
    };
  });
};
