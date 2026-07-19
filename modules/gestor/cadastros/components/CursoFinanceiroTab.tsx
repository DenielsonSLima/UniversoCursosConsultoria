import React from 'react';
import { Banknote, CreditCard, Loader2, Percent, Receipt, Save, WalletCards } from 'lucide-react';
import { CursoFinanceiroConfig } from '../cadastros.types';
import { formatMoney, moneyInputValue, parseMoneyInput } from './cursoGradeCurricular.helpers';

interface CursoFinanceiroTabProps {
  financeiroConfig: CursoFinanceiroConfig;
  valorBaseInput: string;
  descontoInput: string;
  isSaving: boolean;
  usesTurmaFinanceiro: boolean;
  setValorBaseInput: React.Dispatch<React.SetStateAction<string>>;
  setDescontoInput: React.Dispatch<React.SetStateAction<string>>;
  updateConfig: (patch: Partial<CursoFinanceiroConfig>) => void;
  updateNested: (key: keyof CursoFinanceiroConfig, patch: Record<string, unknown>) => void;
  onSave: () => void;
}

const CursoFinanceiroTab: React.FC<CursoFinanceiroTabProps> = ({
  financeiroConfig,
  valorBaseInput,
  descontoInput,
  isSaving,
  usesTurmaFinanceiro,
  setValorBaseInput,
  setDescontoInput,
  updateConfig,
  updateNested,
  onSave
}) => (
  <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8 pb-20 animate-fadeIn">
    <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-8">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
            <WalletCards size={14} /> Política Financeira
          </span>
          <h4 className="mt-2 text-xl font-black text-[#001a33]">
            {usesTurmaFinanceiro ? 'Meios de pagamento aceitos' : 'Regras padrão do curso'}
          </h4>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
            {usesTurmaFinanceiro
              ? 'O curso define apenas quais meios a turma poderá usar. Valores, parcelas, descontos, juros e multa são configurados na turma.'
              : 'Essas regras servem como base financeira do curso.'}
          </p>
        </div>
        <button type="button" onClick={onSave} disabled={isSaving} className="shrink-0 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-900/15 transition-colors hover:bg-blue-900 disabled:opacity-70 flex items-center gap-2">
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {!usesTurmaFinanceiro && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valor base da mensalidade</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-emerald-300 focus-within:bg-white">
              <span className="text-sm font-black text-slate-400">R$</span>
              <input
                type="text"
                value={valorBaseInput}
                onChange={(event) => setValorBaseInput(event.target.value)}
                onBlur={() => {
                  const nextValue = parseMoneyInput(valorBaseInput, financeiroConfig.valorBase);
                  updateConfig({ valorBase: nextValue });
                  setValorBaseInput(moneyInputValue(nextValue));
                }}
                className="w-full bg-transparent text-lg font-black text-[#001a33] outline-none"
              />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Desconto até o vencimento</span>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-emerald-300 focus-within:bg-white">
              <span className="text-sm font-black text-slate-400">R$</span>
              <input
                type="text"
                value={descontoInput}
                onChange={(event) => setDescontoInput(event.target.value)}
                onBlur={() => {
                  const nextValue = parseMoneyInput(descontoInput, financeiroConfig.descontoPontualidade);
                  updateConfig({ descontoPontualidade: nextValue });
                  setDescontoInput(moneyInputValue(nextValue));
                }}
                className="w-full bg-transparent text-lg font-black text-emerald-600 outline-none"
              />
            </div>
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: 'pix' as const, label: 'Pix', icon: Banknote, note: usesTurmaFinanceiro ? 'Disponível para turmas deste curso.' : 'Recebe desconto se marcado.' },
          { key: 'boleto' as const, label: 'Boleto', icon: Receipt, note: usesTurmaFinanceiro ? 'Disponível para turmas deste curso.' : 'Recebe desconto se marcado.' },
          { key: 'cartao' as const, label: 'Cartão', icon: CreditCard, note: `Até ${financeiroConfig.cartao.maxParcelas}x.` }
        ].map((method) => {
          const Icon = method.icon;
          const enabled = financeiroConfig.metodosRecebimento[method.key];
          const discountEnabled = !usesTurmaFinanceiro && financeiroConfig.descontoMetodo[method.key];
          return (
            <div key={method.key} className={`rounded-2xl border p-5 transition-colors ${enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2 ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}><Icon size={18} /></div>
                  <div>
                    <span className="block text-sm font-black text-[#001a33]">{method.label}</span>
                    <span className="text-[10px] font-bold text-slate-500">{method.note}</span>
                  </div>
                </div>
                <button type="button" onClick={() => updateNested('metodosRecebimento', { [method.key]: !enabled })} className={`h-7 w-12 rounded-full p-1 transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} title={enabled ? `Desativar ${method.label}` : `Ativar ${method.label}`}>
                  <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {!usesTurmaFinanceiro && (
                <label className={`mt-5 flex items-center justify-between rounded-xl border px-3 py-2 ${enabled ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Aplicar desconto</span>
                  <input type="checkbox" checked={discountEnabled} disabled={!enabled} onChange={(event) => updateNested('descontoMetodo', { [method.key]: event.target.checked })} className="h-4 w-4 accent-emerald-600" />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600"><CreditCard size={15} /> Regra do cartão</span>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {usesTurmaFinanceiro ? 'Define o limite máximo que as turmas deste curso poderão oferecer no cartão.' : 'Por padrão, cartão não recebe desconto de pontualidade e pode parcelar até duas vezes.'}
            </p>
          </div>
          <label className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Máx. parcelas</span>
            <input type="number" min={1} max={12} value={financeiroConfig.cartao.maxParcelas} onChange={(event) => updateNested('cartao', { maxParcelas: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })} className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-black text-[#001a33] outline-none focus:border-emerald-300" />
          </label>
        </div>
      </div>
    </div>

    <div className="space-y-5">
      <div className="bg-white rounded-[2rem] border border-slate-200 p-7 shadow-sm">
        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600"><Percent size={14} /> {usesTurmaFinanceiro ? 'Valores por turma' : 'Simulação'}</span>
        {usesTurmaFinanceiro ? (
          <div className="mt-5 space-y-3 text-xs font-semibold leading-relaxed text-slate-600">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">Preço, quantidade de parcelas, desconto de pontualidade, juros e multa devem ser definidos na criação ou configuração da turma.</div>
            <p>Assim cada turma pode ter seu próprio valor conforme ano, campanha, duração, polo ou condição comercial, sem alterar o cadastro base do curso.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-700">Pix/Boleto até vencimento</span>
              <span className="text-lg font-black text-emerald-700">{formatMoney(Math.max(0, financeiroConfig.valorBase - financeiroConfig.descontoPontualidade))}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600">Cartão</span>
              <span className="text-lg font-black text-[#001a33]">{formatMoney(financeiroConfig.valorBase)}</span>
            </div>
            <p className="text-[10px] font-semibold leading-relaxed text-slate-500">A simulação é visual. A cobrança real deve ser calculada e criada no backend/Asaas usando esta política salva no curso.</p>
          </div>
        )}
      </div>
      <div className="bg-white rounded-[2rem] border border-slate-200 p-7 shadow-sm">
        <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600"><Receipt size={14} /> Asaas e carnê</span>
        <h4 className="mt-2 text-lg font-black text-[#001a33]">Modelo recomendado</h4>
        <div className="mt-4 space-y-3 text-xs font-semibold leading-relaxed text-slate-600">
          <p>Use cobrança avulsa para matrícula e rematrícula, porque elas têm valores próprios.</p>
          <p>Use parcelamento Asaas para mensalidades iguais, pois é o caminho documentado para gerar carnê oficial.</p>
          <p>Em estorno de baixa manual, o sistema deve reabrir a conta local e recriar/vincular a cobrança no Asaas quando a cobrança anterior tiver sido cancelada.</p>
        </div>
      </div>
    </div>
  </div>
);

export default CursoFinanceiroTab;
