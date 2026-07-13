export const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

export const normalizeCpf = (value: unknown) => {
  const digits = onlyDigits(value);
  return digits.length === 11 ? digits : "";
};

export const parseMenuNumber = (value: unknown) => {
  const match = String(value || "").trim().match(/^\s*(\d{1,2})\s*$/);
  return match ? Number(match[1]) : null;
};

export const detectAttendantRequest = (value: unknown) =>
  /\b(atendente|humano|pessoa|secretaria|falar|ajuda)\b/i.test(String(value || ""));

export const detectPixRequest = (value: unknown) =>
  /\b(pix|copia\s*e\s*cola|copia|cola)\b/i.test(String(value || ""));

export const detectLinkRequest = (value: unknown) =>
  /\b(boleto|link|pagamento|parcela|fatura|segunda\s*via)\b/i.test(String(value || ""));

export const detectIrpfRequest = (value: unknown) =>
  /\b(irpf|imposto\s*de\s*renda|declara[cç][aã]o|recibo\s*irpf|ano\s*calend[aá]rio)\b/i.test(String(value || ""));

export const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(value || 0));

export const datePt = (value: unknown) => {
  const raw = String(value || "");
  if (!raw) return "";
  const [year, month, day] = raw.slice(0, 10).split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
};

export const statusPrefix = (status: unknown, dueDate: unknown) => {
  const today = new Date().toISOString().slice(0, 10);
  const due = String(dueDate || "").slice(0, 10);
  if (String(status || "").toUpperCase() === "VENCIDO" || (due && due < today)) return "vencida em";
  return "vence em";
};
