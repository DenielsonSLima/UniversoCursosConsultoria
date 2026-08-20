import {
  assertValidDiarioPdfAcademicSnapshot,
  type DiarioPdfAcademicSnapshot,
} from "../../../modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts";
import { assertSha256, sha256Hex } from "./artifact-assets.ts";

export type FrozenSnapshotIntegrity = {
  schemaVersion: 1;
  canonicalization: "POSTGRES_JSONB_TEXT_UTF8_V1";
  hashAlgorithm: "SHA-256";
  encoding: "UTF-8";
  canonicalJson: string;
  documentSnapshotSha256: string;
  academicRevisionSha256: string;
  templateSourceSha256: string;
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

export const verifyFrozenDocumentSnapshot = async (
  integrity: FrozenSnapshotIntegrity,
  expectedDocumentSnapshotSha256: string,
): Promise<DiarioPdfAcademicSnapshot> => {
  if (
    !integrity || integrity.schemaVersion !== 1 ||
    integrity.canonicalization !== "POSTGRES_JSONB_TEXT_UTF8_V1" ||
    integrity.hashAlgorithm !== "SHA-256" || integrity.encoding !== "UTF-8" ||
    typeof integrity.canonicalJson !== "string" ||
    new TextEncoder().encode(integrity.canonicalJson).byteLength >
      4 * 1024 * 1024
  ) throw new Error("A prova canônica do snapshot do Diário é inválida.");
  const expected = assertSha256(
    String(expectedDocumentSnapshotSha256 || ""),
    "O hash do snapshot",
  );
  const proofHash = assertSha256(
    String(integrity.documentSnapshotSha256 || ""),
    "O hash da prova canônica",
  );
  if (expected !== proofHash) {
    throw new Error("A prova canônica diverge do envelope.");
  }
  const canonicalBytes = new TextEncoder().encode(integrity.canonicalJson);
  if (await sha256Hex(canonicalBytes) !== proofHash) {
    throw new Error("O conteúdo canônico do snapshot foi alterado.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(integrity.canonicalJson);
  } catch {
    throw new Error("O snapshot canônico do Diário não é JSON válido.");
  }
  const snapshot = assertValidDiarioPdfAcademicSnapshot(parsed);
  if (
    snapshot.source.academicRevisionSha256 !==
      assertSha256(integrity.academicRevisionSha256, "A revisão acadêmica") ||
    snapshot.templateSource.sha256 !==
      assertSha256(integrity.templateSourceSha256, "A revisão do modelo")
  ) {
    throw new Error(
      "Os hashes internos do snapshot divergem da prova canônica.",
    );
  }
  if (!snapshot.template.imprimirValidacaoContracapa) {
    throw new Error(
      "O Diário assinável precisa imprimir a validação na contracapa.",
    );
  }
  return deepFreeze(snapshot);
};
