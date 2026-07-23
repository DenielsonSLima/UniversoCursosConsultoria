import { decodeCnab240Ansi } from "../gateways/api/banese-cnab240.codec.ts";
import { parseCnab240Payload } from "../gateways/api/banese-cnab240.parser.ts";
import {
  publicCnabFile,
  publicCnabRecord,
  readCnabFileWithRecords,
} from "./file-service.ts";
import {
  BANESE_CNAB_BUCKET,
  BANESE_CNAB_PROVIDER,
  validateCnabReturnUpload,
} from "./policy.ts";
import {
  assertCnabReturnPayloadSafety,
  assertReturnAgreement,
  decodeReturnBase64,
  isCnabProcessingLeaseExpired,
  returnEventFingerprint,
} from "./return-policy.ts";
import {
  existingEventFingerprints,
  loadReturnReceivableCandidates,
  previewReturnEvent,
} from "./return-preview.ts";
import {
  type GestorActor,
  loadCnabContext,
  sha256Bytes,
  writeCnabAudit,
} from "./shared.ts";

const rejectReturnFile = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  message: string,
  expectedUpdatedAt?: string,
) => {
  let update = admin
    .from("payment_gateway_cnab_files")
    .update({
      status: "REJECTED",
      processing_summary: { error: message },
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .eq("direction", "RETORNO")
    .eq("status", "IMPORTING");
  if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await update.select("id").maybeSingle();
  if (error) throw error;
  if (!data) return false;
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "ARQUIVO_REJEITADO",
    metadata: { stage: "import", message },
  });
  return true;
};

const recoverDuplicateImport = async (
  admin: any,
  actor: GestorActor,
  duplicate: any,
) => {
  if (duplicate.status !== "IMPORTING") {
    const existing = await readCnabFileWithRecords(admin, duplicate.id);
    await writeCnabAudit(admin, {
      file_id: duplicate.id,
      actor_id: actor.id,
      action: "RETORNO_REPETIDO",
      metadata: { sameHash: true },
    });
    return existing;
  }
  if (
    !isCnabProcessingLeaseExpired(
      duplicate.updated_at || duplicate.created_at,
    )
  ) {
    throw new Error(
      "Este retorno CNAB ainda está sendo importado. Aguarde a conclusão antes de reenviar.",
    );
  }
  const rejected = await rejectReturnFile(
    admin,
    actor,
    duplicate.id,
    "Importação anterior interrompida; arquivo liberado para reenvio seguro.",
    duplicate.updated_at || undefined,
  );
  if (rejected) return null;

  const { data: current, error: currentError } = await admin
    .from("payment_gateway_cnab_files")
    .select("*")
    .eq("id", duplicate.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current || current.status === "REJECTED") return null;
  if (current.status === "IMPORTING") {
    throw new Error(
      "Este retorno CNAB foi retomado por outro processo. Aguarde a conclusão.",
    );
  }
  const existing = await readCnabFileWithRecords(admin, current.id);
  await writeCnabAudit(admin, {
    file_id: current.id,
    actor_id: actor.id,
    action: "RETORNO_REPETIDO",
    metadata: { sameHash: true, recoveredDuringImport: true },
  });
  return existing;
};

const duplicateResponse = (
  existing: Awaited<
    ReturnType<typeof readCnabFileWithRecords>
  >,
) => ({
  duplicate: true,
  file: publicCnabFile(existing.file),
  records: existing.records.map(publicCnabRecord),
});

export const previewReturn = async (
  admin: any,
  actor: GestorActor,
  body: Record<string, unknown>,
) => {
  const context = await loadCnabContext(admin, body.environment);
  const bytes = decodeReturnBase64(body.fileContentBase64);
  assertCnabReturnPayloadSafety(bytes);
  const upload = validateCnabReturnUpload({
    fileName: body.fileName,
    byteLength: bytes.length,
  });
  const hash = await sha256Bytes(bytes);

  const { data: duplicate, error: duplicateError } = await admin
    .from("payment_gateway_cnab_files")
    .select("*")
    .eq("provider_code", BANESE_CNAB_PROVIDER)
    .eq("environment", context.environment)
    .eq("convenio", context.convenio)
    .eq("direction", "RETORNO")
    .eq("sha256", hash)
    .neq("status", "REJECTED")
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) {
    const existing = await recoverDuplicateImport(admin, actor, duplicate);
    if (existing) return duplicateResponse(existing);
  }

  const decodedPayload = decodeCnab240Ansi(bytes);
  const parsed = parseCnab240Payload(decodedPayload);
  if (parsed.outcomes.length || !parsed.events.length) {
    const details = parsed.outcomes.slice(0, 5).map((item) => item.message)
      .join(" ");
    throw new Error(
      details || "O retorno CNAB240 não contém eventos T/U válidos.",
    );
  }
  assertReturnAgreement(decodedPayload, context.convenio);
  if (parsed.events.length > 5_000) {
    throw new Error(
      "O retorno CNAB excede o limite operacional de 5.000 eventos.",
    );
  }
  const candidatesByTitle = await loadReturnReceivableCandidates(
    admin,
    context,
    parsed.events,
  );
  const prepared = await Promise.all(parsed.events.map(async (event) => ({
    ...await previewReturnEvent(
      admin,
      context,
      event,
      candidatesByTitle.get(event.nossoNumero) || [],
    ),
    provider_code: BANESE_CNAB_PROVIDER,
    environment: context.environment,
    convenio: context.convenio,
    file_direction: "RETORNO",
    event_fingerprint: await returnEventFingerprint(context, event),
  })));
  const existingFingerprints = await existingEventFingerprints(
    admin,
    context,
    prepared.map((record) => record.event_fingerprint),
  );
  const seenInFile = new Set<string>();
  for (const record of prepared) {
    const repeated = existingFingerprints.has(record.event_fingerprint) ||
      seenInFile.has(record.event_fingerprint);
    seenInFile.add(record.event_fingerprint);
    if (repeated) {
      record.status = "SKIPPED";
      record.message =
        "Evento já registrado anteriormente; nenhuma baixa será repetida.";
    }
  }

  const fileId = crypto.randomUUID();
  const year = new Date().getUTCFullYear();
  const storagePath =
    `banese/${context.environment}/retorno/${year}/${fileId}/arquivo.${upload.extension}`;
  const totalAmount = prepared.reduce(
    (total, record) => total + Number(record.paid_amount || 0),
    0,
  );
  const now = new Date().toISOString();
  const { error: fileError } = await admin
    .from("payment_gateway_cnab_files")
    .insert({
      id: fileId,
      provider_code: BANESE_CNAB_PROVIDER,
      environment: context.environment,
      convenio: context.convenio,
      edi7_code: context.edi7Code,
      direction: "RETORNO",
      file_name: upload.fileName,
      storage_path: storagePath,
      sha256: hash,
      status: "IMPORTING",
      nsa: null,
      title_count: prepared.length,
      record_count: parsed.summary.fileLines,
      total_amount: totalAmount,
      created_by: actor.id,
      imported_at: now,
      metadata: { originalExtension: upload.extension },
    });
  if (fileError) throw fileError;

  const { error: uploadError } = await admin.storage
    .from(BANESE_CNAB_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    const rejected = await rejectReturnFile(
      admin,
      actor,
      fileId,
      "Falha ao armazenar arquivo privado.",
    );
    if (!rejected) {
      throw new Error(
        "O estado do retorno mudou durante a falha de armazenamento; confira o histórico antes de reenviar.",
      );
    }
    throw uploadError;
  }

  const records = prepared.map((record) => ({
    id: crypto.randomUUID(),
    ...record,
    file_id: fileId,
  }));
  for (let index = 0; index < records.length; index += 250) {
    const { error: recordsError } = await admin
      .from("payment_gateway_cnab_records")
      .insert(records.slice(index, index + 250));
    if (recordsError) {
      const rejected = await rejectReturnFile(
        admin,
        actor,
        fileId,
        "Falha ao persistir prévia do retorno.",
      );
      if (!rejected) {
        throw new Error(
          "O estado do retorno mudou durante a persistência; confira o histórico antes de reenviar.",
        );
      }
      throw recordsError;
    }
  }

  const { data: finalizedData, error: finalizeError } = await admin.rpc(
    "finalize_banese_cnab_return_preview",
    { p_file_id: fileId, p_actor_id: actor.id },
  );
  let confirmedFile = Array.isArray(finalizedData)
    ? finalizedData[0]
    : finalizedData;
  if (finalizeError || confirmedFile?.status !== "PREVIEWED") {
    const { data: current, error: currentError } = await admin
      .from("payment_gateway_cnab_files")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (
      current?.status === "PREVIEWED" &&
      Number(current.processing_summary?.persistedRecords) === records.length
    ) {
      confirmedFile = current;
    } else {
      const rejected = await rejectReturnFile(
        admin,
        actor,
        fileId,
        "Falha ao finalizar a prévia persistida do retorno.",
      );
      if (!rejected) {
        throw new Error(
          "A finalização do retorno ficou ambígua; confira o histórico antes de reenviar.",
        );
      }
      if (finalizeError) throw finalizeError;
      throw new Error("Não foi possível finalizar a prévia do retorno CNAB.");
    }
  }
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "RETORNO_PREVISUALIZADO",
    metadata: {
      matched: prepared.filter((item) => item.status === "MATCHED").length,
      reviewRequired: prepared.filter((item) =>
        item.status === "REVIEW_REQUIRED"
      ).length,
    },
  });
  return {
    duplicate: false,
    file: publicCnabFile(confirmedFile),
    records: records.map(publicCnabRecord),
  };
};
