import Download from 'lucide-react/dist/esm/icons/download';
import ExternalLink from 'lucide-react/dist/esm/icons/external-link';
import FileCheck2 from 'lucide-react/dist/esm/icons/file-check-2';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

interface BaneseBoletoDocumentProps {
  documentUrl: string | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onDownload: () => void;
}

const BaneseBoletoDocument = ({
  documentUrl,
  isLoading,
  error,
  onRetry,
  onDownload,
}: BaneseBoletoDocumentProps) => (
  <section className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_28px_75px_rgba(15,23,42,0.13)]">
    <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#001a33] text-white">
          <FileCheck2 size={19} />
        </span>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Documento bancário</p>
          <h2 className="text-sm font-black text-[#001a33]">Boleto Banese em PDF</h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (documentUrl) {
              window.open(documentUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          disabled={!documentUrl}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#001a33] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-[#001a33] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-300"
          title="Abrir boleto PDF diretamente em uma nova aba do navegador"
        >
          <ExternalLink size={14} /> Abrir em nova aba
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!documentUrl}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white transition hover:bg-[#07345f] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Download size={14} /> Baixar boleto
        </button>
      </div>
    </header>

    <div className="relative min-h-[760px] bg-[#dfe5e9] p-2 sm:min-h-[920px] sm:p-4">
      {isLoading ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-lg">
            <Loader2 size={24} className="mx-auto animate-spin text-emerald-700" />
            <p className="mt-3 text-xs font-black text-[#001a33]">Montando boleto bancário...</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">Linha, barras, beneficiário e pagador são validados no servidor.</p>
          </div>
        </div>
      ) : error ? (
        <div className="absolute inset-0 grid place-items-center p-5">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-lg">
            <p className="text-sm font-black text-rose-700">Não foi possível montar o boleto</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white"
            >
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        </div>
      ) : documentUrl ? (
        <iframe
          src={`${documentUrl}#toolbar=1&navpanes=0&view=FitH`}
          title="Boleto Banese em PDF"
          className="h-[900px] w-full rounded-xl border border-slate-300 bg-white shadow-inner sm:h-[1080px]"
        />
      ) : null}
    </div>
  </section>
);

export default BaneseBoletoDocument;
