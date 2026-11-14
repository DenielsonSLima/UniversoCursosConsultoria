import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, Loader2, Plus } from 'lucide-react';
import { supabase } from '../../../../../../lib/supabase';
import ProfessorDocumentoDialog from './ProfessorDocumentoDialog';
import {
  type ProfessorDocumento,
  type ProfessorDocumentoArquivo,
  type ProfessorDocumentoEnvio,
  professorDocumentosService,
} from './professor-documentos.service';

import ProfessorDocumentoCard from './ProfessorDocumentoCard';
import {
  ProfessorDocumentoCreateForm,
  ProfessorDocumentoReviewForm,
  type ProfessorDocumentoRevisao,
  type ProfessorDocumentoSolicitacao,
} from './ProfessorDocumentoForms';
import {
  professorDocumentButton as button,
  professorDocumentDate as date,
} from './professor-documentos.presentation';

interface Props {
  professorId: string;
  cacheScope?: string;
  toast: { success: (title: string, message?: string) => void };
}
const message = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? ('code' in error && error.code === 'PGRST202' ? 'Os documentos do professor ainda não estão disponíveis neste ambiente.' : String(error.message))
    : 'Não foi possível concluir a operação. Tente novamente.';

const ParceiroProfessorDocumentos: React.FC<Props> = ({ professorId, cacheScope, toast }) => {
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [review, setReview] = useState<ProfessorDocumento | null>(null);
  const [history, setHistory] = useState<ProfessorDocumento | null>(null);
  const [preview, setPreview] = useState<{ file: ProfessorDocumentoArquivo; url: string } | null>(
    null,
  );
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<ProfessorDocumentoEnvio | null>(null);
  const requests = useRef(new Map<string, { signature: string; id: string }>());
  const requestFor = (action: string, payload: unknown) => {
    const signature = JSON.stringify(payload);
    const previous = requests.current.get(action);
    if (previous?.signature === signature) return previous.id;
    const id = crypto.randomUUID();
    requests.current.set(action, { signature, id });
    return id;
  };
  const queryKey = ['gestor-professor-documentos', professorId];
  const query = useQuery({
    queryKey: [...queryKey, cacheScope, offset],
    queryFn: () => professorDocumentosService.listar(professorId, offset),
    enabled: Boolean(cacheScope),
    gcTime: 0,
    staleTime: 0,
    retry: 2,
    refetchOnReconnect: 'always',
  });
  useEffect(() => {
    if (!cacheScope) return undefined;
    const channel = supabase.channel(`professor-documentos:${professorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professor_documentos',
          filter: `professor_id=eq.${professorId}`,
        },
        () =>
          void client.invalidateQueries({ queryKey: ['gestor-professor-documentos', professorId] }),
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') void client.invalidateQueries({ queryKey });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cacheScope, client, professorId]);
  const changed = () => client.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: (payload: ProfessorDocumentoSolicitacao) => {
      return professorDocumentosService.solicitar(
        professorId,
        payload,
        requestFor('solicitar', payload),
      );
    },
    onSuccess: async () => {
      requests.current.delete('solicitar');
      setCreateOpen(false);
      setOffset(0);
      await changed();
      toast.success('Pendência adicionada', 'O documento foi incluído no cadastro do professor.');
    },
    onError: (failure) => setError(message(failure)),
  });
  const upload = useMutation({
    mutationFn: (value: ProfessorDocumentoEnvio) =>
      professorDocumentosService.enviar(professorId, value),
    onSuccess: async () => {
      setPendingUpload(null);
      await changed();
      toast.success('Documento enviado', 'O arquivo está disponível para análise.');
    },
    onError: (failure) => setError(message(failure)),
  });
  const revise = useMutation({
    mutationFn: (value: ProfessorDocumentoRevisao) => {
      if (!review?.arquivoAtualId) throw new Error('Atualize o documento antes de revisar.');
      const payload = {
        documentoId: review.id,
        arquivoId: review.arquivoAtualId,
        ...value,
      };
      return professorDocumentosService.revisar(
        professorId,
        payload,
        requestFor('revisar', payload),
      );
    },
    onSuccess: async () => {
      requests.current.delete('revisar');
      setReview(null);
      await changed();
      toast.success(
        'Análise registrada',
        'A decisão e o histórico do documento foram atualizados.',
      );
    },
    onError: (failure) => setError(message(failure)),
  });
  const openFile = async (file: ProfessorDocumentoArquivo) => {
    setError('');
    setOpeningId(file.id);
    try {
      const url = await professorDocumentosService.visualizar(file);
      setHistory(null);
      setPreview({ file, url });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setOpeningId(null);
    }
  };
  const busy = create.isPending || upload.isPending || revise.isPending;
  const painel = query.data;

  if (!cacheScope) {
    return (
      <p className='py-6 text-slate-600'>
        Não foi possível identificar o acesso para consultar os documentos.
      </p>
    );
  }
  if (query.isPending) {
    return (
      <p className='flex items-center gap-2 py-8 text-slate-500'>
        <Loader2 size={16} className='animate-spin' />Carregando documentos…
      </p>
    );
  }
  if (query.isError || !painel) {
    return (
      <div role='alert' className='rounded-lg border border-red-200 bg-red-50 p-4 text-red-800'>
        <p>{message(query.error)}</p>

      </div>
    );
  }

  return (
    <section className='space-y-4 text-[13px]'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='text-base font-semibold text-[#001a33]'>Documentos do professor</h3>
          <p className='mt-1 text-xs text-slate-600'>
            Adicione as pendências necessárias ao cadastro e acompanhe os envios. PDF ou imagens de
            até 10 MB.
          </p>
        </div>
        <button
          type='button'
          className={button}
          disabled={busy}
          onClick={() => {
            setError('');
            setCreateOpen(true);
          }}
        >
          <Plus size={16} />Adicionar pendência
        </button>
      </header>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[
          ['Documentos', painel.total],
          ['Aguardando envio', painel.pendentes],
          ['Em análise', painel.emAnalise],
          ['Aprovados', painel.aprovados],
        ].map(([label, value]) => (
          <div key={label} className='rounded-lg border border-slate-200 px-3 py-2'>
            <p className='text-xs text-slate-600'>{label}</p>
            <p className='mt-1 text-lg font-semibold text-[#001a33]'>{value}</p>
          </div>
        ))}
      </div>
      {error && (
        <p role='alert' className='rounded-lg border border-red-200 bg-red-50 p-3 text-red-700'>
          {error}
        </p>
      )}
      {pendingUpload && !upload.isPending && (
        <div className='flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3'>
          <span>Envio pendente de conclusão: {pendingUpload.file.name}</span>
          <button
            type='button'
            className={button}
            onClick={() => {
              setError('');
              upload.mutate(pendingUpload);
            }}
          >
            Tentar concluir envio
          </button>
          <button type='button' className={button} onClick={() => setPendingUpload(null)}>
            Fechar aviso
          </button>
        </div>
      )}
      {!painel.total && (
        <div className='rounded-lg border border-dashed border-slate-200 p-8 text-center text-slate-600'>
          <FileText className='mx-auto mb-2 text-slate-400' size={24} />
          <p>Nenhum documento solicitado para este professor.</p>
        </div>
      )}
      <div className='space-y-3'>
        {painel.itens.map((documento) => (
          <ProfessorDocumentoCard
            key={documento.id}
            documento={documento}
            busy={busy}
            openingId={openingId}
            sending={upload.isPending && upload.variables.documentoId === documento.id}
            onOpenFile={(file) => void openFile(file)}
            onUpload={(file) => {
              const value = {
                documentoId: documento.id,
                file,
                reservaRequestId: crypto.randomUUID(),
                confirmarRequestId: crypto.randomUUID(),
              };
              setPendingUpload(value);
              setError('');
              upload.mutate(value);
            }}
            onReview={() => {
              setReview(documento);
              setError('');
            }}
            onHistory={() => setHistory(documento)}
          />
        ))}
      </div>
      {painel.total > 20 && (
        <nav
          aria-label='Páginas dos documentos'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          <span className='text-xs text-slate-600'>
            {offset + 1}–{Math.min(offset + 20, painel.total)} de {painel.total}
          </span>
          <div className='flex gap-2'>
            <button
              type='button'
              className={button}
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 20))}
            >
              Anterior
            </button>
            <button
              type='button'
              className={button}
              disabled={offset + 20 >= painel.total}
              onClick={() => setOffset((value) => value + 20)}
            >
              Próxima
            </button>
          </div>
        </nav>
      )}

      {createOpen && (
        <ProfessorDocumentoCreateForm
          busy={create.isPending}
          error={error}
          onClose={() => setCreateOpen(false)}
          onSubmit={(value) => {
            setError('');
            create.mutate(value);
          }}
        />
      )}
      {review && (
        <ProfessorDocumentoReviewForm
          documento={review}
          busy={revise.isPending}
          error={error}
          onClose={() => setReview(null)}
          onSubmit={(value) => {
            setError('');
            revise.mutate(value);
          }}
        />
      )}
      {history && (
        <ProfessorDocumentoDialog
          title={`Histórico: ${history.nome}`}
          onClose={() => setHistory(null)}
        >
          <div className='space-y-4'>
            <h4 className='font-medium'>Últimos envios</h4>
            {!history.arquivos.length && <p className='text-slate-500'>Nenhum arquivo enviado.</p>}
            {history.arquivos.map((file) => (
              <div
                key={file.id}
                className='flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3'
              >
                <div className='min-w-0'>
                  <p className='break-all'>{file.nome}</p>
                  <p className='mt-1 text-xs text-slate-500'>
                    {date(file.confirmadoEm)}
                    {file.id === history.arquivoAtualId ? ' · Versão atual' : ''}
                  </p>
                </div>
                <button
                  type='button'
                  className={button}
                  disabled={Boolean(openingId)}
                  onClick={() => void openFile(file)}
                >
                  <Eye size={15} />Visualizar
                </button>
              </div>
            ))}
            <h4 className='font-medium'>Últimas movimentações</h4>
            {history.historico.map((event) => (
              <div key={event.id} className='border-l-2 border-slate-200 pl-3'>
                <p className='text-xs text-slate-500'>{date(event.criadoEm)}</p>
                <p className='mt-1'>
                  {event.acao === 'solicitado'
                    ? 'Pendência adicionada'
                    : event.acao === 'enviado'
                    ? 'Arquivo enviado para análise'
                    : event.acao === 'aprovado'
                    ? 'Documento aprovado'
                    : 'Reenvio solicitado'}
                </p>
                {event.observacao && (
                  <p className='mt-1 whitespace-pre-wrap break-words text-slate-600'>
                    {event.observacao}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ProfessorDocumentoDialog>
      )}
      {preview && (
        <ProfessorDocumentoDialog
          title={preview.file.nome}
          wide
          onClose={() => setPreview(null)}
        >
          {preview.file.mimeType === 'application/pdf'
            ? (
              <iframe
                title={`Prévia de ${preview.file.nome}`}
                src={preview.url}
                sandbox='allow-same-origin allow-downloads'
                referrerPolicy='no-referrer'
                className='h-[65dvh] w-full rounded-lg border border-slate-200'
              />
            )
            : (
              <img
                alt={preview.file.nome}
                src={preview.url}
                className='mx-auto max-h-[65dvh] max-w-full object-contain'
              />
            )}
          <a
            className={`${button} mt-3`}
            href={preview.url}
            target='_blank'
            rel='noopener noreferrer'
          >
            Abrir arquivo em outra aba
          </a>
        </ProfessorDocumentoDialog>
      )}
    </section>
  );
};

export default ParceiroProfessorDocumentos;
