import React from 'react';
import { Info, Landmark, WalletCards } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCurrency } from '../caixa.formatters';
import { CaixaMovimentacaoChart } from './CaixaMovimentacaoChart';

type CaixaAccount = CaixaMonthlyStatement['contas'][number];

interface CaixaAccountsPanelProps {
  accounts: CaixaAccount[];
}

export const CaixaAccountsPanel: React.FC<CaixaAccountsPanelProps> = ({ accounts }) => (
  <aside
    aria-labelledby="caixa-accounts-panel-title"
    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">Posição registrada</p>
        <h2 id="caixa-accounts-panel-title" className="mt-1 text-base font-extrabold text-slate-900">
          Onde está o saldo
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">Contas bancárias e caixas do escopo</p>
      </div>
      <Info size={16} className="mt-0.5 text-slate-400" aria-hidden="true" />
    </div>

    {accounts.length > 0 ? (
      <ul className="mt-4 divide-y divide-slate-100">
        {accounts.map((account) => (
          <li key={account.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-blue-50 p-2 text-blue-600">
                {account.natureza === 'CAIXA_INTERNO'
                  ? <WalletCards size={17} aria-hidden="true" />
                  : <Landmark size={17} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {account.banco} · Ag. {account.agencia} · Conta {account.conta}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {account.titular} · {account.cidadeUf}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-extrabold ${
                    account.valorExibido < 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}>
                    {formatCaixaCurrency(account.valorExibido)}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px]">
                  <span className="font-semibold text-blue-700">
                    {account.tipoValorExibido === 'POSICAO_POLO'
                      ? 'Posição deste polo'
                      : account.compartilhada
                        ? `Compartilhada com ${account.unidadesUso} unidades`
                        : 'Saldo registrado'}
                  </span>
                  {account.tipoValorExibido === 'POSICAO_POLO' ? (
                    <span className="text-slate-400">
                      Total da conta {formatCaixaCurrency(account.saldoTotalRegistrado)}
                    </span>
                  ) : null}
                  {!account.ativo ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                      Inativa · somente histórico
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <div className="mt-4 flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
        <p className="px-4 text-sm text-slate-400">Nenhuma conta disponível neste escopo.</p>
      </div>
    )}

    <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
      <Info size={13} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
      <span>
        Saldos contábeis são atualizados por cobranças e baixas conciliadas. A integração Banese não consulta o extrato bancário.
      </span>
    </div>
  </aside>
);

export const CaixaMovementAndAccounts: React.FC<{
  serieMensal: CaixaMonthlyStatement['serieMensal'];
  accounts: CaixaMonthlyStatement['contas'];
}> = ({ serieMensal, accounts }) => (
  <section aria-label="Evolução mensal e localização do saldo" className="grid grid-cols-1 gap-4 lg:grid-cols-5">
    <CaixaMovimentacaoChart serieMensal={serieMensal} />
    <CaixaAccountsPanel accounts={accounts} />
  </section>
);
