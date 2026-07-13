import { money } from "./format.ts";

export type IrpfYearOption = {
  year: number;
  label: string;
  matriculaId: string;
  totalPaid: number;
};

const TECHNICAL_STATUSES = ["ATIVO", "CONCLUIDO", "CANCELADO", "TRANCADO", "DESISTENTE", "TRANSFERIDO"];

const validatorBaseUrl = () => {
  const raw = [
    Deno.env.get("PUBLIC_SITE_URL"),
    Deno.env.get("SITE_URL"),
    Deno.env.get("APP_URL"),
    Deno.env.get("VITE_PUBLIC_SITE_URL"),
  ].find((item) => String(item || "").trim()) || "https://www.universocc.com.br";
  return String(raw).replace(/\/+$/, "");
};

export const buildIrpfValidationUrl = (code: string) =>
  `${validatorBaseUrl()}/validador?q=${encodeURIComponent(code)}`;

const getTechnicalEnrollments = async (admin: any, alunoId: string) => {
  const { data, error } = await admin
    .from("matriculas")
    .select("id,status,data_matricula,turma_id,turmas!inner(id,nome,cursos!inner(nome,modalidade))")
    .eq("aluno_id", alunoId)
    .in("status", TECHNICAL_STATUSES)
    .eq("turmas.cursos.modalidade", "TECNICO")
    .order("data_matricula", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getIrpfYearOptions = async (admin: any, alunoId: string) => {
  const enrollments = await getTechnicalEnrollments(admin, alunoId);
  if (!enrollments.length) return { eligible: false, options: [] as IrpfYearOption[] };

  const { data, error } = await admin
    .from("contas_receber")
    .select("id,valor,valor_pago,data_pagamento,matricula_id,turma_id,turmas!inner(id,nome,cursos!inner(nome,modalidade))")
    .eq("cliente_id", alunoId)
    .eq("status", "PAGO")
    .not("data_pagamento", "is", null)
    .eq("turmas.cursos.modalidade", "TECNICO")
    .order("data_pagamento", { ascending: false });
  if (error) throw error;

  const enrollmentByTurma = new Map(enrollments.map((item: any) => [item.turma_id, item]));
  const currentYear = new Date().getFullYear();
  const years = new Map<number, IrpfYearOption>();

  for (const row of data || []) {
    const year = Number(String(row.data_pagamento || "").slice(0, 4));
    if (!year || year > currentYear - 1) continue;
    const fallbackEnrollment = enrollmentByTurma.get(row.turma_id) || enrollments[0];
    const matriculaId = row.matricula_id || fallbackEnrollment?.id;
    if (!matriculaId) continue;

    const totalPaid = Number(row.valor_pago || row.valor || 0);
    const current = years.get(year);
    const course = row.turmas?.cursos?.nome || row.turmas?.nome || "Curso técnico";
    years.set(year, {
      year,
      matriculaId: current?.matriculaId || matriculaId,
      totalPaid: Number(current?.totalPaid || 0) + totalPaid,
      label: `${year} - ${course}`,
    });
  }

  const options = [...years.values()]
    .sort((a, b) => b.year - a.year)
    .map((item) => ({ ...item, label: `${item.label} - ${money(item.totalPaid)}` }));
  return { eligible: true, options };
};

export const issueIrpfDocument = async (admin: any, option: IrpfYearOption) => {
  const { data, error } = await admin.rpc("emitir_documento_validacao", {
    p_documento: "declaracao_irpf",
    p_matricula_id: option.matriculaId,
    p_periodo_referencia: String(option.year),
    p_referencia_externa: null,
    p_validade_ate: null,
    p_emitido_por: null,
    p_registrar_reemissao: true,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const code = String(row?.codigo || "").trim();
  if (!code) throw new Error("Não foi possível gerar o código de validação do IRPF.");
  return { code, url: buildIrpfValidationUrl(code) };
};

export const formatIrpfOptionsList = (options: IrpfYearOption[]) =>
  options.map((item, index) => `${index + 1} - ${item.label}`).join("\n");
