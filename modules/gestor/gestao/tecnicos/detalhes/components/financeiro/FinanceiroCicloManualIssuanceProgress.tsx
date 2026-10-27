import React, { useEffect, useState } from 'react';
import {
  Clock3,
  FileCheck2,
  Landmark,
  Loader2,
  ReceiptText,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface FinanceiroCicloManualIssuanceProgressProps {
  alunoNome: string;
  matriculaExibicao: string;
  cicloNumero: number | null;
  quantidadeItens: number | null;
  quantidadeBancaria?: number;
  emitidosBanese: number;
  preparacaoConcluida: boolean;
  total: string | null;
  startedAt?: number;
  progressConfirmed?: boolean;
  completionConfirmed?: boolean;
  pendingCount?: number;
  reviewCount?: number;
  observedAt?: string;
  readError?: string | null;
  checking?: boolean;
  onCheck?: () => void;
  onClose?: () => void;
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
  quantidadeBancaria,
  emitidosBanese,
  preparacaoConcluida,
  total,
  startedAt,
  progressConfirmed = true,
  completionConfirmed = false,
  pendingCount,
  reviewCount,
  observedAt,
  readError,
  checking = false,
  onCheck,
  onClose,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(() => startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)) : 0);

  useEffect(() => {
    const beginning = startedAt ?? Date.now();
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - beginning) / 1_000)));
    };
    const intervalId = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  const formattedTotal = formatMoney(total);
  const quantityLabel = quantidadeItens === null
    ? 'as cobranças revisadas'
    : `${quantidadeItens} cobranças`;
  const bankCount = quantidadeBancaria ?? quantidadeItens;
  const itemCount = bankCount && bankCount > 0 ? bankCount : 0;
  const emittedCount = Math.min(itemCount, Math.max(0, emitidosBanese));
  const progressPercent = itemCount > 0
    ? Math.round((emittedCount / itemCount) * 100)
    : 0;
  const emissionFinished = completionConfirmed;
  const progressLabel = !progressConfirmed ? 'Aguardando confirmação do progresso'
    : itemCount > 0
    ? `${emittedCount}/${itemCount} títulos emitidos`
    : 'Preparando cobranças';

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
          {progressLabel}. {progressConfirmed ? `${progressPercent}% confirmado.` : 'Quantidade emitida ainda não confirmada.'}
        </p>
        <div className="bg-[#001a33] px-5 py-6 text-white sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/30">
                {completionConfirmed ? <CheckCircle2 size={24} /> : <Loader2 className="animate-spin motion-reduce:animate-none" size={24} />}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                  {completionConfirmed ? 'Emissão confirmada pelo servidor' : 'Acompanhamento da emissão'}
                </p>
                <h2 id="manual-cycle-title" className="mt-1 text-xl font-black sm:text-2xl">
                  {completionConfirmed ? `${cicloNumero}º ciclo gerado e emitido` : cicloNumero === null
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

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black text-white">{progressLabel}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-300">
                {progressConfirmed ? 'Cada avanço confirma um título validado e salvo pelo sistema.' : 'A consulta está em andamento. Ausência de resposta não significa zero títulos emitidos.'}
              </p>
            </div>
            <p className="shrink-0 text-2xl font-black tabular-nums text-emerald-300">
              {progressConfirmed ? `${progressPercent}%` : '—'}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso real da emissão BolePix"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressConfirmed ? progressPercent : undefined}
            aria-valuetext={progressConfirmed ? `${progressLabel}, ${progressPercent}% confirmado` : progressLabel}
            className="mt-3 h-3 overflow-hidden rounded-full bg-white/15"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: ReceiptText,
                number: '1',
                title: 'Preparar cobranças',
                description: `Criar ou reutilizar ${quantityLabel}.`,
                state: preparacaoConcluida ? 'complete' : 'active',
              },
              {
                icon: Landmark,
                number: '2',
                title: 'Emitir no Banese',
                description: bankCount === null
                  ? 'Registrar os títulos BolePix no Banese, um por vez.'
                  : `Registrar os ${bankCount} títulos BolePix, um por vez.`,
                state: emissionFinished
                  ? 'complete'
                  : preparacaoConcluida
                    ? 'active'
                    : 'pending',
              },
              {
                icon: FileCheck2,
                number: '3',
                title: 'Conferir o retorno',
                description: 'Validar Pix, linha digitável e código de barras.',
                state: emissionFinished ? 'complete' : 'pending',
              },
            ].map(({ icon: Icon, number, title, description, state }) => (
              <div
                key={number}
                className={`rounded-2xl border p-4 ${state === 'active'
                  ? 'border-blue-200 bg-blue-50 shadow-sm'
                  : state === 'complete'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${state === 'complete'
                    ? 'bg-emerald-600 text-white'
                    : state === 'active'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-500'}`}
                  >
                    {state === 'complete' ? <FileCheck2 size={14} /> : number}
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
                <p className="text-xs font-black text-emerald-950">{completionConfirmed ? 'Emissão concluída' : 'Você pode sair do acompanhamento'}</p>
                <p className="mt-1 text-[10px] font-semibold leading-relaxed text-emerald-800">
                  A solicitação é protegida contra duplicidade. Fechar esta tela não cancela nem repete a emissão. A consulta indicará como retomar com segurança se necessário.
                </p>
              </div>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">{quantityLabel}</p>
              {formattedTotal ? <p className="mt-1 text-sm font-black text-emerald-950">{formattedTotal}</p> : null}
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs font-semibold text-slate-600">
            {progressConfirmed && <p>{pendingCount ?? '—'} títulos pendentes · {reviewCount ?? '—'} em revisão</p>}
            <p>{observedAt ? `Última consulta confirmada: ${new Date(observedAt).toLocaleTimeString('pt-BR')}.` : 'Ainda sem consulta confirmada.'} Tempo restante indisponível; depende da confirmação bancária.</p>
            {readError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{readError}</p>}
            {Boolean(reviewCount) && <p role="alert" className="text-amber-800">Há títulos em revisão. Consulte a operação existente; não gere um novo ciclo.</p>}
            <div className="flex flex-wrap gap-3 pt-2">
              {onCheck && <button type="button" disabled={checking} onClick={onCheck} className="rounded-lg border border-blue-200 px-4 py-2 text-blue-800 disabled:opacity-50">{checking ? 'Consultando…' : 'Consultar progresso'}</button>}
              {onClose && <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-white">{completionConfirmed ? 'Concluir acompanhamento' : 'Sair do acompanhamento'}</button>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default FinanceiroCicloManualIssuanceProgress;
