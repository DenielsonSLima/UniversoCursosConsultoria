import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Layers, Loader2 } from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import ToastNotification, { useToast } from '../../../../../components/ToastNotification';
import type {
  ElectronicSignatureArchiveCursor,
  ElectronicSignatureArchiveItem,
  ElectronicSignatureArtifactClass,
} from '../../../../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import { electronicSignatureQueryKeys } from '../../../../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import {
  ElectronicSignatureRequestError,
  electronicSignatureService,
} from '../../../../../../shared/assinatura-eletronica/assinatura-eletronica.service';
import {
  clearElectronicSignatureRequestId,
  getOrCreateElectronicSignatureRequestId,
} from '../../../../../../shared/assinatura-eletronica/electronic-signature-request-id';
import DiarioClasse from './DiarioClasse';
import TechnicalDataError from '../TechnicalDataError';
import TurmaDiarioCard from './TurmaDiarioCard';
import { useTurmaDiarios } from './hooks/useTurmaDiarios';
import {
  DiarioExportMode,
  TurmaDiarioDisciplina,
  TurmaDiarioSelection,
} from './turma-diarios.types';

interface TurmaDiariosProps {
  turma: Turma;
  gestorContextId?: string;
}

type SignedDiaryArtifactClass = Exclude<
  ElectronicSignatureArtifactClass,
  'DOCUMENTO_ORIGINAL'
>;

interface OpeningDiaryArtifact {
  artifactClass: SignedDiaryArtifactClass;
  disciplinaId: string;
}

const listSignedDiariesByDiscipline = async (
  turmaId: string,
  contextId: string,
  poloId: string,
) => {
  const byDiscipline = new Map<string, ElectronicSignatureArchiveItem>();
  const visitedCursors = new Set<string>();
  let cursor: ElectronicSignatureArchiveCursor | null = null;

  do {
    const page = await electronicSignatureService.listGestorArchive({
      contextId,
      poloId,
      filters: {
        search: '',
        status: 'ASSINADO',
        documentType: 'diario_classe',
        turmaId,
        finalizedFrom: null,
        finalizedTo: null,
      },
      limit: 100,
      cursor,
    });
    page.items.forEach((item) => {
      if (
        (item.artifacts.final || item.artifacts.receipt)
        && !byDiscipline.has(item.disciplinaId)
      ) {
        byDiscipline.set(item.disciplinaId, item);
      }
    });
    cursor = page.nextCursor;
    if (cursor) {
      const cursorIdentity = `${cursor.finalizedAt}:${cursor.envelopeId}`;
      if (visitedCursors.has(cursorIdentity)) {
        throw new Error('A paginação do acervo de diários não avançou.');
      }
      visitedCursors.add(cursorIdentity);
    }
  } while (cursor);

  return byDiscipline;
};

const signedDiaryErrorMessage = (error: unknown) => {
  if (error instanceof ElectronicSignatureRequestError) return error.message;
  return error instanceof Error
    ? error.message
    : 'O serviço autorizado não liberou o artefato solicitado.';
};

const TurmaDiarios: React.FC<TurmaDiariosProps> = ({ turma, gestorContextId = '' }) => {
  const [selection, setSelection] = useState<TurmaDiarioSelection | null>(null);
  const [openingDiaryArtifact, setOpeningDiaryArtifact] = useState<OpeningDiaryArtifact | null>(
    null,
  );
  const { toasts, removeToast, toast } = useToast();
  const diariosQuery = useTurmaDiarios(turma.id);
  const modules = diariosQuery.data || [];
  const poloId = turma.poloId || '';
  const signedDiariesQuery = useQuery({
    queryKey: [
      ...electronicSignatureQueryKeys.archiveLists('GESTOR', gestorContextId, poloId || null),
      'turma-card-artifacts',
      turma.id,
    ],
    queryFn: () => listSignedDiariesByDiscipline(turma.id, gestorContextId, poloId),
    enabled: Boolean(turma.id && gestorContextId && poloId),
    staleTime: 30_000,
    retry: false,
  });

  const selectDiary = (
    disciplina: TurmaDiarioDisciplina,
    moduloNome: string,
    exportMode?: DiarioExportMode,
  ) => {
    setSelection({ disciplina, moduloNome, exportMode });
  };

  const openSignedDiaryArtifact = async (
    item: ElectronicSignatureArchiveItem,
    artifactClass: SignedDiaryArtifactClass,
  ) => {
    const artifactAvailable = artifactClass === 'DOCUMENTO_FINAL'
      ? item.artifacts.final
      : item.artifacts.receipt;
    if (typeof window === 'undefined' || openingDiaryArtifact || !artifactAvailable) return;
    const isEvidenceReceipt = artifactClass === 'COMPROVANTE_EVIDENCIA';
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = isEvidenceReceipt
        ? 'Autorizando comprovante de evidências…'
        : 'Autorizando diário assinado…';
      previewWindow.document.body.textContent = isEvidenceReceipt
        ? 'Autorizando acesso temporário ao comprovante de evidências…'
        : 'Autorizando acesso temporário ao PDF final…';
    }
    const scope = ['GESTOR', gestorContextId, item.envelopeId, artifactClass] as const;
    setOpeningDiaryArtifact({ artifactClass, disciplinaId: item.disciplinaId });
    try {
      const requestId = getOrCreateElectronicSignatureRequestId(
        'CREATE_ARTIFACT_DOWNLOAD_URL',
        scope,
      );
      const download = await electronicSignatureService.createArtifactDownloadUrl({
        envelopeId: item.envelopeId,
        artifactClass,
        profile: 'GESTOR',
        contextId: gestorContextId,
        requestId,
      });
      clearElectronicSignatureRequestId('CREATE_ARTIFACT_DOWNLOAD_URL', scope);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.replace(download.url);
      } else {
        toast.info(
          'Link temporário autorizado',
          'O navegador bloqueou a nova aba. Use a ação abaixo enquanto o link estiver válido.',
          {
            actionLabel: 'Abrir PDF',
            onAction: () => {
              const fallbackWindow = window.open(download.url, '_blank', 'noopener,noreferrer');
              if (fallbackWindow) fallbackWindow.opener = null;
            },
          },
        );
      }
    } catch (error) {
      previewWindow?.close();
      toast.error(
        isEvidenceReceipt
          ? 'Não foi possível abrir o comprovante'
          : 'Não foi possível abrir o diário assinado',
        signedDiaryErrorMessage(error),
      );
    } finally {
      setOpeningDiaryArtifact(null);
    }
  };

  if (diariosQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="ml-3 font-bold text-slate-500">Carregando diários de classe...</span>
      </div>
    );
  }

  if (diariosQuery.isError) {
    return (
      <TechnicalDataError
        title="Diários não carregados"
        message="A grade foi ocultada para não exibir dados acadêmicos incompletos."
        retrying={diariosQuery.isFetching}
        onRetry={() => { void diariosQuery.refetch(); }}
      />
    );
  }

  if (selection) {
    return (
      <DiarioClasse
        disciplina={selection.disciplina}
        moduloNome={selection.moduloNome}
        turma={turma}
        onBack={() => setSelection(null)}
        initialExportMode={selection.exportMode}
        returnToListOnExportClose={Boolean(selection.exportMode)}
        gestorContextId={gestorContextId}
      />
    );
  }

  return (
    <section>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="mb-7">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Gestão acadêmica</p>
        <h3 className="mt-1 text-xl font-black text-[#001a33]">Diários de classe</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Acompanhe o período, a presença geral e abra a versão preenchida ou manual de cada diário.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center rounded-[2rem] border border-slate-100 bg-white py-20 text-center text-slate-400 shadow-sm">
          <BookOpen size={48} className="mb-4 text-slate-300" />
          <p className="text-sm font-bold">Nenhuma disciplina cadastrada na grade deste curso.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {modules.map((module) => (
            <section key={module.id}>
              <div className="mb-4 flex items-center gap-3 px-1">
                <div className="rounded-lg bg-slate-200/60 p-2 text-slate-500">
                  <Layers size={15} />
                </div>
                <h4 className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                  {module.nome}
                </h4>
                <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-400 ring-1 ring-slate-200">
                  {module.disciplinas.length}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {module.disciplinas.map((disciplina) => {
                  const signedDiary = signedDiariesQuery.data?.get(disciplina.id);
                  return (
                    <TurmaDiarioCard
                      key={disciplina.id}
                      disciplina={disciplina}
                      onOpen={() => selectDiary(disciplina, module.nome)}
                      onOpenPdf={(mode) => selectDiary(disciplina, module.nome, mode)}
                      onOpenSignedPdf={signedDiary?.artifacts.final
                        ? () => {
                          void openSignedDiaryArtifact(signedDiary, 'DOCUMENTO_FINAL');
                        }
                        : undefined}
                      onOpenEvidenceReceipt={signedDiary?.artifacts.receipt
                        ? () => {
                          void openSignedDiaryArtifact(signedDiary, 'COMPROVANTE_EVIDENCIA');
                        }
                        : undefined}
                      signedPdfLoading={
                        openingDiaryArtifact?.disciplinaId === disciplina.id
                        && openingDiaryArtifact.artifactClass === 'DOCUMENTO_FINAL'
                      }
                      evidenceReceiptLoading={
                        openingDiaryArtifact?.disciplinaId === disciplina.id
                        && openingDiaryArtifact.artifactClass === 'COMPROVANTE_EVIDENCIA'
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

export default TurmaDiarios;
