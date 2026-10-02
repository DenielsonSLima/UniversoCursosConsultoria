import React from 'react';
import { CheckCircle2, Clock3, Info, Landmark, Radar, WalletCards } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCurrency, formatCaixaDateTime } from '../caixa.formatters';
import { CaixaMovimentacaoChart } from './CaixaMovimentacaoChart';

type CaixaAccount = CaixaMonthlyStatement['contas'][number];

interface CaixaAccountsPanelProps {
  accounts: CaixaAccount[];
}

export const CaixaAccountsPanel: React.FC<CaixaAccountsPanelProps> = ({ accounts }) => (
  <aside aria-labelledby="caixa-accounts-panel-title" className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 sm:p-6">
    <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full border-[28px] border-blue-50" />
    <div className="relative flex items-start justify-between gap-3">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-600">Mapa de liquidez</p>
        <h2 id="caixa-accounts-panel-title" className="mt-1 text-lg font-extrabold text-slate-900">Onde está o saldo</h2>
        <p className="mt-0.5 text-xs text-slate-500">Contas bancárias e caixas do escopo</p>
      </div>
      <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Radar size={17} aria-hidden="true" /></span>
    </div>

    {accounts.length > 0 ? (
      <ol className="relative mt-5 space-y-2 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-blue-100">
        {accounts.map((account, index) => (
          <li key={account.id} className="relative rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition hover:border-blue-100 hover:bg-blue-50/40 motion-reduce:transition-none">
            <div className="flex items-start gap-3">
              <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white text-blue-600 shadow-sm">
                {account.natureza === 'CAIXA_INTERNO' ? <WalletCards size={17} aria-hidden="true" /> : <Landmark size={17} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-xs font-extrabold text-slate-900">{account.banco} · Ag. {account.agencia} · Conta {account.conta}</p>
                    <p className="mt-0.5 break-words text-[10px] text-slate-500">{account.titular} · {account.cidadeUf}</p>
                  </div>
                  <p className={`shrink-0 text-base font-black ${account.valorExibido < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatCaixaCurrency(account.valorExibido)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[9px]">
                  <span className="font-bold text-blue-700">{account.tipoValorExibido === 'POSICAO_POLO' ? 'Posição deste polo' : account.compartilhada ? `Compartilhada com ${account.unidadesUso} unidades` : 'Saldo registrado'}</span>
                  {account.tipoValorExibido === 'POSICAO_POLO' ? <span className="text-slate-400">Total da conta {formatCaixaCurrency(account.saldoTotalRegistrado)}</span> : null}
                  {!account.ativo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">Inativa · somente histórico</span> : null}
                </div>
              </div>
              <span className="sr-only">Conta {index + 1} de {accounts.length}</span>
            </div>
          </li>
        ))}
      </ol>
    ) : (
      <div className="mt-5 flex min-h-32 flex-col items-center justify-center rounded-2xl bg-slate-50 px-4 text-center">
        <WalletCards size={22} className="text-slate-300" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-slate-500">Nenhuma conta disponível neste escopo.</p>
      </div>
    )}

    <div className="mt-4 flex gap-2 rounded-xl bg-blue-50/70 px-3 py-2.5 text-[9px] leading-4 text-slate-500">
      <Info size={13} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
      <span>Saldos contábeis são atualizados por cobranças e baixas conciliadas. A integração Banese não consulta o extrato bancário.</span>
    </div>
  </aside>
);

export const CaixaMovementAndAccounts: React.FC<{
  serieMensal: CaixaMonthlyStatement['serieMensal'];
  accounts: CaixaMonthlyStatement['contas'];
  reconciliation?: CaixaMonthlyStatement['conciliacao'];
}> = ({ serieMensal, accounts, reconciliation }) => (
  <section aria-labelledby="caixa-movement-title" className="overflow-hidden rounded-[30px] border border-slate-200 bg-[#eef3f9] p-3 shadow-sm sm:p-4">
    <header className="flex flex-col gap-2 px-2 pb-4 pt-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Pulso operacional</p>
        <h2 id="caixa-movement-title" className="mt-1 text-lg font-extrabold text-[#061a2f]">Evolução mensal e localização do saldo</h2>
      </div>
      <p className="max-w-lg text-xs leading-5 text-slate-500 sm:text-right">O movimento explica o período; as contas mostram onde a posição ficou registrada.</p>
    </header>

    <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
      <CaixaMovimentacaoChart serieMensal={serieMensal} />
      <CaixaAccountsPanel accounts={accounts} />
    </div>

    {reconciliation ? <ReconciliationRail reconciliation={reconciliation} /> : null}
  </section>
);

const ReconciliationRail: React.FC<{ reconciliation: CaixaMonthlyStatement['conciliacao'] }> = ({ reconciliation }) => (
  <footer aria-label="Conciliação do período" className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="grid gap-0 lg:grid-cols-[1.2fr_repeat(4,minmax(0,0.7fr))]">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 lg:border-b-0 lg:border-r">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><CheckCircle2 size={16} aria-hidden="true" /></span>
        <div><p className="text-xs font-extrabold text-slate-900">Conciliação do período</p><p className="mt-0.5 text-[9px] text-slate-500">Rastreabilidade da prestação</p></div>
      </div>
      <AuditValue label="Recebimentos" value={String(reconciliation.recebimentosConciliados)} />
      <AuditValue label="Pagamentos" value={String(reconciliation.pagamentosConciliados)} />
      <AuditValue label="Pendências" value={String(reconciliation.pendentes)} tone={reconciliation.pendentes > 0 ? 'amber' : 'green'} />
      <div className="border-t border-slate-100 px-4 py-3 lg:border-l lg:border-t-0">
        <p className="flex items-center gap-1 text-[9px] font-semibold text-slate-500"><Clock3 size={10} aria-hidden="true" /> Atualização</p>
        <p className="mt-1 text-[10px] font-bold text-slate-700">{formatCaixaDateTime(reconciliation.ultimaAtualizacao)}</p>
      </div>
    </div>
  </footer>
);

const AuditValue: React.FC<{ label: string; value: string; tone?: 'default' | 'amber' | 'green' }> = ({ label, value, tone = 'default' }) => {
  const toneClass = tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-emerald-700' : 'text-slate-900';
  return <div className="border-t border-slate-100 px-4 py-3 lg:border-l lg:border-t-0"><p className="text-[9px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-base font-black ${toneClass}`}>{value}</p></div>;
};
