import React, { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import type {
  MatriculaTecnicaFinanceiroRow,
  MatriculaTecnicaOverrideInput,
  MatriculaTecnicaRegra,
} from './matricula-tecnica-financeiro.types';
import {
  createFinanceiroRequestId,
  useRemoverOverrideFinanceiroTecnico,
  useSalvarOverrideFinanceiroTecnico,
} from './hooks/useMatriculaTecnicaFinanceiro';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';
import { isRegraFinanceiraConflict } from './matricula-tecnica-financeiro.service';

interface FinanceiroAlunoOverrideDialogProps {
  row: MatriculaTecnicaFinanceiroRow;
  regraTurma: MatriculaTecnicaRegra;
  turmaId: string;
  onClose: () => void;
}

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
    qtdMensalidades: override.cobranca.mensalidade.quantidade,
    valorMensalidade: override.cobranca.mensalidade.valor,
    cobrarRematricula: override.cobranca.rematricula.habilitada,
    valorRematricula: override.cobranca.rematricula.valor,
    diaVencimento: override.vencimento.diaBase,
    descontoPontualidade: override.encargos.descontoPontualidade,
    jurosAtrasoPercentual: override.encargos.jurosAtrasoPercentual,
    multaAtrasoPercentual: override.encargos.multaAtrasoPercentual,
    aplicarDescontoMatricula: override.aplicacao.matricula.desconto,
    aplicarMultaJurosMatricula: override.aplicacao.matricula.multaJuros,
    aplicarDescontoMensalidade: override.aplicacao.mensalidade.desconto,
    aplicarMultaJurosMensalidade: override.aplicacao.mensalidade.multaJuros,
    aplicarDescontoRematricula: override.aplicacao.rematricula.desconto,
    aplicarMultaJurosRematricula: override.aplicacao.rematricula.multaJuros,
    instrucaoBoleto: override.boleto.instrucao,
  };
};

const BOOLEAN_FIELDS: Array<{
  key: keyof MatriculaTecnicaOverrideInput;
  label: string;
}> = [
  { key: 'cobrarMatricula', label: 'Cobrar matrícula' },
  { key: 'cobrarRematricula', label: 'Cobrar rematrícula' },
  { key: 'aplicarDescontoMatricula', label: 'Desconto na matrícula' },
  { key: 'aplicarMultaJurosMatricula', label: 'Multa/juros na matrícula' },
  { key: 'aplicarDescontoMensalidade', label: 'Desconto nas mensalidades' },
  { key: 'aplicarMultaJurosMensalidade', label: 'Multa/juros nas mensalidades' },
  { key: 'aplicarDescontoRematricula', label: 'Desconto na rematrícula' },
  { key: 'aplicarMultaJurosRematricula', label: 'Multa/juros na rematrícula' },
];

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
  const [baseExpected, setBaseExpected] = useState(() => ({
    expectedTurmaRevisao: regraTurma.identidade.turmaRevisao,
    expectedTurmaFingerprint: regraTurma.identidade.turmaFingerprint,
    expectedOverrideRevisao: row.override?.identidade.revisao ?? 0,
    expectedOverrideFingerprint: row.override?.identidade.fingerprint ?? '',
  }));
  const saveMutation = useSalvarOverrideFinanceiroTecnico();
  const removeMutation = useRemoverOverrideFinanceiroTecnico();
  const saveRequestIds = useRef(new Map<string, string>());
  const removeRequestIds = useRef(new Map<string, string>());
  const pending = saveMutation.isPending || removeMutation.isPending;
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

  const save = async () => {
    if (conflict) return;
    const requestKey = JSON.stringify({ matriculaId: row.matriculaId, baseExpected, form });
    const requestId = saveRequestIds.current.get(requestKey) || createFinanceiroRequestId();
    saveRequestIds.current.set(requestKey, requestId);
    try {
      await saveMutation.mutateAsync({
        turmaId,
        matriculaId: row.matriculaId,
        requestId,
        ...baseExpected,
        override: form,
      });
      saveRequestIds.current.delete(requestKey);
      toast.success('Regra individual salva', 'Os próximos lançamentos usarão a regra efetiva confirmada pelo servidor.');
      onClose();
    } catch (error) {
      if (isRegraFinanceiraConflict(error)) {
        setConflict(true);
        toast.warning('Regra alterada em outra sessão', 'Feche e abra novamente para revisar a versão atual.');
        return;
      }
      toast.error('Regra individual não salva', error instanceof Error ? error.message : 'O servidor não confirmou a alteração.');
    }
  };

  const remove = async () => {
    if (conflict) return;
    const requestKey = JSON.stringify({ matriculaId: row.matriculaId, baseExpected });
    const requestId = removeRequestIds.current.get(requestKey) || createFinanceiroRequestId();
    removeRequestIds.current.set(requestKey, requestId);
    try {
      await removeMutation.mutateAsync({
        turmaId,
        matriculaId: row.matriculaId,
        requestId,
        ...baseExpected,
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
      toast.error('Override não removido', error instanceof Error ? error.message : 'O servidor não confirmou a alteração.');
    }
  };

  const numberField = (
    key: keyof MatriculaTecnicaOverrideInput,
    label: string,
    options?: { max?: number; min?: number; step?: string },
  ) => (
    <label className="space-y-1.5">
      <span className="text-[10px] font-black uppercase text-slate-500">{label}</span>
      <input
        type="number"
        min={options?.min ?? 0}
        max={options?.max}
        step={options?.step ?? '0.01'}
        value={(form[key] as string | number | null) ?? ''}
        placeholder="Herdar da turma"
        onChange={(event) => updateField(key, event.target.value === ''
          ? null
          : (key === 'qtdMensalidades' || key === 'diaVencimento'
            ? Number(event.target.value)
            : event.target.value))}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="override-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Configuração individual</p>
            <h3 id="override-title" className="mt-1 text-xl font-black text-[#001a33]">{row.alunoNome}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Campo vazio herda a regra viva da turma. Zero representa isenção explícita.</p>
          </div>
          <button ref={(node) => { initialFocusRef.current = node; }} type="button" disabled={pending} onClick={onClose} aria-label="Fechar configuração individual" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {numberField('valorMatricula', 'Valor da matrícula')}
          {numberField('valorMensalidade', 'Valor da mensalidade')}
          {numberField('valorRematricula', 'Valor da rematrícula')}
          {numberField('qtdMensalidades', 'Mensalidades por ciclo', { min: 1, max: 60, step: '1' })}
          {numberField('diaVencimento', 'Dia de vencimento', { min: 1, max: 31, step: '1' })}
          {numberField('descontoPontualidade', 'Desconto de pontualidade')}
          {numberField('jurosAtrasoPercentual', 'Juros ao mês (%)')}
          {numberField('multaAtrasoPercentual', 'Multa única (%)', { max: 100 })}
        </div>

        {conflict ? (
          <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">
            A regra da turma ou do aluno mudou em outra sessão. Seu rascunho foi preservado; feche e abra novamente para revisar antes de salvar.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BOOLEAN_FIELDS.map((field) => {
            const value = form[field.key] as boolean | null;
            return (
              <label key={field.key} className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="block text-[9px] font-black uppercase text-slate-600">{field.label}</span>
                <select value={value === null ? '' : String(value)} onChange={(event) => updateField(field.key, event.target.value === '' ? null : event.target.value === 'true')} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold outline-none focus:border-blue-500">
                  <option value="">Herdar da turma</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
            );
          })}
        </div>

        <label className="mt-5 block space-y-1.5">
          <span className="text-[10px] font-black uppercase text-slate-500">Instrução individual do boleto/carnê</span>
          <textarea value={form.instrucaoBoleto ?? ''} maxLength={180} placeholder="Vazio: herdar a instrução da turma" onChange={(event) => updateField('instrucaoBoleto', event.target.value === '' ? null : event.target.value)} className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-blue-500" />
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" disabled={pending || conflict || !row.overrideAtivo} onClick={() => { void remove(); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 px-4 py-3 text-[10px] font-black uppercase text-amber-700 disabled:opacity-40"><RotateCcw size={14} /> Usar regra da turma</button>
          <div className="flex gap-3">
            <button type="button" disabled={pending} onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase text-slate-500">Cancelar</button>
            <button type="button" disabled={pending || conflict} onClick={() => { void save(); }} className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{pending ? <Loader2 className="animate-spin" size={14} /> : null} Salvar</button>
          </div>
        </div>
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default FinanceiroAlunoOverrideDialog;
