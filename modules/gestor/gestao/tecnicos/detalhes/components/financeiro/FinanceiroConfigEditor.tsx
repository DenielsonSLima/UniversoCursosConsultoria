import React from 'react';
import { Calendar, RefreshCw, Save, Settings } from 'lucide-react';
import FinanceiroCronogramaItem from './FinanceiroCronogramaItem';
import { CronogramaItem, FinanceiroConfigData } from './financeiro-config.service';
import {
  FINANCEIRO_POLICIES,
  FinanceiroRulesCalculation,
  formatCurrencyBRL,
} from './financeiro-config.utils';

interface FinanceiroConfigEditorProps {
  calculo?: FinanceiroRulesCalculation;
  cronograma: CronogramaItem[];
  formData: FinanceiroConfigData;
  isSaving: boolean;
  onCancel: () => void;
  onDragEnd: () => void;
  onDragEnter: (index: number) => void;
  onDragStart: (index: number) => void;
  onGenerate: () => void;
  onSave: () => void;
  onUpdateDate: (itemId: string, newDate: string) => void;
  setFormData: React.Dispatch<React.SetStateAction<FinanceiroConfigData>>;
}

const FinanceiroConfigEditor: React.FC<FinanceiroConfigEditorProps> = ({
  calculo,
  cronograma,
  formData,
  isSaving,
  onCancel,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onGenerate,
  onSave,
  onUpdateDate,
  setFormData,
}) => {
  const handleCurrencyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const digits = value.replace(/\D/g, '');
    const numericValue = digits ? parseFloat(digits) / 100 : 0;
    setFormData((previous) => ({ ...previous, [name]: numericValue }));
  };

  const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: parseFloat(value) || 0 }));
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 mb-8 animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
          <Settings size={20} className="text-blue-600" /> Configurar Plano de Pagamento
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
            1. Definição de Valores
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Matrícula (R$)</label>
              <input
                type="text" name="valorMatricula"
                value={formatCurrencyBRL(formData.valorMatricula)} onChange={handleCurrencyChange}
                className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Rematrícula (R$)</label>
              <input
                type="text" name="valorRematricula"
                value={formatCurrencyBRL(formData.valorRematricula)} onChange={handleCurrencyChange}
                className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Parcelas por ciclo</label>
              <input
                type="number" name="qtdParcelas"
                value={formData.qtdParcelas} onChange={handleNumberChange}
                className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Valor Parcela (R$)</label>
              <input
                type="text" name="valorParcela"
                value={formatCurrencyBRL(formData.valorParcela)} onChange={handleCurrencyChange}
                className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Dia de Vencimento Padrão</label>
              <select
                name="diaVencimentoPadrao"
                value={formData.diaVencimentoPadrao}
                onChange={(event) => setFormData((previous) => ({
                  ...previous,
                  diaVencimentoPadrao: parseInt(event.target.value) || 10,
                }))}
                className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white"
              >
                {[5, 10, 15, 20, 25, 28].map((day) => (
                  <option key={day} value={day}>Todo dia {String(day).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-blue-800 uppercase">Descontos & Multas</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-blue-600 uppercase">Desc. Pontualidade</label>
                <input
                  type="text" name="descontoPontualidade"
                  value={formatCurrencyBRL(formData.descontoPontualidade)} onChange={handleCurrencyChange}
                  className="w-full p-2 rounded-lg border border-blue-200 text-xs bg-white text-slate-700 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-blue-600 uppercase">Juros (%)</label>
                <input
                  type="number" step="0.1" name="jurosAtraso"
                  value={formData.jurosAtraso} onChange={handleNumberChange}
                  className="w-full p-2 rounded-lg border border-blue-200 text-xs bg-white text-slate-700 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-blue-600 uppercase">Multa (R$)</label>
                <input
                  type="text" name="multaAtraso"
                  value={formatCurrencyBRL(formData.multaAtraso)} onChange={handleCurrencyChange}
                  className="w-full p-2 rounded-lg border border-blue-200 text-xs bg-white text-slate-700 outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-white/70 p-3 md:grid-cols-3">
              {FINANCEIRO_POLICIES.map((policy) => (
                <div key={policy.label} className="rounded-lg border border-blue-100 bg-white p-3">
                  <p className="mb-2 text-[10px] font-black uppercase text-[#001a33]">{policy.label}</p>
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-600">
                    <input
                      type="checkbox"
                      checked={formData[policy.descontoKey]}
                      onChange={(event) => setFormData((previous) => ({
                        ...previous,
                        [policy.descontoKey]: event.target.checked,
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    Desconto
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-600">
                    <input
                      type="checkbox"
                      checked={formData[policy.multaKey]}
                      onChange={(event) => setFormData((previous) => ({
                        ...previous,
                        [policy.multaKey]: event.target.checked,
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    Multa/Juros
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <span className="text-[10px] text-[#001a33] font-bold uppercase tracking-wider block border-b border-slate-100 pb-1.5">
              Simulação de Recebimento (1 Parcela - Cálculo via RPC)
            </span>
            <div className="flex justify-between items-center text-xs">
              <div className="flex flex-col">
                <span className="text-slate-700 font-bold">Antes do Vencimento (Com Desconto):</span>
                <span className="text-[10px] text-slate-500">Valor da parcela - Desconto de Pontualidade</span>
              </div>
              <span className="font-extrabold text-sm text-emerald-600">
                {calculo
                  ? formatCurrencyBRL(calculo.valor_com_desconto)
                  : formatCurrencyBRL(Math.max(0, formData.valorParcela - formData.descontoPontualidade))}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-50">
              <div className="flex flex-col">
                <span className="text-slate-700 font-bold">Após o Vencimento (Exemplo 1 Mês de Atraso):</span>
                <span className="text-[10px] text-slate-500">
                  Parcela + Juros de {formData.jurosAtraso}% ({calculo
                    ? formatCurrencyBRL(calculo.juros_calculados)
                    : formatCurrencyBRL(formData.valorParcela * (formData.jurosAtraso / 100))}) + Multa de {formatCurrencyBRL(formData.multaAtraso)}
                </span>
              </div>
              <span className="font-extrabold text-sm text-rose-600">
                {calculo
                  ? formatCurrencyBRL(calculo.valor_com_atraso)
                  : formatCurrencyBRL(formData.valorParcela + (formData.valorParcela * (formData.jurosAtraso / 100)) + formData.multaAtraso)}
              </span>
            </div>
          </div>

          <button
            onClick={onGenerate}
            className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-slate-900 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} /> Gerar / Resetar Cronograma
          </button>
        </div>

        <div className="flex flex-col h-full">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 flex justify-between items-center">
            <span>2. Cronograma do ciclo</span>
            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600">Estimativa padrão</span>
          </h4>
          <div className="flex-1 bg-slate-100 rounded-2xl p-4 overflow-y-auto max-h-[500px] border-2 border-dashed border-slate-300 custom-scrollbar relative">
            {cronograma.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <Calendar size={48} className="mb-2 opacity-50" />
                <p className="text-sm font-medium text-center px-8">Configure os valores ao lado e clique em "Gerar Cronograma" para visualizar a lista.</p>
              </div>
            ) : cronograma.map((item, index) => (
              <FinanceiroCronogramaItem
                key={item.id}
                item={item}
                index={index}
                onDragEnd={onDragEnd}
                onDragEnter={onDragEnter}
                onDragStart={onDragStart}
                onUpdateDate={onUpdateDate}
              />
            ))}
          </div>
          {cronograma.length > 0 ? (
            <div className="mt-2 text-[10px] text-slate-500 text-center">
              * A matrícula é criada primeiro; mensalidades e rematrícula são liberadas por baixa de pagamento.
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
        <button
          onClick={onCancel}
          className="px-6 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold uppercase text-xs hover:bg-white transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={cronograma.length === 0 || isSaving}
          className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold uppercase text-xs hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Regra Financeira'}
        </button>
      </div>
    </div>
  );
};

export default FinanceiroConfigEditor;
