import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Clipboard from 'lucide-react/dist/esm/icons/clipboard';
import Info from 'lucide-react/dist/esm/icons/info';
import QrCode from 'lucide-react/dist/esm/icons/qr-code';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles';
import type { BanesePixPresentation } from '../banese-payment.types';
import useCopyFeedback from '../hooks/useCopyFeedback';

interface BanesePixPanelProps {
  pix: BanesePixPresentation;
  disabled?: boolean;
}

const BanesePixPanel = ({ pix, disabled = false }: BanesePixPanelProps) => {
  const { state, copy } = useCopyFeedback(pix.payload);
  const available = pix.state === 'available' && !disabled;

  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-emerald-200 bg-white shadow-[0_18px_45px_rgba(15,118,82,0.08)]">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white shadow-sm">
            <QrCode size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Pix Banese</p>
            <p className="text-xs font-bold text-emerald-950">{pix.title}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
          <ShieldCheck size={11} /> {pix.state === 'available' ? 'Oficial' : pix.state === 'sandbox-unavailable' ? 'Homologação' : 'Aguardando banco'}
        </span>
      </div>

      {available ? (
        <div className="p-4">
          <div className={`grid gap-4 ${pix.imageSource ? 'sm:grid-cols-[132px_1fr]' : ''}`}>
            {pix.imageSource ? (
              <div className="mx-auto grid h-[132px] w-[132px] place-items-center rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:mx-0">
                <img src={pix.imageSource} alt="QR Code Pix desta cobrança Banese" className="h-full w-full object-contain" />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-relaxed text-slate-600">{pix.message}</p>
              {pix.payload ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  <p className="max-h-20 overflow-hidden break-all px-2 py-1 font-mono text-[11px] font-bold leading-relaxed text-slate-700">
                    {pix.payload}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copy(pix.payload ?? '')}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    {state === 'copied' ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}
                    {state === 'copied' ? 'Pix copiado' : 'Copiar Pix'}
                  </button>
                  <p className={`mt-2 text-center text-[10px] font-bold ${state === 'error' ? 'text-rose-600' : 'text-slate-400'}`} aria-live="polite">
                    {state === 'error' ? 'Não foi possível copiar. Selecione o código manualmente.' : 'Use somente o código desta parcela.'}
                  </p>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  O QR está disponível, mas o código copia e cola ainda não foi retornado.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-emerald-300 bg-[linear-gradient(135deg,#f0fdf7_0%,#ffffff_55%,#ecfdf5_100%)] p-5">
            <div className="absolute -right-5 -top-6 h-24 w-24 rounded-full border-[14px] border-emerald-100/70" />
            <div className="relative flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                {pix.state === 'sandbox-unavailable' ? <Sparkles size={21} /> : <QrCode size={21} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-emerald-950">{disabled ? 'Cobrança já encerrada' : pix.title}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800/80">
                  {disabled ? 'As opções de pagamento foram desativadas porque esta cobrança já foi confirmada ou cancelada.' : pix.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default BanesePixPanel;
