import { validateBaneseBoletoResponse } from "./boleto-response.ts";
import { asRecord, onlyDigits } from "./utils.ts";

export type BaneseBoletoCollisionKind =
  | "MATCH"
  | "FOREIGN"
  | "INDETERMINATE";

export type BaneseBoletoCollisionExpectation = {
  ourNumber: unknown;
  amount: unknown;
  dueDate: unknown;
  agency: unknown;
  account: unknown;
  documentNumber: unknown;
  companyTitleId: unknown;
  payerDocument: unknown;
};

type IdentityRelation = "MATCH" | "DIFFERENT" | "MISSING";

type CollisionReason =
  | "FULL_MATCH"
  | "STRONG_TITLE_IDENTITIES_DIVERGE"
  | "EXPECTED_IDENTITY_INCOMPLETE"
  | "REMOTE_IDENTITY_INCOMPLETE"
  | "REMOTE_RESPONSE_INCONSISTENT"
  | "IDENTITY_DIVERGENCE_NOT_CONCLUSIVE";

export type BaneseBoletoCollisionAudit = {
  version: 1;
  classification: BaneseBoletoCollisionKind;
  reason: CollisionReason;
  expectedComplete: boolean;
  remoteComplete: boolean;
  internallyConsistent: boolean;
  relations: {
    ourNumber: IdentityRelation;
    documentNumber: IdentityRelation;
    companyTitleId: IdentityRelation;
    payerDocument: IdentityRelation;
    amount: IdentityRelation;
    dueDate: IdentityRelation;
  };
};

export type BaneseBoletoCollisionResult = {
  classification: BaneseBoletoCollisionKind;
  fingerprintSha256: string;
  audit: BaneseBoletoCollisionAudit;
};

const scalarText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  return "";
};

const normalizedText = (value: unknown) => scalarText(value).toLowerCase();

const relation = (expected: string, remote: string): IdentityRelation => {
  if (!expected || !remote) return "MISSING";
  return expected === remote ? "MATCH" : "DIFFERENT";
};

const amountInCents = (value: unknown) => {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !value.trim())
  ) {
    return "";
  }
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? String(cents) : "";
};

const isoDate = (value: unknown) => {
  if (typeof value !== "string") return "";
  const date = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
};

const normalizedOurNumber = (value: unknown) => {
  const digits = onlyDigits(scalarText(value));
  return /^\d{1,9}$/.test(digits) ? digits.padStart(9, "0") : "";
};

const normalizedPayerDocument = (value: unknown) => {
  const digits = onlyDigits(scalarText(value));
  return [11, 14].includes(digits.length) ? digits : "";
};

const sha256Hex = async (value: unknown) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const classifyBaneseBoletoCollision = async (
  raw: unknown,
  expected: BaneseBoletoCollisionExpectation,
): Promise<BaneseBoletoCollisionResult> => {
  const remote = asRecord(raw);
  const remotePayer = asRecord(remote.Pagador ?? remote.pagador);
  const expectedOurNumber = normalizedOurNumber(expected.ourNumber);
  const remoteOurNumber = normalizedOurNumber(
    remote.NossoNumero ?? remote.nossoNumero,
  );
  const expectedDocumentNumber = normalizedText(expected.documentNumber);
  const remoteDocumentNumber = normalizedText(
    remote.NumeroDocumento ?? remote.numeroDocumento,
  );
  const expectedCompanyTitleId = normalizedText(expected.companyTitleId);
  const remoteCompanyTitleId = normalizedText(
    remote.IdTituloEmpresa ?? remote.idTituloEmpresa,
  );
  const expectedPayerDocument = normalizedPayerDocument(
    expected.payerDocument,
  );
  const remotePayerDocument = normalizedPayerDocument(
    remotePayer.NumeroCPFCNPJ ?? remotePayer.numeroCPFCNPJ ??
      remotePayer.numeroCpfCnpj,
  );
  const expectedAmount = amountInCents(expected.amount);
  const remoteAmount = amountInCents(
    remote.ValorNominal ?? remote.valorNominal,
  );
  const expectedDueDate = isoDate(expected.dueDate);
  const remoteDueDate = isoDate(
    remote.DataVencimento ?? remote.dataVencimento,
  );
  const expectedAgency = onlyDigits(scalarText(expected.agency));
  const expectedAccount = onlyDigits(scalarText(expected.account));
  const remoteBarcodeValue = remote.NumeroCodigoBarras ??
    remote.numeroCodigoBarras;
  const remoteDigitableLineValue = remote.NumeroLinhaDigitavel ??
    remote.numeroLinhaDigitavel;
  const remoteBarcode = typeof remoteBarcodeValue === "string"
    ? onlyDigits(remoteBarcodeValue)
    : "";
  const remoteDigitableLine = typeof remoteDigitableLineValue === "string"
    ? onlyDigits(remoteDigitableLineValue)
    : "";

  const relations = {
    ourNumber: relation(expectedOurNumber, remoteOurNumber),
    documentNumber: relation(
      expectedDocumentNumber,
      remoteDocumentNumber,
    ),
    companyTitleId: relation(expectedCompanyTitleId, remoteCompanyTitleId),
    payerDocument: relation(expectedPayerDocument, remotePayerDocument),
    amount: relation(expectedAmount, remoteAmount),
    dueDate: relation(expectedDueDate, remoteDueDate),
  } satisfies BaneseBoletoCollisionAudit["relations"];

  const expectedComplete = Boolean(
    expectedOurNumber && expectedDocumentNumber && expectedCompanyTitleId &&
      expectedPayerDocument && expectedAmount && expectedDueDate &&
      /^\d{3}$/.test(expectedAgency) && expectedAgency !== "000" &&
      /^\d{9}$/.test(expectedAccount),
  );
  const remoteComplete = Boolean(
    remoteOurNumber && remoteDocumentNumber && remoteCompanyTitleId &&
      remotePayerDocument && remoteAmount && remoteDueDate &&
      remoteBarcode.length === 44 && remoteDigitableLine.length === 47,
  );

  let classification: BaneseBoletoCollisionKind = "INDETERMINATE";
  let reason: CollisionReason = "EXPECTED_IDENTITY_INCOMPLETE";
  let internallyConsistent = false;

  if (expectedComplete && !remoteComplete) {
    reason = "REMOTE_IDENTITY_INCOMPLETE";
  } else if (expectedComplete && remoteComplete) {
    try {
      validateBaneseBoletoResponse(raw, {
        ourNumber: expectedOurNumber,
        amount: Number(remoteAmount) / 100,
        dueDate: remoteDueDate,
        agency: expectedAgency,
        account: expectedAccount,
        documentNumber: remoteDocumentNumber,
        companyTitleId: remoteCompanyTitleId,
        payerDocument: remotePayerDocument,
        requireRemoteFinancialIdentity: true,
        requireRemoteTitleIdentity: true,
      });
      internallyConsistent = true;
    } catch {
      reason = "REMOTE_RESPONSE_INCONSISTENT";
    }

    if (internallyConsistent) {
      try {
        validateBaneseBoletoResponse(raw, {
          ...expected,
          requireRemoteFinancialIdentity: true,
          requireRemoteTitleIdentity: true,
        });
        classification = "MATCH";
        reason = "FULL_MATCH";
      } catch {
        if (
          relations.documentNumber === "DIFFERENT" &&
          relations.companyTitleId === "DIFFERENT"
        ) {
          classification = "FOREIGN";
          reason = "STRONG_TITLE_IDENTITIES_DIVERGE";
        } else {
          reason = "IDENTITY_DIVERGENCE_NOT_CONCLUSIVE";
        }
      }
    }
  }

  const audit: BaneseBoletoCollisionAudit = {
    version: 1,
    classification,
    reason,
    expectedComplete,
    remoteComplete,
    internallyConsistent,
    relations,
  };
  const remoteSituationCode = scalarText(
    remote.CodigoSituacaoBoleto ?? remote.codigoSituacaoBoleto,
  );
  // O material do hash exclui pagador, NumeroDocumento, IdTituloEmpresa e
  // qualquer campo Pix/QR. Somente a digestao opaca e devolvida ao chamador.
  const sanitizedFingerprintMaterial = {
    schema: "banese-boleto-collision/v1",
    audit,
    bankSnapshot: {
      ourNumber: remoteOurNumber,
      barcode: remoteBarcode,
      digitableLine: remoteDigitableLine,
      amountInCents: remoteAmount,
      dueDate: remoteDueDate,
      situationCode: /^\d+$/.test(remoteSituationCode)
        ? remoteSituationCode
        : "",
    },
  };

  return {
    classification,
    fingerprintSha256: await sha256Hex(sanitizedFingerprintMaterial),
    audit,
  };
};
