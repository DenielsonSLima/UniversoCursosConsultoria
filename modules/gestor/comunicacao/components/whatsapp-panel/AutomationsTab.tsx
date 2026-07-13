import React from 'react';
import { BadgeCheck, CalendarClock, Clock3, FileText, RefreshCw } from 'lucide-react';
import { DEFAULT_AUTOMATION, DEFAULT_MODALITIES, TEMPLATE_VARIABLES } from './constants';
import { AutomationTabProps } from './types';
import AutomationCard from './AutomationCard';

const AutomationsTab: React.FC<AutomationTabProps> = ({
  automation,
  loadingConfig,
  openAutomation,
  onToggleOpen,
  onAutomationChange,
  onModalitiesChange,
  onSave,
  isSaving,
  savingKey,
}) => {
  const updateAutomation = (patch: Partial<typeof automation>) => {
    onAutomationChange({ ...automation, ...patch });
  };

  if (loadingConfig) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
          <RefreshCw size={18} className="animate-spin" />
          Carregando regras...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="max-w-5xl space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-[#001a33]">Automações financeiras por WhatsApp</p>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
              Abra somente o aviso que deseja ajustar. Cada cartão tem modalidades, texto e salvamento próprio.
            </p>
          </div>
          <span className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500">
            Cartões recolhidos por padrão
          </span>
        </div>

        <div className="space-y-4">
          <AutomationCard
            icon={CalendarClock}
            automationKey="due"
            step="01"
            tone="blue"
            title="Aviso de vencimento"
            description="Enviado somente para alunos que ainda não pagaram a parcela. Se a parcela já estiver paga, este aviso não deve disparar."
            triggerValue={`${automation.waDueNoticeDays ?? 3} dia(s) antes do vencimento`}
            audienceValue="Aluno com parcela aberta e não paga"
            isOpen={openAutomation === 'due'}
            onToggleOpen={() => onToggleOpen('due')}
            checked={Boolean(automation.waSendDueNotice)}
            onChange={(checked) => updateAutomation({ waSendDueNotice: checked })}
            timingLabel="Avisar quantos dias antes"
            timingValue={automation.waDueNoticeDays ?? 3}
            onTimingChange={(value) => updateAutomation({ waDueNoticeDays: value })}
            timingSuffix="dia(s) antes do vencimento"
            message={automation.waDueNoticeTemplate || DEFAULT_AUTOMATION.waDueNoticeTemplate || ''}
            onMessageChange={(value) => updateAutomation({ waDueNoticeTemplate: value })}
            variables={TEMPLATE_VARIABLES.due}
            modalities={automation.waDueNoticeModalities || DEFAULT_MODALITIES}
            onModalitiesChange={(value) => onModalitiesChange('waDueNoticeModalities', value)}
            onSave={onSave}
            isSaving={isSaving && savingKey === 'due'}
          />

          <AutomationCard
            icon={BadgeCheck}
            automationKey="receipt"
            step="02"
            tone="emerald"
            title="Aviso de recebimento"
            description="Enviado na confirmação do pagamento, quando a baixa/recebimento for reconhecida no financeiro."
            triggerValue="Na confirmação do pagamento"
            audienceValue="Aluno que teve a parcela recebida"
            isOpen={openAutomation === 'receipt'}
            onToggleOpen={() => onToggleOpen('receipt')}
            checked={Boolean(automation.waSendPaymentReceipt)}
            onChange={(checked) => updateAutomation({ waSendPaymentReceipt: checked })}
            message={automation.waPaymentReceiptTemplate || DEFAULT_AUTOMATION.waPaymentReceiptTemplate || ''}
            onMessageChange={(value) => updateAutomation({ waPaymentReceiptTemplate: value })}
            variables={TEMPLATE_VARIABLES.receipt}
            modalities={automation.waPaymentReceiptModalities || DEFAULT_MODALITIES}
            onModalitiesChange={(value) => onModalitiesChange('waPaymentReceiptModalities', value)}
            onSave={onSave}
            isSaving={isSaving && savingKey === 'receipt'}
          />

          <AutomationCard
            icon={Clock3}
            automationKey="overdue"
            step="03"
            tone="amber"
            title="Aviso de atraso"
            description="Enviado para aluno com parcela vencida e ainda não paga. Use para cobrança simples de atraso."
            triggerValue={`${automation.waOverdueNoticeDays ?? 1} dia(s) após o vencimento`}
            audienceValue="Aluno com uma parcela vencida"
            isOpen={openAutomation === 'overdue'}
            onToggleOpen={() => onToggleOpen('overdue')}
            checked={Boolean(automation.waSendOverdueNotice)}
            onChange={(checked) => updateAutomation({ waSendOverdueNotice: checked })}
            timingLabel="Avisar quantos dias depois"
            timingValue={automation.waOverdueNoticeDays ?? 1}
            onTimingChange={(value) => updateAutomation({ waOverdueNoticeDays: value })}
            timingSuffix="dia(s) após o vencimento"
            message={automation.waDefaultOverdueTemplate || DEFAULT_AUTOMATION.waDefaultOverdueTemplate || ''}
            onMessageChange={(value) => updateAutomation({ waDefaultOverdueTemplate: value })}
            variables={TEMPLATE_VARIABLES.overdue}
            modalities={automation.waOverdueNoticeModalities || DEFAULT_MODALITIES}
            onModalitiesChange={(value) => onModalitiesChange('waOverdueNoticeModalities', value)}
            onSave={onSave}
            isSaving={isSaving && savingKey === 'overdue'}
          />

          <AutomationCard
            icon={FileText}
            automationKey="multiple"
            step="04"
            tone="rose"
            title="Múltiplas parcelas em atraso"
            description="Enviado quando o aluno acumula mais de uma parcela vencida. Use para oferecer uma condição especial de regularização."
            triggerValue={`A partir de ${automation.waMultipleOverdueMinInstallments ?? 2} parcelas vencidas`}
            audienceValue="Aluno com atraso recorrente"
            isOpen={openAutomation === 'multiple'}
            onToggleOpen={() => onToggleOpen('multiple')}
            checked={Boolean(automation.waSendMultipleOverdueNotice)}
            onChange={(checked) => updateAutomation({ waSendMultipleOverdueNotice: checked })}
            timingLabel="Disparar a partir de quantas parcelas"
            timingValue={automation.waMultipleOverdueMinInstallments ?? 2}
            onTimingChange={(value) => updateAutomation({ waMultipleOverdueMinInstallments: Math.max(value, 2) })}
            timingSuffix="parcelas vencidas"
            message={automation.waMultipleOverdueTemplate || DEFAULT_AUTOMATION.waMultipleOverdueTemplate || ''}
            onMessageChange={(value) => updateAutomation({ waMultipleOverdueTemplate: value })}
            variables={TEMPLATE_VARIABLES.multiple}
            modalities={automation.waMultipleOverdueModalities || DEFAULT_MODALITIES}
            onModalitiesChange={(value) => onModalitiesChange('waMultipleOverdueModalities', value)}
            onSave={onSave}
            isSaving={isSaving && savingKey === 'multiple'}
          />
        </div>
      </div>
    </div>
  );
};

export default AutomationsTab;
