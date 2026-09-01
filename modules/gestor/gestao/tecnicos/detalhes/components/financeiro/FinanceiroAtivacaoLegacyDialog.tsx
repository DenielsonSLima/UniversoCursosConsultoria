import React from 'react';
import type {
  MatriculaTecnicaAtivacaoModo,
  MatriculaTecnicaFinanceiroRow,
} from './matricula-tecnica-financeiro.types';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';

export interface FinanceiroAtivacaoLegacyAction {
  matriculaIds: string[];
  label: string;
  modo: MatriculaTecnicaAtivacaoModo;
}

interface FinanceiroAtivacaoLegacyDialogProps {
  action: FinanceiroAtivacaoLegacyAction;
  alunos: MatriculaTecnicaFinanceiroRow[];
  ativarEm: string;
  pending: boolean;
  onAtivarEmChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const formatMoney = (value: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value));

const FinanceiroAtivacaoLegacyDialog: React.FC<FinanceiroAtivacaoLegacyDialogProps> = ({
  action,
  alunos,
  ativarEm,
  pending,
  onAtivarEmChange,
  onClose,
  onConfirm,
}) => {
  const rows = action.matriculaIds
    .map((id) => alunos.find((row) => row.matriculaId === id))
    .filter((row): row is MatriculaTecnicaFinanceiroRow => Boolean(row));
  const rule = rows.length === 1 ? rows[0].regraEfetiva : null;
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="schedule-finance-title" tabIndex={-1} className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
        <h3 id="schedule-finance-title" className="text-lg font-black text-[#001a33]">{action.modo === 'AGORA' ? 'Confirmar geração inicial' : 'Agendar geração'}</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">{action.label}.</p>
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
          <strong className="block text-[10px] font-black uppercase">Regra efetiva confirmada pelo servidor</strong>
          {rule
            ? `${rows[0].overrideAtivo ? 'Regra individual. ' : 'Regra da turma. '}${rule.cobranca.matricula.habilitada ? `Matrícula inicial: ${formatMoney(rule.cobranca.matricula.valor)}.` : `Primeiro ciclo: ${rule.cobranca.mensalidade.quantidade} mensalidades de ${formatMoney(rule.cobranca.mensalidade.valor)}.`}`
            : 'Cada aluno do lote será validado com sua própria regra efetiva (turma mais eventuais configurações individuais).'}
        </div>
        {action.modo === 'AGENDADA' ? <label className="mt-5 block space-y-2"><span className="text-[10px] font-black uppercase text-slate-500">Executar em</span><input type="datetime-local" value={ativarEm} onChange={(event) => onAtivarEmChange(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold outline-none focus:border-blue-500" /></label> : null}
        <div className="mt-5 flex gap-3"><button ref={(node) => { initialFocusRef.current = node; }} type="button" disabled={pending} onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase text-slate-500">Cancelar</button><button type="button" disabled={pending || (action.modo === 'AGENDADA' && !ativarEm)} onClick={onConfirm} className="flex-1 rounded-xl bg-blue-600 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{pending ? 'Processando...' : 'Confirmar'}</button></div>
      </div>
    </div>
  );
};

export default FinanceiroAtivacaoLegacyDialog;
