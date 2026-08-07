import React, { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type {
  DocumentoAlunoArquivo,
  DocumentoAlunoModoEnvio,
  DocumentoAlunoPainel,
} from '../../shared/documentos-aluno/documentos-aluno.types';
import { documentosAlunoV2Service } from '../../shared/documentos-aluno/documentos-aluno.service';
import {
  DocumentoEnvioModoSelector,
  DocumentoEnvioOrientacoes,
  DocumentoSeparadoCard,
  DocumentoVersoesHistorico,
  PdfUnicoStatusCard,
  PdfUnicoUploader,
} from './documentos';

interface PerfilDocumentosTabProps {
  painel: DocumentoAlunoPainel;
  uploadingKey?: string | null;
  cancellingLotId?: string | null;
  onUploadSeparado: (documentoId: string, files: File[]) => Promise<unknown>;
  onUploadPdf: (file: File) => Promise<unknown>;
  onCancelLote: (
    loteId: string,
    arquivos: Array<{ bucket: string; path: string }>,
  ) => Promise<unknown>;
}

const PerfilDocumentosTab: React.FC<PerfilDocumentosTabProps> = ({
  painel,
  uploadingKey = null,
  cancellingLotId = null,
  onUploadSeparado,
  onUploadPdf,
  onCancelLote,
}) => {
  const [mode, setMode] = useState<DocumentoAlunoModoEnvio>('separado');
  const [selectedByDocument, setSelectedByDocument] = useState<Record<string, File[]>>({});
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [errorsByDocument, setErrorsByDocument] = useState<Record<string, string | null>>({});
  const [pdfError, setPdfError] = useState<string | null>(null);

  const openLots = useMemo(
    () => painel.lotesPdf.filter((lote) =>
      ['preparando', 'aguardando_mapeamento'].includes(lote.status)),
    [painel.lotesPdf],
  );
  const pdfLots = useMemo(
    () => painel.lotesPdf.filter((lote) => lote.modo === 'pdf_unico'),
    [painel.lotesPdf],
  );
  const separatePreparingLots = useMemo(
    () => painel.lotesPdf.filter((lote) =>
      lote.modo === 'separado' && lote.status === 'preparando'),
    [painel.lotesPdf],
  );
  const pdfPending = pdfLots.some((lote) =>
    ['preparando', 'aguardando_mapeamento'].includes(lote.status));
  const pendingDocumentIds = useMemo(
    () => new Set(
      openLots.flatMap((lote) => lote.documentoIds),
    ),
    [openLots],
  );
  const eligibleItems = useMemo(
    () => painel.itens.filter((item) =>
      ['nao_enviado', 'recusado'].includes(item.status)
      && !pendingDocumentIds.has(item.id)),
    [painel.itens, pendingDocumentIds],
  );

  const openFile = async (arquivo: DocumentoAlunoArquivo) => {
    const signed = await documentosAlunoV2Service.getArquivoUrl(arquivo);
    if (signed.url) window.open(signed.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2.5rem]">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <FileText className="text-blue-600" size={18} />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">
            Documentação Escolar
          </h3>
        </div>

        <div className="mt-5">
          <DocumentoEnvioModoSelector
            value={mode}
            onChange={setMode}
            disabled={Boolean(uploadingKey)}
          />
        </div>

        {mode === 'separado' ? (
          <div className="mt-5 space-y-4">
            {separatePreparingLots.map((lote) => (
              <PdfUnicoStatusCard
                key={lote.id}
                title="Envio separado incompleto"
                cancelling={cancellingLotId === lote.id}
                envio={{
                  id: lote.id,
                  status: 'preparando',
                  arquivos: lote.arquivos,
                  criadoEm: lote.criadoEm,
                  finalizadoEm: lote.finalizadoEm,
                }}
                onOpenArquivo={(arquivo) => void openFile(arquivo)}
                onCancel={() => void onCancelLote(lote.id, lote.arquivos)}
              />
            ))}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {painel.itens.map((documento) => {
                const selectedFiles = selectedByDocument[documento.id] || [];
                const uploading = uploadingKey === documento.id;
                return (
                  <DocumentoSeparadoCard
                    key={documento.id}
                    documento={documento}
                    selectedFiles={selectedFiles}
                    uploading={uploading}
                    canSubmit={
                      ['nao_enviado', 'recusado'].includes(documento.status)
                      && !pendingDocumentIds.has(documento.id)
                    }
                    blockReason={
                      pendingDocumentIds.has(documento.id)
                        ? 'Este item já faz parte de um envio em andamento.'
                        : null
                    }
                    error={errorsByDocument[documento.id]}
                    onFilesSelected={(documentoId, incoming) => {
                      setErrorsByDocument((current) => ({ ...current, [documentoId]: null }));
                      setSelectedByDocument((current) => {
                        const unique = new Map<string, File>();
                        for (const file of [...(current[documentoId] || []), ...incoming]) {
                          unique.set(`${file.name}:${file.size}:${file.lastModified}`, file);
                        }
                        return {
                          ...current,
                          [documentoId]: [...unique.values()].slice(0, 5),
                        };
                      });
                    }}
                    onRemoveSelectedFile={(documentoId, index) => {
                      setSelectedByDocument((current) => ({
                        ...current,
                        [documentoId]: (current[documentoId] || []).filter(
                          (_file, fileIndex) => fileIndex !== index,
                        ),
                      }));
                    }}
                    onSubmit={async (documentoId) => {
                      const files = selectedByDocument[documentoId] || [];
                      try {
                        await onUploadSeparado(documentoId, files);
                        setSelectedByDocument((current) => ({ ...current, [documentoId]: [] }));
                      } catch (error) {
                        setErrorsByDocument((current) => ({
                          ...current,
                          [documentoId]: error instanceof Error
                            ? error.message
                            : 'Não foi possível enviar este documento.',
                        }));
                      }
                    }}
                    onOpenArquivo={(arquivo) => void openFile(arquivo)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <PdfUnicoUploader
              selectedFile={selectedPdf}
              uploading={uploadingKey === 'pdf_unico'}
              disabled={pdfPending || eligibleItems.length === 0}
              error={pdfError}
              blockReason={
                pdfPending
                  ? 'Já existe um PDF aguardando organização da secretaria.'
                  : eligibleItems.length === 0
                    ? 'Todos os documentos estão bloqueados ou aprovados.'
                    : null
              }
              onFileSelected={(file) => {
                setPdfError(null);
                setSelectedPdf(file);
              }}
              onSubmit={async () => {
                if (!selectedPdf) return;
                try {
                  await onUploadPdf(selectedPdf);
                  setSelectedPdf(null);
                } catch (error) {
                  setPdfError(
                    error instanceof Error ? error.message : 'Não foi possível enviar o PDF.',
                  );
                }
              }}
            />

            {pdfLots.map((lote) => (
              <PdfUnicoStatusCard
                key={lote.id}
                cancelling={cancellingLotId === lote.id}
                envio={{
                  id: lote.id,
                  status: lote.status === 'aguardando_mapeamento'
                    ? 'aguardando_mapeamento'
                    : lote.status === 'arquivado'
                      ? 'arquivado'
                      : lote.status === 'preparando'
                        ? 'preparando'
                        : 'mapeado',
                  arquivos: lote.arquivos,
                  criadoEm: lote.criadoEm,
                  finalizadoEm: lote.finalizadoEm,
                }}
                onOpenArquivo={(arquivo) => void openFile(arquivo)}
                onCancel={lote.status === 'preparando'
                  ? () => void onCancelLote(lote.id, lote.arquivos)
                  : undefined}
              />
            ))}
          </div>
        )}

        {painel.itens.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-medium text-slate-500">
            O checklist de documentos ainda não foi disponibilizado pela secretaria.
          </p>
        ) : null}
      </section>

      <DocumentoEnvioOrientacoes />

      {painel.itens
        .filter((item) => item.versoes.length > 0)
        .map((item) => (
          <DocumentoVersoesHistorico
            key={item.id}
            versions={item.versoes}
            currentVersionId={item.versaoAtual?.id}
            onOpenArquivo={(arquivo) => void openFile(arquivo)}
          />
        ))}
    </div>
  );
};

export default PerfilDocumentosTab;
