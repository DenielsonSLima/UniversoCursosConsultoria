import React from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import StatCard from './EadStatCard';
import type { EadAlunoTurma, EadPagamentoTurma, EadTurmaResumo } from '../ead-turma.types';
import { formatCurrency, formatDateTime, paymentMethodLabel } from '../ead-turma.presentation';

export const EadFinanceiroPanel: React.FC<{
  resumo?: EadTurmaResumo;
  alunos: EadAlunoTurma[];
  pagamentos: EadPagamentoTurma[];
  isLoading: boolean;
  isError: boolean;
}> = ({ resumo, alunos, pagamentos, isLoading, isError }) => (

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <StatCard label="Receita prevista" value={formatCurrency(resumo?.receitaPrevista)} icon={<CreditCard size={18} />} tone="purple" />
      <StatCard label="Receita confirmada" value={formatCurrency(resumo?.receitaConfirmada)} icon={<ShieldCheck size={18} />} tone="emerald" />
      <StatCard label="Pendentes" value={resumo?.alunosPendentes ?? 0} icon={<CreditCard size={18} />} tone="amber" />
      <section className="rounded-3xl border border-slate-200 bg-white p-6 lg:col-span-3">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Recebimentos dos alunos</h3>
            <p className="text-xs font-bold text-slate-500">A configuração do checkout fica no cadastro do curso EAD.</p>
          </div>
          {resumo?.asaasUrl && (
            <a
              href={resumo.asaasUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
            >
              Abrir link Asaas
            </a>
          )}
        </div>

        {isLoading ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-black text-slate-400">Carregando pagamentos...</div>
        ) : isError ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm font-black text-rose-700">Nao foi possivel carregar os pagamentos desta turma.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <div className="grid min-w-[980px] grid-cols-[1.4fr_0.75fr_0.85fr_1fr_1fr_0.8fr] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>Aluno</span>
              <span>Valor</span>
              <span>Status</span>
              <span>Recebido em</span>
              <span>Confirmado em</span>
              <span>Forma</span>
            </div>
            <div className="divide-y divide-slate-100">
              {alunos.map((aluno) => {
                const pagamento = pagamentos.find(item => item.matricula_id === aluno.matriculaId);
                const statusPagamento = pagamento?.status || 'SEM_COBRANCA';
                return (
                  <div key={aluno.matriculaId} className="grid min-w-[980px] grid-cols-[1.4fr_0.75fr_0.85fr_1fr_1fr_0.8fr] gap-3 px-4 py-4 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#001a33]" title={aluno.nome}>{aluno.nome}</p>
                      <p className="truncate text-xs font-bold text-slate-400" title={aluno.email || pagamento?.email || ''}>{aluno.email || pagamento?.email || 'Sem email'}</p>
                    </div>
                    <p className="font-black text-emerald-700">{pagamento ? formatCurrency(pagamento.valor) : '—'}</p>
                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusPagamento === 'PAGO' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
                      {statusPagamento === 'PAGO' ? 'Confirmado' : statusPagamento === 'SEM_COBRANCA' ? 'Sem cobrança vinculada' : 'Pendente'}
                    </span>
                    <p className="text-xs font-bold text-slate-600">{formatDateTime(pagamento?.pago_em)}</p>
                    <p className="text-xs font-bold text-slate-600">{formatDateTime(pagamento?.confirmado_em || pagamento?.pago_em)}</p>
                    <p className="text-xs font-black uppercase text-slate-500">
                      {pagamento?.forma_pagamento ? paymentMethodLabel(pagamento.forma_pagamento) : '—'}
                    </p>
                  </div>
                );
              })}
              {alunos.length === 0 && (
                <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum aluno matriculado nesta turma.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
);
