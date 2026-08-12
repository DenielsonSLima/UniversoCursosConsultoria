import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Check,
  CircleCheckBig,
  Loader2,
  School,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DependenciaCheckoutError,
  useConfirmarDependenciaMutation,
  useEmitirBoletoDependenciaMutation,
} from '../hooks/useDependenciasAcademicasMutations';
import {
  useDependenciaOfertasQuery,
  useDependenciaPreviaQuery,
} from '../hooks/useDependenciasAcademicasQueries';
import type {
  DependenciaAcademica,
  DependenciaCheckoutResult,
  DependenciaPreviaInput,
} from '../dependencias-academicas.types';
import {
  formatCurrency,
  formatDate,
  formatGrade,
  todayInputValue,
} from '../dependencias-academicas.utils';
import DependenciaBoletoPanel from './DependenciaBoletoPanel';

interface DependenciaEncaminhamentoWizardProps {
  poloId: string;
  dependencia: DependenciaAcademica | null;
  onClose: () => void;
}

const createIdempotencyKey = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `dependencia-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const steps = [
  { id: 1, label: 'Reprovação', icon: BookOpenCheck },
  { id: 2, label: 'Oferta', icon: School },
  { id: 3, label: 'Cobrança', icon: Banknote },
  { id: 4, label: 'Boleto', icon: CircleCheckBig },
] as const;

const DependenciaEncaminhamentoWizard = ({
  poloId,
  dependencia,
  onClose,
}: DependenciaEncaminhamentoWizardProps) => {
  const [step, setStep] = useState(1);
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [checkout, setCheckout] = useState<DependenciaCheckoutResult | null>(null);
  const ofertasQuery = useDependenciaOfertasQuery(
    poloId,
    dependencia?.matriculaId || null,
    dependencia?.disciplinaId || null,
  );
  const previewInput = useMemo<DependenciaPreviaInput | null>(() => (
    dependencia && selectedTurmaId
      ? {
          poloId,
          matriculaId: dependencia.matriculaId,
          disciplinaId: dependencia.disciplinaId,
          turmaDestinoId: selectedTurmaId,
          dataVencimento: dueDate,
        }
      : null
  ), [dependencia, dueDate, poloId, selectedTurmaId]);
  const previewQuery = useDependenciaPreviaQuery(previewInput, step === 3);
  const confirmationMutation = useConfirmarDependenciaMutation(poloId);
  const boletoMutation = useEmitirBoletoDependenciaMutation(poloId);

  useEffect(() => {
    if (!dependencia) return;
    const today = todayInputValue();
    const suggestedDueDate = dependencia.dataVencimento?.slice(0, 10);
    setStep(1);
    setSelectedTurmaId('');
    setDueDate(
      suggestedDueDate && suggestedDueDate >= today
        ? suggestedDueDate
        : today,
    );
    setIdempotencyKey(createIdempotencyKey());
    setCheckout(null);
    confirmationMutation.reset();
    boletoMutation.reset();
  }, [dependencia?.id]);

  useEffect(() => {
    if (!dependencia) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape'
        && !confirmationMutation.isPending
        && !boletoMutation.isPending
      ) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [
    boletoMutation.isPending,
    confirmationMutation.isPending,
    dependencia,
    onClose,
  ]);

  if (!dependencia) return null;

  const preview = previewQuery.data;
  const selectedOffer = ofertasQuery.data?.find((item) => item.turmaId === selectedTurmaId);
  const partialConfirmation = confirmationMutation.error instanceof DependenciaCheckoutError
    ? confirmationMutation.error.confirmation
    : null;
  const isProcessing = confirmationMutation.isPending || boletoMutation.isPending;

  const confirm = () => {
    if (!previewInput || !preview?.podeConfirmar) return;
    confirmationMutation.mutate(
      { ...previewInput, idempotencyKey },
      {
        onSuccess: (result) => {
          setCheckout(result);
          setStep(4);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[2147482000] flex items-center justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Encaminhar dependência acadêmica"
        className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[2rem]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-[#001a33] px-5 py-4 text-white sm:px-7">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Fluxo acadêmico-financeiro</p>
            <h3 className="mt-1 text-lg font-black uppercase tracking-tight">Encaminhar dependência</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-300">
              {dependencia.alunoNome} · {dependencia.disciplinaNome}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Fechar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-7">
          <ol className="grid grid-cols-4 gap-2">
            {steps.map((item) => {
              const Icon = item.icon;
              const active = step === item.id;
              const complete = step > item.id;
              return (
                <li
                  key={item.id}
                  className={`flex min-w-0 items-center gap-2 rounded-xl border px-2 py-2 sm:px-3 ${
                    active
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                      : complete
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? 'bg-cyan-700 text-white' : complete ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>
                    {complete ? <Check size={13} /> : <Icon size={13} />}
                  </span>
                  <span className="hidden truncate text-[9px] font-black uppercase tracking-wider sm:block">{item.label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          {step === 1 ? (
            <div className="space-y-5">
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0 text-rose-700" size={21} />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-700">Reprovação consolidada</p>
                    <h4 className="mt-1 text-lg font-black text-rose-950">{dependencia.disciplinaNome}</h4>
                    <p className="mt-1 text-sm font-semibold text-rose-800">{dependencia.motivoReprovacao}</p>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Carga horária', `${dependencia.cargaHoraria}h`],
                    ['Nota final', formatGrade(dependencia.notaOriginal)],
                    ['Frequência', dependencia.frequenciaOriginal === null ? '—' : `${dependencia.frequenciaOriginal}%`],
                    ['Turma de origem', dependencia.turmaOrigemCodigo || dependencia.turmaOrigemNome],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-rose-100 bg-white/70 p-3">
                      <dt className="text-[8px] font-black uppercase tracking-wider text-rose-500">{label}</dt>
                      <dd className="mt-1 text-xs font-black text-rose-950">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-900">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" />
                <p className="text-xs font-semibold leading-relaxed">
                  O aluno continuará na matrícula original. A confirmação inclui somente esta disciplina no diário da oferta escolhida; não transfere nem matricula o aluno na turma inteira.
                </p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-black uppercase tracking-tight text-[#001a33]">Selecione a oferta compatível</h4>
                <p className="mt-1 text-xs font-medium text-slate-500">A lista vem do serviço acadêmico seguro e considera curso, disciplina e situação do diário.</p>
              </div>
              {ofertasQuery.isLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                  <Loader2 className="animate-spin text-blue-600" size={18} /> Buscando ofertas
                </div>
              ) : ofertasQuery.isError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
                  <p className="text-xs font-bold text-rose-700">Não foi possível consultar as ofertas disponíveis.</p>
                  <button type="button" onClick={() => void ofertasQuery.refetch()} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white">Tentar novamente</button>
                </div>
              ) : !ofertasQuery.data?.length ? (
                <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-7 text-center">
                  <School size={28} className="mx-auto text-amber-600" />
                  <p className="mt-3 text-sm font-black text-amber-950">Nenhuma oferta compatível disponível</p>
                  <p className="mt-1 text-xs font-semibold text-amber-800">Mantenha a dependência pendente até a abertura de uma nova turma.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {ofertasQuery.data.map((offer) => {
                    const selected = offer.turmaId === selectedTurmaId;
                    return (
                      <button
                        type="button"
                        key={offer.id}
                        disabled={!offer.compativel}
                        onClick={() => setSelectedTurmaId(offer.turmaId)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-100'
                            : offer.compativel
                              ? 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                              : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-[#001a33]">{offer.turmaNome}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {offer.turmaCodigo || 'Sem código'} · {offer.periodoNome || 'Período a definir'}
                            </p>
                          </div>
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {selected ? <Check size={13} /> : null}
                          </span>
                        </div>
                        <div className="mt-4 space-y-1 text-[10px] font-bold text-slate-500">
                          <p>Docente: {offer.professorNome || 'A definir'}</p>
                          <p>Período: {formatDate(offer.dataInicio)} até {formatDate(offer.dataFim)}</p>
                          <p>Vagas: {offer.vagasDisponiveis ?? 'conforme diário'}</p>
                        </div>
                        {offer.impedimento ? <p className="mt-3 text-[10px] font-bold text-rose-600">{offer.impedimento}</p> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_220px] sm:items-end">
                <div>
                  <h4 className="text-base font-black uppercase tracking-tight text-[#001a33]">Confira a cobrança canônica</h4>
                  <p className="mt-1 text-xs font-medium text-slate-500">O navegador apenas exibe a prévia calculada e validada pelo backend.</p>
                </div>
                <label className="block">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Vencimento do boleto</span>
                  <input
                    type="date"
                    min={todayInputValue()}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>
              </div>
              {previewQuery.isLoading || previewQuery.isFetching ? (
                <div className="flex min-h-52 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-400">
                  <Loader2 className="animate-spin text-cyan-700" size={20} /> Calculando prévia segura
                </div>
              ) : previewQuery.isError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
                  <p className="text-xs font-bold text-rose-700">O backend não conseguiu calcular esta reoferta.</p>
                  <button type="button" onClick={() => void previewQuery.refetch()} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white">Recalcular</button>
                </div>
              ) : preview ? (
                <div className="overflow-hidden rounded-3xl border border-cyan-200 bg-white">
                  <div className="border-b border-cyan-100 bg-cyan-50 px-5 py-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.17em] text-cyan-700">Cobrança avulsa · 1 boleto</p>
                    <h5 className="mt-1 text-lg font-black text-[#001a33]">{preview.disciplinaNome}</h5>
                    <p className="mt-1 text-xs font-semibold text-cyan-900">{selectedOffer?.turmaNome || preview.turmaDestinoNome}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
                    {[
                      ['Carga horária', `${preview.cargaHoraria}h`],
                      ['Percentual', `${preview.percentualAplicado}%`],
                      ['Base da parcela', formatCurrency(preview.valorBase)],
                      ['Valor a cobrar', formatCurrency(preview.valorCobrar)],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-white p-4">
                        <dt className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
                        <dd className="mt-1 text-sm font-black text-[#001a33]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-4">
                    {[
                      ['Desconto até vencimento', formatCurrency(preview.descontoPontualidade)],
                      ['Juros após vencimento', `${preview.jurosAtrasoPercentual}% ao mês`],
                      ['Multa após vencimento', `${preview.multaAtrasoPercentual}% única`],
                      ['Baixa bancária', `${preview.diasBaixaDevolucao} dias após vencimento`],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-white p-4">
                        <dt className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
                        <dd className="mt-1 text-sm font-black text-[#001a33]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="p-5">
                    <p className="text-xs font-bold text-slate-700">{preview.descricaoCobranca}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">{preview.regraResumo}</p>
                    <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-emerald-800">
                      {preview.instrucaoBoleto}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500">
                      Esta é uma cobrança única da disciplina. Ela não altera matrícula, mensalidades nem cronograma financeiro do curso técnico.
                    </p>
                    {preview.bloqueio ? (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{preview.bloqueio}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {confirmationMutation.isError ? (
                <div className={`rounded-2xl border p-4 ${partialConfirmation ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                  <p className="text-xs font-black">
                    {partialConfirmation
                      ? 'A reoferta foi confirmada, mas o boleto não ficou disponível.'
                      : 'Não foi possível confirmar a reoferta.'}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold">{confirmationMutation.error.message}</p>
                  {partialConfirmation ? (
                    <>
                      <p className="mt-2 text-[10px] font-bold">
                        A tentativa abaixo reutiliza o mesmo recebível; a trava do servidor impede um segundo título quando o estado é ambíguo.
                      </p>
                      <button
                        type="button"
                        disabled={boletoMutation.isPending}
                        onClick={() => boletoMutation.mutate(partialConfirmation, {
                          onSuccess: (result) => {
                            setCheckout(result);
                            setStep(4);
                          },
                        })}
                        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 text-[9px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                      >
                        {boletoMutation.isPending
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Banknote size={13} />}
                        Tentar emitir o mesmo boleto
                      </button>
                      {boletoMutation.isError ? (
                        <p className="mt-2 text-[10px] font-semibold">
                          {boletoMutation.error.message}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 4 && checkout ? (
            <div className="space-y-5">
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CircleCheckBig size={24} className="shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Reoferta confirmada</p>
                    <h4 className="mt-1 text-lg font-black text-emerald-950">Cobrança Banese vinculada à dependência</h4>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
                      O aluno não foi matriculado na turma inteira. A entrada no diário da disciplina seguirá o estado financeiro canônico.
                    </p>
                  </div>
                </div>
              </div>
              <DependenciaBoletoPanel boleto={checkout.boleto} />
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
          {step > 1 && step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={isProcessing || Boolean(partialConfirmation)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <ArrowLeft size={14} /> Voltar
            </button>
          ) : <span />}
          {step === 1 ? (
            <button type="button" onClick={() => setStep(2)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-800">
              Conferido <ArrowRight size={14} />
            </button>
          ) : null}
          {step === 2 ? (
            <button
              type="button"
              disabled={!selectedTurmaId}
              onClick={() => setStep(3)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Calcular cobrança <ArrowRight size={14} />
            </button>
          ) : null}
          {step === 3 ? (
            <button
              type="button"
              disabled={!preview?.podeConfirmar || isProcessing || Boolean(partialConfirmation)}
              onClick={confirm}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-700 px-5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {confirmationMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {confirmationMutation.isPending ? 'Confirmando e registrando boleto' : 'Confirmar e gerar boleto'}
            </button>
          ) : null}
          {step === 4 ? (
            <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-800">
              Concluir <Check size={14} />
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
};

export default DependenciaEncaminhamentoWizard;
