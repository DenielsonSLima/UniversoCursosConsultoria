import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  Loader2,
  ReceiptText,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';
import type {
  CicloFinanceiroTecnicoManualPreview,
} from './matricula-tecnica-ciclo-manual.types';
import FinanceiroCicloManualChargeRows from './FinanceiroCicloManualChargeRows';
import { getCriterioElegibilidadeLabel } from './matricula-tecnica-ciclo-manual.parser';
import { usePreviewCicloFinanceiroTecnicoManual } from './hooks/useMatriculaTecnicaCicloManual';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';

interface FinanceiroCicloManualDialogProps {
  row: MatriculaTecnicaFinanceiroRow;
  pending: boolean;
  onClose: () => void;
  onConfirm: (
    preview: CicloFinanceiroTecnicoManualPreview,
    primeiroVencimento: string | null,
  ) => void;
}

type WizardStep = 1 | 2 | 3;

const WIZARD_STEPS: Array<{ number: WizardStep; label: string }> = [
  { number: 1, label: 'Dados e vencimento' },
  { number: 2, label: 'Composição das cobranças' },
  { number: 3, label: 'Revisão e confirmação' },
];

const formatMoney = (value: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value));

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');

const formatPercent = (value: string) => `${new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number(value))}%`;

const FinanceiroCicloManualDialog: React.FC<FinanceiroCicloManualDialogProps> = ({
  row,
  pending,
  onClose,
  onConfirm,
}) => {
  const cycleNumber = row.cicloManual.proximoCicloNumero;
  const requiresIndividualDate = cycleNumber === 2;
  const [step, setStep] = useState<WizardStep>(1);
  const [dateSource, setDateSource] = useState<'TURMA' | 'INDIVIDUAL'>(
    requiresIndividualDate ? 'INDIVIDUAL' : 'TURMA',
  );
  const [individualDate, setIndividualDate] = useState(
    () => row.cicloManual.primeiroVencimentoSugerido ?? '',
  );
  const firstDueDate = dateSource === 'INDIVIDUAL' ? individualDate || null : null;
  const previewEnabled = cycleNumber !== null
    && row.cicloManual.estado === 'ELEGIVEL'
    && row.cicloManual.podeGerar
    && (dateSource === 'TURMA' || Boolean(individualDate));
  const previewQuery = usePreviewCicloFinanceiroTecnicoManual({
    matriculaId: row.matriculaId,
    cicloNumero: cycleNumber || 0,
    primeiroVencimento: firstDueDate,
  }, previewEnabled);
  const preview = previewQuery.data?.preview;
  const appliedTerms = preview ? ([
    ['MATRICULA', 'Matrícula', preview.termos.aplicacao.matricula],
    ['REMATRICULA', 'Rematrícula', preview.termos.aplicacao.rematricula],
    ['PARCELA', 'Mensalidades', preview.termos.aplicacao.mensalidade],
  ] as const).filter(([type]) => preview.itens.some((item) => item.tipo === type)) : [];
  const eligibilityLabel = getCriterioElegibilidadeLabel(
    row.cicloManual.criterioElegibilidade,
  );
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);

  const goToStep = (nextStep: WizardStep) => {
    if (pending || (nextStep > 1 && !preview)) return;
    setStep(nextStep);
  };

  const dialog = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-cycle-title"
      aria-describedby="manual-cycle-description"
      aria-busy={pending}
      tabIndex={-1}
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 outline-none"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={(node) => { initialFocusRef.current = node; }}
              type="button"
              disabled={pending}
              onClick={onClose}
              aria-label="Fechar geração do ciclo"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40"
            >
              <X size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">Geração manual</p>
              <h2 id="manual-cycle-title" className="truncate text-lg font-black text-[#001a33] sm:text-xl">Gerar {cycleNumber}º ciclo</h2>
              <p id="manual-cycle-description" className="truncate text-[10px] font-semibold text-slate-500 sm:text-xs">{row.alunoNome} · {row.matriculaExibicao}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase text-slate-600">Ciclo {cycleNumber} de {row.cicloManual.cicloMaximo}</span>
        </div>

        <nav className="mx-auto mt-3 max-w-5xl" aria-label="Etapas da geração de cobranças">
          <ol className="grid grid-cols-3 gap-1 sm:gap-3">
            {WIZARD_STEPS.map((wizardStep) => {
              const current = step === wizardStep.number;
              const complete = step > wizardStep.number;
              return (
                <li
                  key={wizardStep.number}
                  aria-current={current ? 'step' : undefined}
                  className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 sm:px-3 ${current ? 'bg-blue-50 text-blue-800' : complete ? 'text-emerald-700' : 'text-slate-400'}`}
                >
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${current ? 'bg-blue-600 text-white' : complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {complete ? <Check size={13} strokeWidth={3} /> : wizardStep.number}
                  </span>
                  <span className="hidden truncate text-[9px] font-black uppercase tracking-wide sm:block">{wizardStep.number}. {wizardStep.label}</span>
                  <span className="truncate text-[9px] font-black uppercase sm:hidden">{wizardStep.number}. {wizardStep.label.split(' ')[0]}</span>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8" data-testid="manual-cycle-scroll-area">
        <div className="mx-auto w-full max-w-6xl">
          {step === 1 ? (
            <section aria-labelledby="manual-cycle-step-1">
              <div className="mb-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Etapa 1 de 3</p>
                <h3 id="manual-cycle-step-1" className="mt-1 text-2xl font-black text-[#001a33]">Dados e vencimento</h3>
                <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Defina a data inicial. O sistema calculará a rematrícula e todas as mensalidades antes de permitir a geração.</p>
              </div>

              {eligibilityLabel ? (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-relaxed text-emerald-900">
                  <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                  <div><p className="font-black">Aluno apto para o próximo ciclo</p><p className="mt-0.5 text-xs">{eligibilityLabel}</p></div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  {requiresIndividualDate ? (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Data individual obrigatória no 2º ciclo</p>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-900">A data será o vencimento da rematrícula — ou do primeiro item, se ela não for cobrada. Quando houver rematrícula, a mensalidade 1 vencerá no mês seguinte.</p>
                    </div>
                  ) : (
                    <fieldset>
                      <legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vencimentos do aluno</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {([
                          ['TURMA', 'Usar datas da turma', 'O sistema aplica o dia-base configurado.'],
                          ['INDIVIDUAL', 'Definir primeira data', 'O sistema recalcula todo o cronograma.'],
                        ] as const).map(([value, label, description]) => (
                          <label key={value} className={`cursor-pointer rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${dateSource === value ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                            <input type="radio" name="manual-cycle-date-source" value={value} checked={dateSource === value} onChange={() => setDateSource(value)} className="sr-only" />
                            <span className="block text-xs font-black text-[#001a33]">{label}</span>
                            <span className="mt-1 block text-[10px] font-semibold text-slate-500">{description}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {dateSource === 'INDIVIDUAL' ? (
                    <label className="mt-4 block space-y-2">
                      <span className="text-[10px] font-black uppercase text-slate-500">{requiresIndividualDate ? 'Vencimento da rematrícula / primeiro item' : 'Primeiro vencimento individual'}</span>
                      <input type="date" value={individualDate} onChange={(event) => setIndividualDate(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                      {row.cicloManual.primeiroVencimentoSugerido ? (
                        <span className="block text-[10px] font-semibold text-slate-500">Sugestão automática: um mês após o último boleto do ciclo anterior. Você pode alterar esta data.</span>
                      ) : null}
                    </label>
                  ) : null}

                  {!previewEnabled ? (
                    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Informe o primeiro vencimento para visualizar todas as cobranças do ciclo.</div>
                  ) : previewQuery.isLoading || previewQuery.isFetching ? (
                    <div className="mt-4 flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50 py-6 text-sm font-bold text-slate-500" role="status"><Loader2 className="mr-2 animate-spin" size={18} /> Calculando cobranças no sistema...</div>
                  ) : previewQuery.isError || !preview ? (
                    <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs font-semibold text-rose-700" role="alert"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><span>Não foi possível validar a composição. Nenhuma cobrança será gerada.</span></div><button type="button" onClick={() => { void previewQuery.refetch(); }} className="mt-3 rounded-lg bg-white px-3 py-2 text-[9px] font-black uppercase text-rose-700">Tentar novamente</button></div>
                  ) : (
                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><ShieldCheck size={18} /><span>Composição calculada. Avance para conferir cada cobrança.</span></div>
                  )}
                </div>

                <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">O que acontece agora</p>
                  <ol className="mt-4 space-y-4 text-xs font-semibold text-slate-600">
                    <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-700">1</span><span>Você informa o vencimento inicial.</span></li>
                    <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 font-black text-slate-600">2</span><span>Confere rematrícula, mensalidades, descontos, juros e multa.</span></li>
                    <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 font-black text-slate-600">3</span><span>Confirma a criação das cobranças e a emissão BolePix.</span></li>
                  </ol>
                </aside>
              </div>
            </section>
          ) : null}

          {step === 2 && preview ? (
            <section aria-labelledby="manual-cycle-step-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Etapa 2 de 3</p>
              <h3 id="manual-cycle-step-2" className="mt-1 text-2xl font-black text-[#001a33]">Composição das cobranças</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Confira todos os itens e as condições financeiras calculadas pela configuração da turma.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-[9px] font-black uppercase text-blue-600">Cobranças</p><p className="mt-1 text-lg font-black text-blue-950">{preview.quantidadeItens} itens</p></div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-[9px] font-black uppercase text-emerald-600">Total do ciclo</p><p className="mt-1 text-lg font-black text-emerald-950">{formatMoney(preview.total)}</p></div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><p className="text-[9px] font-black uppercase text-violet-600">Primeiro vencimento</p><p className="mt-1 text-lg font-black text-violet-950">{formatDate(preview.primeiroVencimento)}</p></div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Lista completa das cobranças do ciclo">
                <div className="hidden grid-cols-[minmax(0,1fr)_8rem_9rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 sm:grid">
                  <span>Cobrança</span><span>Vencimento</span><span className="text-right">Valor nominal</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {preview.itens.map((item) => (
                    <FinanceiroCicloManualChargeRows
                      key={item.chave}
                      item={item}
                      variant="composition"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_22rem]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Termos financeiros da regra efetiva</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-600">Desconto em dia</p><p className="mt-1 text-sm font-black text-[#001a33]">{formatMoney(preview.termos.descontoPontualidade)}</p></div>
                    <div className="rounded-xl bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-500">Juros ao mês</p><p className="mt-1 text-sm font-black text-[#001a33]">{formatPercent(preview.termos.jurosAtrasoPercentual)}</p></div>
                    <div className="rounded-xl bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-500">Multa única</p><p className="mt-1 text-sm font-black text-[#001a33]">{formatPercent(preview.termos.multaAtrasoPercentual)}</p></div>
                  </div>
                  <div className="mt-3 space-y-2">{appliedTerms.map(([, label, application]) => <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-600"><span className="font-black text-[#001a33]">{label}</span><span>Desconto: {application.desconto ? 'aplica' : 'não aplica'} · Multa/juros: {application.multaJuros ? 'aplica' : 'não aplica'}</span></div>)}</div>
                </div>
                <aside className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase text-blue-700"><ReceiptText size={14} /> Instrução da cobrança</p>
                  <p className="mt-3 text-xs font-semibold leading-relaxed text-blue-950">{preview.termos.instrucaoBoleto.trim() || 'Sem instrução adicional.'}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-[9px] font-bold uppercase text-blue-600"><CalendarDays size={12} /> {preview.sourceVencimento === 'TURMA' ? 'Datas da turma' : 'Datas individuais'} · origem {formatDate(preview.dataOrigem)}</p>
                </aside>
              </div>
            </section>
          ) : null}

          {step === 3 && preview ? (
            <section aria-labelledby="manual-cycle-step-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Etapa 3 de 3</p>
              <h3 id="manual-cycle-step-3" className="mt-1 text-2xl font-black text-[#001a33]">Revisão e confirmação</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Revise o resumo final antes de criar as cobranças e emitir os títulos Banese.</p>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Resumo final do ciclo</p></div>
                  <dl className="grid gap-px bg-slate-100 sm:grid-cols-2">
                    {[
                      ['Aluno', row.alunoNome],
                      ['Matrícula', row.matriculaExibicao],
                      ['Ciclo', `${preview.cicloNumero}º ciclo`],
                      ['Total de cobranças', `${preview.quantidadeItens} itens`],
                      ['Primeiro vencimento', formatDate(preview.primeiroVencimento)],
                      ['Valor total', formatMoney(preview.total)],
                    ].map(([label, value]) => <div key={label} className="bg-white p-4"><dt className="text-[9px] font-black uppercase text-slate-400">{label}</dt><dd className="mt-1 text-sm font-black text-[#001a33]">{value}</dd></div>)}
                  </dl>
                  <div className="border-t border-slate-100 px-4 py-3">
                    <p className="text-[9px] font-black uppercase text-slate-400">Itens conferidos</p>
                    <div className="mt-2 divide-y divide-slate-100">
                      {preview.itens.map((item) => (
                        <FinanceiroCicloManualChargeRows
                          key={item.chave}
                          item={item}
                          variant="review"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-950">
                    <p className="flex items-center gap-2 font-black"><AlertTriangle size={16} /> Confirmação necessária</p>
                    <p className="mt-2">Ao confirmar, o sistema criará {preview.quantidadeItens} cobranças e emitirá {preview.quantidadeItens} títulos BolePix Banese. Revise os valores e vencimentos antes de continuar.</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold leading-relaxed text-emerald-950">
                    <p className="font-black">Geração e emissão em uma única ação</p>
                    <p className="mt-2">As cobranças ficarão listadas em Financeiro com QR Pix, linha digitável, código de barras e PDF oficial Banese disponíveis, sem uma segunda emissão.</p>
                  </div>
                  <details className="rounded-2xl border border-slate-200 bg-white p-4 text-[9px] text-slate-500">
                    <summary className="flex cursor-pointer items-center gap-1.5 font-black uppercase text-slate-500"><Fingerprint size={13} /> Auditoria da prévia</summary>
                    <dl className="mt-3 space-y-1 font-mono"><div><dt className="inline font-bold">Regra: </dt><dd className="inline break-all">{preview.regraEfetivaFingerprint}</dd></div><div><dt className="inline font-bold">Política: </dt><dd className="inline break-all">{preview.politicaFingerprint}</dd></div><div><dt className="inline font-bold">Cronograma: </dt><dd className="inline break-all">{preview.cronogramaFingerprint}</dd></div></dl>
                  </details>
                </aside>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40">Cancelar</button>
          <div className="flex gap-2">
            {step > 1 ? <button type="button" disabled={pending} onClick={() => goToStep((step - 1) as WizardStep)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 sm:flex-none"><ArrowLeft size={14} /> Voltar</button> : null}
            {step < 3 ? (
              <button type="button" disabled={pending || !preview || previewQuery.isFetching} onClick={() => goToStep((step + 1) as WizardStep)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40 sm:flex-none">{step === 1 ? 'Ver composição' : 'Revisar geração'} <ChevronRight size={14} /></button>
            ) : (
              <button type="button" disabled={pending || !preview || previewQuery.isFetching} onClick={() => preview && onConfirm(preview, firstDueDate)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-[10px] font-black uppercase text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-40 sm:flex-none">
                {pending ? <><Loader2 className="animate-spin" size={14} /> Gerando e emitindo BolePix...</> : <><ReceiptText size={14} /> Gerar e emitir BolePix</>}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};

export default FinanceiroCicloManualDialog;
