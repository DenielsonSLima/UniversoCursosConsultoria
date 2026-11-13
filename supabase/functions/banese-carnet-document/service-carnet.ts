import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ServiceDocumentContext } from "../banese/internal/service-document-context.ts";
import type { BaneseCarnetReceivableRow } from "./document-policy.ts";

const openStatuses = new Set(["PENDENTE", "VENCIDO", "AGUARDANDO_CONFIRMACAO"]);
const bankStatuses = new Set(["", "2", "PENDING", "OPEN", "REGISTERED", "CREATED"]);
const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const upper = (value: unknown) => text(value).toUpperCase();
const identity = (row: BaneseCarnetReceivableRow) => [row.cliente_id, row.polo_id,
  row.gateway_environment, row.gateway_issuer_polo_id, digits(row.gateway_boleto_convenio),
  digits(row.gateway_boleto_agencia).padStart(3, "0")].join("|");

export function selectServiceCarnetRows(
  selected: BaneseCarnetReceivableRow,
  candidates: BaneseCarnetReceivableRow[],
  context: ServiceDocumentContext,
) {
  if (!["production", "sandbox"].includes(String(selected.gateway_environment))
    || candidates.length !== context.receivableIds.length
    || new Set(candidates.map(row => row.id)).size !== candidates.length
    || candidates.some(row => !context.receivableIds.includes(row.id))) {
    throw new Error("As parcelas não correspondem ao grupo canônico da NFS-e.");
  }
  const rows = candidates.filter(row => openStatuses.has(upper(row.status)));
  if (!rows.some(row => row.id === selected.id)) throw new Error("O boleto selecionado está encerrado ou indisponível.");
  for (const row of rows) {
    if (identity(row) !== identity(selected) || row.gateway_provider !== "banese_card"
      || upper(row.gateway_payment_method) !== "BOLETO" || !bankStatuses.has(upper(row.gateway_status))
      || !row.gateway_financial_terms || !row.gateway_financial_terms_confirmed_at
      || Number.isNaN(Date.parse(row.gateway_financial_terms_confirmed_at))) {
      throw new Error("Há parcelas do serviço aguardando confirmação bancária para o carnê.");
    }
  }
  return rows.sort((a, b) => context.receivableIds.indexOf(a.id) - context.receivableIds.indexOf(b.id));
}

export async function readServiceCarnetRows(admin: SupabaseClient, selected: BaneseCarnetReceivableRow,
  context: ServiceDocumentContext, columns: string) {
  const { data, error } = await admin.from("contas_receber").select(columns).in("id", context.receivableIds);
  if (error) throw new Error("Não foi possível consultar os boletos da NFS-e.");
  return selectServiceCarnetRows(selected, (data || []) as unknown as BaneseCarnetReceivableRow[], context);
}
