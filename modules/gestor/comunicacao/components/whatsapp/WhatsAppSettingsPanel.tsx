import React from 'react';
import { BarChart3, CheckCircle2, MessageCircle, RefreshCw, Wallet } from 'lucide-react';
import { WhatsAppUsageSummary } from './whatsapp.types';

interface WhatsAppSettingsPanelProps {
  summary: WhatsAppUsageSummary | null;
  loading: boolean;
}

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const toneClasses = {
  rose: {
    icon: 'bg-rose-50 text-rose-700',
    bar: 'bg-rose-500',
    soft: 'bg-rose-50 text-rose-700 border-rose-100',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-700',
    bar: 'bg-amber-500',
    soft: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
};

const fallbackSummary: WhatsAppUsageSummary = {
  usage_month: new Date().toISOString(),
  monthly_limit: 120,
  currency: 'BRL',
  meta_balance: null,
  meta_balance_source: 'server',
  meta_synced_at: null,
  marketing_sent: 0,
  marketing_rate: 0.62,
  marketing_cost: 0,
  marketing_available: 193,
  marketing_percent: 0,
  billing_sent: 0,
  billing_rate: 0.32,
  billing_cost: 0,
  billing_available: 375,
  billing_percent: 0,
  service_sent: 0,
  service_rate: 0,
  service_cost: 0,
  service_percent: 0,
  total_sent: 0,
  spent: 0,
  remaining: 120,
  spent_percent: 0,
};

const WhatsAppSettingsPanel: React.FC<WhatsAppSettingsPanelProps> = ({ summary, loading }) => {
  const usage = summary || fallbackSummary;
  const buckets = [
    {
      kind: 'marketing',
      label: 'Marketing',
      description: 'Mensagens iniciadas pela escola fora da janela de atendimento.',
      sent: usage.marketing_sent,
      rate: usage.marketing_rate,
      cost: usage.marketing_cost,
      available: usage.marketing_available,
      percent: usage.marketing_percent,
      tone: 'rose' as const,
    },
    {
      kind: 'billing',
      label: 'Avisos de cobrança',
      description: 'Vencimento, recebimento e atraso financeiro.',
      sent: usage.billing_sent,
      rate: usage.billing_rate,
      cost: usage.billing_cost,
      available: usage.billing_available,
      percent: usage.billing_percent,
      tone: 'amber' as const,
    },
    {
      kind: 'service',
      label: 'Resposta em 24h',
      description: 'Resposta dentro da janela aberta pelo aluno.',
      sent: usage.service_sent,
      rate: usage.service_rate,
      cost: usage.service_cost,
      available: null,
      percent: usage.service_percent,
      tone: 'emerald' as const,
    },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="max-w-6xl space-y-5">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Controle mensal</p>
                <h3 className="mt-1 text-2xl font-bold tracking-tight text-[#001a33]">Saldo estimado WhatsApp</h3>
                <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                  Orçamento interno de {money(usage.monthly_limit)} para acompanhar marketing, avisos financeiros e respostas dentro da janela de atendimento.
                </p>
              </div>
              <div className="rounded-2xl bg-[#001a33] px-5 py-4 text-white">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-100/70">Restante</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">{money(usage.remaining)}</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Consumido no mês</span>
                <span>{money(usage.spent)} de {money(usage.monthly_limit)}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${usage.spent_percent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <Wallet size={18} className="text-slate-500" />
              <p className="mt-3 text-xs font-medium text-slate-400">Limite</p>
              <p className="text-xl font-bold text-[#001a33]">{money(usage.monthly_limit)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <BarChart3 size={18} className="text-slate-500" />
              <p className="mt-3 text-xs font-medium text-slate-400">Enviado no mês</p>
              <p className="text-xl font-bold text-[#001a33]">{usage.total_sent}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              {loading ? <RefreshCw size={18} className="animate-spin text-slate-500" /> : <CheckCircle2 size={18} className="text-emerald-600" />}
              <p className="mt-3 text-xs font-medium text-slate-400">Base do cálculo</p>
              <p className="text-xl font-bold text-[#001a33]">Mês atual</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {buckets.map((bucket) => {
            const tone = toneClasses[bucket.tone];
            return (
              <div key={bucket.kind} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone.icon}`}>
                    <MessageCircle size={20} />
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone.soft}`}>
                    {bucket.rate > 0 ? `${money(bucket.rate)} / msg` : 'R$ 0,00'}
                  </span>
                </div>

                <h4 className="mt-4 text-lg font-bold tracking-tight text-[#001a33]">{bucket.label}</h4>
                <p className="mt-1 min-h-[40px] text-xs font-medium leading-relaxed text-slate-500">{bucket.description}</p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Enviadas</p>
                    <p className="text-2xl font-bold text-[#001a33]">{bucket.sent}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">Custo</p>
                    <p className="text-2xl font-bold text-[#001a33]">{money(bucket.cost)}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${bucket.percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {bucket.rate > 0
                      ? `Ainda cabem aproximadamente ${bucket.available || 0} mensagens neste saldo.`
                      : 'Respostas dentro de 24h não consomem o limite estimado.'}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-bold text-[#001a33]">Resumo do mês atual</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
            As mensagens são classificadas pelo banco conforme texto financeiro e janela de resposta de 24h. Os valores retornam da funcao `whatsapp_usage_summary`.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-slate-400">Total enviado</p>
              <p className="mt-1 text-xl font-bold text-[#001a33]">{usage.total_sent}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-slate-400">Estimado gasto</p>
              <p className="mt-1 text-xl font-bold text-[#001a33]">{money(usage.spent)}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-slate-400">Saldo restante</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{money(usage.remaining)}</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-medium text-slate-400">Uso do limite</p>
              <p className="mt-1 text-xl font-bold text-[#001a33]">{Number(usage.spent_percent || 0).toFixed(0)}%</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default WhatsAppSettingsPanel;
