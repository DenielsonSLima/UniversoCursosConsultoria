import React from 'react';
import { FileStack } from 'lucide-react';
import type { DocumentoAlunoLotePdf } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';

interface DocumentosPendingLotsProps {
  preparingLots: DocumentoAlunoLotePdf[];
  awaitingMappings: DocumentoAlunoLotePdf[];
  cancelledCleanupLots: DocumentoAlunoLotePdf[];
  cancelPending: boolean;
  pagesPending: boolean;
  deletePending: boolean;
  onOpenMapping: (lot: DocumentoAlunoLotePdf) => void;
  onCancelPdf: (lot: DocumentoAlunoLotePdf, reason: string) => void;
  onRetryCleanup: (fileIds: string[]) => void;
}

const DocumentosPendingLots: React.FC<DocumentosPendingLotsProps> = ({
  preparingLots,
  awaitingMappings,
  cancelledCleanupLots,
  cancelPending,
  pagesPending,
  deletePending,
  onOpenMapping,
  onCancelPdf,
  onRetryCleanup,
}) => (
  <>
    {preparingLots.length > 0 ? (
      <section className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-amber-950">
          Envios incompletos
        </h3>
        <p className="mt-1 text-xs font-semibold text-amber-800">
          Estes lotes ainda não foram finalizados. Cancele para liberar o
          checklist e limpar os arquivos reservados.
        </p>
        <div className="mt-4 space-y-2">
          {preparingLots.map((lot) => (
            <div
              key={lot.id}
              className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-[#001a33]">
                  {lot.arquivos[0]?.nome || 'Envio sem arquivo confirmado'}
                </p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  {lot.modo === 'pdf_unico' ? 'PDF consolidado' : 'Documentos separados'}
                </p>
              </div>
              <button
                type="button"
                disabled={cancelPending}
                onClick={() => {
                  const reason = window.prompt(
                    'Informe o motivo do cancelamento deste envio incompleto:',
                  )?.trim();
                  if (reason) onCancelPdf(lot, reason);
                }}
                className="min-h-10 rounded-xl bg-amber-700 px-4 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"
              >
                Cancelar e limpar
              </button>
            </div>
          ))}
        </div>
      </section>
    ) : null}

    {awaitingMappings.length > 0 ? (
      <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <FileStack className="mt-0.5 shrink-0 text-blue-700" size={20} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black uppercase tracking-wide text-blue-950">
              PDFs aguardando organização
            </h3>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-800">
              Informe o total de páginas e associe cada intervalo ao item correto do checklist.
            </p>
            <div className="mt-4 space-y-2">
              {awaitingMappings.map((lot) => (
                <div
                  key={lot.id}
                  className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-[#001a33]">
                      {lot.arquivos[0]?.nome || 'PDF consolidado'}
                    </p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {lot.documentoIds.length} itens disponíveis para mapeamento
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pagesPending}
                      onClick={() => onOpenMapping(lot)}
                      className="min-h-10 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      Mapear páginas
                    </button>
                    <button
                      type="button"
                      disabled={cancelPending}
                      onClick={() => {
                        const reason = window.prompt(
                          'Informe por que este PDF deve ser recusado e removido:',
                        )?.trim();
                        if (reason) onCancelPdf(lot, reason);
                      }}
                      className="min-h-10 rounded-xl border border-red-100 bg-red-50 px-4 text-[10px] font-black uppercase tracking-wider text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      Recusar PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    ) : null}

    {cancelledCleanupLots.length > 0 ? (
      <section className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-amber-950">
          Limpezas administrativas pendentes
        </h3>
        <p className="mt-1 text-xs font-semibold text-amber-800">
          O lote já foi cancelado; tente novamente a exclusão física dos arquivos.
        </p>
        <div className="mt-4 space-y-2">
          {cancelledCleanupLots.map((lot) => {
            const pendingIds = lot.arquivos
              .filter((file) => file.status !== 'excluido')
              .map((file) => file.id);
            return (
              <div
                key={lot.id}
                className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="truncate text-xs font-black text-[#001a33]">
                  {lot.arquivos[0]?.nome || 'PDF cancelado'}
                </p>
                <button
                  type="button"
                  disabled={deletePending}
                  onClick={() => onRetryCleanup(pendingIds)}
                  className="min-h-10 rounded-xl bg-amber-700 px-4 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  Tentar limpeza novamente
                </button>
              </div>
            );
          })}
        </div>
      </section>
    ) : null}
  </>
);

export default DocumentosPendingLots;
