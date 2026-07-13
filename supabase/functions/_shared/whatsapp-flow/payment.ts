import { datePt, money, statusPrefix } from "./format.ts";

export type PaymentMethod = "link" | "pix";

export type PaymentOption = {
  id: string;
  label: string;
  link: string;
  pix: string;
};

const hasPaymentFor = (item: PaymentOption, method: PaymentMethod) =>
  method === "pix" ? Boolean(item.pix) : Boolean(item.link);

const totalInstallmentsFor = (row: any, rows: any[]) => {
  if (Number(row.gateway_installments || 0) > 0) return Number(row.gateway_installments);
  if (!row.matricula_id) return null;
  const siblings = rows.filter((item) => item.matricula_id && item.matricula_id === row.matricula_id);
  const max = Math.max(...siblings.map((item) => Number(item.parcela_numero || 0)));
  return max > 0 ? max : null;
};

const isEligibleDueDate = (row: any) => {
  const status = String(row.status || "").toUpperCase();
  if (status === "VENCIDO") return true;
  if (status !== "PENDENTE") return false;

  const due = String(row.data_vencimento || "").slice(0, 10);
  if (!due) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  return due <= limit.toISOString().slice(0, 10);
};

const optionFromRow = (row: any, rows: any[]): PaymentOption => {
  const total = totalInstallmentsFor(row, rows);
  const number = Number(row.parcela_numero || 0);
  const installment = number > 0
    ? `Parcela ${String(number).padStart(2, "0")}${total ? `/${total}` : ""}`
    : row.descricao || "Parcela";
  const course = row.turmas?.cursos?.nome || row.turmas?.nome || "";
  const label = [
    installment,
    `${statusPrefix(row.status, row.data_vencimento)} ${datePt(row.data_vencimento)}`,
    money(row.valor),
    course,
  ].filter(Boolean).join(" - ");

  return {
    id: row.id,
    label,
    link: row.gateway_invoice_url || row.asaas_invoice_url || row.gateway_bank_slip_url || row.asaas_bank_slip_url || "",
    pix: row.gateway_pix_payload || "",
  };
};

export const getPaymentOptions = async (
  admin: any,
  alunoId: string,
  method: PaymentMethod,
) => {
  const { data, error } = await admin
    .from("contas_receber")
    .select(`
      id, descricao, valor, data_vencimento, status, matricula_id, parcela_numero,
      gateway_installments, gateway_invoice_url, gateway_bank_slip_url, gateway_pix_payload,
      asaas_invoice_url, asaas_bank_slip_url,
      turmas(nome, cursos(nome, modalidade))
    `)
    .eq("cliente_id", alunoId)
    .in("status", ["PENDENTE", "VENCIDO"])
    .order("data_vencimento", { ascending: true });
  if (error) throw error;

  const rows = data || [];
  return rows
    .filter(isEligibleDueDate)
    .map((row: any) => optionFromRow(row, rows))
    .filter((item: PaymentOption) => hasPaymentFor(item, method));
};

export const paymentValueFor = (option: PaymentOption, method: PaymentMethod) =>
  method === "pix" ? option.pix : option.link;

export const formatOptionsList = (options: PaymentOption[]) =>
  options.map((item, index) => `${index + 1} - ${item.label}`).join("\n");
