import type { ContasReceber } from './financeiro.types';
import { hasProescEvidence } from './financeiro.proesc-evidence';

const issuanceStates = new Set(['EMITIDO', 'PENDENTE', 'REVISAO', 'REVISAO_MANUAL', 'NAO_APLICAVEL']);

export const mapReceivableIssuance = (row: Record<string, any>): Pick<ContasReceber,
  'destinoCobranca' | 'emissaoGerenciadaTurma' | 'emissaoCicloStatus'> => {
  const destination = row.destino_cobranca ?? row.regra_financeira_tecnica_snapshot?.destinoCobranca;
  return {
    destinoCobranca: destination === 'LOCAL' || destination === 'BANESE' ? destination : undefined,
    emissaoGerenciadaTurma: row.emissao_gerenciada_turma === true,
    emissaoCicloStatus: issuanceStates.has(row.emissao_ciclo_status) ? row.emissao_ciclo_status : undefined,
  };
};

export const receivableIssuanceNotice = (item: ContasReceber) => {
  if (item.destinoCobranca === 'LOCAL') {
    return { title: 'Sem boleto', message: 'Matrícula registrada para recebimento sem emissão bancária.' };
  }
  if (item.emissaoGerenciadaTurma && item.emissaoCicloStatus !== 'EMITIDO') {
    return item.emissaoCicloStatus === 'REVISAO_MANUAL'
      ? { title: 'Emissão em revisão', message: 'Acompanhe esta cobrança em Gestão → Turma → Financeiro.' }
      : { title: 'Emissão não concluída', message: 'Abra Gestão → Turma → Financeiro e use Retomar emissão.' };
  }
  return null;
};

// Financeiro receives payments and opens existing titles. Native technical
// cycles are issued only by the reviewed class generation/resumption flow.
export const submitReceivableFromFinanceiro = async <T>(
  item: ContasReceber,
  submit: (receivableId: string) => Promise<T>,
): Promise<T> => {
  if (item.destinoCobranca === 'LOCAL') {
    throw new Error('Esta matrícula foi registrada sem boleto. Use Receber para registrar o pagamento.');
  }
  if (item.emissaoGerenciadaTurma) {
    throw new Error('A emissão desta cobrança é feita em Gestão → Turma → Financeiro. Use Retomar emissão para concluir o ciclo existente.');
  }
  if (item.origemPagamento === 'SISTEMA_ANTERIOR' || hasProescEvidence(item)) {
    throw new Error('Esta cobrança pertence ao histórico importado e não permite uma nova emissão por aqui.');
  }
  if (!item.id || !['PENDENTE', 'VENCIDO'].includes(item.status)) {
    throw new Error('A cobrança não está disponível para envio ao banco. Atualize a tela.');
  }
  return submit(item.id);
};
