import React from 'react';
import { Check, Eye, History, Loader2, Upload } from 'lucide-react';
import {
  PROFESSOR_DOCUMENT_ACCEPT,
  PROFESSOR_DOCUMENT_CATEGORIES,
  type ProfessorDocumento,
  type ProfessorDocumentoArquivo,
} from './professor-documentos.service';
import {
  professorDocumentButton as button,
  professorDocumentDate as date,
  professorDocumentStatuses,
} from './professor-documentos.presentation';

interface Props {
  documento: ProfessorDocumento;
  busy: boolean;
  sending: boolean;
  openingId: string | null;
  onOpenFile: (file: ProfessorDocumentoArquivo) => void;
  onUpload: (file: File) => void;
  onReview: () => void;
  onHistory: () => void;
}

const ProfessorDocumentoCard: React.FC<Props> = ({
  documento,
  busy,
  sending,
  openingId,
  onOpenFile,
  onUpload,
  onReview,
  onHistory,
}) => {
  const current = documento.arquivos.find((file) => file.id === documento.arquivoAtualId);
  const status = professorDocumentStatuses[documento.status];
  return (
    <article className='rounded-xl border border-slate-200 p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <h4 className='break-words font-semibold text-[#001a33]'>{documento.nome}</h4>
            <span className={`rounded-md px-2 py-1 text-xs ${status.color}`}>{status.label}</span>
          </div>
          <p className='mt-1 text-xs text-slate-500'>
            {PROFESSOR_DOCUMENT_CATEGORIES.find((item) => item.value === documento.categoria)
              ?.label}
            {' · Atualizado em '}
            {date(documento.atualizadoEm)}
          </p>
          {documento.instrucao && (
            <p className='mt-2 whitespace-pre-wrap break-words text-slate-600'>
              {documento.instrucao}
            </p>
          )}
          {documento.observacaoRevisao && (
            <p className='mt-2 whitespace-pre-wrap break-words text-slate-700'>
              Análise: {documento.observacaoRevisao}
            </p>
          )}
          {current && (
            <p className='mt-2 break-all text-xs text-slate-600'>
              {current.nome}
              {' · '}
              {(current.tamanho / 1024 / 1024).toLocaleString('pt-BR', {
                maximumFractionDigits: 2,
              })} MB
            </p>
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          {current && (
            <button
              type='button'
              className={button}
              disabled={Boolean(openingId)}
              onClick={() => onOpenFile(current)}
            >
              {openingId === current.id
                ? <Loader2 size={15} className='animate-spin' />
                : <Eye size={15} />}
              Visualizar
            </button>
          )}
          <label
            className={`${button} ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
          >
            {sending ? <Loader2 size={15} className='animate-spin' /> : <Upload size={15} />}
            {current ? 'Novo envio' : 'Enviar arquivo'}
            <input
              type='file'
              className='sr-only'
              accept={PROFESSOR_DOCUMENT_ACCEPT}
              disabled={busy}
              aria-label={`Enviar arquivo: ${documento.nome}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onUpload(file);
              }}
            />
          </label>
          {documento.status === 'em_analise' && (
            <button type='button' className={button} disabled={busy} onClick={onReview}>
              <Check size={15} />Revisar
            </button>
          )}
          <button type='button' className={button} onClick={onHistory}>
            <History size={15} />Histórico
          </button>
        </div>
      </div>
    </article>
  );
};

export default ProfessorDocumentoCard;
