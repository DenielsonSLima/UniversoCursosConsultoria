import Download from 'lucide-react/dist/esm/icons/download';
import FileStack from 'lucide-react/dist/esm/icons/file-stack';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';

interface BaneseCarnetDownloadProps {
  installmentCount: number;
  isDownloading: boolean;
  error: string | null;
  onDownload: () => void;
}

const BaneseCarnetDownload = ({
  installmentCount,
  isDownloading,
  error,
  onDownload,
}: BaneseCarnetDownloadProps) => (
  <section className="overflow-hidden rounded-[1.6rem] border border-emerald-800/20 bg-[#063d33] text-white shadow-[0_16px_38px_rgba(6,61,51,0.18)]">
    <div className="relative p-4">
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full border border-white/10 bg-emerald-300/10" />
      <div className="relative flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-emerald-200">
          <FileStack size={19} />
        </span>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">Carnê Banese</p>
          <h2 className="mt-1 text-sm font-black">Todas as parcelas em um PDF</h2>
          <p className="mt-1 text-[10px] font-semibold leading-relaxed text-emerald-50/75">
            {installmentCount} boletos registrados, organizados em um único documento.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading}
        className="relative mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-[0.15em] text-[#063d33] transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#063d33] disabled:cursor-wait disabled:opacity-70"
      >
        {isDownloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {isDownloading ? 'Montando carnê...' : 'Baixar carnê completo'}
      </button>

      <p
        className={`relative mt-2 text-center text-[10px] font-semibold leading-relaxed ${error ? 'text-rose-200' : 'text-emerald-50/60'}`}
        aria-live="polite"
      >
        {error || 'O arquivo é gerado no servidor somente com as parcelas desta matrícula.'}
      </p>
    </div>
  </section>
);

export default BaneseCarnetDownload;
