import {
  publicCnabFile,
  publicCnabRecord,
  readCnabFileWithRecords,
} from "./file-service.ts";
import {
  completeCnabActivation,
  recordCnabActivationFailure,
} from "./return-activation.ts";
import {
  assertCnabFileScope,
  canProcessNextCnabRecord,
  isCnabProcessingLeaseExpired,
} from "./return-policy.ts";
import {
  finishReturnFile,
  recordReturnProcessingFailure,
  renewReturnProcessingLease,
} from "./return-processing.ts";
import { type GestorActor, loadCnabContext, writeCnabAudit } from "./shared.ts";

type ProcessingOptions = {
  retryErrors: boolean;
  renewBeforePayment: boolean;
};

const processClaimedReturnRecords = async (
  admin: any,
  actor: GestorActor,
  file: any,
  records: any[],
  processingToken: string,
  options: ProcessingOptions,
) => {
  const batchStartedAt = Date.now();
  let batchProcessed = 0;
  let batchDeferred = false;
  const eligibleStatuses = options.retryErrors
    ? ["ACTIVATION_PENDING", "ERROR", "MATCHED"]
    : ["ACTIVATION_PENDING", "MATCHED"];

  for (const record of records) {
    if (!eligibleStatuses.includes(record.status)) continue;
    if (!canProcessNextCnabRecord(batchProcessed, batchStartedAt)) {
      batchDeferred = true;
      break;
    }
    batchProcessed += 1;
    if (record.status === "ACTIVATION_PENDING") {
      await renewReturnProcessingLease(admin, file.id, processingToken);
      try {
        await completeCnabActivation(admin, actor, file, record);
      } catch (error) {
        await renewReturnProcessingLease(admin, file.id, processingToken);
        await recordCnabActivationFailure(
          admin,
          actor,
          file.id,
          record.id,
          error,
        );
      }
      continue;
    }

    if (options.renewBeforePayment) {
      await renewReturnProcessingLease(admin, file.id, processingToken);
    }
    if (record.status === "ERROR") {
      const { data: reset, error: resetError } = await admin
        .from("payment_gateway_cnab_records")
        .update({
          status: "MATCHED",
          message: "Pendência técnica liberada para nova tentativa.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", record.id)
        .eq("status", "ERROR")
        .select("id")
        .maybeSingle();
      if (resetError) throw resetError;
      if (!reset) {
        throw new Error(
          "O estado da pendência CNAB mudou antes do reprocessamento.",
        );
      }
    }
    try {
      const { data, error } = await admin.rpc(
        "apply_banese_cnab_return_record",
        {
          p_record_id: record.id,
          p_processing_token: processingToken,
          p_actor_id: actor.id,
        },
      );
      if (error) throw error;
      if (data?.needsActivation) {
        await completeCnabActivation(admin, actor, file, {
          ...record,
          status: "ACTIVATION_PENDING",
        });
      }
    } catch (error) {
      await recordReturnProcessingFailure(
        admin,
        actor,
        file.id,
        record.id,
        processingToken,
        error,
      );
    }
  }
  return { batchProcessed, batchDeferred };
};

const claimPreviewedReturn = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  processingToken: string,
) => {
  const { data: claimed, error: claimError } = await admin
    .from("payment_gateway_cnab_files")
    .update({
      status: "PROCESSING",
      processed_by: actor.id,
      processing_token: processingToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .eq("status", "PREVIEWED")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    throw new Error("O retorno já está sendo processado por outro operador.");
  }
};

const resumeStaleReturn = async (
  admin: any,
  actor: GestorActor,
  file: any,
  processingToken: string,
) => {
  const staleSince = String(file.updated_at || "");
  if (!isCnabProcessingLeaseExpired(staleSince)) {
    throw new Error(
      "O retorno está em processamento. Aguarde 10 minutos antes de tentar a retomada.",
    );
  }
  const { data: resumed, error: resumeError } = await admin
    .from("payment_gateway_cnab_files")
    .update({
      processed_by: actor.id,
      processing_token: processingToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", file.id)
    .eq("status", "PROCESSING")
    .eq("processing_token", file.processing_token)
    .eq("updated_at", staleSince)
    .select("id")
    .maybeSingle();
  if (resumeError) throw resumeError;
  if (!resumed) {
    throw new Error("O retorno já foi retomado por outro operador.");
  }
  await writeCnabAudit(admin, {
    file_id: file.id,
    actor_id: actor.id,
    action: "PROCESSAMENTO_RETOMADO",
    metadata: {
      previousActorId: file.processed_by || null,
      staleSince,
    },
  });
};

const finalizeAppliedReturn = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  processingToken: string,
  processingSummary: Record<string, unknown>,
) => {
  const file = await finishReturnFile(admin, fileId, processingToken);
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "RETORNO_APLICADO",
    metadata: { ...(file.processing_summary || {}), ...processingSummary },
  });
  const result = await readCnabFileWithRecords(admin, fileId);
  return {
    file: publicCnabFile(file),
    records: result.records.map(publicCnabRecord),
  };
};

export const applyReturn = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  requestedEnvironment?: unknown,
) => {
  const context = await loadCnabContext(admin, requestedEnvironment);
  const existing = await readCnabFileWithRecords(admin, fileId);
  assertCnabFileScope(existing.file, context, "RETORNO");
  if (existing.file.status === "PROCESSED") {
    return {
      alreadyProcessed: true,
      file: publicCnabFile(existing.file),
      records: existing.records.map(publicCnabRecord),
    };
  }
  const processingToken = crypto.randomUUID();
  if (existing.file.status === "PREVIEWED") {
    if (
      existing.records.some((record: any) =>
        !["MATCHED", "SKIPPED", "REVIEW_REQUIRED"].includes(record.status)
      )
    ) {
      throw new Error(
        "A prévia possui estado incompatível com a confirmação segura.",
      );
    }
    if (!existing.records.some((record: any) => record.status === "MATCHED")) {
      throw new Error(
        "O retorno contém apenas eventos já registrados; não há baixa a confirmar.",
      );
    }
    await claimPreviewedReturn(admin, actor, fileId, processingToken);
  } else if (existing.file.status === "PROCESSING") {
    await resumeStaleReturn(admin, actor, existing.file, processingToken);
  } else {
    throw new Error(
      "Somente um retorno previamente validado pode ser aplicado.",
    );
  }

  const batch = await processClaimedReturnRecords(
    admin,
    actor,
    existing.file,
    existing.records,
    processingToken,
    { retryErrors: false, renewBeforePayment: false },
  );
  const result = await finalizeAppliedReturn(
    admin,
    actor,
    fileId,
    processingToken,
    batch,
  );
  return { alreadyProcessed: false, ...result };
};

export const retryReturnActivation = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  requestedEnvironment?: unknown,
) => {
  const context = await loadCnabContext(admin, requestedEnvironment);
  const existing = await readCnabFileWithRecords(admin, fileId);
  assertCnabFileScope(existing.file, context, "RETORNO");
  if (existing.file.status === "PROCESSED") {
    return {
      file: publicCnabFile(existing.file),
      records: existing.records.map(publicCnabRecord),
    };
  }
  if (existing.file.status !== "PARTIAL") {
    throw new Error("Somente um retorno parcial pode reprocessar pendências.");
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
    .eq("status", "PARTIAL")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    throw new Error(
      "O retorno parcial já está sendo retomado por outro operador.",
    );
  }
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "PROCESSAMENTO_RETOMADO",
    metadata: { retryPartial: true },
  });
  const batch = await processClaimedReturnRecords(
    admin,
    actor,
    existing.file,
    existing.records,
    processingToken,
    { retryErrors: true, renewBeforePayment: true },
  );
  return finalizeAppliedReturn(
    admin,
    actor,
    fileId,
    processingToken,
    { retryPartial: true, ...batch },
  );
};
