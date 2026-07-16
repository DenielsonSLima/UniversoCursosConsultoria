import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { Turma } from '../../../../gestao.types';
import FinanceiroConfigEditor from './FinanceiroConfigEditor';
import FinanceiroConfigSummary from './FinanceiroConfigSummary';
import TechnicalDataError from '../TechnicalDataError';
import {
  buildFinanceiroCronograma,
  CronogramaItem,
  DEFAULT_FINANCEIRO_CONFIG,
  FinanceiroConfigData,
  mapSavedCronograma,
  shouldUseSavedCronograma,
} from './financeiro-config.service';
import {
  useFinanceiroConfig,
  useFinanceiroRulesCalculation,
  useSaveFinanceiroConfigMutation,
} from './hooks/useFinanceiroConfig';

interface FinanceiroConfigProps {
  turma: Turma;
}

const FinanceiroConfig: React.FC<FinanceiroConfigProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [config, setConfig] = useState<FinanceiroConfigData>(DEFAULT_FINANCEIRO_CONFIG);
  const [formData, setFormData] = useState({ ...config });
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const configQuery = useFinanceiroConfig(turma.id);
  const { data: configDb, isLoading } = configQuery;
  const saveMutation = useSaveFinanceiroConfigMutation(
    turma.id,
    () => {
      toast.success('Sucesso', 'Configurações e ordem do cronograma salvas!');
      setIsEditing(false);
    },
    (error: any) => {
      toast.error('Erro', `Erro ao salvar configurações: ${error.message}`);
    },
  );

  useEffect(() => {
    if (!configDb) return;

    setConfig(configDb);
    setFormData(configDb);

    if (shouldUseSavedCronograma(configDb.cronogramaFinanceiro, configDb.qtdParcelas)) {
      setCronograma(mapSavedCronograma(configDb.cronogramaFinanceiro));
      return;
    }

    setCronograma(buildFinanceiroCronograma(configDb, turma.dataInicio));
  }, [configDb, turma.dataInicio]);

  const calculoConfigQuery = useFinanceiroRulesCalculation(configDb || config, false, Boolean(configDb));
  const calculoFormQuery = useFinanceiroRulesCalculation(formData, true, isEditing);

  const generateCronograma = () => {
    setCronograma(buildFinanceiroCronograma(formData, turma.dataInicio));
  };

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;

    const nextCronograma = [...cronograma];
    const draggedItemContent = nextCronograma[dragItem.current];
    nextCronograma.splice(dragItem.current, 1);
    nextCronograma.splice(dragOverItem.current, 0, draggedItemContent);

    dragItem.current = null;
    dragOverItem.current = null;
    setCronograma(nextCronograma);
  };

  const handleUpdateItemDate = (itemId: string, newDate: string) => {
    setCronograma((previous) => previous.map((item) => (
      item.id === itemId ? { ...item, dataVencimento: newDate } : item
    )));
  };

  const handleEdit = () => {
    setIsEditing(true);
    setFormData({ ...config });
    if (cronograma.length === 0) generateCronograma();
  };

  const handleSave = () => {
    if (configQuery.isError || calculoFormQuery.isError) {
      toast.error(
        'Dados financeiros indisponíveis',
        'Recarregue as regras financeiras antes de salvar qualquer alteração.',
      );
      return;
    }

    saveMutation.mutate({
      ...formData,
      cronogramaFinanceiro: cronograma,
    });
  };

  if (configQuery.isError) {
    return (
      <TechnicalDataError
        title="Configuração financeira não carregada"
        message="A edição foi bloqueada para impedir que valores locais substituam uma configuração já existente."
        retrying={configQuery.isFetching}
        onRetry={() => { void configQuery.refetch(); }}
      />
    );
  }

  if (isEditing) {
    if (calculoFormQuery.isError) {
      return (
        <TechnicalDataError
          title="Cálculo financeiro indisponível"
          message="A edição e o salvamento foram bloqueados até que as regras financeiras sejam recalculadas com segurança."
          retrying={calculoFormQuery.isFetching}
          onRetry={() => { void calculoFormQuery.refetch(); }}
        />
      );
    }

    return (
      <>
        <FinanceiroConfigEditor
          calculo={calculoFormQuery.data}
          cronograma={cronograma}
          formData={formData}
          isSaving={saveMutation.isPending}
          onCancel={() => setIsEditing(false)}
          onDragEnd={handleSort}
          onDragEnter={(index) => { dragOverItem.current = index; }}
          onDragStart={(index) => { dragItem.current = index; }}
          onGenerate={generateCronograma}
          onSave={handleSave}
          onUpdateDate={handleUpdateItemDate}
          setFormData={setFormData}
        />
        <ToastNotification toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
        <RefreshCw className="animate-spin text-[#001a33] mr-2" size={24} />
        <span className="text-slate-500 font-bold text-sm">Carregando configurações financeiras do banco...</span>
      </div>
    );
  }

  if (calculoConfigQuery.isError) {
    return (
      <TechnicalDataError
        title="Cálculo financeiro indisponível"
        message="Os valores foram carregados, mas a simulação oficial não pôde ser calculada. Nenhuma alteração foi permitida."
        retrying={calculoConfigQuery.isFetching}
        onRetry={() => { void calculoConfigQuery.refetch(); }}
      />
    );
  }

  return (
    <>
      <FinanceiroConfigSummary
        calculo={calculoConfigQuery.data}
        config={config}
        cronograma={cronograma}
        onEdit={handleEdit}
      />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroConfig;
