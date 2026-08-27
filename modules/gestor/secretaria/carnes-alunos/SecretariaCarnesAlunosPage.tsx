import ToastNotification from '../../parceiros/components/shared/ToastNotification';
import CarnesDocumentPreviewModal from './components/CarnesDocumentPreviewModal';
import CarnesModeNavigation from './components/CarnesModeNavigation';
import CarnesWorkspace from './components/CarnesWorkspace';
import { useCarnesAlunosController } from './hooks/useCarnesAlunosController';

interface SecretariaCarnesAlunosPageProps {
  poloId?: string | null;
}

const SecretariaCarnesAlunosPage = ({ poloId }: SecretariaCarnesAlunosPageProps) => {
  const controller = useCarnesAlunosController(poloId);

  return (
    <div className="space-y-5">
      <ToastNotification toasts={controller.toasts} onRemove={controller.removeToast} />

      <section
        aria-label="Carnês dos alunos — somente leitura"
        className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
      >
        <CarnesModeNavigation
          mode={controller.mode}
          onChange={controller.changeMode}
        />
        <CarnesWorkspace controller={controller} />
      </section>

      {controller.preparedDocument ? (
        <CarnesDocumentPreviewModal
          document={controller.preparedDocument}
          onClose={controller.closePreview}
        />
      ) : null}
    </div>
  );
};

export default SecretariaCarnesAlunosPage;
