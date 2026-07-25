import React from 'react';
import { FileInput, Plus, Trash2 } from 'lucide-react';
import {
  DocumentoAlunoChecklistItem,
  DocumentoAlunoPdfMapeamento,
} from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import { validarMapeamentosPdf } from '../../../../../../shared/documentos-aluno/documentos-aluno.utils';
import DocumentosModalShell from './DocumentosModalShell';

interface PdfUnicoMappingModalProps {
  open: boolean;
  fileName: string;
  fileUrl: string | null;
  totalPaginas: number;
  checklist: DocumentoAlunoChecklistItem[];
  mapeamentos: DocumentoAlunoPdfMapeamento[];
  submitting?: boolean;
  error?: string | null;
  onAddMapping: () => void;
  onRemoveMapping: (mappingId: string) => void;
  onChangeMapping: (mapping: DocumentoAlunoPdfMapeamento) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const PdfUnicoMappingModal: React.FC<PdfUnicoMappingModalProps> = ({
  open,
  fileName,
  fileUrl,
  totalPaginas,
  checklist,
  mapeamentos,
  submitting = false,
  error,
  onAddMapping,
  onRemoveMapping,
  onChangeMapping,
  onSubmit,
  onClose,
}) => {
  const validationErrors = validarMapeamentosPdf(mapeamentos, totalPaginas);
  const hasErrors = Object.keys(validationErrors).length > 0;
  const allChecklistItemsMapped = checklist.length > 0
    && mapeamentos.length === checklist.length;
  const canSubmit = totalPaginas > 0
    && allChecklistItemsMapped
    && !hasErrors
    && !submitting;

  return (
    <DocumentosModalShell
      open={open}
      title="Mapear PDF único"
      eyebrow="Classificação documental"
      description={`${fileName} · ${totalPaginas} ${totalPaginas === 1 ? 'página' : 'páginas'}`}
      size="full"
      closeDisabled={submitting}
      onClose={onClose}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-11 rounded-xl border border-slate-200 px-5 text-[10px] font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="min-h-11 rounded-xl bg-blue-600 px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Salvando mapeamento…' : 'Confirmar mapeamento'}
          </button>
        </div>
      )}
    >
      <div className="grid min-h-[70vh] grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)] xl:p-5">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {fileUrl ? (
            <iframe src={fileUrl} title={`PDF ${fileName}`} className="h-[70vh] w-full border-0" />
          ) : (
            <div className="flex h-[70vh] flex-col items-center justify-center p-8 text-center">
              <FileInput aria-hidden="true" className="text-slate-300" size={36} />
              <p className="mt-3 text-sm font-black text-[#001a33]">Pré-visualização expirada</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Atualize a URL temporária antes de mapear as páginas.</p>
            </div>
          )}
        </div>

        <section aria-labelledby="pdf-mapping-title" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="pdf-mapping-title" className="text-sm font-black text-[#001a33]">Intervalos por documento</h3>
              <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500">
                Relacione cada item às páginas correspondentes. Um item só pode aparecer uma vez.
              </p>
            </div>
            <button
              type="button"
              onClick={onAddMapping}
              disabled={submitting || mapeamentos.length >= checklist.length}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#001a33] px-3 text-[9px] font-black uppercase tracking-wider text-white transition hover:bg-blue-950 disabled:opacity-45"
            >
              <Plus aria-hidden="true" size={13} /> Adicionar
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {mapeamentos.map((mapeamento, index) => {
              const rowError = validationErrors[mapeamento.id];

              return (
                <fieldset key={mapeamento.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <legend className="px-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Documento {index + 1}
                  </legend>
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-end gap-2">
                    <label className="min-w-0 text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Item do checklist
                      <select
                        value={mapeamento.checklistItemId}
                        onChange={(event) => onChangeMapping({
                          ...mapeamento,
                          checklistItemId: event.target.value,
                        })}
                        className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold normal-case tracking-normal text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Selecione</option>
                        {checklist.map((item) => (
                          <option key={item.id} value={item.id}>{item.nome}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Início
                      <input
                        type="number"
                        min={1}
                        max={totalPaginas}
                        value={mapeamento.paginaInicio}
                        onChange={(event) => onChangeMapping({
                          ...mapeamento,
                          paginaInicio: Number(event.target.value),
                        })}
                        className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-xs font-black text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Fim
                      <input
                        type="number"
                        min={mapeamento.paginaInicio || 1}
                        max={totalPaginas}
                        value={mapeamento.paginaFim}
                        onChange={(event) => onChangeMapping({
                          ...mapeamento,
                          paginaFim: Number(event.target.value),
                        })}
                        className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-xs font-black text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remover intervalo ${index + 1}`}
                      onClick={() => onRemoveMapping(mapeamento.id)}
                      disabled={submitting}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-45"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  </div>
                  {rowError ? <p className="mt-2 text-[9px] font-bold text-red-600">{rowError}</p> : null}
                </fieldset>
              );
            })}
          </div>

          {mapeamentos.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs font-medium text-slate-500">
              Adicione o primeiro intervalo para começar o mapeamento.
            </p>
          ) : null}
          {mapeamentos.length > 0 && !allChecklistItemsMapped ? (
            <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] font-bold text-amber-800">
              Mapeie todos os {checklist.length} itens deste lote antes de confirmar.
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-4 text-xs font-bold text-red-600">{error}</p> : null}
        </section>
      </div>
    </DocumentosModalShell>
  );
};

export default PdfUnicoMappingModal;
