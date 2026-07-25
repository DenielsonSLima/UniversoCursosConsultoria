import React from "react";
import { CheckCircle2, CreditCard, Info, Link2 } from "lucide-react";
import { useEadCourseWizardContext } from "../EadCourseWizardContext";
import { parseBRLPrice } from "../eadCourseWizard.helpers";

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
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
          <CreditCard size={20} />
        </span>
        <div>
          <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">
            Financeiro e checkout
          </h4>
          <p className="mt-0.5 text-xs font-medium text-slate-400">
            Defina o valor e as formas de recebimento do curso EAD.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
          Valor do curso *
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-all focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100">
          <span className="text-sm font-bold text-slate-400">R$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Ex: 299,90"
            className="w-full border-none bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder-slate-400"
            value={valorText}
            onChange={(event) => setValorText(event.target.value)}
            onBlur={() => {
              const parsed = parseBRLPrice(valorText);
              setValorText(
                parsed !== null && !Number.isNaN(parsed)
                  ? parsed.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                  : "",
              );
            }}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
        <h5 className="mb-4 text-sm font-black uppercase tracking-tight text-[#001a33]">
          Formas de recebimento no checkout
        </h5>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["Pix", financeiroPix, setFinanceiroPix],
            ["Boleto", financeiroBoleto, setFinanceiroBoleto],
            ["Cartão", financeiroCartao, setFinanceiroCartao],
          ].map(([label, checked, setter]) => (
            <button
              key={label as string}
              type="button"
              onClick={() =>
                (setter as React.Dispatch<React.SetStateAction<boolean>>)(
                  !(checked as boolean),
                )}
              className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left text-xs font-black uppercase tracking-wide transition-all ${
                checked
                  ? "border-emerald-200 bg-white text-emerald-700 shadow-sm"
                  : "border-slate-200 bg-white/70 text-slate-400"
              }`}
            >
              <span>{label as string}</span>
              <CheckCircle2 size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-5">
        <div className="flex items-start gap-3">
          <Info size={18} className="mt-0.5 shrink-0 text-blue-700" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Pagamento em parcela única
            </p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-900">
              O parcelamento está desativado para cursos EAD. O checkout
              sempre solicita uma única cobrança pelo valor integral do curso.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <Link2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
              Checkout individual do aluno
            </p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
              Na compra, o sistema gera uma cobrança individual vinculada à
              matrícula. Boleto e Pix usam a rota bancária liberada; cartão
              permanece condicionado à homologação do provedor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EadCourseWizardStep2;
