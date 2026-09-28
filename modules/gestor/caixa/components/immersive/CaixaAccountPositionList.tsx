import React from 'react';
import { Info, Landmark, WalletCards } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../../caixa.types';
import { formatCaixaCurrency } from '../../caixa.formatters';

interface CaixaAccountPositionListProps {
  accounts: CaixaMonthlyStatement['contas'];
}

export const CaixaAccountPositionList = ({ accounts }: CaixaAccountPositionListProps) => (
  <section aria-labelledby="caixa-account-list-title" className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_-38px_rgba(0,26,51,0.48)] sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.19em] text-blue-700">Posição detalhada</p>
        <h3 id="caixa-account-list-title" className="mt-1 text-lg font-black tracking-[-0.025em] text-[#001a33]">
          Contas e caixas da unidade
        </h3>
        <p className="mt-1 text-xs text-slate-500">Valores registrados no recorte selecionado.</p>
      </div>
      <Info size={16} className="mt-1 shrink-0 text-slate-400" aria-hidden="true" />
    </div>

    <div className="mt-5 divide-y divide-slate-100">
      {accounts.length > 0 ? accounts.map((account) => (
        <div key={account.id} className="py-3.5 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
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
                  {!account.ativo && (
                    <p className="mt-0.5 text-[10px] font-semibold text-amber-700">Inativa — somente histórico</p>
                  )}
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {account.titular} · {account.cidadeUf}
                  </p>
                </div>
                <p className={`shrink-0 text-sm font-black ${account.valorExibido < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {formatCaixaCurrency(account.valorExibido)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
                <span className="font-bold text-blue-700">
                  {account.tipoValorExibido === 'POSICAO_POLO'
                    ? 'Posição deste polo'
                    : account.compartilhada
                      ? `Compartilhada com ${account.unidadesUso} unidades`
                      : 'Saldo registrado'}
                </span>
                {account.tipoValorExibido === 'POSICAO_POLO' && (
                  <span className="text-slate-400">Total da conta {formatCaixaCurrency(account.saldoTotalRegistrado)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )) : (
        <p className="py-8 text-center text-sm text-slate-400">Nenhuma conta disponível.</p>
      )}
    </div>

    <div className="mt-5 flex gap-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-[10px] leading-4 text-slate-500">
      <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>Saldo contábil atualizado por cobranças e baixas conciliadas. A integração Banese não consulta o extrato bancário.</span>
    </div>
  </section>
);
