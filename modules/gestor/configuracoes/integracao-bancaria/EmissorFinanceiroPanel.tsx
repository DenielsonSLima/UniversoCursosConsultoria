import React from 'react';
import {
  Building2,
  CheckCircle2,
  Landmark,
  Loader2,
  Network,
  Save,
  ShieldCheck,
} from 'lucide-react';
import {
  GatewayIssuerCandidate,
  GatewayIssuerConfig,
} from './integracao-bancaria.service';

interface EmissorFinanceiroPanelProps {
  config?: GatewayIssuerConfig | null;
  candidates: GatewayIssuerCandidate[];
  activePolosCount: number;
  selectedIssuerId: string;
  saving: boolean;
  onSelect: (issuerPoloId: string) => void;
  onSave: () => void;
}

const EmissorFinanceiroPanel: React.FC<EmissorFinanceiroPanelProps> = ({
  config,
  candidates,
  activePolosCount,
  selectedIssuerId,
  saving,
  onSelect,
  onSave,
}) => {
  const selectedIssuer = candidates.find((candidate) => candidate.id === selectedIssuerId)
    || config?.issuer
    || null;
  const configured = Boolean(
    config?.active
    && config.appliesToAllPolos
    && config.issuerPoloId,
  );
  const hasChanged = Boolean(selectedIssuerId && selectedIssuerId !== config?.issuerPoloId);

  return (
    <section className="overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
              <Landmark size={21} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Recebedor único
              </p>
              <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                Emissor financeiro da matriz
              </h4>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                Pix e boletos de todos os polos usam o CNPJ definido aqui. O polo de origem continua separado em cada cobrança para filtros, relatórios e auditoria.
              </p>
            </div>
          </div>

          <span className={`inline-flex min-h-[32px] items-center gap-2 self-start rounded-md border px-3 text-[10px] font-black uppercase tracking-widest ${
            configured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}>
            {configured ? <CheckCircle2 size={14} /> : <ShieldCheck size={14} />}
            {configured ? 'Matriz definida' : 'Configuração pendente'}
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div>
          <label
            htmlFor="payment-issuer-polo"
            className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500"
          >
            Polo matriz emissor
          </label>
          <select
            id="payment-issuer-polo"
            value={selectedIssuerId}
            onChange={(event) => onSelect(event.target.value)}
            className="min-h-[48px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-[#001a33] outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">Selecione a matriz</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} · {candidate.cnpj}
              </option>
            ))}
          </select>

          {selectedIssuer && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Building2 size={13} />
                  CNPJ recebedor
                </p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{selectedIssuer.cnpj}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Localização
                </p>
                <p className="mt-1 text-sm font-black uppercase text-[#001a33]">
                  {selectedIssuer.city}/{selectedIssuer.state}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={saving || !selectedIssuerId || (!hasChanged && configured)}
            className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {hasChanged || !configured ? 'Salvar emissor' : 'Emissor já aplicado'}
          </button>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
            <Network size={14} />
            Regra de herança
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#001a33]">
            {activePolosCount}
          </p>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            polos ativos atendidos
          </p>
          <div className="mt-4 rounded-md border border-blue-100 bg-white/80 p-3 text-xs font-semibold leading-relaxed text-slate-600">
            Empresa e polo da matrícula continuam identificando a origem. Somente o recebedor bancário é herdado da matriz.
          </div>
        </div>
      </div>
    </section>
  );
};

export default EmissorFinanceiroPanel;
