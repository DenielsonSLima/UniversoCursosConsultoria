import type { CicloManualModoMatricula } from './matricula-tecnica-ciclo-manual.types';
import { isFeeOnlyTransferSchedule } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
import { isExternalTransferConditions } from '../academic/external-transfer.contract';

type RecordValue = Record<string, unknown>;
export const isCycleRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isCycleEnrollmentMode = (value: unknown): value is CicloManualModoMatricula =>
  ['BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR'].includes(String(value));

export const isFeeOnlyExternalTransferPlan = (plan: unknown, cycle: number) =>
  isCycleRecord(plan) && (plan.versao === 3 ? isFeeOnlyTransferSchedule(plan, cycle)
  : [1, 2].includes(cycle) && plan.cobrarMensalidades === false
  && typeof plan.requestId === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.requestId)
  && isExternalTransferConditions(plan.condicoes)
  && (cycle === 1 ? plan.condicoes.cobrarMatricula : plan.condicoes.cobrarRematricula));

export const readCycleQuantities = (value: RecordValue, allowLocalOnly = false) => {
  const total = value.quantidadeItens;
  const legacy = value.quantidadeBancaria === undefined && value.quantidadeLocal === undefined;
  const bank = legacy ? total : value.quantidadeBancaria;
  const local = legacy ? 0 : value.quantidadeLocal;
  if (!Number.isInteger(total) || !Number.isInteger(bank) || !Number.isInteger(local)
    || (Number(bank) < 1 && !(allowLocalOnly && bank === 0 && local === 1 && total === 1))
    || Number(local) < 0 || Number(local) > 1
    || Number(bank) + Number(local) !== total) return null;
  return { bank: Number(bank), local: Number(local), total: Number(total) };
};

export const isProvenLocalEnrollment = (value: unknown) => {
  if (!isCycleRecord(value)) return false;
  const date = String(value.vencimento || '');
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  return value.tipo === 'MATRICULA' && value.numero === 0
    && value.emissaoBanese === 'NAO_APLICAVEL' && value.emissaoHistoricaComprovada !== true
    && typeof value.id === 'string' && value.id.trim().length > 0
    && typeof value.descricao === 'string' && value.descricao.trim().length > 0
    && typeof value.valor === 'string' && /^\d+(?:\.\d+)?$/.test(value.valor)
    && Number(value.valor) > 0
    && parsedDate !== null && !Number.isNaN(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === date
    && ((['PENDENTE', 'VENCIDO', 'PAGO'].includes(String(value.status)) && value.localFeeWaiverProven !== true)
      || (value.status === 'CANCELADO' && value.localFeeWaiverProven === true))
    && value.destinoCobranca === 'LOCAL' && value.localSemBoletoComprovado === true;
};

export const isIssuedCycleReceivable = (item: RecordValue, cycleNumber: number) => {
  if (item.destinoCobranca === 'LOCAL') {
    return cycleNumber === 1 && item.tipo === 'MATRICULA' && item.numero === 0
      && item.emissaoBanese === 'NAO_APLICAVEL' && item.emissaoHistoricaComprovada !== true
      && isProvenLocalEnrollment(item);
  }
  return (item.destinoCobranca === undefined || item.destinoCobranca === 'BANESE')
    && item.localSemBoletoComprovado !== true && item.localFeeWaiverProven !== true && item.emissaoBanese === 'EMITIDO'
    && (['PENDENTE', 'VENCIDO'].includes(String(item.status))
      || (item.status === 'PAGO' && item.emissaoHistoricaComprovada === true));
};


export const isProvenWaivedLocalEnrollment = (value: unknown) =>
  isCycleRecord(value) && value.status === 'CANCELADO' && value.localFeeWaiverProven === true
  && isProvenLocalEnrollment(value);
