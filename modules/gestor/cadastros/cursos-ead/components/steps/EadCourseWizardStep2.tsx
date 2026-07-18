import React from 'react';
import { CheckCircle2, CreditCard, Link2, AlertTriangle } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';
import { formatEadMoney } from '../eadFinancialConfig';
import { parseBRLPrice } from '../eadCourseWizard.helpers';

const EadCourseWizardStep2 = () => {
  const {
    valorText,
    setValorText,
    financeiroPix,
    setFinanceiroPix,
    financeiroBoleto,
    setFinanceiroBoleto,
    financeiroCartao,
    setFinanceiroCartao,
    financeiroParcelado,
    setFinanceiroParcelado,
    financeiroParcelasPadrao,
    setFinanceiroParcelasPadrao,
    financeiroMaxParcelas,
    setFinanceiroMaxParcelas,
    financeiroTaxaPagaPor,
    setFinanceiroTaxaPagaPor,
    financeiroRepassarCustoParcelamento,
    setFinanceiroRepassarCustoParcelamento,
    financeiroConsiderarTaxaNoCheckout,
    setFinanceiroConsiderarTaxaNoCheckout,
    financeiroPreviewBillingType,
    financeiroSimulation,
    financeiroMultipleMethods,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl"><CreditCard size={20} /></span>
        <div>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Financeiro e Checkout Asaas</h4>
          <p className="text-slate-400 text-xs font-medium mt-0.5">Defina valor, formas de recebimento, parcelamento e regra da taxa antes de publicar o curso.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do curso *</label>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-emerald-500 transition-all">
            <span className="text-slate-400 font-bold text-sm">R$</span>
            <input
              type="text"
              placeholder="Ex: 299,90"
              className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder-slate-400"
              value={valorText}
              onChange={e => setValorText(e.target.value)}
              onBlur={() => {
                const parsed = parseBRLPrice(valorText);
                setValorText(parsed !== null && !isNaN(parsed) ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável pela taxa Asaas</label>
          <select
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all"
            value={financeiroTaxaPagaPor}
            onChange={e => setFinanceiroTaxaPagaPor(e.target.value as 'aluno' | 'instituicao')}
          >
            <option value="aluno">Aluno (registro interno)</option>
            <option value="instituicao">Instituição absorve a taxa</option>
          </select>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
        <h5 className="mb-4 text-sm font-black uppercase tracking-tight text-[#001a33]">Formas de recebimento no checkout</h5>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ['Pix', financeiroPix, setFinanceiroPix],
            ['Boleto', financeiroBoleto, setFinanceiroBoleto],
            ['Cartão', financeiroCartao, setFinanceiroCartao]
          ].map(([label, checked, setter]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)(!(checked as boolean))}
              className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left text-xs font-black uppercase tracking-wide transition-all ${
                checked ? 'border-emerald-200 bg-white text-emerald-700 shadow-sm' : 'border-slate-200 bg-white/70 text-slate-400'
              }`}
            >
              <span>{label as string}</span>
              <CheckCircle2 size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
        <h5 className="mb-3 text-sm font-black uppercase tracking-tight text-[#001a33]">Taxa da Asaas já no valor cobrado?</h5>
        <p className="text-xs font-medium text-slate-600">
          Quando ativado, o valor enviado ao Asaas já desconta a taxa estimada para que a instituição receba líquido no valor do curso.
        </p>
        <button
          type="button"
          onClick={() => setFinanceiroConsiderarTaxaNoCheckout(!financeiroConsiderarTaxaNoCheckout)}
          className={`mt-4 inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-wide transition-all ${
            financeiroConsiderarTaxaNoCheckout
              ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
              : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          {financeiroConsiderarTaxaNoCheckout ? 'Sim, considerar no checkout' : 'Não considerar'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          disabled={!financeiroCartao}
          onClick={() => setFinanceiroParcelado(!financeiroParcelado)}
          className={`rounded-2xl border p-4 text-left transition-all disabled:opacity-50 ${
            financeiroParcelado && financeiroCartao ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          <span className="block text-[10px] font-black uppercase tracking-widest">Parcelamento</span>
          <span className="mt-2 block text-sm font-black">{financeiroParcelado && financeiroCartao ? 'Ativo' : 'Desativado'}</span>
        </button>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Parcelas padrão</label>
          <input
            type="number"
            min={1}
            max={21}
            disabled={!financeiroCartao}
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 disabled:opacity-50"
            value={financeiroParcelasPadrao}
            onChange={e => setFinanceiroParcelasPadrao(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Máximo de parcelas</label>
          <input
            type="number"
            min={1}
            max={21}
            disabled={!financeiroCartao || !financeiroParcelado}
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-800 disabled:opacity-50"
            value={financeiroMaxParcelas}
            onChange={e => setFinanceiroMaxParcelas(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Repasse do custo de parcelamento</p>
            <h5 className="mt-1 text-sm font-black text-[#001a33]">Cobrar do aluno o custo estimado do cartão parcelado</h5>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
              Quando ativo, pagamentos escolhidos no cartão usam um valor ajustado para a instituição receber próximo ao valor base após a taxa padrão de cartão.
            </p>
          </div>

          <button
            type="button"
            disabled={!financeiroCartao || !financeiroParcelado}
            onClick={() => setFinanceiroRepassarCustoParcelamento(prev => !prev)}
            className={`w-full rounded-2xl border px-5 py-4 text-left transition-all disabled:opacity-50 lg:w-52 ${
              financeiroRepassarCustoParcelamento && financeiroCartao && financeiroParcelado
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <span className="block text-[10px] font-black uppercase tracking-widest">Status</span>
            <span className="mt-2 block text-sm font-black">
              {financeiroRepassarCustoParcelamento && financeiroCartao && financeiroParcelado ? 'Sim, repassar' : 'Não repassar'}
            </span>
          </button>
        </div>

        {financeiroRepassarCustoParcelamento && financeiroMultipleMethods && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-700" />
            <p className="text-xs font-semibold leading-relaxed text-amber-800">
              Com Pix ou boleto junto do cartão, cada aluno escolhe uma forma no checkout. O repasse do parcelamento só altera o valor quando a escolha for cartão.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Simulador Asaas EAD</p>
            <h5 className="text-sm font-black text-[#001a33]">
              {financeiroPreviewBillingType === 'CREDIT_CARD'
                ? `Cartão em até ${financeiroSimulation.installmentCount}x`
                : financeiroPreviewBillingType === 'PIX'
                  ? 'Pix'
                  : 'Boleto'}
            </h5>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Taxas padrão públicas do Asaas
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {financeiroMultipleMethods ? 'Prévia do método priorizado' : 'Configuração atual'}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="block font-bold text-slate-400">Aluno paga</span>
                <strong className="mt-1 block text-base text-[#001a33]">{formatEadMoney(financeiroSimulation.checkout.grossValue)}</strong>
              </div>
              <div>
                <span className="block font-bold text-slate-400">Recebe líquido</span>
                <strong className="mt-1 block text-base text-emerald-700">{formatEadMoney(financeiroSimulation.checkout.netValue)}</strong>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500">
              Taxa estimada na configuração: {formatEadMoney(financeiroSimulation.checkout.feeValue)}.
              {financeiroSimulation.checkout.feeValue > 0 && <span> Antecipação: {formatEadMoney(financeiroSimulation.withoutPass.anticipatedEstimate)}.</span>}
            </p>
          </div>

          {financeiroCartao && financeiroRepassarCustoParcelamento && (
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Com repasse</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="block font-bold text-slate-400">Aluno paga</span>
                  <strong className="mt-1 block text-base text-[#001a33]">{formatEadMoney(financeiroSimulation.withPass.customerPays)}</strong>
                </div>
                <div>
                  <span className="block font-bold text-slate-400">Recebe líquido</span>
                  <strong className="mt-1 block text-base text-emerald-700">{formatEadMoney(financeiroSimulation.withPass.institutionReceives)}</strong>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500">
                Taxa estimada: {formatEadMoney(financeiroSimulation.withPass.fee)}. Antecipando tudo, estimativa líquida: {formatEadMoney(financeiroSimulation.withPass.anticipatedEstimate)}.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className="block font-black uppercase tracking-widest text-slate-400">Pix/Boleto</span>
            <strong className="mt-1 block text-sm text-[#001a33]">{formatEadMoney(financeiroSimulation.pixOrBoletoNet)}</strong>
            <span className="mt-1 block font-semibold text-slate-500">
              Taxa fixa estimada de {formatEadMoney(financeiroSimulation.pixOrBoletoFixedFee)}.
            </span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className="block font-black uppercase tracking-widest text-slate-400">Antecipação</span>
            <strong className="mt-1 block text-sm text-[#001a33]">Sujeita à análise</strong>
            <span className="mt-1 block font-semibold text-slate-500">
              A taxa real depende da sua conta Asaas e da antecipação contratada.
            </span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className="block font-black uppercase tracking-widest text-slate-400">Taxa no checkout</span>
            <strong className="mt-1 block text-sm text-[#001a33]">
              {financeiroConsiderarTaxaNoCheckout ? 'Sim, já incluso' : 'Não incluso'}
            </strong>
            <span className="mt-1 block font-semibold text-slate-500">
              {financeiroConsiderarTaxaNoCheckout
                ? 'o valor do aluno já contempla o rateio da taxa.'
                : 'mantém o valor cheio e a taxa não é embutida no preço.'}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <Link2 size={18} className="mt-0.5 text-emerald-700" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Checkout individual do aluno</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
              Ao publicar, o sistema cria a turma única EAD. Na compra, o checkout Asaas é gerado para cada aluno usando estas regras financeiras e vinculado à matrícula.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EadCourseWizardStep2;
