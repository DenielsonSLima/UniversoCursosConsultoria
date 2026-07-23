import {
  publicCnabFile,
  publicCnabRecord,
  readCnabFileWithRecords,
} from "./file-service.ts";
import { safeCnabError } from "./policy.ts";
import {
  assertCnabFileScope,
  resolveCnabFailureTransition,
} from "./return-policy.ts";
import {
  existingEventFingerprints,
  loadReturnReceivableCandidates,
  parsedEventFromRecord,
  previewReturnEvent,
} from "./return-preview.ts";
import { type GestorActor, loadCnabContext, writeCnabAudit } from "./shared.ts";

export const renewReturnProcessingLease = async (
  admin: any,
  fileId: string,
  processingToken: string,
) => {
  const { data, error } = await admin
    .from("payment_gateway_cnab_files")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", fileId)
    .eq("status", "PROCESSING")
    .eq("processing_token", processingToken)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "O lease do retorno foi assumido por outra execução; o processamento atual foi interrompido.",
    );
  }
};

export const recordReturnProcessingFailure = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  recordId: string,
  processingToken: string,
  error: unknown,
) => {
  await renewReturnProcessingLease(admin, fileId, processingToken);
  const message = safeCnabError(error);
  const { data: current, error: currentError } = await admin
    .from("payment_gateway_cnab_records")
    .select("status")
    .eq("id", recordId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) {
    throw new Error(
      "O registro CNAB deixou de existir durante o processamento.",
    );
  }
  const transition = resolveCnabFailureTransition(current.status);
  if (transition.terminal) return;
  const { data: updated, error: updateError } = await admin
    .from("payment_gateway_cnab_records")
    .update({
      status: transition.status,
      message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("status", current.status)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) {
    throw new Error(
      "O estado do registro CNAB mudou durante o tratamento da falha.",
    );
  }
  await writeCnabAudit(admin, {
    file_id: fileId,
    record_id: recordId,
    actor_id: actor.id,
    action: transition.action,
    metadata: {
      stage: transition.status === "ACTIVATION_PENDING"
        ? "projection"
        : "payment",
    },
  });
};

export const finishReturnFile = async (
  admin: any,
  fileId: string,
  processingToken: string,
  markProcessedAt = true,
) => {
  const { data: file, error } = await admin.rpc(
    "finish_banese_cnab_return_processing",
    {
      p_file_id: fileId,
      p_processing_token: processingToken,
      p_mark_processed_at: markProcessedAt,
    },
  );
  if (error) throw error;
  if (!file) {
    throw new Error(
      "O lease do retorno foi perdido antes da conclusão do arquivo.",
    );
  }
  return file;
};

export const revalidateReturn = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  requestedEnvironment?: unknown,
) => {
  const context = await loadCnabContext(admin, requestedEnvironment);
  const existing = await readCnabFileWithRecords(admin, fileId);
  assertCnabFileScope(existing.file, context, "RETORNO");
  if (!["PREVIEWED", "PARTIAL"].includes(existing.file.status)) {
    throw new Error(
      "Somente retornos em prévia ou parciais podem ser revalidados.",
    );
  }
  const eligible = existing.records.filter((record: any) =>
    record.applied_at == null &&
    ["MATCHED", "REVIEW_REQUIRED", "ERROR"].includes(record.status)
  );
  if (!eligible.length) {
    throw new Error("O retorno não possui pendências revalidáveis.");
  }

  const processingToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin
    .from("payment_gateway_cnab_files")
    .update({
      status: "PROCESSING",
      processed_by: actor.id,
      processing_token: processingToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .eq("status", existing.file.status)
    .eq("updated_at", existing.file.updated_at)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    throw new Error("O retorno mudou antes do início da revalidação.");
  }

  const events = eligible.map(parsedEventFromRecord);
  const candidatesByTitle = await loadReturnReceivableCandidates(
    admin,
    context,
    events,
  );
  const appliedFingerprints = await existingEventFingerprints(
    admin,
    context,
    eligible.map((record: any) => record.event_fingerprint),
  );
  const updates = await Promise.all(eligible.map(async (record: any) => {
    const event = parsedEventFromRecord(record);
    const preview = await previewReturnEvent(
      admin,
      context,
      event,
      candidatesByTitle.get(event.nossoNumero) || [],
    );
    const alreadyApplied = appliedFingerprints.has(record.event_fingerprint);
    return {
      id: record.id,
      expected_record_status: record.status,
      expected_record_updated_at: record.updated_at,
      receivable_id: preview.receivable_id,
      expected_receivable_status: preview.expected_receivable_status,
      expected_receivable_updated_at: preview.expected_receivable_updated_at,
      expected_min_amount: preview.expected_min_amount,
      expected_max_amount: preview.expected_max_amount,
      status: alreadyApplied ? "SKIPPED" : preview.status,
      message: alreadyApplied
        ? "Evento já aplicado por outro arquivo de retorno."
        : preview.message,
    };
  }));

  for (let index = 0; index < updates.length; index += 250) {
    const batch = updates.slice(index, index + 250);
    const { data, error } = await admin.rpc(
      "revalidate_banese_cnab_return_records",
      {
        p_file_id: fileId,
        p_processing_token: processingToken,
        p_updates: batch,
        p_actor_id: actor.id,
      },
    );
    if (error) throw error;
    if (Number(data || 0) !== batch.length) {
      throw new Error("A revalidação CNAB não confirmou todo o lote.");
    }
  }

  const file = await finishReturnFile(admin, fileId, processingToken, false);
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "RETORNO_REVALIDADO",
    metadata: {
      revalidated: updates.length,
      matched: updates.filter((item) => item.status === "MATCHED").length,
      reviewRequired: updates.filter((item) =>
        item.status === "REVIEW_REQUIRED"
      ).length,
      skipped: updates.filter((item) => item.status === "SKIPPED").length,
    },
  });
  const result = await readCnabFileWithRecords(admin, fileId);
  return {
    file: publicCnabFile(file),
    records: result.records.map(publicCnabRecord),
  };
};
