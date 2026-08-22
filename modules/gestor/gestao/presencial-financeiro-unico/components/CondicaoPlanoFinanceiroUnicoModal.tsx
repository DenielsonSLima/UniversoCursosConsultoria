import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FileKey2,
  Loader2,
  ReceiptText,
  RefreshCw,
  X,
} from 'lucide-react';
import { formatCurrencyBRL, formatDateBR, formatPercentageBR } from '../formatters';
import { usePreviewCondicaoPlanoFinanceiroUnico } from '../hooks/useCondicaoPlanoFinanceiroUnico';
import { createPlanoFinanceiroUnicoRequestId } from '../presencial-financeiro-unico.service';
import type {
  AjusteCondicaoPlanoFinanceiroUnico,
  MatricularAlunoPlanoFinanceiroUnicoV2Input,
  MatricularAlunoPlanoFinanceiroUnicoV2Result,
  MotivoCondicaoPlanoFinanceiroUnico,
  PendenciaPlanoFinanceiroUnico,
  RegraPlanoFinanceiroUnico,
  TipoDescontoComercialPlanoFinanceiroUnico,
} from '../types';

interface CondicaoPlanoFinanceiroUnicoModalProps {
  turmaId: string;
  turmaNome: string;
  student: { id: string; nome: string };
  regraTurma: RegraPlanoFinanceiroUnico;
  pendencia?: PendenciaPlanoFinanceiroUnico | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    input: MatricularAlunoPlanoFinanceiroUnicoV2Input,
  ) => Promise<MatricularAlunoPlanoFinanceiroUnicoV2Result>;
  onCompleted: (result: MatricularAlunoPlanoFinanceiroUnicoV2Result) => void;
  onError: (error: unknown) => void;
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-[#001a33] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelClass = 'text-[10px] font-black uppercase tracking-wider text-slate-500';

const conditionSignature = (adjustment: AjusteCondicaoPlanoFinanceiroUnico) => {
  const {
    expectedOverrideRevisao: _expectedOverrideRevisao,
    expectedOverrideFingerprint: _expectedOverrideFingerprint,
    ...condition
  } = adjustment;
  return JSON.stringify(condition);
};

const buildInitialAdjustment = (
  regra: RegraPlanoFinanceiroUnico,
  pendencia?: PendenciaPlanoFinanceiroUnico | null,
): AjusteCondicaoPlanoFinanceiroUnico => {
  if (pendencia) {
    return {
      ...pendencia.config.ajuste,
      expectedOverrideRevisao: pendencia.config.overrideRevisao,
      expectedOverrideFingerprint: pendencia.config.overrideFingerprint,
    };
  }
  return { modo: 'HERDAR' };
};

const buildCustomAdjustment = (
  regra: RegraPlanoFinanceiroUnico,
  current: AjusteCondicaoPlanoFinanceiroUnico,
): AjusteCondicaoPlanoFinanceiroUnico => ({
  modo: 'PERSONALIZAR',
  qtdParcelas: current.qtdParcelas || regra.qtdParcelas,
  primeiroVencimento: current.primeiroVencimento || regra.primeiroVencimento,
  descontoComercialTipo: current.descontoComercialTipo || 'NENHUM',
  descontoComercialValor: current.descontoComercialValor || 0,
  descontoPontualidade: current.descontoPontualidade ?? regra.descontoPontualidade,
  jurosAtrasoPercentual: current.jurosAtrasoPercentual ?? regra.jurosAtrasoPercentual,
  multaAtraso: current.multaAtraso ?? regra.multaAtraso,
  expectedOverrideRevisao: current.expectedOverrideRevisao,
  expectedOverrideFingerprint: current.expectedOverrideFingerprint,
});

const CondicaoPlanoFinanceiroUnicoModal: React.FC<CondicaoPlanoFinanceiroUnicoModalProps> = ({
  turmaId,
  turmaNome,
  student,
  regraTurma,
  pendencia,
  pending,
  onClose,
  onSubmit,
  onCompleted,
  onError,
}) => {
  const initialAdjustment = useMemo(
    () => buildInitialAdjustment(regraTurma, pendencia),
    [pendencia, regraTurma],
  );
  const [adjustment, setAdjustment] = useState(initialAdjustment);
  const [previewAdjustment, setPreviewAdjustment] = useState(initialAdjustment);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState<MotivoCondicaoPlanoFinanceiroUnico>('NEGOCIACAO');
  const [justification, setJustification] = useState('');
  const [formError, setFormError] = useState('');
  const requestIds = useRef(new Map<string, string>());
  const previewQuery = usePreviewCondicaoPlanoFinanceiroUnico({
    turmaId,
    alunoId: student.id,
    ajuste: previewAdjustment,
  });
  const preview = previewQuery.data;
  const draftSignature = JSON.stringify(adjustment);
  const previewSignature = JSON.stringify(previewAdjustment);
  const previewOutdated = draftSignature !== previewSignature;
  const isCustom = adjustment.modo === 'PERSONALIZAR';
  const conditionChanged = conditionSignature(adjustment) !== conditionSignature(initialAdjustment);
  const requiresAuthorization = isCustom
    ? !pendencia || conditionChanged
    : Boolean(pendencia?.config.ajuste.modo === 'PERSONALIZAR' && conditionChanged);

  const setMode = (mode: 'HERDAR' | 'PERSONALIZAR') => {
    const next = mode === 'HERDAR'
      ? {
        modo: 'HERDAR' as const,
        expectedOverrideRevisao: adjustment.expectedOverrideRevisao,
        expectedOverrideFingerprint: adjustment.expectedOverrideFingerprint,
      }
      : buildCustomAdjustment(regraTurma, adjustment);
    setAdjustment(next);
    setPreviewAdjustment(next);
    setFormError('');
  };

  const updateAdjustment = (patch: Partial<AjusteCondicaoPlanoFinanceiroUnico>) => {
    setAdjustment((current) => ({ ...current, ...patch }));
    setFormError('');
  };

  const updatePreview = () => {
    setPreviewAdjustment({ ...adjustment });
    setFormError('');
  };

  const submit = async (generateNow: boolean) => {
    if (!preview || previewOutdated || previewQuery.isFetching) {
      setFormError('Atualize e aguarde a prévia oficial antes de confirmar.');
      return;
    }
    if (requiresAuthorization && (code.trim().length < 8 || !reason)) {
      setFormError('Informe o código de autorização e o motivo da condição individual.');
      return;
    }
    if (requiresAuthorization && reason === 'OUTRO' && justification.trim().length < 5) {
      setFormError('Descreva o motivo da condição individual em pelo menos 5 caracteres.');
      return;
    }
    const requestKey = `${student.id}:${generateNow}:${draftSignature}`;
    const requestId = requestIds.current.get(requestKey) || createPlanoFinanceiroUnicoRequestId();
    requestIds.current.set(requestKey, requestId);
    try {
      const result = await onSubmit({
        requestId,
        turmaId,
        alunoId: student.id,
        expectedRevisao: regraTurma.revisao,
        expectedFingerprint: regraTurma.fingerprint,
        ajuste: adjustment,
        gerarAgora: generateNow,
        codigo: requiresAuthorization ? code.trim() : undefined,
        motivo: requiresAuthorization ? reason : undefined,
        justificativa: requiresAuthorization ? justification.trim() || undefined : undefined,
      });
      requestIds.current.delete(requestKey);
      onCompleted(result);
    } catch (error) {
      onError(error);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="condicao-plano-title" className="max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-[#001a33] p-6 text-white">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><ReceiptText size={14} /> Condição financeira do aluno</p>
            <h3 id="condicao-plano-title" className="mt-1 text-xl font-black">{pendencia ? 'Revisar pendência financeira' : 'Vincular aluno e definir cobrança'}</h3>
            <p className="mt-1 text-xs font-semibold text-blue-100">{student.nome} · {turmaNome}</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Fechar" className="rounded-full p-2 text-blue-200 hover:bg-white/10 disabled:opacity-50"><X size={20} /></button>
        </header>

        <div className="max-h-[calc(94vh-165px)] overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setMode('HERDAR')} className={`rounded-2xl border p-4 text-left ${!isCustom ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}>
              <p className="text-sm font-black text-[#001a33]">Usar regra da turma</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Mantém valor, parcelas, vencimentos, desconto de pontualidade, juros e multa.</p>
            </button>
            <button type="button" onClick={() => setMode('PERSONALIZAR')} className={`rounded-2xl border p-4 text-left ${isCustom ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 bg-white'}`}>
              <p className="text-sm font-black text-[#001a33]">Personalizar para este aluno</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Permite 1 boleto com desconto, 2 parcelas ou outra negociação autorizada.</p>
            </button>
          </div>

          {isCustom ? (
            <section className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label><span className={labelClass}>Quantidade de boletos</span><input className={inputClass} type="number" min="1" max="60" value={adjustment.qtdParcelas || ''} onChange={(event) => updateAdjustment({ qtdParcelas: Number(event.target.value) })} /></label>
                <label><span className={labelClass}>Primeiro vencimento</span><input className={inputClass} type="date" value={adjustment.primeiroVencimento || ''} onChange={(event) => updateAdjustment({ primeiroVencimento: event.target.value })} /></label>
                <label><span className={labelClass}>Tipo de desconto</span><select className={inputClass} value={adjustment.descontoComercialTipo || 'NENHUM'} onChange={(event) => { const discountType = event.target.value as TipoDescontoComercialPlanoFinanceiroUnico; updateAdjustment({ descontoComercialTipo: discountType, ...(discountType === 'A_VISTA' ? { qtdParcelas: 1 } : {}) }); if (discountType === 'A_VISTA') setReason('A_VISTA'); }}><option value="NENHUM">Sem desconto</option><option value="A_VISTA">Pagamento à vista</option><option value="NEGOCIADO">Desconto negociado</option></select></label>
                <label><span className={labelClass}>Desconto comercial</span><input className={inputClass} type="number" min="0" step="0.01" value={adjustment.descontoComercialValor ?? 0} onChange={(event) => updateAdjustment({ descontoComercialValor: Number(event.target.value) })} /></label>
                <label><span className={labelClass}>Desconto pontualidade</span><input className={inputClass} type="number" min="0" step="0.01" value={adjustment.descontoPontualidade ?? 0} onChange={(event) => updateAdjustment({ descontoPontualidade: Number(event.target.value) })} /></label>
                <label><span className={labelClass}>Juros ao mês (%)</span><input className={inputClass} type="number" min="0" max="100" step="0.01" value={adjustment.jurosAtrasoPercentual ?? 0} onChange={(event) => updateAdjustment({ jurosAtrasoPercentual: Number(event.target.value) })} /></label>
                <label><span className={labelClass}>Multa fixa</span><input className={inputClass} type="number" min="0" step="0.01" value={adjustment.multaAtraso ?? 0} onChange={(event) => updateAdjustment({ multaAtraso: Number(event.target.value) })} /></label>
                <button type="button" onClick={updatePreview} disabled={!previewOutdated || previewQuery.isFetching} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-40"><RefreshCw size={14} className={previewQuery.isFetching ? 'animate-spin' : ''} /> Atualizar prévia</button>
              </div>
            </section>
          ) : null}

          {previewQuery.isLoading || previewQuery.isFetching ? <div className="mt-5 flex items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 py-8 text-sm font-bold text-blue-700"><Loader2 className="mr-2 animate-spin" size={18} /> Calculando no servidor...</div> : null}
          {previewQuery.isError ? <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><AlertCircle className="mr-2 inline" size={17} />{previewQuery.error instanceof Error ? previewQuery.error.message : 'A prévia oficial não foi carregada.'}</div> : null}
          {previewOutdated ? <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-800">Os campos mudaram. Clique em “Atualizar prévia” para recalcular no banco antes de confirmar.</div> : null}

          {preview && !previewQuery.isFetching && !previewOutdated ? (
            <section className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className={labelClass}>Valor nominal</p><p className="mt-1 text-lg font-black text-[#001a33]">{formatCurrencyBRL(preview.valorTotalNominal)}</p></div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className={labelClass}>Desconto comercial</p><p className="mt-1 text-lg font-black text-emerald-700">{formatCurrencyBRL(preview.descontoComercial.valor)}</p></div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className={labelClass}>Total efetivo</p><p className="mt-1 text-lg font-black text-blue-800">{formatCurrencyBRL(preview.valorTotalEfetivo)}</p></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className={labelClass}>Cobrança</p><p className="mt-1 text-lg font-black text-[#001a33]">{preview.qtdParcelas} boleto{preview.qtdParcelas === 1 ? '' : 's'}</p></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-3 text-xs"><p className={labelClass}>Pontualidade</p><p className="mt-1 font-black text-[#001a33]">{formatCurrencyBRL(preview.descontoPontualidade)}</p></div>
                <div className="rounded-xl border border-slate-200 p-3 text-xs"><p className={labelClass}>Juros de atraso</p><p className="mt-1 font-black text-[#001a33]">{formatPercentageBR(preview.jurosAtrasoPercentual)}% ao mês</p></div>
                <div className="rounded-xl border border-slate-200 p-3 text-xs"><p className={labelClass}>Multa fixa</p><p className="mt-1 font-black text-[#001a33]">{formatCurrencyBRL(preview.multaAtraso)}</p></div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3"><CalendarDays size={16} className="text-blue-600" /><p className="text-xs font-black uppercase tracking-wider text-[#001a33]">Cronograma oficial</p></div>
                <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto">{preview.cronograma.map((installment) => <div key={installment.id} className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="text-sm font-bold text-[#001a33]">{installment.label}</p><p className="text-[10px] font-semibold uppercase text-slate-400">{formatDateBR(installment.dataVencimento)}</p></div><p className="font-black text-[#001a33]">{formatCurrencyBRL(installment.valor)}</p></div>)}</div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold leading-relaxed text-emerald-900"><CheckCircle2 size={17} className="mb-2 text-emerald-600" />{preview.mensagens.pagamentoAteVencimento}</div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900"><AlertCircle size={17} className="mb-2 text-amber-600" />{preview.mensagens.pagamentoCom30DiasAtraso}</div>
              </div>
            </section>
          ) : null}

          {requiresAuthorization ? (
            <section className="mt-5 rounded-2xl border border-slate-200 p-5">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#001a33]"><FileKey2 size={16} className="text-violet-600" /> Autorização da condição individual</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Código financeiro</span><input className={inputClass} type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Mínimo 8 caracteres" /></label><label><span className={labelClass}>Motivo</span><select className={inputClass} value={reason} onChange={(event) => setReason(event.target.value as MotivoCondicaoPlanoFinanceiroUnico)}><option value="NEGOCIACAO">Negociação</option><option value="A_VISTA">Pagamento à vista</option><option value="BOLSA">Bolsa</option><option value="CONVENIO">Convênio</option><option value="INCENTIVO">Incentivo</option><option value="OUTRO">Outro</option></select></label></div>
              <label className="mt-4 block"><span className={labelClass}>Justificativa {reason === 'OUTRO' ? '(obrigatória)' : '(opcional)'}</span><textarea className={inputClass} rows={2} maxLength={300} value={justification} onChange={(event) => setJustification(event.target.value)} /></label>
            </section>
          ) : null}

          {formError ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{formError}</p> : null}
          <p className="mt-4 text-[11px] font-semibold leading-relaxed text-slate-500">Gerar agora cria títulos locais. A emissão do boleto bancário continua em Financeiro › Receber. “Gerar depois” preserva a matrícula pendente e permite revisar esta condição.</p>
        </div>

        <footer className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-white p-5 sm:grid-cols-[0.75fr_1fr_1.25fr]">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 disabled:opacity-50">Voltar</button>
          <button type="button" onClick={() => { void submit(false); }} disabled={pending || !preview || previewOutdated || previewQuery.isFetching} className="rounded-xl border border-blue-200 bg-blue-50 py-3 text-[10px] font-black uppercase tracking-wider text-blue-700 disabled:opacity-40">{pending ? 'Salvando...' : pendencia ? 'Atualizar e manter pendente' : 'Vincular e gerar depois'}</button>
          <button type="button" onClick={() => { void submit(true); }} disabled={pending || !preview || previewOutdated || previewQuery.isFetching} className="rounded-xl bg-emerald-600 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/20 disabled:opacity-40">{pending ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Processando...</span> : `Gerar ${preview?.qtdParcelas || ''} boleto${preview?.qtdParcelas === 1 ? '' : 's'} agora`}</button>
        </footer>
      </section>
    </div>
  );
};

export default CondicaoPlanoFinanceiroUnicoModal;
