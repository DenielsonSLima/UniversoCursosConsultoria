import { BANESE_CNAB_BUCKET, BANESE_CNAB_PROVIDER } from "./policy.ts";
import { assertCnabFileScope } from "./return-policy.ts";
import { type GestorActor, loadCnabContext, writeCnabAudit } from "./shared.ts";

export const publicCnabFile = (row: any) => ({
  id: row.id,
  direction: row.direction,
  environment: row.environment,
  convenio: row.convenio,
  fileName: row.file_name,
  status: row.status,
  nsa: row.nsa,
  titleCount: row.title_count,
  recordCount: row.record_count,
  totalAmount: Number(row.total_amount || 0),
  generatedAt: row.generated_at,
  importedAt: row.imported_at,
  processedAt: row.processed_at,
  createdAt: row.created_at,
  processingSummary: row.processing_summary || {},
});

export const publicCnabRecord = (row: any) => ({
  id: row.id,
  receivableId: row.receivable_id,
  lineNumber: row.line_number,
  nossoNumero: row.nosso_numero,
  movementCode: row.movement_code,
  occurrenceCodes: row.occurrence_codes || [],
  nominalAmount: row.nominal_amount == null ? null : Number(row.nominal_amount),
  paidAmount: row.paid_amount == null ? null : Number(row.paid_amount),
  expectedMinAmount: row.expected_min_amount == null
    ? null
    : Number(row.expected_min_amount),
  expectedMaxAmount: row.expected_max_amount == null
    ? null
    : Number(row.expected_max_amount),
  occurrenceDate: row.occurrence_date,
  liquidationChannel: row.liquidation_channel,
  status: row.status,
  message: row.message,
});

export const readCnabFileWithRecords = async (admin: any, fileId: string) => {
  const { data: file, error: fileError } = await admin
    .from("payment_gateway_cnab_files")
    .select("*")
    .eq("id", fileId)
    .maybeSingle();
  if (fileError) throw fileError;
  if (!file) throw new Error("Arquivo CNAB não encontrado.");
  const records: any[] = [];
  const pageSize = 500;
  for (let offset = 0;; offset += pageSize) {
    const { data, error: recordsError } = await admin
      .from("payment_gateway_cnab_records")
      .select("*")
      .eq("file_id", fileId)
      .order("line_number", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (recordsError) throw recordsError;
    records.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return { file, records };
};

export const listCnabFiles = async (
  admin: any,
  requestedEnvironment?: unknown,
) => {
  const context = await loadCnabContext(admin, requestedEnvironment);
  const { data, error } = await admin
    .from("payment_gateway_cnab_files")
    .select("*")
    .eq("provider_code", BANESE_CNAB_PROVIDER)
    .eq("environment", context.environment)
    .eq("convenio", context.convenio)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return { context, files: (data || []).map(publicCnabFile) };
};

export const getCnabFileDetails = async (
  admin: any,
  fileId: string,
  requestedEnvironment?: unknown,
) => {
  const context = await loadCnabContext(admin, requestedEnvironment);
  const existing = await readCnabFileWithRecords(admin, fileId);
  const direction = existing.file.direction === "REMESSA"
    ? "REMESSA"
    : "RETORNO";
  assertCnabFileScope(existing.file, context, direction);
  return {
    file: publicCnabFile(existing.file),
    records: existing.records.map(publicCnabRecord),
  };
};

export const createSignedCnabDownload = async (
  admin: any,
  actor: GestorActor,
  fileId: string,
  requestedEnvironment?: unknown,
) => {
  const context = await loadCnabContext(admin, requestedEnvironment);
  const { data: file, error } = await admin
    .from("payment_gateway_cnab_files")
    .select("*")
    .eq("id", fileId)
    .eq("provider_code", BANESE_CNAB_PROVIDER)
    .eq("environment", context.environment)
    .eq("convenio", context.convenio)
    .maybeSingle();
  if (error) throw error;
  if (!file) throw new Error("Arquivo CNAB não encontrado no ambiente ativo.");
  if (
    file.direction !== "REMESSA" || file.status !== "GENERATED" ||
    Number(file.processing_summary?.claimedReceivables || 0) !==
      Number(file.title_count || 0)
  ) {
    throw new Error(
      "Somente uma remessa gerada com sucesso pode ser exportada.",
    );
  }
  const { data, error: signedError } = await admin.storage
    .from(BANESE_CNAB_BUCKET)
    .createSignedUrl(file.storage_path, 60);
  if (signedError || !data?.signedUrl) {
    throw signedError ||
      new Error("Não foi possível assinar o download privado.");
  }
  await writeCnabAudit(admin, {
    file_id: file.id,
    actor_id: actor.id,
    action: "REMESSA_BAIXADA",
    metadata: { direction: file.direction, expiresInSeconds: 60 },
  });
  return {
    file: publicCnabFile(file),
    signedUrl: data.signedUrl,
    expiresIn: 60,
  };
};
