import React from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import type { ExternalTransferPreview } from './external-transfer.contract';
import {
  externalTransferFinancialConfigurationError,
  type ExternalTransferCycleValues, type ExternalTransferFinancialConfigurations,
} from './external-transfer-financial-configuration';
import ExternalTransferCycleConfigurator from './ExternalTransferCycleConfigurator';

interface Props {
  configurations: ExternalTransferFinancialConfigurations | null;
  onConfigurationChange: <K extends keyof ExternalTransferCycleValues>(cycle: 1 | 2, field: K, value: ExternalTransferCycleValues[K]) => void;
  context?: ExternalTransferPreview;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  onRetry: () => void;
  onRestoreDefaults: () => void;
}
const ExternalTransferFinancialFields: React.FC<Props> = ({
  configurations, onConfigurationChange, context, loading, error, disabled, onRetry, onRestoreDefaults,
}) => {
  const blocked = disabled || loading || Boolean(error) || !context || !configurations;
  const validation = context && configurations ? externalTransferFinancialConfigurationError(configurations, context) : null;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-black text-blue-900">Configurar o financeiro</h4>
        <p className="mt-1 text-xs text-slate-600">Os valores iniciais vêm da turma. Configure cada ciclo e avance para conferir a lista de cobranças.</p>
      </div>
      <button type="button" onClick={onRestoreDefaults} disabled={blocked}
        className="flex items-center gap-1.5 rounded-lg border border-blue-200 p-2 text-[10px] font-bold text-blue-800 disabled:opacity-40"><RotateCcw size={13} />Restaurar padrões da turma</button>
    </div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
      <p>{error}</p><button type="button" disabled={loading || disabled} onClick={onRetry} className="mt-2 font-bold underline">Consultar novamente</button>
    </div> : loading ? <p role="status" className="flex items-center gap-2 text-xs text-blue-700"><Loader2 size={14} className="animate-spin" />Carregando padrões da turma...</p> : null}
    {context && configurations && <div className="space-y-4">
      {([1, 2] as const).filter((cycle) => cycle <= context.maxCiclos).map((cycle) => <ExternalTransferCycleConfigurator key={cycle}
        cycle={cycle} context={context} configuration={configurations[cycle]} disabled={blocked}
        onChange={(field, value) => onConfigurationChange(cycle, field, value)} />)}
    </div>}
    {validation && !loading && !error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{validation}</p>}
    {context?.avisos.map((warning, index) => <p key={index} className="text-xs text-amber-800">{warning}</p>)}
    <p className="text-xs text-slate-500">Ao avançar, as datas e os valores serão conferidos automaticamente. Você poderá editar, adicionar ou remover cobranças na próxima etapa.</p>
  </section>;
};
export default ExternalTransferFinancialFields;
