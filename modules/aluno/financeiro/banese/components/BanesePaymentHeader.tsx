import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import type { BaneseEnvironment } from '../banese-payment.types';

interface BanesePaymentHeaderProps {
  environment: BaneseEnvironment | null;
  onBack: () => void;
}

const BanesePaymentHeader = ({ environment, onBack }: BanesePaymentHeaderProps) => (
  <header className="relative isolate overflow-hidden bg-[#001a33] text-white shadow-[0_24px_70px_rgba(0,26,51,0.22)]">
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_15%,rgba(18,137,92,0.34),transparent_31%),radial-gradient(circle_at_16%_120%,rgba(230,25,35,0.2),transparent_34%)]" />
    <div className="absolute -right-20 top-3 -z-10 h-52 w-72 rotate-[-9deg] rounded-[50%] border border-white/10" />
    <div className="absolute -right-16 top-12 -z-10 h-52 w-72 rotate-[-9deg] rounded-[50%] border border-white/10" />

    <div className="mx-auto flex min-h-24 w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-10">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:-translate-x-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Voltar para o financeiro"
        >
          <ArrowLeft size={19} />
        </button>

        <div className="hidden h-14 w-36 shrink-0 items-center justify-center rounded-2xl bg-white px-3 shadow-lg shadow-black/10 min-[560px]:flex">
          <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-auto max-h-11 w-full object-contain" />
        </div>

        <div className="hidden h-12 w-px bg-white/15 sm:block" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <img
              src="/logos/payment-gateways/banese.png"
              alt="Banese"
              className="h-6 w-auto max-w-28 object-contain sm:h-7 sm:max-w-36"
            />
            <span className="hidden rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-100 md:inline-flex">
              Processado pelo Banese
            </span>
          </div>
          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 sm:text-xs">
            Área de pagamento Universo
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {environment === 'sandbox' ? (
          <span className="hidden rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100 sm:inline-flex">
            Homologação
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white sm:text-[10px]">
          <ShieldCheck size={14} className="text-emerald-300" />
          <span className="hidden min-[420px]:inline">Área autenticada</span>
          <span className="min-[420px]:hidden">Segura</span>
        </span>
      </div>
    </div>

    {environment === 'sandbox' ? (
      <div className="border-t border-amber-200/15 bg-amber-300 px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-amber-950">
        Cobrança de teste — não realizar pagamento
      </div>
    ) : null}
  </header>
);

export default BanesePaymentHeader;
