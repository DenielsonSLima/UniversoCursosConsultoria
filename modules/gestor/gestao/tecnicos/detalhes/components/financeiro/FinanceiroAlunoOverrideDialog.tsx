import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, LockKeyhole, RotateCcw, X } from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import type {
  CondicaoIndividualMotivo,
  MatriculaTecnicaFinanceiroRow,
  MatriculaTecnicaOverrideInput,
  MatriculaTecnicaRegra,
} from './matricula-tecnica-financeiro.types';
import {
  createFinanceiroRequestId,
  useRemoverOverrideFinanceiroTecnico,
  useSalvarOverrideFinanceiroTecnico,
} from './hooks/useMatriculaTecnicaFinanceiro';
import {
  useTechnicalConditionCodeStatus,
  useValidateTechnicalConditionCode,
} from './hooks/useTechnicalConditionAuthorization';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';
import { isRegraFinanceiraConflict } from './matricula-tecnica-financeiro.service';

interface FinanceiroAlunoOverrideDialogProps {
  row: MatriculaTecnicaFinanceiroRow;
  regraTurma: MatriculaTecnicaRegra;
  turmaId: string;
  onClose: () => void;
}

const MOTIVO_LABELS: Record<CondicaoIndividualMotivo, string> = {
  BOLSA: 'Bolsa parcial',
  CONVENIO: 'Convênio',
  INCENTIVO: 'Incentivo',
  NEGOCIACAO: 'Negociação autorizada',
  OUTRO: 'Outro',
};

const formatMoney = (value: string | number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0);

const parseCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? (Number(digits) / 100).toFixed(2) : '0.00';
};

const emptyOverride = (): MatriculaTecnicaOverrideInput => ({
  cobrarMatricula: null,
  valorMatricula: null,
  qtdMensalidades: null,
  valorMensalidade: null,
  cobrarRematricula: null,
  valorRematricula: null,
  diaVencimento: null,
  descontoPontualidade: null,
  jurosAtrasoPercentual: null,
  multaAtrasoPercentual: null,
  aplicarDescontoMatricula: null,
  aplicarMultaJurosMatricula: null,
  aplicarDescontoMensalidade: null,
  aplicarMultaJurosMensalidade: null,
  aplicarDescontoRematricula: null,
  aplicarMultaJurosRematricula: null,
  instrucaoBoleto: null,
});

const overrideToInput = (row: MatriculaTecnicaFinanceiroRow): MatriculaTecnicaOverrideInput => {
  const override = row.override;
  if (!override?.ativo) return emptyOverride();
  return {
    cobrarMatricula: override.cobranca.matricula.habilitada,
    valorMatricula: override.cobranca.matricula.valor,
    qtdMensalidades: null,
    valorMensalidade: override.cobranca.mensalidade.valor,
    cobrarRematricula: null,
    valorRematricula: override.cobranca.rematricula.valor,
    diaVencimento: null,
    descontoPontualidade: override.encargos.descontoPontualidade,
    jurosAtrasoPercentual: null,
    multaAtrasoPercentual: null,
    aplicarDescontoMatricula: null,
    aplicarMultaJurosMatricula: null,
    aplicarDescontoMensalidade: null,
    aplicarMultaJurosMensalidade: null,
    aplicarDescontoRematricula: null,
    aplicarMultaJurosRematricula: null,
    instrucaoBoleto: null,
  };
};

const FinanceiroAlunoOverrideDialog: React.FC<FinanceiroAlunoOverrideDialogProps> = ({
  row,
  regraTurma,
  turmaId,
  onClose,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const [form, setForm] = useState<MatriculaTecnicaOverrideInput>(() => overrideToInput(row));
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoAutorizado, setCodigoAutorizado] = useState(false);
  const [motivo, setMotivo] = useState<CondicaoIndividualMotivo>('BOLSA');
  const [justificativa, setJustificativa] = useState('');
  const [authorizationError, setAuthorizationError] = useState('');
  const [baseExpected, setBaseExpected] = useState(() => ({
    expectedTurmaRevisao: regraTurma.identidade.turmaRevisao,
    expectedTurmaFingerprint: regraTurma.identidade.turmaFingerprint,
    expectedOverrideRevisao: row.override?.identidade.revisao ?? 0,
    expectedOverrideFingerprint: row.override?.identidade.fingerprint ?? '',
  }));
  const saveMutation = useSalvarOverrideFinanceiroTecnico();
  const removeMutation = useRemoverOverrideFinanceiroTecnico();
  const validateCodeMutation = useValidateTechnicalConditionCode();
  const codeStatusQuery = useTechnicalConditionCodeStatus(turmaId);
  const saveRequestIds = useRef(new Map<string, string>());
  const removeRequestIds = useRef(new Map<string, string>());
  const pending = saveMutation.isPending || removeMutation.isPending || validateCodeMutation.isPending;
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);

  useEffect(() => {
    const nextExpected = {
      expectedTurmaRevisao: regraTurma.identidade.turmaRevisao,
      expectedTurmaFingerprint: regraTurma.identidade.turmaFingerprint,
      expectedOverrideRevisao: row.override?.identidade.revisao ?? 0,
      expectedOverrideFingerprint: row.override?.identidade.fingerprint ?? '',
    };
    const changed = JSON.stringify(nextExpected) !== JSON.stringify(baseExpected);
    if (!changed) return;
    if (dirty) {
      setConflict(true);
      return;
    }
    setForm(overrideToInput(row));
    setBaseExpected(nextExpected);
  }, [baseExpected, dirty, regraTurma, row]);

  const updateField = <Key extends keyof MatriculaTecnicaOverrideInput>(
    key: Key,
    value: MatriculaTecnicaOverrideInput[Key],
  ) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const authorize = async () => {
    if (!codigo.trim()) {
      setAuthorizationError('Digite o código de autorização.');
      return;
    }
    if (motivo === 'OUTRO' && justificativa.trim().length < 5) {
      setAuthorizationError('Descreva o motivo da condição individual.');
      return;
    }
    try {
      const result = await validateCodeMutation.mutateAsync({
        turmaId,
        alunoId: row.alunoId,
        codigo,
        motivo,
        justificativa: justificativa.trim() || null,
      });
      if (!result.autorizado) {
        setCodigoAutorizado(false);
        setAuthorizationError(result.motivo === 'BLOQUEADO'
          ? 'Muitas tentativas. Aguarde o período de bloqueio.'
          : result.motivo === 'NAO_CONFIGURADO'
            ? 'A turma não possui código de autorização configurado.'
            : `Código não aceito.${result.tentativasRestantes == null ? '' : ` Restam ${result.tentativasRestantes} tentativa(s).`}`);
        return;
      }
      setCodigoAutorizado(true);
      setAuthorizationError('');
    } catch (error) {
      setCodigoAutorizado(false);
      setAuthorizationError(error instanceof Error ? error.message : 'Não foi possível validar o código.');
    }
  };

  const save = async () => {
    if (conflict || !codigoAutorizado) return;
    const monthlyValue = Number(form.valorMensalidade ?? regraTurma.valorMensalidade);
    const onTimeDiscount = Number(form.descontoPontualidade ?? regraTurma.encargos.descontoPontualidade);
    if (monthlyValue <= 0) {
      setAuthorizationError('A mensalidade individual deve ser maior que zero.');
      return;
    }
    if (onTimeDiscount < 0 || onTimeDiscount >= monthlyValue) {
      setAuthorizationError('O desconto por pagamento em dia deve ser menor que a mensalidade.');
      return;
    }
    if (
      Number(form.valorMatricula ?? regraTurma.valorMatricula) > Number(regraTurma.valorMatricula)
      || monthlyValue > Number(regraTurma.valorMensalidade)
      || Number(form.valorRematricula ?? regraTurma.valorRematricula) > Number(regraTurma.valorRematricula)
      || onTimeDiscount < Number(regraTurma.encargos.descontoPontualidade)
    ) {
      setAuthorizationError('A condição individual deve reduzir valores ou aumentar o desconto em relação à turma.');
      return;
    }
    const requestKey = JSON.stringify({
      matriculaId: row.matriculaId,
      baseExpected,
      form,
      motivo,
      justificativa: justificativa.trim(),
    });
    const requestId = saveRequestIds.current.get(requestKey) || createFinanceiroRequestId();
    saveRequestIds.current.set(requestKey, requestId);
    try {
      await saveMutation.mutateAsync({
        turmaId,
        matriculaId: row.matriculaId,
        requestId,
        ...baseExpected,
        override: form,
        codigoAutorizacao: codigo,
        motivo,
        justificativa: justificativa.trim() || null,
      });
      saveRequestIds.current.delete(requestKey);
      toast.success('Condição individual salva', 'Os próximos lançamentos usarão os valores autorizados e confirmados pelo servidor.');
      onClose();
    } catch (error) {
      if (isRegraFinanceiraConflict(error)) {
        setConflict(true);
        toast.warning('Regra alterada em outra sessão', 'Feche e abra novamente para revisar a versão atual.');
        return;
      }
      toast.error('Condição individual não salva', error instanceof Error ? error.message : 'O servidor não confirmou a alteração.');
    }
  };

  const remove = async () => {
    if (conflict || !codigoAutorizado) return;
    const requestKey = JSON.stringify({
      matriculaId: row.matriculaId,
      baseExpected,
      motivo,
      justificativa: justificativa.trim(),
    });
    const requestId = removeRequestIds.current.get(requestKey) || createFinanceiroRequestId();
    removeRequestIds.current.set(requestKey, requestId);
    try {
      await removeMutation.mutateAsync({
        turmaId,
        matriculaId: row.matriculaId,
        requestId,
        ...baseExpected,
        codigoAutorizacao: codigo,
        motivo,
        justificativa: justificativa.trim() || null,
      });
      removeRequestIds.current.delete(requestKey);
      toast.success('Regra da turma restaurada', 'O aluno voltou a herdar os parâmetros vigentes da turma.');
      onClose();
    } catch (error) {
      if (isRegraFinanceiraConflict(error)) {
        setConflict(true);
        toast.warning('Regra alterada em outra sessão', 'Feche e abra novamente para revisar a versão atual.');
        return;
      }
      toast.error('Condição não removida', error instanceof Error ? error.message : 'O servidor não confirmou a alteração.');
    }
  };

  const effectiveValue = (key: 'valorMatricula' | 'valorMensalidade' | 'valorRematricula' | 'descontoPontualidade') => {
    if (form[key] != null) return form[key] as string;
    if (key === 'valorMatricula') return regraTurma.valorMatricula;
    if (key === 'valorMensalidade') return regraTurma.valorMensalidade;
    if (key === 'valorRematricula') return regraTurma.valorRematricula;
    return regraTurma.encargos.descontoPontualidade;
  };

  const currencyField = (
    key: 'valorMatricula' | 'valorMensalidade' | 'valorRematricula' | 'descontoPontualidade',
    label: string,
    classValue: string,
    disabled = false,
  ) => (
    <label className="space-y-1.5">
      <span className="text-[10px] font-black uppercase text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={formatMoney(effectiveValue(key))}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => updateField(key, parseCurrencyInput(event.target.value))}
        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-violet-500 disabled:bg-slate-100"
      />
      <span className="block text-[9px] font-semibold text-slate-400">Turma: {formatMoney(classValue)}</span>
    </label>
  );

  const cobrarMatricula = form.cobrarMatricula ?? regraTurma.cobranca.matricula.habilitada;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="override-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Condição financeira individual</p>
            <h3 id="override-title" className="mt-1 text-xl font-black text-[#001a33]">{row.alunoNome}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">O código autoriza bolsa, incentivo ou negociação. Ele não altera ciclos, juros, multa ou vencimento.</p>
          </div>
          <button ref={(node) => { initialFocusRef.current = node; }} type="button" disabled={pending} onClick={onClose} aria-label="Fechar condição individual" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
          {codeStatusQuery.isError ? <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">Não foi possível consultar a proteção da turma. <button type="button" onClick={() => { void codeStatusQuery.refetch(); }} className="underline">Tentar novamente</button>.</div> : !codeStatusQuery.isLoading && !codeStatusQuery.data?.configurado ? <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">Defina o código em Configurações da turma antes de aplicar uma condição individual.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-violet-700">Motivo</span><select value={motivo} onChange={(event) => { setMotivo(event.target.value as CondicaoIndividualMotivo); setCodigoAutorizado(false); }} className="w-full rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-violet-500">{Object.entries(MOTIVO_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1.5"><span className="text-[9px] font-black uppercase text-violet-700">Código de autorização</span><div className="flex gap-2"><input type="password" autoComplete="off" value={codigo} onChange={(event) => { setCodigo(event.target.value); setCodigoAutorizado(false); setAuthorizationError(''); }} className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-violet-500" /><button type="button" disabled={pending || codeStatusQuery.isError || !codeStatusQuery.data?.configurado} onClick={() => { void authorize(); }} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 text-[10px] font-black uppercase text-white disabled:opacity-50">{validateCodeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Validar</button></div></label>
          </div>
          <label className="mt-3 block space-y-1.5"><span className="text-[9px] font-black uppercase text-violet-700">Justificativa {motivo === 'OUTRO' ? '(obrigatória)' : '(opcional)'}</span><input value={justificativa} maxLength={300} onChange={(event) => { setJustificativa(event.target.value); setCodigoAutorizado(false); }} placeholder="Ex.: bolsa institucional de 30%" className="w-full rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-violet-500" /></label>
          {authorizationError ? <p role="alert" className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">{authorizationError}</p> : null}
        </div>

        {codigoAutorizado ? (
          <div className="mt-6">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-700"><CheckCircle2 size={15} /> Código validado · valores liberados</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>{currencyField('valorMatricula', 'Matrícula individual', regraTurma.valorMatricula, !cobrarMatricula)}<label className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={!cobrarMatricula} onChange={(event) => updateField('cobrarMatricula', !event.target.checked)} /> Isentar matrícula</label></div>
              {currencyField('valorMensalidade', 'Mensalidade individual', regraTurma.valorMensalidade)}
              <div>{currencyField('valorRematricula', 'Rematrícula individual', regraTurma.valorRematricula, !regraTurma.cobranca.rematricula.habilitada)}<span className="mt-2 block text-[9px] font-semibold text-slate-400">Pode reduzir o valor; a rematrícula mantém o segundo ciclo.</span></div>
              <div className="sm:col-span-2">{currencyField('descontoPontualidade', 'Desconto adicional pagando em dia', regraTurma.encargos.descontoPontualidade)}</div>
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[10px] font-bold text-slate-600"><LockKeyhole size={15} /> Mensalidades por ciclo, vencimento, juros e multa permanecem iguais aos da turma.</p>
          </div>
        ) : <div className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-600"><LockKeyhole size={16} /> Valide o código para visualizar e editar a condição deste aluno.</div>}

        {conflict ? <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">A regra mudou em outra sessão. Seu rascunho foi preservado; feche e abra novamente antes de salvar.</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" disabled={pending || conflict || !codigoAutorizado || !row.overrideAtivo} onClick={() => { void remove(); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 px-4 py-3 text-[10px] font-black uppercase text-amber-700 disabled:opacity-40"><RotateCcw size={14} /> Restaurar regra da turma</button>
          <div className="flex gap-3"><button type="button" disabled={pending} onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase text-slate-500">Cancelar</button><button type="button" disabled={pending || conflict || !codigoAutorizado} onClick={() => { void save(); }} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{saveMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : null} Salvar condição</button></div>
        </div>
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default FinanceiroAlunoOverrideDialog;
