import { Barcode, CheckCircle2, Clipboard, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { DependenciaBoleto } from '../dependencias-academicas.types';

interface DependenciaBoletoPanelProps {
  boleto: DependenciaBoleto;
}

const onlyDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');

const formattedLine = (value?: string | null) => {
  const digits = onlyDigits(value);
  return digits ? digits.replace(/(\d{5})(?=\d)/g, '$1 ').trim() : '';
};

const DependenciaBoletoPanel = ({ boleto }: DependenciaBoletoPanelProps) => {
  const [copied, setCopied] = useState(false);
  const line = onlyDigits(boleto.linhaDigitavel);

  const copy = async () => {
    if (!line) return;
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-cyan-100 bg-cyan-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#001a33] text-white">
            <Barcode size={18} />
          </span>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-700">Boleto Banese</p>
            <p className="text-xs font-black text-[#001a33]">
              {line ? 'Pronto para pagamento' : 'Registro em processamento'}
            </p>
          </div>
        </div>
        {boleto.nossoNumero ? (
          <span className="rounded-full border border-cyan-200 bg-white px-2 py-1 font-mono text-[9px] font-bold text-cyan-800">
            {boleto.nossoNumero}
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="break-all font-mono text-xs font-black leading-6 tracking-wide text-[#001a33]">
            {formattedLine(line) || 'A linha digitável aparecerá após o registro bancário.'}
          </p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!line}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {copied ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}
            {copied ? 'Linha copiada' : 'Copiar linha'}
          </button>
          {boleto.boletoUrl ? (
            <a
              href={boleto.boletoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-800 transition hover:bg-cyan-100"
            >
              Abrir boleto <ExternalLink size={14} />
            </a>
          ) : (
            <div className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-[10px] font-bold text-slate-500">
              PDF bancário ainda não disponível
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] font-bold text-slate-400">
          Esta cobrança disponibiliza somente boleto Banese.
        </p>
      </div>
    </section>
  );
};

export default DependenciaBoletoPanel;
