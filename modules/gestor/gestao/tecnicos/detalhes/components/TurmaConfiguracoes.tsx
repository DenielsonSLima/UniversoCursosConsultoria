
import React from 'react';
import { Save, Trash2, Power } from 'lucide-react';
import { Turma } from '../../../gestao.types';

interface TurmaConfiguracoesProps {
  turma: Turma;
}

const TurmaConfiguracoes: React.FC<TurmaConfiguracoesProps> = ({ turma }) => {
  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm animate-fadeIn">
      <h3 className="text-lg font-bold text-[#001a33] mb-6 border-b border-slate-100 pb-4">Editar Turma</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Nome da Turma</label>
          <input type="text" defaultValue={turma.nome} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700 font-bold" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Polo</label>
          <input type="text" defaultValue={turma.poloNome} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Data Início</label>
          <input type="date" defaultValue={turma.dataInicio} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Previsão Término</label>
          <input type="date" defaultValue={turma.dataPrevisaoTermino} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 pt-6 border-t border-slate-100">
        <button className="flex items-center justify-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-emerald-900 transition-colors">
          <Save size={16} /> Salvar Alterações
        </button>
        
        <div className="flex-1"></div>

        <button className="flex items-center justify-center gap-2 px-6 py-3 border border-orange-200 text-orange-600 bg-orange-50 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-orange-100 transition-colors">
          <Power size={16} /> Encerrar Turma
        </button>
        <button className="flex items-center justify-center gap-2 px-6 py-3 border border-red-200 text-red-600 bg-red-50 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-red-100 transition-colors">
          <Trash2 size={16} /> Excluir
        </button>
      </div>
    </div>
  );
};

export default TurmaConfiguracoes;
