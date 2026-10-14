import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { GestorPermissions } from '../../access-control';
import { canReceivePlannedExternalTransfer } from '../../gestao/tecnicos/detalhes/components/academic/external-transfer-access';
import FinanceiroAlunosList from '../../gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList';
import { canUseManualEnrollmentSettlement } from '../../gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-settlement-account';
import { useMatriculaTecnicaFinanceiroWorkspace } from '../../gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaFinanceiro';
import { useMatriculaTecnicaFinanceiroRealtime } from '../../gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaFinanceiroRealtime';

export interface TransferenciaFinanceiroTarget {
  poloId: string;
  turmaId: string;
  alunoId: string;
  matriculaId: string;
  cursoNome: string;
}

interface Props {
  target: TransferenciaFinanceiroTarget;
  permissions: GestorPermissions;
  onBack: () => void;
}

const SecretariaTransferenciaFinanceiro: React.FC<Props> = ({ target, permissions, onBack }) => {
  const canAccess = canReceivePlannedExternalTransfer(permissions);
  const workspaceQuery = useMatriculaTecnicaFinanceiroWorkspace(target.turmaId, target.alunoId, canAccess);
  useMatriculaTecnicaFinanceiroRealtime(canAccess ? target.turmaId : '');
  const [valuesVisible, setValuesVisible] = useState(false);
  const workspace = workspaceQuery.data;
  const row = workspace?.matriculas.find((item) => item.matriculaId === target.matriculaId);
  const matchesTarget = workspace?.turma.turmaId === target.turmaId
    && workspace.turma.poloId === target.poloId
    && workspace.aluno?.alunoId === target.alunoId
    && workspace.matriculas.length === 1
    && row?.alunoId === target.alunoId;

  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-black text-[#001a33]">Financeiro da transferência recebida</h3>
        <p className="mt-1 text-sm text-slate-600">Confira o ciclo disponível e confirme a emissão BolePix. O carnê ficará disponível após a emissão dos títulos.</p>
      </div>
      <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
        <ArrowLeft size={15} />Concluir e voltar
      </button>
    </header>
    {!canAccess ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">O recebimento exige acesso ao Financeiro da turma e a Financeiro → Receber.</p>
      : workspaceQuery.isLoading ? <p role="status" className="flex items-center gap-2 rounded-xl bg-white p-5 text-sm text-slate-600"><Loader2 size={18} className="animate-spin" />Carregando financeiro individual...</p>
        : workspaceQuery.isError || !workspace || !row || !matchesTarget ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>{workspaceQuery.isError ? 'Não foi possível conferir o financeiro individual. Atualize a consulta antes de continuar.' : 'O financeiro retornado não corresponde à matrícula, ao aluno e à unidade do recebimento.'}</p>
          <button type="button" disabled={workspaceQuery.isFetching} onClick={() => { void workspaceQuery.refetch(); }} className="mt-3 font-bold underline disabled:opacity-50">Tentar novamente</button>
        </div> : <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div>
              <p className="text-sm font-black text-violet-950">{row.alunoNome}</p>
              <p className="mt-1 text-xs text-violet-800">{target.cursoNome} — {workspace.turma.nome} · Matrícula {row.matriculaExibicao}</p>
              <p className="mt-2 text-xs text-violet-800">O plano salvo permanece nesta matrícula. Cada ciclo tem sua própria revisão e confirmação.</p>
            </div>
            <button type="button" onClick={() => setValuesVisible((current) => !current)} aria-pressed={valuesVisible}
              className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800">
              {valuesVisible ? <EyeOff size={16} /> : <Eye size={16} />}{valuesVisible ? 'Ocultar valores' : 'Exibir valores'}
            </button>
          </div>
          <FinanceiroAlunosList key={target.matriculaId}
            turma={{ id: workspace.turma.turmaId, poloId: workspace.turma.poloId,
              nome: workspace.turma.nome, codigo: workspace.turma.codigo, cursoNome: target.cursoNome }}
            canSettleEnrollment={canUseManualEnrollmentSettlement(permissions)}
            valuesVisible={valuesVisible} regra={workspace.regra} alunos={[row]} resumo={row.totais}
            isLoading={false} isError={false} isFetching={workspaceQuery.isFetching}
            onRetry={() => { void workspaceQuery.refetch(); }} />
        </>}
  </section>;
};

export default SecretariaTransferenciaFinanceiro;
