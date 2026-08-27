import ToastNotification from '../../parceiros/components/shared/ToastNotification';
import BatchFinancePanel from './components/BatchFinancePanel';
import CustomFinancePanel from './components/CustomFinancePanel';
import FinanceModeNavigation from './components/FinanceModeNavigation';
import IndividualFinancePanel from './components/IndividualFinancePanel';
import SettlementModal from './components/SettlementModal';
import { useSecretariaFinanceiroController } from './hooks/useSecretariaFinanceiroController';

const SecretariaConsultaFinanceiraPage = () => {
  const controller = useSecretariaFinanceiroController();

  return (
    <div className="space-y-5">
      <ToastNotification
        toasts={controller.toasts}
        onRemove={controller.removeToast}
      />

      <section
        aria-labelledby="secretaria-recebimentos-workspace-title"
        className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
      >
        <h3 id="secretaria-recebimentos-workspace-title" className="sr-only">
          Recebimentos por aluno e curso
        </h3>
        <FinanceModeNavigation
          mode={controller.mode}
          onChange={controller.changeMode}
        />

        <div className="p-5 md:p-7">
          {controller.mode === 'individual'
            ? <IndividualFinancePanel controller={controller} />
            : null}
          {controller.mode === 'lote'
            ? <BatchFinancePanel controller={controller} />
            : null}
          {controller.mode === 'custom'
            ? <CustomFinancePanel controller={controller} />
            : null}
        </div>
      </section>

      <SettlementModal controller={controller.settlement} />
    </div>
  );
};

export default SecretariaConsultaFinanceiraPage;
