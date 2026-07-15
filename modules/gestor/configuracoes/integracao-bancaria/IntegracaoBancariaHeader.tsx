import React from 'react';
import { Key, LayoutDashboard } from 'lucide-react';
import {
  ENVIRONMENTS,
  MODALIDADES,
  PROVIDER_BRANDS,
  environmentLabel,
  modalidadeLabel,
} from './integracao-bancaria.constants';
import {
  GatewayEnvironment,
  GatewayModalidade,
  GatewayProviderCode,
} from './integracao-bancaria.service';
import { MainTab } from './integracao-bancaria.types';
import { ProviderLogo } from './integracao-bancaria.ui';

interface IntegracaoBancariaHeaderProps {
  activeTab: MainTab;
  modalidade: GatewayModalidade;
  environment: GatewayEnvironment;
  providerCode: GatewayProviderCode;
  providerName: string;
  onChangeTab: (tab: MainTab) => void;
  onChangeModalidade: (modalidade: GatewayModalidade) => void;
}

const IntegracaoBancariaHeader: React.FC<IntegracaoBancariaHeaderProps> = ({
  activeTab,
  modalidade,
  environment,
  providerCode,
  providerName,
  onChangeTab,
  onChangeModalidade,
}) => {
  const contextLabel = activeTab === 'resumo'
    ? 'Resumo geral'
    : activeTab === 'parametrizacao'
      ? 'Parametrização'
      : modalidadeLabel(modalidade);

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          {activeTab === 'resumo' ? (
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
              <LayoutDashboard size={22} />
            </span>
          ) : (
            <ProviderLogo code={providerCode} compact />
          )}
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">
              Integração Bancária
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${ENVIRONMENTS.find((item) => item.value === environment)?.chip}`}>
                {environmentLabel(environment)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                {contextLabel}
              </span>
              {activeTab === 'resumo' ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
                  Pix · Boleto · Cartão
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${PROVIDER_BRANDS[providerCode].chip}`}>
                  {providerName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-1">
        <div className="grid min-w-[1080px] grid-cols-7 gap-1">
          <button
            type="button"
            onClick={() => onChangeTab('resumo')}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md px-4 text-xs font-black uppercase tracking-wider ${
              activeTab === 'resumo' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <LayoutDashboard size={15} />
            Resumo
          </button>
          {MODALIDADES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                onChangeTab(item.value);
                onChangeModalidade(item.value);
              }}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-md px-4 text-xs font-black uppercase tracking-wider ${
                activeTab === item.value ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:bg-white'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChangeTab('parametrizacao')}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md px-4 text-xs font-black uppercase tracking-wider ${
              activeTab === 'parametrizacao' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:bg-white'
            }`}
          >
            <Key size={15} />
            Parametrização
          </button>
        </div>
      </div>
    </>
  );
};

export default IntegracaoBancariaHeader;
