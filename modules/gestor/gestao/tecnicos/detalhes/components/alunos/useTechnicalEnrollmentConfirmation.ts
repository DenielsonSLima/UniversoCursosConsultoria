import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { academicLifecycleKeys } from "../../academic-lifecycle.keys";
import {
  createFinanceiroRequestId,
  useAtivarFinanceiroMatriculaTecnica,
  usePreVincularAlunoTecnico,
  useSalvarOverrideFinanceiroTecnico,
} from "../financeiro/hooks/useMatriculaTecnicaFinanceiro";
import { matriculaTecnicaFinanceiroKeys } from "../financeiro/matricula-tecnica-financeiro.keys";
import {
  isFinanceiroDateRejected,
  isRegraFinanceiraConflict,
} from "../financeiro/matricula-tecnica-financeiro.service";
import type { MatriculaTecnicaRegraIdentidade } from "../financeiro/matricula-tecnica-financeiro.types";
import type { EnrollmentFinanceSubmission } from "./ConfirmarMatriculaModal";

interface EnrollmentToast {
  error: (title: string, message: string) => void;
  success: (title: string, message: string) => void;
  warning: (title: string, message: string) => void;
}

interface UseTechnicalEnrollmentConfirmationInput {
  turmaId: string;
  alunoId?: string;
  canEnroll: boolean;
  canManageFinanceiro: boolean;
  contextError: boolean;
  manualFinanceMode: boolean;
  regra?: MatriculaTecnicaRegraIdentidade;
  onSuccess: () => void;
  toast: EnrollmentToast;
}

export const useTechnicalEnrollmentConfirmation = ({
  turmaId,
  alunoId,
  canEnroll,
  canManageFinanceiro,
  contextError,
  manualFinanceMode,
  regra,
  onSuccess,
  toast,
}: UseTechnicalEnrollmentConfirmationInput) => {
  const queryClient = useQueryClient();
  const preLinkRequestIds = useRef(new Map<string, string>());
  const overrideRequestIds = useRef(new Map<string, string>());
  const activationRequestIds = useRef(new Map<string, string>());
  const preLinkMutation = usePreVincularAlunoTecnico();
  const saveOverrideMutation = useSalvarOverrideFinanceiroTecnico();
  const activateFinanceMutation = useAtivarFinanceiroMatriculaTecnica();

  const confirm = async (submission: EnrollmentFinanceSubmission) => {
    if (!alunoId) return;
    if (!canEnroll || contextError || !regra) {
      toast.error(
        "Regra não carregada",
        "Recarregue o workspace financeiro oficial antes de confirmar.",
      );
      return;
    }

    const effectiveIntent = manualFinanceMode
      ? "PENDENTE"
      : canManageFinanceiro
      ? submission.intent
      : "PENDENTE";
    const primeiroVencimento = canManageFinanceiro
      ? submission.primeiroVencimento
      : "";
    const ativarEm = canManageFinanceiro && !manualFinanceMode
      ? submission.ativarEm
      : "";
    if (canManageFinanceiro && !primeiroVencimento) {
      toast.error(
        "Vencimento obrigatório",
        "Informe o primeiro vencimento desta matrícula.",
      );
      return;
    }
    if (effectiveIntent === "AGENDADA" && !ativarEm) {
      toast.error(
        "Agendamento obrigatório",
        "Informe quando a geração financeira deve ser executada.",
      );
      return;
    }

    const preLinkKey = `${alunoId}:${
      primeiroVencimento || "CANONICO"
    }:${regra.revisao}:${regra.fingerprint}`;
    const preLinkRequestId = preLinkRequestIds.current.get(preLinkKey) ||
      createFinanceiroRequestId();
    preLinkRequestIds.current.set(preLinkKey, preLinkRequestId);
    let preLinkConfirmed = false;

    try {
      const preLink = await preLinkMutation.mutateAsync({
        turmaId,
        alunoId,
        requestId: preLinkRequestId,
        expectedRegraRevisao: regra.revisao,
        expectedRegraFingerprint: regra.fingerprint,
        primeiroVencimento: canManageFinanceiro
          ? primeiroVencimento || null
          : null,
      });
      if (preLink.cobrancaGerada) {
        throw new Error("O pré-vínculo retornou uma cobrança inesperada.");
      }
      preLinkConfirmed = true;
      await queryClient.invalidateQueries({
        queryKey: academicLifecycleKeys.alunos(turmaId),
      });

      let effectiveMatricula = preLink.matricula;
      if (submission.override) {
        if (!submission.codigoAutorizacao || !submission.motivo) {
          throw new Error(
            "A condição individual não possui autorização válida.",
          );
        }
        const effectiveRule = effectiveMatricula.regraEfetiva;
        const currentOverride = effectiveMatricula.override;
        if (!effectiveRule || !currentOverride) {
          throw new Error(
            "O servidor não retornou a identidade financeira para aplicar a condição individual.",
          );
        }
        const overrideKey = JSON.stringify({
          matriculaId: effectiveMatricula.matriculaId,
          override: submission.override,
          motivo: submission.motivo,
          justificativa: submission.justificativa,
          expected: effectiveRule.identidade,
        });
        const overrideRequestId = overrideRequestIds.current.get(overrideKey) ||
          createFinanceiroRequestId();
        overrideRequestIds.current.set(overrideKey, overrideRequestId);
        const overrideResult = await saveOverrideMutation.mutateAsync({
          turmaId,
          matriculaId: effectiveMatricula.matriculaId,
          requestId: overrideRequestId,
          expectedTurmaRevisao: effectiveRule.identidade.turmaRevisao,
          expectedTurmaFingerprint: effectiveRule.identidade.turmaFingerprint,
          expectedOverrideRevisao: currentOverride.identidade.revisao,
          expectedOverrideFingerprint: currentOverride.identidade.fingerprint,
          override: submission.override,
          codigoAutorizacao: submission.codigoAutorizacao,
          motivo: submission.motivo,
          justificativa: submission.justificativa,
        });
        overrideRequestIds.current.delete(overrideKey);
        effectiveMatricula = overrideResult.matricula;
      }

      if (effectiveIntent !== "PENDENTE") {
        const effectiveRule = effectiveMatricula.regraEfetiva;
        const currentOverride = effectiveMatricula.override;
        if (!effectiveRule || !currentOverride) {
          throw new Error(
            "O servidor não retornou a identidade financeira efetiva da matrícula.",
          );
        }
        const activationKey =
          `${effectiveMatricula.matriculaId}:${effectiveIntent}:${
            ativarEm || "AGORA"
          }:${effectiveRule.identidade.efetivaFingerprint}`;
        const activationRequestId =
          activationRequestIds.current.get(activationKey) ||
          createFinanceiroRequestId();
        activationRequestIds.current.set(activationKey, activationRequestId);
        await activateFinanceMutation.mutateAsync({
          turmaId,
          matriculaId: effectiveMatricula.matriculaId,
          modo: effectiveIntent,
          requestId: activationRequestId,
          expectedTurmaRevisao: effectiveRule.identidade.turmaRevisao,
          expectedTurmaFingerprint: effectiveRule.identidade.turmaFingerprint,
          expectedOverrideRevisao: currentOverride.identidade.revisao,
          expectedOverrideFingerprint: currentOverride.identidade.fingerprint,
          expectedEfetivaFingerprint:
            effectiveRule.identidade.efetivaFingerprint,
          ativarEm: effectiveIntent === "AGENDADA"
            ? new Date(ativarEm).toISOString()
            : null,
        });
      }

      preLinkRequestIds.current.clear();
      overrideRequestIds.current.clear();
      activationRequestIds.current.clear();
      onSuccess();
      if (manualFinanceMode || effectiveIntent === "PENDENTE") {
        toast.success(
          "Aluno pré-vinculado",
          "Configuração salva como pendente. Nenhuma cobrança ou agendamento foi criado.",
        );
      } else if (effectiveIntent === "AGORA") {
        toast.success(
          "Cobrança inicial gerada",
          "O servidor confirmou o vínculo e criou somente o título inicial local.",
        );
      } else {
        toast.success(
          "Financeiro agendado",
          "O vínculo foi confirmado e a geração ficou agendada pelo servidor.",
        );
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "O servidor não confirmou a operação.";
      if (isRegraFinanceiraConflict(error)) {
        void queryClient.invalidateQueries({
          queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId),
          refetchType: "active",
        });
        toast.warning(
          preLinkConfirmed
            ? "Vínculo confirmado; regra alterada"
            : "Regra financeira alterada",
          "A regra da turma mudou durante a confirmação. Revise os novos valores e confirme novamente.",
        );
        return;
      }
      if (isFinanceiroDateRejected(error)) {
        toast.warning(
          preLinkConfirmed
            ? "Aluno vinculado; data não aceita"
            : "Data não aceita pelo servidor",
          "A data informada já venceu ou não é válida. O financeiro permanece pendente; corrija o vencimento e tente novamente.",
        );
        return;
      }
      if (preLinkConfirmed) {
        void queryClient.invalidateQueries({
          queryKey: matriculaTecnicaFinanceiroKeys.turma(turmaId),
          refetchType: "active",
        });
        toast.warning(
          "Aluno vinculado; financeiro pendente",
          `${message} A configuração permanece pendente e nenhuma geração foi confirmada.`,
        );
      } else {
        toast.error(
          "Matrícula não realizada",
          `${message} Tente novamente; o mesmo identificador será reutilizado com segurança.`,
        );
      }
    }
  };

  return {
    confirm,
    isPending: preLinkMutation.isPending ||
      saveOverrideMutation.isPending ||
      activateFinanceMutation.isPending,
  };
};
