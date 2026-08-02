import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { MensageriaConfigData, mensageriaService } from '../../configuracoes/mensageria/mensageria.service';
import AutomationsTab from '../components/whatsapp-panel/AutomationsTab';
import { DEFAULT_AUTOMATION, DEFAULT_MODALITIES } from '../components/whatsapp-panel/constants';
import { AutomationField, AutomationKey } from '../components/whatsapp-panel/types';

const automationLabels: Record<AutomationKey, string> = {
  due: 'Aviso de vencimento',
  receipt: 'Aviso de recebimento',
  overdue: 'Aviso de atraso',
  multiple: 'Múltiplas parcelas em atraso',
};

interface LegacyWhatsAppAutomationsPanelProps {
  onBack?: () => void;
}

const LegacyWhatsAppAutomationsPanel: React.FC<LegacyWhatsAppAutomationsPanelProps> = ({ onBack }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [automation, setAutomation] = useState<MensageriaConfigData>({ tipo: 'whatsapp', ...DEFAULT_AUTOMATION });
  const [openAutomation, setOpenAutomation] = useState<AutomationKey | null>(null);
  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['mensageria_config', 'whatsapp'],
    queryFn: () => mensageriaService.getConfig('whatsapp'),
  });

  useEffect(() => {
    setAutomation({
      tipo: 'whatsapp',
      ...DEFAULT_AUTOMATION,
      ...config,
      waDueNoticeModalities: config?.waDueNoticeModalities?.length ? config.waDueNoticeModalities : DEFAULT_MODALITIES,
      waPaymentReceiptModalities: config?.waPaymentReceiptModalities?.length ? config.waPaymentReceiptModalities : DEFAULT_MODALITIES,
      waOverdueNoticeModalities: config?.waOverdueNoticeModalities?.length ? config.waOverdueNoticeModalities : DEFAULT_MODALITIES,
      waMultipleOverdueModalities: config?.waMultipleOverdueModalities?.length ? config.waMultipleOverdueModalities : DEFAULT_MODALITIES,
    });
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (key: AutomationKey) => {
      const patches: Record<AutomationKey, Partial<MensageriaConfigData>> = {
        due: {
          waDueNoticeDays: automation.waDueNoticeDays,
          waSendDueNotice: automation.waSendDueNotice,
          waDueNoticeTemplate: automation.waDueNoticeTemplate,
          waDueNoticeModalities: automation.waDueNoticeModalities,
        },
        receipt: {
          waSendPaymentReceipt: automation.waSendPaymentReceipt,
          waPaymentReceiptTemplate: automation.waPaymentReceiptTemplate,
          waPaymentReceiptModalities: automation.waPaymentReceiptModalities,
        },
        overdue: {
          waSendOverdueNotice: automation.waSendOverdueNotice,
          waOverdueNoticeDays: automation.waOverdueNoticeDays,
          waDefaultOverdueTemplate: automation.waDefaultOverdueTemplate,
          waOverdueNoticeModalities: automation.waOverdueNoticeModalities,
        },
        multiple: {
          waSendMultipleOverdueNotice: automation.waSendMultipleOverdueNotice,
          waMultipleOverdueMinInstallments: automation.waMultipleOverdueMinInstallments,
          waMultipleOverdueTemplate: automation.waMultipleOverdueTemplate,
          waMultipleOverdueModalities: automation.waMultipleOverdueModalities,
        },
      };
      if (!window.confirm(`Confirmar alteração de “${automationLabels[key]}” no WhatsApp em produção?`)) {
        const cancelled = new Error('Operação cancelada.');
        cancelled.name = 'AbortError';
        throw cancelled;
      }
      return mensageriaService.saveWhatsappAutomationConfig(patches[key]).then(() => key);
    },
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] });
      toast.success('Configuração atualizada', `${automationLabels[key]} foi atualizado no motor atual do WhatsApp.`);
    },
    onError: (error: any) => {
      if (error?.name !== 'AbortError') toast.error('Erro ao salvar', error?.message || 'Não foi possível atualizar o WhatsApp atual.');
    },
  });

  const updateModalities = (field: AutomationField, value: string[]) => {
    setAutomation((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
        {onBack && <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <ArrowLeft size={15} /> Voltar à central multicanal
        </button>}
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-200"><TriangleAlert size={19} /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-base font-black text-amber-950">Automações atuais do WhatsApp</h1><span className="rounded-full bg-amber-200/70 px-2 py-1 text-xs font-black text-amber-900">Produção atual</span></div>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">Alterações salvas nesta área afetam o envio atual do WhatsApp. Elas não publicam o novo motor multicanal.</p>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-600"><MessageCircle size={15} className="text-emerald-700" /> Comunicação / Automações / WhatsApp atual</div>
        {isError || (!isLoading && !config) ? <div className="m-5 flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-6 text-center"><TriangleAlert size={26} className="text-rose-600" /><h2 className="mt-3 text-base font-black text-[#001a33]">Configuração indisponível</h2><p className="mt-2 max-w-md text-xs leading-5 text-slate-600">O editor foi bloqueado para impedir que valores padrão substituam a configuração de produção.</p><button type="button" onClick={() => refetch()} className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black text-white"><RefreshCw size={14} /> Tentar novamente</button></div> : <AutomationsTab
          automation={automation}
          loadingConfig={isLoading}
          openAutomation={openAutomation}
          onToggleOpen={(key) => setOpenAutomation((current) => current === key ? null : key)}
          onAutomationChange={setAutomation}
          onModalitiesChange={updateModalities}
          onSave={(key) => saveMutation.mutate(key)}
          isSaving={saveMutation.isPending}
          savingKey={saveMutation.variables}
        />}
      </div>
    </div>
  );
};

export default LegacyWhatsAppAutomationsPanel;
