import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import type { Turma } from '../../../../gestao.types';
import FinanceiroConfigEditor from './FinanceiroConfigEditor';
import FinanceiroConfigSummary from './FinanceiroConfigSummary';
import {
  type FinanceiroConfigData,
  mapConfigToRegraTecnicaInput,
  mapRegraTecnicaCalculo,
  mapRegraTecnicaCronograma,
  mapRegraTecnicaToConfig,
} from './financeiro-config.service';
import type { MatriculaTecnicaRegra } from './matricula-tecnica-financeiro.types';
import {
  createFinanceiroRequestId,
  usePreverRegraFinanceiraTecnica,
  useSalvarRegraFinanceiraTecnica,
} from './hooks/useMatriculaTecnicaFinanceiro';
import { isRegraFinanceiraConflict } from './matricula-tecnica-financeiro.service';

interface FinanceiroConfigProps {
  turma: Turma;
  regra: MatriculaTecnicaRegra;
}

const inputFingerprint = (data: FinanceiroConfigData) => JSON.stringify(
  mapConfigToRegraTecnicaInput(data),
);

const FinanceiroConfig: React.FC<FinanceiroConfigProps> = ({ turma, regra }) => {
  const { toasts, removeToast, toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FinanceiroConfigData>(() => mapRegraTecnicaToConfig(regra));
  const [previewForm, setPreviewForm] = useState<FinanceiroConfigData>(() => mapRegraTecnicaToConfig(regra));
  const [baseRevision, setBaseRevision] = useState(regra.identidade.turmaRevisao);
  const [baseFingerprint, setBaseFingerprint] = useState(regra.identidade.turmaFingerprint);
  const [baseDraftFingerprint, setBaseDraftFingerprint] = useState(() => (
    inputFingerprint(mapRegraTecnicaToConfig(regra))
  ));
  const [conflict, setConflict] = useState(false);
  const requestRef = useRef<{ payload: string; requestId: string } | null>(null);
  const saveMutation = useSalvarRegraFinanceiraTecnica();
  const turmaLabel = [turma.codigo, turma.nome].filter(Boolean).join(' — ');
  const draftFingerprint = inputFingerprint(formData);

  useEffect(() => {
    if (!isEditing) {
      const next = mapRegraTecnicaToConfig(regra);
      setFormData(next);
      setPreviewForm(next);
      setBaseRevision(regra.identidade.turmaRevisao);
      setBaseFingerprint(regra.identidade.turmaFingerprint);
      setBaseDraftFingerprint(inputFingerprint(next));
      setConflict(false);
      return;
    }
    if (
      regra.identidade.turmaRevisao !== baseRevision
      || regra.identidade.turmaFingerprint !== baseFingerprint
    ) {
      if (draftFingerprint !== baseDraftFingerprint) {
        setConflict(true);
      } else {
        const next = mapRegraTecnicaToConfig(regra);
        setFormData(next);
        setPreviewForm(next);
        setBaseRevision(regra.identidade.turmaRevisao);
        setBaseFingerprint(regra.identidade.turmaFingerprint);
        setBaseDraftFingerprint(inputFingerprint(next));
        setConflict(false);
      }
    }
  }, [baseDraftFingerprint, baseFingerprint, baseRevision, draftFingerprint, isEditing, regra]);

  useEffect(() => {
    if (!isEditing) return;
    const timer = window.setTimeout(() => setPreviewForm(formData), 300);
    return () => window.clearTimeout(timer);
  }, [formData, isEditing]);

  const previewInput = useMemo(() => ({
    turmaId: turma.id,
    regra: mapConfigToRegraTecnicaInput(previewForm),
  }), [previewForm, turma.id]);
  const previewQuery = usePreverRegraFinanceiraTecnica(previewInput, isEditing && !conflict);
  const previewReady = Boolean(
    previewQuery.data
    && !previewQuery.isFetching
    && inputFingerprint(previewForm) === inputFingerprint(formData)
  );
  const presentationRule = isEditing && previewReady ? previewQuery.data! : regra;
  const cronograma = mapRegraTecnicaCronograma(presentationRule);
  const calculo = mapRegraTecnicaCalculo(presentationRule);

  const closeEditor = () => {
    const next = mapRegraTecnicaToConfig(regra);
    setFormData(next);
    setPreviewForm(next);
    setBaseRevision(regra.identidade.turmaRevisao);
    setBaseFingerprint(regra.identidade.turmaFingerprint);
    setBaseDraftFingerprint(inputFingerprint(next));
    setConflict(false);
    setIsEditing(false);
    requestRef.current = null;
  };

  const openEditor = () => {
    const next = mapRegraTecnicaToConfig(regra);
    setFormData(next);
    setPreviewForm(next);
    setBaseRevision(regra.identidade.turmaRevisao);
    setBaseFingerprint(regra.identidade.turmaFingerprint);
    setBaseDraftFingerprint(inputFingerprint(next));
    setConflict(false);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (conflict) {
      toast.warning('Regra alterada em outra sessão', 'Descarte este rascunho e revise a versão atual antes de salvar.');
      return;
    }
    if (!formData.instrucaoBoletoCarne.trim()) {
      toast.error('Instrução obrigatória', 'Informe a orientação que será impressa nos boletos e carnês.');
      return;
    }
    if (!previewReady || previewQuery.isError) {
      toast.error('Prévia indisponível', 'Aguarde a prévia canônica do servidor antes de salvar.');
      return;
    }
    const payload = inputFingerprint(formData);
    if (requestRef.current?.payload !== payload) {
      requestRef.current = { payload, requestId: createFinanceiroRequestId() };
    }
    try {
      await saveMutation.mutateAsync({
        turmaId: turma.id,
        requestId: requestRef.current.requestId,
        expectedRevisao: baseRevision,
        expectedFingerprint: baseFingerprint,
        regra: mapConfigToRegraTecnicaInput(formData),
      });
      requestRef.current = null;
      setIsEditing(false);
      toast.success('Regra financeira salva', 'Valores, políticas e cronograma foram confirmados pelo servidor.');
    } catch (error) {
      if (isRegraFinanceiraConflict(error)) {
        setConflict(true);
        toast.warning('Regra alterada em outra sessão', 'O rascunho foi preservado. Descarte-o para carregar a versão atual.');
        return;
      }
      toast.error('Regra não salva', error instanceof Error ? error.message : 'O servidor não confirmou a alteração.');
    }
  };

  if (!isEditing) {
    return (
      <>
        <FinanceiroConfigSummary
          calculo={mapRegraTecnicaCalculo(regra)}
          config={mapRegraTecnicaToConfig(regra)}
          cronograma={mapRegraTecnicaCronograma(regra)}
          onEdit={openEditor}
          turmaLabel={turmaLabel}
        />
        <ToastNotification toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  return (
    <>
      {conflict ? (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-xs font-black uppercase">A regra mudou em outra sessão</p>
            <p className="mt-1 text-xs font-semibold">Seu rascunho foi preservado, mas salvar está bloqueado. Clique em Cancelar para carregar a versão atual.</p>
          </div>
        </div>
      ) : null}
      <FinanceiroConfigEditor
        calculo={calculo}
        calculationReady={previewReady && !conflict && !previewQuery.isError}
        cronograma={cronograma}
        formData={formData}
        isSaving={saveMutation.isPending || previewQuery.isFetching}
        turmaLabel={turmaLabel}
        onCancel={closeEditor}
        onDragEnd={() => undefined}
        onDragEnter={() => undefined}
        onDragStart={() => undefined}
        onGenerate={() => { void previewQuery.refetch(); }}
        onSave={() => { void handleSave(); }}
        onUpdateDate={() => undefined}
        setFormData={setFormData}
      />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroConfig;
