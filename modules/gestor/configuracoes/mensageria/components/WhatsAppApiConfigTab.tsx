import React from 'react';
import {
  AppWindow,
  BadgeDollarSign,
  Braces,
  Hash,
  KeyRound,
  Link2,
  MessageCircle,
  Phone,
  Shield,
  ToggleLeft,
  Webhook,
} from 'lucide-react';
import type { MensageriaConfigData } from '../mensageria.types';

interface WhatsAppApiConfigTabProps {
  draft: MensageriaConfigData;
  activeConfig: MensageriaConfigData | null;
  onChange: <K extends keyof MensageriaConfigData>(field: K, value: MensageriaConfigData[K]) => void;
}

const Field = ({
  icon: Icon,
  label,
  children,
  span = false,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) => (
  <label className={`space-y-2 ${span ? 'md:col-span-2' : ''}`}>
    <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
      <Icon size={14} />
      {label}
    </span>
    {children}
  </label>
);

const inputClass =
  'h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

const WhatsAppApiConfigTab: React.FC<WhatsAppApiConfigTabProps> = ({ draft, activeConfig, onChange }) => {
  const replacingCoexistence = activeConfig?.waConnectionMode === 'coexistence' && Boolean(activeConfig.waEnabled);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`rounded-xl border p-5 ${replacingCoexistence ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${replacingCoexistence ? 'text-amber-700' : 'text-blue-700'}`}>
            <MessageCircle size={21} />
          </span>
          <div>
            <h4 className={`text-sm font-black uppercase tracking-tight ${replacingCoexistence ? 'text-amber-950' : 'text-blue-950'}`}>
              Cloud API exclusiva
            </h4>
            <p className={`mt-1 text-xs font-bold leading-relaxed ${replacingCoexistence ? 'text-amber-700' : 'text-blue-700'}`}>
              {replacingCoexistence
                ? `A coexistência de ${activeConfig?.waDisplayPhoneNumber || 'seu número atual'} continuará ativa até você confirmar a substituição. Preencha abaixo o número Cloud API.`
                : 'Configure o número que ficará ativo na Cloud API oficial da Meta. O token é salvo com segurança no Vault.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field icon={ToggleLeft} label="Status Operacional">
          <select
            value={draft.waEnabled ? 'true' : 'false'}
            onChange={(event) => onChange('waEnabled', event.target.value === 'true')}
            className={inputClass}
          >
            <option value="false">Inativo</option>
            <option value="true">Ativo</option>
          </select>
        </Field>

        <Field icon={Braces} label="Versão Graph API">
          <input
            value={draft.waGraphVersion || ''}
            onChange={(event) => onChange('waGraphVersion', event.target.value)}
            className={inputClass}
            placeholder="v25.0"
          />
        </Field>

        <Field icon={AppWindow} label="App ID">
          <input
            value={draft.waAppId || ''}
            onChange={(event) => onChange('waAppId', event.target.value)}
            className={inputClass}
            placeholder="ID do app da Meta"
          />
        </Field>

        <Field icon={KeyRound} label="App Secret">
          <input
            type="password"
            value={draft.waAppSecret || ''}
            onChange={(event) => onChange('waAppSecret', event.target.value)}
            className={inputClass}
            placeholder="Usado para validar a assinatura do webhook"
          />
        </Field>

        <Field icon={Hash} label="WhatsApp Business Account ID">
          <input
            value={draft.waBusinessAccountId || ''}
            onChange={(event) => onChange('waBusinessAccountId', event.target.value)}
            className={inputClass}
            placeholder="WABA ID"
          />
        </Field>

        <Field icon={Hash} label="Phone Number ID">
          <input
            value={draft.waPhoneNumberId || ''}
            onChange={(event) => onChange('waPhoneNumberId', event.target.value)}
            className={inputClass}
            placeholder="ID do número"
          />
        </Field>

        <Field icon={Phone} label="Número WhatsApp">
          <input
            value={draft.waDisplayPhoneNumber || ''}
            onChange={(event) => onChange('waDisplayPhoneNumber', event.target.value)}
            className={inputClass}
            placeholder="+55 79 99999-9999"
          />
        </Field>

        <Field icon={Shield} label="Verify Token Webhook">
          <input
            value={draft.waWebhookVerifyToken || ''}
            onChange={(event) => onChange('waWebhookVerifyToken', event.target.value)}
            className={inputClass}
            placeholder="Token que você também coloca na Meta"
          />
        </Field>

        <Field icon={KeyRound} label="Access Token" span>
          <input
            type="password"
            value={draft.waToken || ''}
            onChange={(event) => onChange('waToken', event.target.value)}
            className={inputClass}
            placeholder={draft.waTokenConfigured ? 'Token já cadastrado. Preencha apenas para substituir.' : 'Token permanente do system user'}
          />
        </Field>

        <Field icon={Link2} label="URL base Graph" span>
          <input
            value={draft.waInstanceUrl || ''}
            onChange={(event) => onChange('waInstanceUrl', event.target.value)}
            className={inputClass}
            placeholder="https://graph.facebook.com"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]">
          <BadgeDollarSign size={16} className="text-emerald-600" />
          Dados de resumo manual até a sincronização
        </h4>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field icon={BadgeDollarSign} label="Moeda">
            <input
              value={draft.waAccountCurrency || ''}
              onChange={(event) => onChange('waAccountCurrency', event.target.value)}
              className={inputClass}
              placeholder="BRL"
            />
          </Field>
          <Field icon={BadgeDollarSign} label="Saldo estimado">
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.waEstimatedBalance ?? ''}
              onChange={(event) => onChange('waEstimatedBalance', event.target.value === '' ? undefined : Number(event.target.value))}
              className={inputClass}
              placeholder="0,00"
            />
          </Field>
          <Field icon={Shield} label="Qualidade">
            <input
              value={draft.waQualityRating || ''}
              onChange={(event) => onChange('waQualityRating', event.target.value)}
              className={inputClass}
              placeholder="Alta, Média, Baixa ou Green"
            />
          </Field>
          <Field icon={Webhook} label="Limite de mensagens">
            <input
              value={draft.waMessagingLimit || ''}
              onChange={(event) => onChange('waMessagingLimit', event.target.value)}
              className={inputClass}
              placeholder="Ex: 1.000/dia"
            />
          </Field>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppApiConfigTab;
