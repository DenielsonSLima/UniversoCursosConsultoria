
// File: modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx

import React, { useState, useRef, useEffect } from 'react';
import { 
  Settings, Save, Edit2, DollarSign, Calendar, Percent, AlertCircle, 
  GripVertical, RefreshCw, Plus, Trash2 
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { supabase } from '../../../../../../../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../../gestao.types';
import { gestaoService } from '../../../../gestao.service';




interface CronogramaItem {
  id: string;
  tipo: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  label: string;
  valor: number;
  numero?: number; // Número da parcela se for parcela
  dataVencimento?: string;
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
    multaAtraso: 5.00,
    diaVencimentoPadrao: 10,
    cronogramaFinanceiro: [] as any[]
  });

  const [formData, setFormData] = useState({ ...config });
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);

  // Helper para calcular a data de vencimento sequencial por mês
  const calcularDataVencimento = (dataInicio: string, diaVencimento: number, offsetMeses: number): string => {
    if (!dataInicio) return '';
    const date = new Date(dataInicio + 'T00:00:00');
    
    // Adiciona o offset de meses
    date.setMonth(date.getMonth() + offsetMeses);
    
    const ano = date.getFullYear();
    const mes = date.getMonth();
    
    // Evita extrapolar dias do mês (ex: 31 de fevereiro)
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const diaFinal = Math.min(diaVencimento, ultimoDia);
    
    const dateFinal = new Date(ano, mes, diaFinal);
    
    const y = dateFinal.getFullYear();
    const m = String(dateFinal.getMonth() + 1).padStart(2, '0');
    const d = String(dateFinal.getDate()).padStart(2, '0');
    
    return `${y}-${m}-${d}`;
  };

  const handleUpdateItemDate = (itemId: string, newDate: string) => {
    setCronograma(prev => 
      prev.map(item => 
        item.id === itemId ? { ...item, dataVencimento: newDate } : item
      )
    );
  };

  // Carregar as configurações financeiras específicas desta turma do banco
  const { data: configDb, isLoading } = useQuery({
    queryKey: ['turma_financeiro_config', turma.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turmas')
        .select('valor_matricula, valor_rematricula, qtd_parcelas, valor_parcela, desconto_pontualidade, juros_atraso, multa_atraso, dia_vencimento_padrao, cronograma_financeiro')
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
        multaAtraso: Number(data.multa_atraso),
        diaVencimentoPadrao: Number(data.dia_vencimento_padrao || 10),
        cronogramaFinanceiro: data.cronograma_financeiro || []
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

      // Carregar cronograma salvo se existir, senão gerar o padrão
      if (configDb.cronogramaFinanceiro && Array.isArray(configDb.cronogramaFinanceiro) && configDb.cronogramaFinanceiro.length > 0) {
        const loadedCronograma: CronogramaItem[] = configDb.cronogramaFinanceiro.map((item: any) => ({
          id: item.id,
          tipo: item.tipo,
          label: item.label,
          valor: Number(item.valor),
          numero: item.numero,
          dataVencimento: item.dataVencimento
        }));
        setCronograma(loadedCronograma);
      } else {
        const novoCronograma: CronogramaItem[] = [];
        novoCronograma.push({
          id: 'matr',
          tipo: 'MATRICULA',
          label: 'Matrícula Inicial',
          valor: configDb.valorMatricula,
          dataVencimento: turma.dataInicio || ''
        });
        for (let i = 1; i <= configDb.qtdParcelas; i++) {
          const isRematricula = i === 12;
          if (isRematricula) {
            novoCronograma.push({
              id: `rem-${i}`,
              tipo: 'REMATRICULA',
              label: 'Rematrícula Semestral',
              valor: configDb.valorRematricula,
              dataVencimento: calcularDataVencimento(turma.dataInicio, configDb.diaVencimentoPadrao, i)
            });
          } else {
            novoCronograma.push({
              id: `parc-${i}`,
              tipo: 'PARCELA',
              label: `Parcela ${i}`,
              valor: configDb.valorParcela,
              numero: i,
              dataVencimento: calcularDataVencimento(turma.dataInicio, configDb.diaVencimentoPadrao, i)
            });
          }
        }
        setCronograma(novoCronograma);
      }
    }
  }, [configDb, turma.dataInicio]);

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
    const novoCronograma: CronogramaItem[] = [];

    // Mês 1: Matrícula
    novoCronograma.push({
      id: 'matr',
      tipo: 'MATRICULA',
      label: 'Matrícula Inicial',
      valor: formData.valorMatricula,
      dataVencimento: turma.dataInicio || ''
    });

    // Meses seguintes: Parcelas
    for (let i = 1; i <= formData.qtdParcelas; i++) {
      const isRematricula = i === 12; 
      
      if (isRematricula) {
        novoCronograma.push({
          id: `rem-${i}`,
          tipo: 'REMATRICULA',
          label: 'Rematrícula Semestral',
          valor: formData.valorRematricula,
          dataVencimento: calcularDataVencimento(turma.dataInicio, formData.diaVencimentoPadrao, i)
        });
      } else {
        novoCronograma.push({
          id: `parc-${i}`,
          tipo: 'PARCELA',
          label: `Parcela ${i}`,
          valor: formData.valorParcela,
          numero: i,
          dataVencimento: calcularDataVencimento(turma.dataInicio, formData.diaVencimentoPadrao, i)
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
    saveMutation.mutate({
      ...formData,
      cronogramaFinanceiro: cronograma
    });
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
        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border mb-2 cursor-move transition-all shadow-sm ${colorClass} active:scale-[0.98] active:shadow-lg gap-2`}
      >
        <div className="flex items-center gap-3">
          <div className="cursor-grab text-slate-400 hover:text-slate-600">
            <GripVertical size={18} />
          </div>
          <span className="font-bold text-[10px] uppercase bg-white/50 px-2 py-1 rounded border border-black/5 shrink-0">
            Mês {index + 1}
          </span>
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-bold text-sm">{item.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <input 
            type="date"
            value={item.dataVencimento || ''}
            onChange={(e) => handleUpdateItemDate(item.id, e.target.value)}
            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-500 text-slate-700 shadow-sm"
          />
          <div className="font-mono font-bold text-sm opacity-80 min-w-[90px] text-right">
            {formatCurrencyBRL(item.valor)}
          </div>
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
              <div className="space-y-2 col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Dia de Vencimento Padrão</label>
                <select
                  name="diaVencimentoPadrao"
                  value={formData.diaVencimentoPadrao}
                  onChange={(e) => setFormData(prev => ({ ...prev, diaVencimentoPadrao: parseInt(e.target.value) || 10 }))}
                  className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white"
                >
                  {[5, 10, 15, 20, 25, 28].map(d => (
                    <option key={d} value={d}>Todo dia {String(d).padStart(2, '0')}</option>
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
      {/* Coluna Esquerda: Regras e Simulações (ocupa 2/3) */}
      <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Regras Financeiras</h3>
              <p className="text-slate-500 text-sm">Parâmetros aplicados a todos os alunos desta turma.</p>
            </div>
            <button 
              onClick={() => {
                setIsEditing(true);
                setFormData({ ...config });
                if(cronograma.length === 0) gerarCronograma();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-blue-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-50 transition-colors border border-slate-100"
            >
              <Edit2 size={14} /> Editar
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
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
                <Calendar size={10} /> Vencimento Padrão
              </p>
              <p className="text-lg font-black text-[#001a33]">Dia {String(config.diaVencimentoPadrao).padStart(2, '0')}</p>
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

      {/* Coluna Direita: Cronograma Cronológico de Cobrança (ocupa 1/3) */}
      <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col max-h-[500px]">
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Cronograma de Cobrança</h3>
          <p className="text-slate-500 text-xs mt-0.5">Datas de vencimento estimadas por parcela.</p>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2.5">
          {cronograma.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
              <Calendar size={32} className="mb-2 opacity-50" />
              <p className="text-xs font-semibold text-center">Nenhum cronograma gerado. Clique em Editar para criar.</p>
            </div>
          ) : (
            cronograma.map((item, index) => {
              let badgeColor = 'bg-slate-100 text-slate-600';
              if (item.tipo === 'MATRICULA') badgeColor = 'bg-emerald-100 text-emerald-800';
              if (item.tipo === 'REMATRICULA') badgeColor = 'bg-amber-100 text-amber-800';
              
              const formattedDate = item.dataVencimento 
                ? new Date(item.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Sem data';

              return (
                <div key={item.id} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors shadow-sm">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-bold text-[#001a33] truncate">{item.label}</p>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${badgeColor}`}>Mês {index + 1}</span>
                      <span>Vencimento: {formattedDate}</span>
                    </p>
                  </div>
                  <span className="font-mono font-bold text-xs text-slate-700 shrink-0">
                    {formatCurrencyBRL(item.valor)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default FinanceiroConfig;
