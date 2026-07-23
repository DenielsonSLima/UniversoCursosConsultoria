import React from 'react';
import {
  Activity,
  BadgeDollarSign,
  CheckCircle2,
  Cloud,
  Hash,
  MessageCircle,
  Phone,
  QrCode,
  ShieldCheck,
  Signal,
  Webhook,
  XCircle,
} from 'lucide-react';
import type { MensageriaConfigData } from '../mensageria.types';

interface WhatsAppSummaryTabProps {
  config: MensageriaConfigData | null;
  webhookUrl: string;
}

const formatMoney = (value?: number, currency = 'BRL') => {
  if (value === undefined || Number.isNaN(value)) return 'Não sincronizado';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
};

const SummaryMetric = ({
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'blue' | 'amber';
}) => {
  const tones = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-70">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-3 min-h-[28px] break-words text-lg font-black tracking-tight">{value}</p>
    </div>
  );
};

const WhatsAppSummaryTab: React.FC<WhatsAppSummaryTabProps> = ({ config, webhookUrl }) => {
  const isReady = Boolean(config?.waEnabled && config?.waPhoneNumberId && config?.waBusinessAccountId && config?.waTokenConfigured);
  const quality = config?.waQualityRating || 'Não informado';
  const currency = config?.waAccountCurrency || 'BRL';
  const isCoexistence = config?.waConnectionMode === 'coexistence';
  const connectionLabel = isCoexistence ? 'Coexistência com WhatsApp Business App' : 'Cloud API exclusiva';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className={`rounded-xl border p-5 ${isReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className={`mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {isReady ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            </span>
            <div>
              <p className={`text-sm font-black uppercase tracking-tight ${isReady ? 'text-emerald-950' : 'text-amber-950'}`}>
                {isReady ? 'WhatsApp pronto para testes' : 'Configuração incompleta'}
              </p>
              <p className={`mt-1 text-xs font-bold leading-relaxed ${isReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isReady
                  ? `${connectionLabel}. Apenas ${config?.waDisplayPhoneNumber || 'o número selecionado'} está ativo no portal.`
                  : 'Escolha Cloud API exclusiva ou Coexistência com QR Code para ativar um único número.'}
              </p>
            </div>
          </div>
          <span className={`inline-flex min-h-[34px] items-center gap-2 rounded-md px-3 text-[10px] font-black uppercase tracking-widest ${isReady ? 'bg-white text-emerald-700' : 'bg-white text-amber-700'}`}>
            <Signal size={13} />
            {config?.waStatus || 'nao_configurado'}
          </span>
        </div>
      </div>

      <div className={`rounded-xl border p-5 ${isCoexistence ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ${isCoexistence ? 'text-emerald-700' : 'text-blue-700'}`}>
            {isCoexistence ? <QrCode size={20} /> : <Cloud size={20} />}
          </span>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-widest ${isCoexistence ? 'text-emerald-600' : 'text-blue-600'}`}>
              Forma de conexão ativa
            </p>
            <h4 className="mt-1 text-sm font-black uppercase tracking-tight text-[#001a33]">{connectionLabel}</h4>
            <p className={`mt-1 text-xs font-bold leading-relaxed ${isCoexistence ? 'text-emerald-700' : 'text-blue-700'}`}>
              {isCoexistence
                ? 'O mesmo número continua disponível no celular e recebe os eventos oficiais também pela Cloud API.'
                : 'Este número opera somente pela Cloud API e não representa uma sessão do WhatsApp Business App no celular.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          icon={BadgeDollarSign}
          label="Saldo / Conta"
          value={formatMoney(config?.waEstimatedBalance, currency)}
          tone="emerald"
        />
        <SummaryMetric
          icon={Phone}
          label="Número"
          value={config?.waDisplayPhoneNumber || 'Não configurado'}
          tone="blue"
        />
        <SummaryMetric
          icon={ShieldCheck}
          label="Qualidade"
          value={quality}
          tone={quality.toLowerCase().includes('green') || quality.toLowerCase().includes('alta') ? 'emerald' : 'amber'}
        />
        <SummaryMetric
          icon={Activity}
          label="Limite"
          value={config?.waMessagingLimit || 'Não informado'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]">
            <MessageCircle size={17} className="text-emerald-600" />
            Identificação Meta
          </h4>
          <div className="mt-4 space-y-3">
            {[
              ['WABA ID', config?.waBusinessAccountId],
              ['Phone Number ID', config?.waPhoneNumberId],
              ['Modo ativo', connectionLabel],
              ['App ID', config?.waAppId],
              ['Graph API', config?.waGraphVersion || 'v25.0'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                <span className="max-w-[60%] truncate font-mono text-xs font-bold text-slate-700">{value || 'Não configurado'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]">
            <Webhook size={17} className="text-blue-600" />
            Webhook para Meta
          </h4>
          <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
            Use esta URL no painel do app da Meta quando a função de webhook de entrada for ativada.
          </p>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <Hash size={12} />
              URL de callback
            </div>
            <p className="mt-2 break-all font-mono text-xs font-bold text-slate-700">{webhookUrl}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppSummaryTab;
