import React, { useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Fingerprint,
  Loader2,
  ReceiptText,
} from 'lucide-react';
import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';
import type { CicloFinanceiroTecnicoManualPreview } from './matricula-tecnica-ciclo-manual.types';
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
  const [dateSource, setDateSource] = useState<'TURMA' | 'INDIVIDUAL'>(
    requiresIndividualDate ? 'INDIVIDUAL' : 'TURMA',
  );
  const [individualDate, setIndividualDate] = useState('');
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
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, pending);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-cycle-title"
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Geração manual</p>
            <h3 id="manual-cycle-title" className="mt-1 text-xl font-black text-[#001a33]">
              Gerar {cycleNumber}º ciclo
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{row.alunoNome} · {row.matriculaExibicao}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase text-slate-600">
            Ciclo {cycleNumber} de {row.cicloManual.cicloMaximo}
          </span>
        </div>

        {row.cicloManual.criterioElegibilidade ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold leading-relaxed text-emerald-800">
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
            <span>Elegibilidade confirmada pelo servidor: {row.cicloManual.criterioElegibilidade}</span>
          </div>
        ) : null}

        {requiresIndividualDate ? (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Data individual obrigatória no 2º ciclo</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-900">
              A data será o vencimento da rematrícula — ou do primeiro item, se ela não for cobrada.
              Quando houver rematrícula, a mensalidade 1 vencerá no mês seguinte.
            </p>
          </div>
        ) : (
          <fieldset className="mt-5">
            <legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vencimentos do aluno</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {([
                ['TURMA', 'Usar datas da turma', 'O servidor aplica o dia-base configurado.'],
                ['INDIVIDUAL', 'Definir primeira data', 'O servidor recalcula todo o cronograma.'],
              ] as const).map(([value, label, description]) => (
                <label key={value} className={`cursor-pointer rounded-2xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                  dateSource === value ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                }`}>
                  <input
                    type="radio"
                    name="manual-cycle-date-source"
                    value={value}
                    checked={dateSource === value}
                    onChange={() => setDateSource(value)}
                    className="sr-only"
                  />
                  <span className="block text-xs font-black text-[#001a33]">{label}</span>
                  <span className="mt-1 block text-[10px] font-semibold text-slate-500">{description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {dateSource === 'INDIVIDUAL' ? (
          <label className="mt-3 block space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-500">
              {requiresIndividualDate ? 'Vencimento da rematrícula / primeiro item' : 'Primeiro vencimento individual'}
            </span>
            <input
              type="date"
              value={individualDate}
              onChange={(event) => setIndividualDate(event.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
            />
          </label>
        ) : null}

        {!previewEnabled ? (
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
            Informe o primeiro vencimento para o servidor montar a prévia.
          </div>
        ) : previewQuery.isLoading || previewQuery.isFetching ? (
          <div className="mt-5 flex items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 py-8 text-sm font-bold text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={18} /> Calculando cronograma no servidor...
          </div>
        ) : previewQuery.isError || !preview ? (
          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><span>Não foi possível validar a prévia. Nenhuma cobrança será criada.</span></div>
            <button type="button" onClick={() => { void previewQuery.refetch(); }} className="mt-3 rounded-lg bg-white px-3 py-2 text-[9px] font-black uppercase text-rose-700">Tentar novamente</button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3"><p className="text-[9px] font-black uppercase text-blue-600">Composição</p><p className="mt-1 text-sm font-black text-blue-950">{preview.quantidadeItens} recebíveis</p></div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-600">Total do ciclo</p><p className="mt-1 text-sm font-black text-emerald-950">{formatMoney(preview.total)}</p></div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3"><p className="text-[9px] font-black uppercase text-violet-600">Primeiro vencimento</p><p className="mt-1 text-sm font-black text-violet-950">{formatDate(preview.primeiroVencimento)}</p></div>
            </div>

            <p className="mt-2 text-[9px] font-semibold text-slate-400">Data de origem do cronograma: {formatDate(preview.dataOrigem)}</p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase text-slate-600"><ReceiptText size={14} /> Itens canônicos</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400"><CalendarDays size={12} /> {preview.sourceVencimento === 'TURMA' ? 'Datas da turma' : 'Datas individuais'}</span>
              </div>
              <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
                {preview.itens.map((item) => (
                  <div key={item.chave} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-xs">
                    <div><p className="font-bold text-slate-700">{item.descricao}</p><p className="mt-0.5 text-[9px] font-black uppercase text-slate-400">Vence em {formatDate(item.vencimento)}</p></div>
                    <span className="font-black text-[#001a33]">{formatMoney(item.valor)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Termos financeiros da regra efetiva</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-emerald-600">Desconto em dia</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{formatMoney(preview.termos.descontoPontualidade)}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-rose-500">Juros ao mês</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{formatPercent(preview.termos.jurosAtrasoPercentual)}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-rose-500">Multa única</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{formatPercent(preview.termos.multaAtrasoPercentual)}</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {appliedTerms.map(([, label, application]) => (
                  <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-slate-600">
                    <span className="font-black text-[#001a33]">{label}</span>
                    <span>Desconto: {application.desconto ? 'aplica' : 'não aplica'} · Multa/juros: {application.multaJuros ? 'aplica' : 'não aplica'}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold leading-relaxed text-slate-600">
                <strong className="text-[#001a33]">Instrução para emissão posterior:</strong>{' '}
                {preview.termos.instrucaoBoleto.trim() || 'Sem instrução adicional.'}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500"><Fingerprint size={13} /> Identidade da prévia</p>
              <dl className="mt-2 space-y-1 font-mono text-[9px] text-slate-500">
                <div><dt className="inline font-bold">Regra: </dt><dd className="inline break-all">{preview.regraEfetivaFingerprint}</dd></div>
                <div><dt className="inline font-bold">Política: </dt><dd className="inline break-all">{preview.politicaFingerprint}</dd></div>
                <div><dt className="inline font-bold">Cronograma: </dt><dd className="inline break-all">{preview.cronogramaFingerprint}</dd></div>
              </dl>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900">
              Esta confirmação criará <strong>{preview.quantidadeItens} recebíveis locais</strong> e <strong>0 boletos Banese</strong>. A emissão bancária continuará manual em Financeiro › A Receber.
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <button
            ref={(node) => { initialFocusRef.current = node; }}
            type="button"
            disabled={pending}
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-[10px] font-black uppercase text-slate-500 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending || !preview || previewQuery.isFetching}
            onClick={() => preview && onConfirm(preview, firstDueDate)}
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-[10px] font-black uppercase text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? 'Gerando ciclo...' : `Criar ${preview?.quantidadeItens || ''} recebíveis locais`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinanceiroCicloManualDialog;
