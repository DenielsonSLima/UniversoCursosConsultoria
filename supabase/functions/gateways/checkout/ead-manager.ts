import {
  requireGestorAtivo,
  requireGestorModule,
} from "../../_shared/authz.ts";
import type { CheckoutRuntime } from "./types.ts";
import { UUID_RE } from "./utils.ts";

// This mode always reserves a charge. Academic permission allows enrollment;
// waiving the charge belongs exclusively to the separate Financeiro RPC.
export const authorizeManagerEadEnrollment = async (runtime: CheckoutRuntime) => {
  if (runtime.body.managerEnrollment !== true) return null;
  if (!UUID_RE.test(String(runtime.body.alunoId || "")) ||
    !UUID_RE.test(String(runtime.body.turmaId || "")) || runtime.body.receivableId) {
    throw new Error("Informe o aluno e a turma para a matrícula EAD pelo gestor.");
  }
  const gestor = await requireGestorAtivo(runtime.req, runtime.admin);
  requireGestorModule(gestor, "gestao");
  if (!["gestor", "financeiro"].includes(String(gestor.perfil || "").trim().toLowerCase()) ||
    (Object.prototype.hasOwnProperty.call(gestor.tabs, "gestao") && !gestor.tabs.gestao.includes("alunos"))) {
    throw new Error("Acesso aos alunos da turma EAD nao autorizado.");
  }
  return gestor;
};
