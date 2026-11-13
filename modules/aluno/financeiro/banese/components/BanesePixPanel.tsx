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
    <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white ">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-700 text-white">
            <QrCode size={18} />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-800">Pix Banese</p>
            <p className="text-[13px] font-medium text-emerald-950">{pix.title}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700">
          <ShieldCheck size={11} /> {pix.state === 'available' ? 'Oficial' : pix.state === 'sandbox-unavailable' ? 'Homologação' : 'Indisponível'}
        </span>
      </div>

      {available ? (
        <div className="p-4">
          <div className={`grid gap-4 ${pix.imageSource ? 'sm:grid-cols-[minmax(0,1fr)_132px]' : ''}`}>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-relaxed text-slate-600">{pix.message}</p>
              {pix.payload ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void copy(pix.payload ?? '')}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-[14px] font-medium text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    {state === 'copied' ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}
                    {state === 'copied' ? 'Pix copiado' : 'Copiar Pix'}
                  </button>
                  <p className={`mt-2 text-center text-xs font-medium ${state === 'error' ? 'text-rose-600' : 'text-slate-600'}`} aria-live="polite">
                    {state === 'error' ? 'Não foi possível copiar. Selecione o código manualmente.' : 'Use somente o código desta parcela.'}
                  </p>
                  <label className="mt-3 block text-xs text-slate-600" htmlFor="banese-pix-payload">Código Pix copia e cola</label>
                  <textarea id="banese-pix-payload" readOnly value={pix.payload} rows={2} className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-base leading-relaxed text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 md:text-xs" />
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  O QR está disponível, mas o código copia e cola ainda não foi retornado.
                </div>
              )}
            </div>
            {pix.imageSource ? (
              <div className="mx-auto grid h-[132px] w-[132px] place-items-center rounded-lg border border-slate-200 bg-white p-2 sm:mx-0">
                <img src={pix.imageSource} alt="QR Code Pix desta cobrança Banese" className="h-full w-full object-contain" />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700">
                {pix.state === 'sandbox-unavailable' ? <Sparkles size={21} /> : <QrCode size={21} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-950">{disabled ? 'Cobrança já encerrada' : pix.title}</p>
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
