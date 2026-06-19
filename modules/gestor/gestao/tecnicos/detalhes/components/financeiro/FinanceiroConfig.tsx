
// File: modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx

import React, { useState, useRef, useEffect } from 'react';
import { 
  Settings, Save, Edit2, DollarSign, Calendar, Percent, AlertCircle, 
  GripVertical, RefreshCw, Plus, Trash2 
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { supabase } from '../../../../../../../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../../../gestao.types';
import { gestaoService } from '../../../../gestao.service';




interface CronogramaItem {
  id: string;
  tipo: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  label: string;
  valor: number;
  numero?: number; // Número da parcela se for parcela
}

interface FinanceiroConfigProps {
  turma: Turma;
}

const FinanceiroConfig: React.FC<FinanceiroConfigProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();
  
  // Configuração Base
  const [config, setConfig] = useState({
    valorMatricula: 150.00,
    valorRematricula: 100.00,
    qtdParcelas: 22, // Exemplo do prompt
    valorParcela: 350.00,
    descontoPontualidade: 20.00,
    jurosAtraso: 2.0,
    multaAtraso: 5.00
  });

  const [formData, setFormData] = useState({ ...config });
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);

  // Carregar as configurações financeiras específicas desta turma do banco
  const { data: configDb, isLoading } = useQuery({
    queryKey: ['turma_financeiro_config', turma.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turmas')
        .select('valor_matricula, valor_rematricula, qtd_parcelas, valor_parcela, desconto_pontualidade, juros_atraso, multa_atraso')
        .eq('id', turma.id)
        .single();

      if (error) throw error;

      return {
        valorMatricula: Number(data.valor_matricula),
        valorRematricula: Number(data.valor_rematricula),
        qtdParcelas: Number(data.qtd_parcelas),
        valorParcela: Number(data.valor_parcela),
        descontoPontualidade: Number(data.desconto_pontualidade),
        jurosAtraso: Number(data.juros_atraso),
        multaAtraso: Number(data.multa_atraso)
      };
    }
  });

  // Salvar as configurações no banco via mutation
  const saveMutation = useMutation({
    mutationFn: (newConfig: typeof config) => gestaoService.saveTurmaFinanceiroConfig(turma.id, newConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turma_financeiro_config', turma.id] });
      toast.success("Sucesso", "Configurações e ordem do cronograma salvas!");
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast.error("Erro", `Erro ao salvar configurações: ${err.message}`);
    }
  });

  // Sincronizar estado local e cronograma quando os dados carregarem do banco
  useEffect(() => {
    if (configDb) {
      setConfig(configDb);
      setFormData(configDb);

      // Gerar cronograma automaticamente
      const novoCronograma: CronogramaItem[] = [];
      novoCronograma.push({
        id: 'matr',
        tipo: 'MATRICULA',
        label: 'Matrícula Inicial',
        valor: configDb.valorMatricula
      });
      for (let i = 1; i <= configDb.qtdParcelas; i++) {
        const isRematricula = i === 12;
        if (isRematricula) {
          novoCronograma.push({
            id: `rem-${i}`,
            tipo: 'REMATRICULA',
            label: 'Rematrícula Semestral',
            valor: configDb.valorRematricula
          });
        } else {
          novoCronograma.push({
            id: `parc-${i}`,
            tipo: 'PARCELA',
            label: `Parcela ${i}`,
            valor: configDb.valorParcela,
            numero: i
          });
        }
      }
      setCronograma(novoCronograma);
    }
  }, [configDb]);

  // Realtime Subscription para atualizar em tempo real quando alterado por outro usuário
  useEffect(() => {
    const channel = supabase
      .channel(`turma_financeiro_${turma.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'turmas', filter: `id=eq.${turma.id}` },
        (payload) => {
          console.log('Alteração detectada na turma via Realtime, invalidando cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['turma_financeiro_config', turma.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [turma.id, queryClient]);

  // Para a visualização (cálculo via RPC no Supabase)
  const { data: calculoConfig } = useQuery({
    queryKey: ['calculo_regras_turma', config.valorParcela, config.descontoPontualidade, config.jurosAtraso, config.multaAtraso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calcular_regras_financeiras_turma', {
        valor_parcela: config.valorParcela,
        desconto_pontualidade: config.descontoPontualidade,
        juros_atraso_percentual: config.jurosAtraso,
        multa_atraso: config.multaAtraso
      });
      if (error) throw error;
      return data[0];
    },
    staleTime: Infinity,
  });

  // Para a edição (cálculo via RPC no Supabase)
  const { data: calculoForm } = useQuery({
    queryKey: ['calculo_regras_turma_form', formData.valorParcela, formData.descontoPontualidade, formData.jurosAtraso, formData.multaAtraso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calcular_regras_financeiras_turma', {
        valor_parcela: formData.valorParcela,
        desconto_pontualidade: formData.descontoPontualidade,
        juros_atraso_percentual: formData.jurosAtraso,
        multa_atraso: formData.multaAtraso
      });
      if (error) throw error;
      return data[0];
    },
    staleTime: Infinity,
  });

  // Referências para arrastar
  const dragItem = useRef<any>(null);
  const dragOverItem = useRef<any>(null);

  // Formatar número como BRL
  const formatCurrencyBRL = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Handler para inputs de moeda BRL (Mascara em tempo real)
  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const digits = value.replace(/\D/g, '');
    const numericValue = digits ? parseFloat(digits) / 100 : 0;
    setFormData(prev => ({ ...prev, [name]: numericValue }));
  };

  // Handler para outros inputs numéricos
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  // Gera o cronograma com base nas configurações
  const gerarCronograma = () => {
    const totalMeses = formData.qtdParcelas + 1; // +1 para matrícula
    const novoCronograma: CronogramaItem[] = [];

    // Mês 1: Matrícula
    novoCronograma.push({
      id: 'matr',
      tipo: 'MATRICULA',
      label: 'Matrícula Inicial',
      valor: formData.valorMatricula
    });

    // Meses seguintes: Parcelas
    for (let i = 1; i <= formData.qtdParcelas; i++) {
      // Exemplo simples: Rematrícula no mês 12 se houver
      const isRematricula = i === 12; 
      
      if (isRematricula) {
        novoCronograma.push({
          id: `rem-${i}`,
          tipo: 'REMATRICULA',
          label: 'Rematrícula Semestral',
          valor: formData.valorRematricula
        });
      } else {
        novoCronograma.push({
          id: `parc-${i}`,
          tipo: 'PARCELA',
          label: `Parcela ${i}`,
          valor: formData.valorParcela,
          numero: i
        });
      }
    }

    setCronograma(novoCronograma);
  };

  const handleSort = () => {
    const _cronograma = [...cronograma];
    const draggedItemContent = _cronograma[dragItem.current];
    _cronograma.splice(dragItem.current, 1);
    _cronograma.splice(dragOverItem.current, 0, draggedItemContent);

    dragItem.current = null;
    dragOverItem.current = null;
    setCronograma(_cronograma);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  // --- Renderização dos Itens Arrastáveis ---
  const renderCronogramaItem = (item: CronogramaItem, index: number) => {
    let colorClass = '';
    let icon = null;

    switch (item.tipo) {
      case 'MATRICULA':
        colorClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
        icon = <DollarSign size={14} />;
        break;
      case 'REMATRICULA':
        colorClass = 'bg-amber-50 border-amber-200 text-amber-700';
        icon = <RefreshCw size={14} />;
        break;
      case 'PARCELA':
      default:
        colorClass = 'bg-white border-slate-200 text-slate-600 hover:border-blue-300';
        icon = <Calendar size={14} />;
        break;
    }

    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => (dragItem.current = index)}
        onDragEnter={() => (dragOverItem.current = index)}
        onDragEnd={handleSort}
        onDragOver={(e) => e.preventDefault()}
        className={`flex items-center justify-between p-3 rounded-xl border mb-2 cursor-move transition-all shadow-sm ${colorClass} active:scale-[0.98] active:shadow-lg`}
      >
        <div className="flex items-center gap-3">
          <div className="cursor-grab text-slate-400 hover:text-slate-600">
            <GripVertical size={18} />
          </div>
          <span className="font-bold text-[10px] uppercase bg-white/50 px-2 py-1 rounded border border-black/5">
            Mês {index + 1}
          </span>
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-bold text-sm">{item.label}</span>
          </div>
        </div>
        <div className="font-mono font-bold text-sm opacity-80">
          {formatCurrencyBRL(item.valor)}
        </div>
      </div>
    );
  };

  if (isEditing) {
    return (
      <>
      <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 mb-8 animate-fadeIn">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <Settings size={20} className="text-blue-600" /> Configurar Plano de Pagamento
          </h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Lado Esquerdo: Inputs de Valores */}
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
                <label className="text-xs font-bold text-slate-500 uppercase">Qtd. Parcelas</label>
                <input 
                  type="number" name="qtdParcelas" 
                  value={formData.qtdParcelas} onChange={handleChange} 
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
                      value={formData.jurosAtraso} onChange={handleChange} 
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
            </div>

            {/* Simulação Dinâmica na Edição */}
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
                  {calculoForm ? formatCurrencyBRL(calculoForm.valor_com_desconto) : formatCurrencyBRL(Math.max(0, formData.valorParcela - formData.descontoPontualidade))}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-50">
                <div className="flex flex-col">
                  <span className="text-slate-700 font-bold">Após o Vencimento (Exemplo 1 Mês de Atraso):</span>
                  <span className="text-[10px] text-slate-500">Parcela + Juros de {formData.jurosAtraso}% ({calculoForm ? formatCurrencyBRL(calculoForm.juros_calculados) : formatCurrencyBRL(formData.valorParcela * (formData.jurosAtraso / 100))}) + Multa de {formatCurrencyBRL(formData.multaAtraso)}</span>
                </div>
                <span className="font-extrabold text-sm text-rose-600">
                  {calculoForm ? formatCurrencyBRL(calculoForm.valor_com_atraso) : formatCurrencyBRL(formData.valorParcela + (formData.valorParcela * (formData.jurosAtraso / 100)) + formData.multaAtraso)}
                </span>
              </div>
            </div>

            <button 
              onClick={gerarCronograma}
              className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-widest hover:bg-slate-900 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} /> Gerar / Resetar Cronograma
            </button>
          </div>

          {/* Lado Direito: Drag & Drop */}
          <div className="flex flex-col h-full">
             <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4 flex justify-between items-center">
               <span>2. Ordem de Cobrança</span>
               <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600">Arraste para ordenar</span>
             </h4>

             <div className="flex-1 bg-slate-100 rounded-2xl p-4 overflow-y-auto max-h-[500px] border-2 border-dashed border-slate-300 custom-scrollbar relative">
                {cronograma.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                    <Calendar size={48} className="mb-2 opacity-50" />
                    <p className="text-sm font-medium text-center px-8">Configure os valores ao lado e clique em "Gerar Cronograma" para visualizar a lista.</p>
                  </div>
                ) : (
                  cronograma.map((item, index) => renderCronogramaItem(item, index))
                )}
             </div>
             
             {cronograma.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-500 text-center">
                   * A ordem definida acima será aplicada na geração dos boletos/mensalidades dos alunos.
                </div>
             )}
          </div>

        </div>

        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
          <button 
            onClick={() => setIsEditing(false)}
            className="px-6 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold uppercase text-xs hover:bg-white transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={cronograma.length === 0 || saveMutation.isPending}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold uppercase text-xs hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} /> {saveMutation.isPending ? 'Salvando...' : 'Salvar Regra Financeira'}
          </button>
        </div>
      </div>
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

  // Modo Visualização (Card Resumo)
  return (
    <>
    <div className="bg-white border border-slate-100 rounded-[2rem] p-8 mb-8 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Regras Financeiras</h3>
          <p className="text-slate-500 text-sm">Parâmetros aplicados a todos os alunos desta turma.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditing(true);
            setFormData({ ...config });
            if(cronograma.length === 0) gerarCronograma(); // Auto gera se estiver vazio na primeira edição
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-blue-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-50 transition-colors border border-slate-100"
        >
          <Edit2 size={14} /> Editar
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
            <DollarSign size={10} /> Matrícula
          </p>
          <p className="text-lg font-black text-[#001a33]">{formatCurrencyBRL(config.valorMatricula)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
            <Calendar size={10} /> Plano
          </p>
          <p className="text-lg font-black text-[#001a33]">
            {config.qtdParcelas}x + Remat.
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
            <DollarSign size={10} /> Mensalidade
          </p>
          <p className="text-lg font-black text-[#001a33]">{formatCurrencyBRL(config.valorParcela)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1">
            <RefreshCw size={10} /> Rematrícula
          </p>
          <p className="text-lg font-black text-amber-600">{formatCurrencyBRL(config.valorRematricula)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-emerald-600 font-bold uppercase flex items-center gap-1">
            <Percent size={10} /> Desconto
          </p>
          <p className="text-lg font-black text-emerald-600">- {formatCurrencyBRL(config.descontoPontualidade)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-red-500 font-bold uppercase flex items-center gap-1">
            <AlertCircle size={10} /> Juros/Mês
          </p>
          <p className="text-lg font-black text-red-500">{config.jurosAtraso}%</p>
        </div>
      </div>

      {/* Simulação de Valores */}
      <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block mb-1">Se pago até o vencimento (Com Desconto - RPC)</span>
            <p className="text-slate-500 text-xs font-medium">Valor da parcela com desconto de pontualidade aplicado</p>
          </div>
          <div className="mt-4 flex justify-between items-baseline">
            <span className="text-xs text-slate-400 font-bold">VALOR FINAL</span>
            <span className="text-xl font-black text-emerald-700">
              {calculoConfig ? formatCurrencyBRL(calculoConfig.valor_com_desconto) : formatCurrencyBRL(Math.max(0, config.valorParcela - config.descontoPontualidade))}
            </span>
          </div>
        </div>

        <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider block mb-1">Se pago após o vencimento (Exemplo com 1 mês de atraso - RPC)</span>
            <p className="text-slate-500 text-xs font-medium">Parcela + juros de {config.jurosAtraso}% ({calculoConfig ? formatCurrencyBRL(calculoConfig.juros_calculados) : formatCurrencyBRL(config.valorParcela * (config.jurosAtraso / 100))}) + multa de {formatCurrencyBRL(config.multaAtraso)}</p>
          </div>
          <div className="mt-4 flex justify-between items-baseline">
            <span className="text-xs text-slate-400 font-bold">VALOR FINAL</span>
            <span className="text-xl font-black text-rose-700">
              {calculoConfig ? formatCurrencyBRL(calculoConfig.valor_com_atraso) : formatCurrencyBRL(config.valorParcela + (config.valorParcela * (config.jurosAtraso / 100)) + config.multaAtraso)}
            </span>
          </div>
        </div>
      </div>
    </div>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroConfig;
