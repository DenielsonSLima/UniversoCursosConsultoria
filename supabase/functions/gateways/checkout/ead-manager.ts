import {
  requireFinanceWriteAccess,
  requireGestorAtivo,
  requireGestorModule,
} from "../../_shared/authz.ts";
import type { CheckoutRuntime } from "./types.ts";
import { UUID_RE } from "./utils.ts";

// The browser flag only requests this mode. Identity and finance permission are
// checked before it may bypass publication on the public catalog.
export const authorizeManagerEadEnrollment = async (runtime: CheckoutRuntime) => {
  if (runtime.body.managerEnrollment !== true) return null;
  if (!UUID_RE.test(String(runtime.body.alunoId || "")) ||
    !UUID_RE.test(String(runtime.body.turmaId || "")) || runtime.body.receivableId) {
    throw new Error("Informe o aluno e a turma para a matrícula EAD pelo gestor.");
  }
  const gestor = await requireGestorAtivo(runtime.req, runtime.admin);
  requireGestorModule(gestor, "financeiro");
  requireFinanceWriteAccess(gestor);
  return gestor;
};
