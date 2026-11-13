import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import type { BaneseEnvironment } from '../banese-payment.types';

interface BanesePaymentHeaderProps {
  environment: BaneseEnvironment | null;
  onBack: () => void;
}

const BanesePaymentHeader = ({ environment, onBack }: BanesePaymentHeaderProps) => (
  <header className="overflow-hidden bg-[#001a33] text-white">
    <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-2 sm:px-7 lg:px-10">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/10 text-white transition hover:-translate-x-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Voltar para o financeiro"
        >
          <ArrowLeft size={19} />
        </button>

        <div className="hidden h-10 w-28 shrink-0 items-center justify-center rounded-lg bg-white px-3 min-[560px]:flex">
          <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-auto max-h-11 w-full object-contain" />
        </div>

        <div className="hidden h-8 w-px bg-white/15 sm:block" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <img
              src="/logos/payment-gateways/banese.png"
              alt="Banese"
              className="h-5 w-auto max-w-24 object-contain sm:h-6 sm:max-w-28"
            />
            <span className="hidden rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-xs font-medium text-emerald-100 md:inline-flex">
              Processado pelo Banese
            </span>
          </div>
          <p className="mt-1 truncate text-xs font-medium text-slate-300 sm:text-xs">
            Pagamento Universo
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {environment === 'sandbox' ? (
          <span className="hidden rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100 sm:inline-flex">
            Homologação
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white sm:text-xs">
          <ShieldCheck size={14} className="text-emerald-300" />
          <span className="hidden min-[420px]:inline">Área autenticada</span>
          <span className="min-[420px]:hidden">Segura</span>
        </span>
      </div>
    </div>

    {environment === 'sandbox' ? (
      <div className="border-t border-amber-200/15 bg-amber-300 px-4 py-2 text-center text-xs font-medium text-amber-950">
        Cobrança de teste — não realizar pagamento
      </div>
    ) : null}
  </header>
);

export default BanesePaymentHeader;
