import React, { useEffect, useState } from 'react';
import {
  Clock3,
  FileCheck2,
  Landmark,
  Loader2,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';

interface FinanceiroCicloManualIssuanceProgressProps {
  alunoNome: string;
  matriculaExibicao: string;
  cicloNumero: number | null;
  quantidadeItens: number | null;
  total: string | null;
}

const formatMoney = (value: string | null) => {
  if (!value) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
};

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const FinanceiroCicloManualIssuanceProgress: React.FC<
  FinanceiroCicloManualIssuanceProgressProps
> = ({
  alunoNome,
  matriculaExibicao,
  cicloNumero,
  quantidadeItens,
  total,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    };
    const intervalId = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const formattedTotal = formatMoney(total);
  const quantityLabel = quantidadeItens === null
    ? 'as cobranças revisadas'
    : `${quantidadeItens} cobranças`;

  return (
    <main
      className="flex min-h-0 flex-1 items-center overflow-y-auto bg-slate-100 px-4 py-8 sm:px-6"
      data-testid="manual-cycle-issuance-progress"
    >
      <section
        aria-labelledby="manual-cycle-title"
        aria-describedby="manual-cycle-description"
        className="mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40"
      >
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          Emissão BolePix iniciada. Aguarde a confirmação do sistema.
        </p>
        <div className="bg-[#001a33] px-5 py-6 text-white sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/30">
                <Loader2 className="animate-spin motion-reduce:animate-none" size={24} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                  Emissão segura em andamento
                </p>
                <h2 id="manual-cycle-title" className="mt-1 text-xl font-black sm:text-2xl">
                  {cicloNumero === null
                    ? 'Gerando e emitindo o ciclo'
                    : `Gerando e emitindo o ${cicloNumero}º ciclo`}
                </h2>
                <p id="manual-cycle-description" className="mt-1 truncate text-xs font-semibold text-slate-300">
                  {alunoNome} · {matriculaExibicao}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
              <Clock3 aria-hidden="true" size={17} className="text-emerald-300" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-300">Tempo decorrido</p>
                <p className="font-mono text-lg font-black" aria-label={`${elapsedSeconds} segundos decorridos`}>
                  {formatElapsed(elapsedSeconds)}
                </p>
              </div>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="Geração e emissão BolePix em andamento"
            aria-valuetext={`Processando ${quantityLabel}`}
            className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"
          >
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-emerald-400 motion-reduce:animate-none" />
          </div>
          <p className="mt-2 text-[10px] font-semibold text-slate-300">
            A barra permanece em movimento enquanto esta tentativa estiver em andamento; ela não representa um percentual estimado.
          </p>
        </div>

        <div className="p-5 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: ReceiptText,
                number: '1',
                title: 'Preparar cobranças',
                description: `Criar ou reutilizar ${quantityLabel}.`,
              },
              {
                icon: Landmark,
                number: '2',
                title: 'Emitir no Banese',
                description: quantidadeItens === null
                  ? 'Registrar os títulos BolePix no Banese, um por vez.'
                  : `Registrar os ${quantidadeItens} títulos BolePix, um por vez.`,
              },
              {
                icon: FileCheck2,
                number: '3',
                title: 'Conferir o retorno',
                description: 'Validar Pix, linha digitável e código de barras.',
              },
            ].map(({ icon: Icon, number, title, description }) => (
              <div key={number} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-100 text-[10px] font-black text-blue-700">
                    {number}
                  </span>
                  <Icon aria-hidden="true" size={16} className="text-slate-500" />
                </div>
                <p className="mt-3 text-xs font-black text-[#001a33]">{title}</p>
                <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-700" size={19} />
              <div>
                <p className="text-xs font-black text-emerald-950">Aguarde nesta tela</p>
                <p className="mt-1 text-[10px] font-semibold leading-relaxed text-emerald-800">
                  A solicitação é protegida contra duplicidade. Ao concluir, o sistema informará o sucesso ou indicará como retomar com segurança.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">{quantityLabel}</p>
              {formattedTotal ? <p className="mt-1 text-sm font-black text-emerald-950">{formattedTotal}</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default FinanceiroCicloManualIssuanceProgress;
