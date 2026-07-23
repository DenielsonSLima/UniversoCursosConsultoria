import { isTecnicoCycleLaunch } from "./cycle.ts";

type CallAsaas = (path: string, init?: RequestInit) => Promise<any>;

interface TecnicoInstallmentOptions {
  notificationDisabled?: boolean;
}

const one = (value: any) => Array.isArray(value) ? value[0] : value;

/**
 * @deprecated O POST /installments foi desativado porque um timeout apos o
 * commit remoto nao pode ser recuperado de forma deterministica. Use
 * createAsaasBillingService.syncFutureInstallments, que emite cada parcela
 * pelo fluxo individual com externalReference e fencing.
 */
export const createTecnicoInstallmentService = (
  admin: any,
  callAsaas: CallAsaas,
  options: TecnicoInstallmentOptions = {},
) => {
  void admin;
  void callAsaas;
  void options;

  const isTecnicoReceivable = (receivable: any) => {
    const turma = one(receivable?.turmas);
    const course = one(turma?.cursos);
    return String(course?.modalidade || "").toUpperCase() === "TECNICO" &&
      isTecnicoCycleLaunch(receivable);
  };

  const syncFutureInstallments = async (_matriculaId: string) => {
    throw new Error(
      "Parcelamento tecnico Asaas em lote desativado por seguranca. Use a sincronizacao individual roteada.",
    );
  };

  return {
    isTecnicoReceivable,
    syncFutureInstallments,
  };
};
