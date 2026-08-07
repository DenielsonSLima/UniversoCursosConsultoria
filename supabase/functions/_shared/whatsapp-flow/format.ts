export const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

const isValidCpf = (digits: string) => {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (size: number) => {
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
      sum += Number(digits[index]) * (size + 1 - index);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(9) === Number(digits[9]) && calcDigit(10) === Number(digits[10]);
};

export const normalizeCpf = (value: unknown) => {
  const digits = onlyDigits(value);
  return isValidCpf(digits) ? digits : "";
};

export const normalizePersonName = (value: unknown) => {
  const name = String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 5 || name.length > 120) return "";
  if (name.split(" ").filter(Boolean).length < 2) return "";
  return /^[\p{L}\p{M}][\p{L}\p{M}' -]*$/u.test(name) ? name : "";
};

export const parseMenuNumber = (value: unknown) => {
  const input = String(value || "").trim();
  const numeric = input.match(/^(\d{1,2})$/);
  if (numeric) return Number(numeric[1]);

  const labeled = input.match(
    /^(?:op(?:ç|c)[aã]o\s+)?(\d{1,2})(?:\s*[-–—.):]\s*|\s+)[\p{L}\p{M}][\p{L}\p{M}\s/+&-]{0,60}$/iu,
  );
  return labeled ? Number(labeled[1]) : null;
};

export const detectAttendantRequest = (value: unknown) =>
  /\b(atendente|humano|pessoa|secretaria|falar|ajuda)\b/i.test(String(value || ""));

export const detectPixRequest = (value: unknown) =>
  /\b(pix|copia\s*e\s*cola|copia|cola)\b/i.test(String(value || ""));

export const detectLinkRequest = (value: unknown) =>
  /\b(boleto|link|pagamento|parcela|fatura|segunda\s*via)\b/i.test(String(value || ""));

export const detectIrpfRequest = (value: unknown) =>
  /\b(irpf|imposto\s*de\s*renda|declara[cç][aã]o|recibo\s*irpf|ano\s*calend[aá]rio)\b/i.test(String(value || ""));

export const studentDisplayName = (aluno: any, conversation?: any) =>
  String(aluno?.nome_social || aluno?.nome || aluno?.razao_social || conversation?.contato_nome || "aluno(a)")
    .trim()
    .replace(/\s+/g, " ");

export const renderFlowText = (text: unknown, context: { aluno?: any | null; conversation?: any | null }) => {
  const name = studentDisplayName(context.aluno, context.conversation);
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/{{\s*nome_aluno\s*}}/gi, name)
    .replace(/{{\s*aluno_nome\s*}}/gi, name)
    .replace(/{{\s*nome\s*}}/gi, name);
};

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
