import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { Turma } from '../../../../gestao.types';
import FinanceiroConfigEditor from './FinanceiroConfigEditor';
import FinanceiroConfigSummary from './FinanceiroConfigSummary';
import TechnicalDataError from '../TechnicalDataError';
import {
  CronogramaItem,
  DEFAULT_FINANCEIRO_CONFIG,
  FinanceiroConfigData,
  financeiroConfigService,
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

const getPreviewFingerprint = (data: FinanceiroConfigData) => JSON.stringify([
  data.valorParcela,
  data.descontoPontualidade,
  data.jurosAtraso,
  data.multaAtraso,
  data.aplicarDescontoMensalidade,
  data.aplicarMultaJurosMensalidade,
]);

const FinanceiroConfig: React.FC<FinanceiroConfigProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [config, setConfig] = useState<FinanceiroConfigData>(DEFAULT_FINANCEIRO_CONFIG);
  const [formData, setFormData] = useState({ ...config });
  const [calculationFormData, setCalculationFormData] = useState({ ...config });
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const turmaLabel = [turma.codigo, turma.nome].filter(Boolean).join(' — ');
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
      setIsGeneratingSchedule(false);
      setCronograma(mapSavedCronograma(configDb.cronogramaFinanceiro));
      return;
    }

    let cancelled = false;
    setIsGeneratingSchedule(true);
    void financeiroConfigService.buildSchedule(configDb, turma.dataInicio)
      .then((schedule) => {
        if (!cancelled) setCronograma(schedule);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setCronograma([]);
          toast.error('Cronograma indisponível', error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setIsGeneratingSchedule(false);
      });

    return () => {
      cancelled = true;
    };
  }, [configDb, toast, turma.dataInicio]);

  useEffect(() => {
    if (!isEditing) return;
    const timer = window.setTimeout(() => {
      setCalculationFormData(formData);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [formData, isEditing]);

  const calculoConfigQuery = useFinanceiroRulesCalculation(configDb || config, false, Boolean(configDb));
  const calculoFormQuery = useFinanceiroRulesCalculation(calculationFormData, true, isEditing);
  const calculationReady = Boolean(
    calculoFormQuery.data
    && !calculoFormQuery.isFetching
    && getPreviewFingerprint(calculationFormData) === getPreviewFingerprint(formData)
  );

  const generateCronograma = async (source = formData) => {
    try {
      setIsGeneratingSchedule(true);
      setCronograma(await financeiroConfigService.buildSchedule(source, turma.dataInicio));
    } catch (error: any) {
      toast.error('Cronograma não gerado', error?.message || 'Não foi possível calcular as datas no servidor.');
    } finally {
      setIsGeneratingSchedule(false);
    }
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
    setCalculationFormData({ ...config });
    if (cronograma.length === 0) void generateCronograma(config);
  };

  const handleSave = () => {
    if (!formData.instrucaoBoletoCarne.trim()) {
      toast.error(
        'Instrução obrigatória',
        'Informe a orientação que será impressa nos boletos e carnês desta turma.',
      );
      return;
    }
    if (configQuery.isError || calculoFormQuery.isError || !calculationReady) {
      toast.error(
        'Dados financeiros indisponíveis',
        'Aguarde a prévia oficial do servidor antes de salvar qualquer alteração.',
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
          calculationReady={calculationReady}
          cronograma={cronograma}
          formData={formData}
          isSaving={saveMutation.isPending || isGeneratingSchedule}
          turmaLabel={turmaLabel}
          onCancel={() => setIsEditing(false)}
          onDragEnd={handleSort}
          onDragEnter={(index) => { dragOverItem.current = index; }}
          onDragStart={(index) => { dragItem.current = index; }}
          onGenerate={() => { void generateCronograma(); }}
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
        turmaLabel={turmaLabel}
      />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroConfig;
