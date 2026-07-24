import { CircleDollarSign, WalletCards } from 'lucide-react';
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

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-4 bg-[#001a33] px-5 py-5 text-white md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400 text-[#001a33]">
              <WalletCards size={23} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                Secretaria financeira
              </p>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight">
                Recebimentos por aluno e curso
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-300">
                Consulte e registre baixas com o cálculo final validado no servidor.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest md:self-auto">
            <CircleDollarSign size={14} /> Individual · Lote · Personalizado
          </span>
        </header>

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
