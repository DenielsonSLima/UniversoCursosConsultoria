import { buildBaneseCnab240Remittance } from "../gateways/api/banese-cnab240.remittance.ts";
import { BANESE_CNAB_BUCKET, BANESE_CNAB_PROVIDER } from "./policy.ts";
import {
  assertNewTitleRemittanceRequest,
  isConfirmedRemittanceClaimState,
} from "./remittance-policy.ts";
import {
  prepareRemittance,
  remittanceLineNumbers,
} from "./remittance-preparation.ts";
import { type GestorActor, sha256Bytes, writeCnabAudit } from "./shared.ts";

const readConfirmedRemittanceClaim = async (
  admin: any,
  fileId: string,
  expectedReceivableIds: string[],
) => {
  const [
    { data: file, error: fileError },
    { data: receivables, error: rowsError },
  ] = await Promise.all([
    admin.from("payment_gateway_cnab_files").select("*").eq("id", fileId)
      .maybeSingle(),
    admin.from("contas_receber").select(
      "id,gateway_submission_channel,gateway_submission_status,gateway_cnab_file_id",
    ).in("id", expectedReceivableIds),
  ]);
  if (fileError) throw fileError;
  if (rowsError) throw rowsError;
  return isConfirmedRemittanceClaimState(
      file,
      receivables || [],
      expectedReceivableIds,
    )
    ? file
    : null;
};

const rejectUnclaimedRemittance = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  message: string,
) => {
  const { data: rejected, error } = await admin
    .from("payment_gateway_cnab_files")
    .update({
      status: "REJECTED",
      processing_summary: { error: message },
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .eq("status", "CREATING")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!rejected) return false;
  const { error: recordsError } = await admin
    .from("payment_gateway_cnab_records")
    .update({
      status: "ERROR",
      message: "Cobrança mudou antes do vínculo atômico da remessa.",
      updated_at: new Date().toISOString(),
    })
    .eq("file_id", fileId)
    .eq("status", "GENERATED");
  if (recordsError) throw recordsError;
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "ARQUIVO_REJEITADO",
    metadata: { stage: "claim", message },
  });
  return true;
};

export const generateRemittance = async (
  admin: any,
  actor: GestorActor,
  body: Record<string, unknown>,
) => {
  assertNewTitleRemittanceRequest(body);
  const prepared = await prepareRemittance(
    admin,
    body.receivableIds,
    body.environment,
  );
  if (
    !/^[0-9a-f]{64}$/.test(String(body.previewFingerprint || "")) ||
    body.previewFingerprint !== prepared.fingerprint
  ) {
    throw new Error(
      "A seleção ou os valores mudaram após a prévia; gere uma nova prévia antes de confirmar.",
    );
  }
  const { data: nsa, error: nsaError } = await admin.rpc(
    "reserve_banese_cnab_nsa",
    {
      p_environment: prepared.environment,
      p_convenio: prepared.convenio,
      p_updated_by: actor.id,
    },
  );
  if (nsaError) throw nsaError;
  const result = buildBaneseCnab240Remittance({
    edi7: prepared.edi7Code,
    agreement: prepared.convenio,
    nsa: Number(nsa),
    generatedAt: new Date(),
    beneficiary: prepared.beneficiary,
    titles: prepared.titles,
  });
  const fileId = crypto.randomUUID();
  const hash = await sha256Bytes(result.bytes);
  const year = new Date().getUTCFullYear();
  const storagePath =
    `banese/${prepared.environment}/remessa/${year}/${fileId}/arquivo.rem`;
  const now = new Date().toISOString();
  const { error: fileError } = await admin
    .from("payment_gateway_cnab_files")
    .insert({
      id: fileId,
      provider_code: BANESE_CNAB_PROVIDER,
      environment: prepared.environment,
      convenio: prepared.convenio,
      edi7_code: prepared.edi7Code,
      direction: "REMESSA",
      file_name: result.fileName,
      storage_path: storagePath,
      sha256: hash,
      status: "CREATING",
      nsa: Number(nsa),
      title_count: result.titleCount,
      record_count: result.recordCount,
      total_amount: result.totalAmount,
      created_by: actor.id,
      generated_at: now,
      metadata: {
        layoutVersion: "Banese 1.16",
        previewFingerprint: prepared.fingerprint,
      },
    })
    .select("id")
    .single();
  if (fileError) throw fileError;
  const { error: uploadError } = await admin.storage
    .from(BANESE_CNAB_BUCKET)
    .upload(storagePath, result.bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    await admin.from("payment_gateway_cnab_files").update({
      status: "REJECTED",
      processing_summary: { error: "Falha ao armazenar remessa privada." },
      updated_at: new Date().toISOString(),
    }).eq("id", fileId);
    throw uploadError;
  }

  const lines = remittanceLineNumbers(prepared.titles);
  const { error: recordsError } = await admin
    .from("payment_gateway_cnab_records")
    .insert(prepared.titles.map((title, index) => ({
      file_id: fileId,
      provider_code: BANESE_CNAB_PROVIDER,
      environment: prepared.environment,
      convenio: prepared.convenio,
      file_direction: "REMESSA",
      receivable_id: prepared.receivables[index].id,
      record_type: "TITLE",
      line_number: lines[index],
      sequence_number: index + 1,
      nosso_numero: title.ourNumber,
      nominal_amount: Number(title.financialTerms.nominalAmount),
      expected_receivable_status: prepared.receivables[index].status,
      expected_receivable_updated_at: prepared.receivables[index].updated_at,
      status: "GENERATED",
      message: "Título incluído em remessa de contingência.",
      raw_payload: {
        documentNumber: title.documentNumber,
        financialTerms: title.financialTerms,
      },
    })));
  if (recordsError) {
    await admin.from("payment_gateway_cnab_files").update({
      status: "REJECTED",
      processing_summary: { error: "Falha ao persistir títulos da remessa." },
      updated_at: new Date().toISOString(),
    }).eq("id", fileId);
    throw recordsError;
  }

  const { data: claim, error: claimError } = await admin.rpc(
    "claim_banese_cnab_remittance",
    { p_file_id: fileId, p_actor_id: actor.id },
  );
  const expectedReceivableIds = prepared.receivables.map((row) => row.id);
  let confirmedFile = await readConfirmedRemittanceClaim(
    admin,
    fileId,
    expectedReceivableIds,
  );
  if (!confirmedFile) {
    const responseConfirmed = !claimError && claim?.claimed === true &&
      Number(claim?.receivableCount || 0) === prepared.receivables.length;
    const rejected = await rejectUnclaimedRemittance(
      admin,
      actor,
      fileId,
      responseConfirmed
        ? "O estado confirmado da remessa não foi localizado."
        : "Cobranças mudaram durante a geração.",
    );
    if (!rejected) {
      confirmedFile = await readConfirmedRemittanceClaim(
        admin,
        fileId,
        expectedReceivableIds,
      );
    }
    if (!confirmedFile) {
      if (claimError && rejected) throw claimError;
      throw new Error(
        rejected
          ? "O vínculo atômico da remessa não foi confirmado."
          : "O resultado do claim ficou ambíguo; a remessa foi preservada para reconciliação.",
      );
    }
  }
  await writeCnabAudit(admin, {
    file_id: fileId,
    actor_id: actor.id,
    action: "REMESSA_GERADA",
    metadata: { nsa: Number(nsa), titleCount: result.titleCount },
  });
  return {
    file: {
      id: confirmedFile.id,
      direction: confirmedFile.direction,
      environment: confirmedFile.environment,
      convenio: confirmedFile.convenio,
      fileName: confirmedFile.file_name,
      status: confirmedFile.status,
      nsa: confirmedFile.nsa,
      titleCount: confirmedFile.title_count,
      recordCount: confirmedFile.record_count,
      totalAmount: Number(confirmedFile.total_amount || 0),
      generatedAt: confirmedFile.generated_at,
      createdAt: confirmedFile.created_at,
    },
  };
};
