
// File: modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx

import React, { useState, useRef } from 'react';
import { 
  Settings, Save, Edit2, DollarSign, Calendar, Percent, AlertCircle, 
  GripVertical, RefreshCw, Plus, Trash2 
} from 'lucide-react';

interface CronogramaItem {
  id: string;
  tipo: 'MATRICULA' | 'PARCELA' | 'REMATRICULA';
  label: string;
  valor: number;
  numero?: number; // Número da parcela se for parcela
}

const FinanceiroConfig: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  
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

  const [formData, setFormData] = useState(config);

  // Estado do Cronograma (Lista Ordenável)
  const [cronograma, setCronograma] = useState<CronogramaItem[]>([]);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // --- Lógica de Geração do Cronograma ---
  const gerarCronograma = () => {
    const itens: CronogramaItem[] = [];

    // 1. Adiciona Matrícula
    itens.push({
      id: 'mat-1',
      tipo: 'MATRICULA',
      label: 'Matrícula Inicial',
      valor: formData.valorMatricula
    });

    // 2. Adiciona Parcelas
    for (let i = 1; i <= formData.qtdParcelas; i++) {
      itens.push({
        id: `parc-${i}`,
        tipo: 'PARCELA',
        label: `Parcela ${i}`,
        valor: formData.valorParcela,
        numero: i
      });
    }

    // 3. Adiciona Rematrícula (Por padrão no final, mas usuário pode mover)
    itens.push({
      id: 'remat-1',
      tipo: 'REMATRICULA',
      label: 'Renovação / Rematrícula',
      valor: formData.valorRematricula
    });

    setCronograma(itens);
  };

  // --- Lógica de Drag & Drop ---
  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;

    const _cronograma = [...cronograma];
    const draggedItemContent = _cronograma[dragItem.current];

    _cronograma.splice(dragItem.current, 1);
    _cronograma.splice(dragOverItem.current, 0, draggedItemContent);

    dragItem.current = null;
    dragOverItem.current = null;
    setCronograma(_cronograma);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: parseFloat(value) || 0 });
  };

  const handleSave = () => {
    setConfig(formData);
    setIsEditing(false);
    // Aqui salvaria `formData` e a ordem do `cronograma` no backend
    alert("Configurações e ordem do cronograma salvas!");
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
          R$ {item.valor.toFixed(2)}
        </div>
      </div>
    );
  };

  if (isEditing) {
    return (
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
                  type="number" step="0.01" name="valorMatricula" 
                  value={formData.valorMatricula} onChange={handleChange} 
                  className="w-full p-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 font-bold text-slate-700 bg-white" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Rematrícula (R$)</label>
                <input 
                  type="number" step="0.01" name="valorRematricula" 
                  value={formData.valorRematricula} onChange={handleChange} 
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
                  type="number" step="0.01" name="valorParcela" 
                  value={formData.valorParcela} onChange={handleChange} 
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
                      type="number" step="0.01" name="descontoPontualidade" 
                      value={formData.descontoPontualidade} onChange={handleChange} 
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
                      type="number" step="0.01" name="multaAtraso" 
                      value={formData.multaAtraso} onChange={handleChange} 
                      className="w-full p-2 rounded-lg border border-blue-200 text-xs bg-white text-slate-700 outline-none focus:border-blue-500" 
                    />
                  </div>
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
            disabled={cronograma.length === 0}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold uppercase text-xs hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} /> Salvar Regra Financeira
          </button>
        </div>
      </div>
    );
  }

  // Modo Visualização (Card Resumo)
  return (
    <div className="bg-white border border-slate-100 rounded-[2rem] p-8 mb-8 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Regras Financeiras</h3>
          <p className="text-slate-500 text-sm">Parâmetros aplicados a todos os alunos desta turma.</p>
        </div>
        <button 
          onClick={() => {
            setIsEditing(true);
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
          <p className="text-lg font-black text-[#001a33]">R$ {config.valorMatricula.toFixed(2)}</p>
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
          <p className="text-lg font-black text-[#001a33]">R$ {config.valorParcela.toFixed(2)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1">
            <RefreshCw size={10} /> Rematrícula
          </p>
          <p className="text-lg font-black text-amber-600">R$ {config.valorRematricula.toFixed(2)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-emerald-600 font-bold uppercase flex items-center gap-1">
            <Percent size={10} /> Desconto
          </p>
          <p className="text-lg font-black text-emerald-600">- R$ {config.descontoPontualidade.toFixed(2)}</p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] text-red-500 font-bold uppercase flex items-center gap-1">
            <AlertCircle size={10} /> Juros/Mês
          </p>
          <p className="text-lg font-black text-red-500">{config.jurosAtraso}%</p>
        </div>
      </div>
    </div>
  );
};

export default FinanceiroConfig;
