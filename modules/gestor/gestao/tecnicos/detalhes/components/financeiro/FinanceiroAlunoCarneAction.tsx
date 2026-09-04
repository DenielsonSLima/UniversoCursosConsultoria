import { useEffect, useRef, useState } from 'react';
import { Loader2, NotebookTabs } from 'lucide-react';
import CarnesDocumentPreviewModal from '../../../../../secretaria/carnes-alunos/components/CarnesDocumentPreviewModal';
import { carnesAlunosService } from '../../../../../secretaria/carnes-alunos/carnes-alunos.service';
import type {
  BaneseDocumentProgress,
  PreparedBaneseDocument,
} from '../../../../../secretaria/carnes-alunos/carnes-alunos.types';
import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';

export type FinanceiroAlunoCarneFeedback = (
  tone: 'info' | 'error',
  title: string,
  message: string,
) => void;

interface FinanceiroAlunoCarneActionProps {
  row: MatriculaTecnicaFinanceiroRow;
  poloId: string;
  turmaId: string;
  disabled: boolean;
  onFeedback: FinanceiroAlunoCarneFeedback;
}

const FinanceiroAlunoCarneAction = ({
  row,
  poloId,
  turmaId,
  disabled,
  onFeedback,
}: FinanceiroAlunoCarneActionProps) => {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<BaneseDocumentProgress | null>(null);
  const [document, setDocument] = useState<PreparedBaneseDocument | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const generatedCycle = row.cicloManual.cicloGerado;
  const incompleteIssuance = Boolean(generatedCycle && (
    generatedCycle.emitidosBanese !== generatedCycle.quantidadeItens
    || generatedCycle.pendentesEmissao > 0
    || generatedCycle.emRevisao > 0
  ));
  const blocked = disabled || pending || incompleteIssuance;
  const title = incompleteIssuance
    ? 'Conclua ou retome a emissão antes de montar o carnê.'
    : pending
      ? `Montando carnê${progress?.total ? ` (${progress.current}/${progress.total})` : '...'}`
      : 'Gerar carnê dos títulos Banese emitidos';

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepareCarnet = async () => {
    if (blocked || inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setProgress(null);
    try {
      const catalog = await carnesAlunosService.listGroups({
        poloId,
        classId: turmaId,
        enrollmentId: row.matriculaId,
        page: 1,
        pageSize: 2,
      }, controller.signal);
      if (catalog.total !== 1 || catalog.groups.length !== 1) {
        throw new Error(catalog.total === 0
          ? 'Ainda não há um grupo completo de títulos Banese disponível para esta matrícula.'
          : 'A matrícula retornou mais de um grupo documental. Revise os títulos antes de gerar.');
      }
      const [group] = catalog.groups;
      if (group.enrollmentId !== row.matriculaId) {
        throw new Error('O catálogo retornou um carnê de outra matrícula.');
      }
      if (group.documentType !== 'carnet') {
        throw new Error('O carnê exige pelo menos três títulos Banese válidos.');
      }
      const prepared = await carnesAlunosService.prepareDocument(
        [group],
        setProgress,
        controller.signal,
      );
      if (!controller.signal.aborted) setDocument(prepared);
    } catch (failure) {
      if (!controller.signal.aborted) {
        onFeedback(
          failure instanceof Error && /pelo menos três|ainda não há/i.test(failure.message)
            ? 'info'
            : 'error',
          'Carnê não preparado',
          failure instanceof Error ? failure.message : 'Não foi possível montar o carnê Banese.',
        );
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        inFlightRef.current = false;
      }
      if (!controller.signal.aborted) {
        setPending(false);
        setProgress(null);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={blocked}
        aria-label={`Gerar carnê de ${row.alunoNome}`}
        aria-busy={pending}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          void prepareCarnet();
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[9px] font-black uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {pending
          ? <Loader2 className="animate-spin" size={15} />
          : <NotebookTabs size={15} />}
        <span>{pending ? 'Montando' : 'Carnê'}</span>
      </button>
      {document ? (
        <CarnesDocumentPreviewModal
          document={document}
          onClose={() => setDocument(null)}
        />
      ) : null}
    </>
  );
};

export default FinanceiroAlunoCarneAction;
