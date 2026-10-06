import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarRange, FileDown, LoaderCircle, RefreshCw } from 'lucide-react';

import { useCalendarioAulasGradeRealtime } from '../hooks/useCalendarioAulasGradeRealtime';
import {
  useCalendarioAulasTurmasQuery,
  useCalendarioAulasModulosQuery,
  usePrepararCalendarioAulasExportacaoMutation,
} from '../hooks/useCalendarioAulasExportacao';
import {
  applyCalendarioAulasSelection,
  createCalendarioAulasSelection,
  getCalendarioAulasScope,
  getCalendarioAulasSelectionError,
} from '../calendarioAulasSelection';
import {
  CALENDARIO_AULAS_MODALIDADES,
  type CalendarioAulasModalidade,
  type CalendarioAulasPdfDocument,
} from '../types';
import CalendarioAulasPicker from './CalendarioAulasPicker';
import CalendarioAulasTechnicalFilters from './CalendarioAulasTechnicalFilters';
import CalendarioAulasPdfPreview from './CalendarioAulasPdfPreview';

type Feedback = { tone: 'error' | 'info'; message: string };
interface CalendarioAulasExportPanelProps {
  poloId?: string | null;
  mesReferencia: string;
}
const CALENDARIO_MODALIDADES_EXPORT = CALENDARIO_AULAS_MODALIDADES.filter((item) => item.value !== 'EAD');

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message || fallback;
  if (error && typeof error === 'object') {
    const parsed = error as Record<string, unknown>;
    const parts = [
      typeof parsed.message === 'string' ? parsed.message.trim() : '',
      typeof parsed.details === 'string' ? parsed.details.trim() : '',
      typeof parsed.hint === 'string' ? parsed.hint.trim() : '',
      parsed.code ? 'código: ' + String(parsed.code) : '',
      parsed.status ? 'status: ' + String(parsed.status) : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' | ');
  }
  return fallback;
};

const formatMesReferencia = (mesReferencia: string) => {
  const date = new Date(mesReferencia + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? 'mês selecionado'
    : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
};

/** A tela coleta o alcance; conteúdo e ordem do documento vêm da RPC. */
const CalendarioAulasExportPanel: React.FC<CalendarioAulasExportPanelProps> = ({ poloId, mesReferencia }) => {
  const [modalidade, setModalidade] = useState<CalendarioAulasModalidade | ''>('');
  const [turmaId, setTurmaId] = useState('');
  const [selection, setSelection] = useState(createCalendarioAulasSelection);
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<CalendarioAulasPdfDocument | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const turmasQuery = useCalendarioAulasTurmasQuery(poloId, modalidade || null);
  const modulosQuery = useCalendarioAulasModulosQuery(poloId, modalidade || null, turmaId || null);
  const prepararMutation = usePrepararCalendarioAulasExportacaoMutation();
  useCalendarioAulasGradeRealtime(poloId, modalidade || null, turmaId || null);

  const turmas = turmasQuery.data || [];
  const modulos = modulosQuery.data || [];
  const needModulo = modalidade === 'TECNICO';
  const isPreparing = prepararMutation.isPending || isRenderingPdf;
  const selectionError = needModulo ? getCalendarioAulasSelectionError(selection, modulos) : null;
  const scope = needModulo ? getCalendarioAulasScope(selection, modulos) : formatMesReferencia(mesReferencia);
  const canExport = Boolean(poloId && modalidade && turmas.some((turma) => turma.turmaId === turmaId)
    && !turmasQuery.isLoading && !turmasQuery.isError
    && (!needModulo || (!modulosQuery.isLoading && !modulosQuery.isError && !selectionError))
    && !isPreparing);
  const noTurmasForSelection = Boolean(modalidade && !turmasQuery.isLoading && !turmasQuery.isError && !turmas.length);
  const showSelectionError = needModulo && turmaId && !modulosQuery.isLoading && !modulosQuery.isError
    && selection.modoExportacao === 'CRONOLOGICO' && selectionError;

  useEffect(() => {
    setTurmaId('');
    setSelection(createCalendarioAulasSelection());
    setFeedback(null);
    setPreviewDocument(null);
  }, [poloId]);

  const handleModalidadeChange = (value: string) => {
    setModalidade(value as CalendarioAulasModalidade);
    setTurmaId('');
    setSelection(createCalendarioAulasSelection());
    setFeedback(null);
  };
  const handleTurmaChange = (value: string) => {
    setTurmaId(value);
    setSelection(createCalendarioAulasSelection());
    setFeedback(null);
  };

  const handleExport = async () => {
    if (!poloId || !modalidade || !canExport) return;
    setFeedback(null);
    try {
      const payload = await prepararMutation.mutateAsync(applyCalendarioAulasSelection({
        poloId, modalidade, turmaId, mesReferencia,
      }, selection));
      if (payload.status !== 'PRONTO') {
        setFeedback({ tone: 'info', message: payload.mensagem
          || 'Esta turma ainda não possui uma grade de aulas pronta para exportação.' });
        return;
      }
      setIsRenderingPdf(true);
      const { createCalendarioAulasPdf } = await import('../calendarioAulasExportacao.pdf');
      const pdf = await createCalendarioAulasPdf(payload);
      // Prévia, download e impressão reutilizam este mesmo Blob nativo.
      setPreviewDocument(pdf);
      setFeedback({ tone: 'info', message: 'Documento preparado: ' + payload.linhas.length
        + ' aula(s). ' + (payload.documento?.alcance || scope) + '.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error, 'Não foi possível preparar o calendário de aulas.') });
    } finally {
      setIsRenderingPdf(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-white shadow-sm"><CalendarRange size={19} /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Documento acadêmico</p>
              <h2 className="mt-0.5 text-base font-bold text-[#001a33]">Exportar calendário de aulas</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                {needModulo ? selection.modoExportacao === 'MODULO_COMPLETO'
                  ? 'O módulo completo inclui todas as suas aulas, independentemente do mês da agenda.'
                  : 'Reúna os módulos em um único calendário, na ordem de data e horário. O período deste documento é independente do mês da agenda.'
                  : 'O PDF considera somente as aulas de ' + formatMesReferencia(mesReferencia) + '.'}
              </p>
            </div>
          </div>
          <span className="max-w-xl rounded-full border border-blue-100 bg-white px-3 py-1.5 text-[10px] font-semibold text-blue-700">
            {scope} · A4 retrato
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-end sm:p-5">
        <CalendarioAulasPicker
          label="Tipo de curso"
          value={modalidade}
          options={CALENDARIO_MODALIDADES_EXPORT.map((item) => ({ id: item.value, label: item.label }))}
          onChange={handleModalidadeChange}
          placeholder="Selecione"
          disabled={!poloId || isPreparing}
        />
        <CalendarioAulasPicker
          label="Turma"
          value={turmaId}
          options={turmas.map((turma) => ({
            id: turma.turmaId, label: turma.turmaNome, description: turma.turmaCodigo || undefined,
          }))}
          onChange={handleTurmaChange}
          placeholder="Selecione uma turma"
          disabled={!modalidade || !poloId || isPreparing}
          loading={turmasQuery.isLoading}
          error={turmasQuery.isError}
          onRetry={() => void turmasQuery.refetch()}
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[11px] font-semibold uppercase text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPreparing ? <LoaderCircle size={14} className="animate-spin" /> : <FileDown size={14} />}
          {isPreparing ? 'Preparando...' : 'Exportar calendário'}
        </button>
      </div>

      {needModulo ? (
        <CalendarioAulasTechnicalFilters
          selection={selection}
          modulos={modulos}
          onChange={(value) => { setSelection(value); setFeedback(null); }}
          disabled={!turmaId || isPreparing}
          loading={modulosQuery.isLoading}
          error={modulosQuery.isError}
          onRetry={() => void modulosQuery.refetch()}
        />
      ) : null}

      {!poloId ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 sm:mx-5 sm:mb-5">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          Selecione um polo ativo para consultar as turmas autorizadas.
        </div>
      ) : null}
      {turmasQuery.isError || modulosQuery.isError ? (
        <div role="alert" className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 sm:mx-5 sm:mb-5">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{getErrorMessage(turmasQuery.error || modulosQuery.error, 'Não foi possível consultar as opções desta turma.')}</span>
          <button
            type="button"
            onClick={() => void (turmasQuery.isError ? turmasQuery.refetch() : modulosQuery.refetch())}
            className="inline-flex items-center gap-1 font-semibold hover:underline"
          ><RefreshCw size={12} /> Tentar novamente</button>
        </div>
      ) : null}
      {noTurmasForSelection ? (
        <p className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:mx-5 sm:mb-5">
          Nenhuma turma elegível foi retornada para esta modalidade e este polo.
        </p>
      ) : null}
      {needModulo && turmaId && !modulosQuery.isLoading && !modulosQuery.isError && !modulos.length ? (
        <p className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:mx-5 sm:mb-5">
          Esta turma técnica ainda não possui módulos disponíveis para seleção.
        </p>
      ) : null}
      {showSelectionError ? (
        <p role="status" className="mx-4 mb-4 text-xs font-medium text-amber-700 sm:mx-5">{selectionError}</p>
      ) : null}
      {feedback ? (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={'mx-4 mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs sm:mx-5 sm:mb-5 '
            + (feedback.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-800')}
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" />{feedback.message}
        </div>
      ) : null}
      {previewDocument ? (
        <CalendarioAulasPdfPreview document={previewDocument} onClose={() => setPreviewDocument(null)} />
      ) : null}
    </section>
  );
};

export default CalendarioAulasExportPanel;
