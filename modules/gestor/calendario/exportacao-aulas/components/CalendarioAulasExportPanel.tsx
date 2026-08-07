import React, { useState } from 'react';
import {
  AlertCircle,
  CalendarRange,
  ChevronDown,
  FileDown,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';

import {
  useCalendarioAulasGradeRealtime,
} from '../hooks/useCalendarioAulasGradeRealtime';
import {
  useCalendarioAulasTurmasQuery,
  usePrepararCalendarioAulasExportacaoMutation,
} from '../hooks/useCalendarioAulasExportacao';
import {
  CALENDARIO_AULAS_MODALIDADES,
  type CalendarioAulasPdfDocument,
  type CalendarioAulasModalidade,
} from '../types';
import CalendarioAulasPdfPreview from './CalendarioAulasPdfPreview';

type Feedback = {
  tone: 'error' | 'info';
  message: string;
};

interface CalendarioAulasExportPanelProps {
  poloId?: string | null;
}

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

/**
 * Filtro e ação do documento de grade. A seleção é local; turmas e conteúdo
 * impresso sempre vêm de RPCs autorizadas e já preparadas pelo servidor.
 */
const CalendarioAulasExportPanel: React.FC<CalendarioAulasExportPanelProps> = ({ poloId }) => {
  const [modalidade, setModalidade] = useState<CalendarioAulasModalidade | ''>('');
  const [turmaId, setTurmaId] = useState('');
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<CalendarioAulasPdfDocument | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const turmasQuery = useCalendarioAulasTurmasQuery(poloId, modalidade || null);
  const prepararMutation = usePrepararCalendarioAulasExportacaoMutation();
  useCalendarioAulasGradeRealtime(poloId, modalidade || null, turmaId || null);

  const turmas = turmasQuery.data || [];
  const isPreparing = prepararMutation.isPending || isRenderingPdf;
  const canExport = Boolean(poloId && modalidade && turmaId && !isPreparing);

  const handleModalidadeChange = (value: string) => {
    setModalidade(value as CalendarioAulasModalidade | '');
    setTurmaId('');
    setFeedback(null);
  };

  const handleTurmaChange = (value: string) => {
    setTurmaId(value);
    setFeedback(null);
  };

  const handleExport = async () => {
    if (!poloId || !modalidade || !turmaId) return;

    setFeedback(null);
    try {
      const payload = await prepararMutation.mutateAsync({ poloId, modalidade, turmaId });
      if (payload.status !== 'PRONTO') {
        setFeedback({
          tone: 'info',
          message: payload.mensagem
            || 'Esta turma ainda não possui uma grade de aulas pronta para exportação.',
        });
        return;
      }

      setIsRenderingPdf(true);
      const { createCalendarioAulasPdf } = await import('../calendarioAulasExportacao.pdf');
      const pdf = await createCalendarioAulasPdf(payload);
      // A composição ocorre uma única vez. O visualizador abre este mesmo
      // Blob para prévia, download e impressão, sem converter a página.
      setPreviewDocument(pdf);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: getErrorMessage(error, 'Não foi possível preparar o calendário de aulas.'),
      });
    } finally {
      setIsRenderingPdf(false);
    }
  };

  const noTurmasForSelection = Boolean(
    modalidade && !turmasQuery.isLoading && !turmasQuery.isError && turmas.length === 0,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-white shadow-sm">
              <CalendarRange size={19} />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Documento acadêmico</p>
              <h2 className="mt-0.5 text-base font-bold text-[#001a33]">Exportar calendário de aulas</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                Selecione a modalidade e a turma. A grade, a ordem, os horários e a marca-d&apos;água são preparados no servidor.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            A4 retrato
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] lg:items-end sm:p-5">
        <label className="relative block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tipo de curso</span>
          <select
            value={modalidade}
            onChange={(event) => handleModalidadeChange(event.target.value)}
            disabled={!poloId}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Selecione</option>
            {CALENDARIO_AULAS_MODALIDADES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400" />
        </label>

        <label className="relative block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Turma</span>
          <select
            value={turmaId}
            onChange={(event) => handleTurmaChange(event.target.value)}
            disabled={!modalidade || turmasQuery.isLoading || !poloId || noTurmasForSelection}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-xs font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              {turmasQuery.isLoading ? 'Carregando turmas...' : 'Selecione uma turma'}
            </option>
            {turmas.map((turma) => (
              <option key={turma.turmaId} value={turma.turmaId}>
                {turma.turmaCodigo
                  ? `${turma.turmaNome} (${turma.turmaCodigo})`
                  : turma.turmaNome}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute bottom-3 right-3 text-slate-400" />
        </label>

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

      {!poloId ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 sm:mx-5 sm:mb-5">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          Selecione um polo ativo para consultar as turmas autorizadas.
        </div>
      ) : null}

      {turmasQuery.isError ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 sm:mx-5 sm:mb-5">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{getErrorMessage(turmasQuery.error, 'Não foi possível consultar as turmas desta modalidade.')}</span>
          <button type="button" onClick={() => void turmasQuery.refetch()} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RefreshCw size={12} /> Tentar novamente
          </button>
        </div>
      ) : null}

      {noTurmasForSelection ? (
        <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:mx-5 sm:mb-5">
          Nenhuma turma elegível foi retornada para esta modalidade e este polo.
        </div>
      ) : null}

      {feedback ? (
        <div className={`mx-4 mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs sm:mx-5 sm:mb-5 ${
          feedback.tone === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-blue-200 bg-blue-50 text-blue-800'
        }`}>
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {feedback.message}
        </div>
      ) : null}

      {previewDocument ? (
        <CalendarioAulasPdfPreview
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </section>
  );
};

export default CalendarioAulasExportPanel;
