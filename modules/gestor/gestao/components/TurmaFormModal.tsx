
import React, { useState } from 'react';
import { X, Save, Layers } from 'lucide-react';
import { Turno } from '../gestao.types';

interface TurmaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[]; // Lista de cursos do cadastro
  modalidade: string;
}

const TurmaFormModal: React.FC<TurmaFormModalProps> = ({ 
  isOpen, onClose, onSave, cursosDisponiveis, modalidade 
}) => {
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    cursoId: '',
    dataInicio: '',
    dataPrevisaoTermino: '',
    turno: 'MATUTINO' as Turno,
    vagasTotais: 40
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cursoSelecionado = cursosDisponiveis.find(c => c.id === formData.cursoId);
    
    if (!cursoSelecionado) {
        alert('Selecione um curso!');
        return;
    }

    onSave({
        ...formData,
        cursoNome: cursoSelecionado.nome,
        modalidade: modalidade,
        status: 'EM_ANDAMENTO'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-fadeIn border border-slate-100">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Nova Turma - {modalidade}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Seleção do Curso (Cadastro) */}
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <label className="block text-xs font-bold text-blue-800 uppercase mb-2 flex items-center gap-2">
                <Layers size={14} /> Selecionar Curso Base
            </label>
            <select 
                className="w-full p-3 rounded-xl border border-blue-200 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
                value={formData.cursoId}
                onChange={(e) => setFormData({...formData, cursoId: e.target.value})}
                required
            >
                <option value="">-- Selecione o Curso --</option>
                {cursosDisponiveis.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </select>
            <p className="text-[10px] text-blue-600/70 mt-2">
                * As turmas são vinculadas aos cursos cadastrados no módulo "Cadastros".
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome da Turma</label>
                <input 
                    type="text" 
                    placeholder="Ex: Turma Alpha 2024"
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-slate-50"
                    value={formData.nome}
                    onChange={(e) => setFormData({...formData, nome: e.target.value})}
                    required
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Código Identificador</label>
                <input 
                    type="text" 
                    placeholder="Ex: 2024.1-ENF-M"
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-slate-50 uppercase"
                    value={formData.codigo}
                    onChange={(e) => setFormData({...formData, codigo: e.target.value})}
                    required
                />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Turno</label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-blue-500"
                    value={formData.turno}
                    onChange={(e) => setFormData({...formData, turno: e.target.value as Turno})}
                >
                    <option value="MATUTINO">Matutino</option>
                    <option value="VESPERTINO">Vespertino</option>
                    <option value="NOTURNO">Noturno</option>
                    <option value="INTEGRAL">Integral</option>
                    <option value="EAD">EAD / Online</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                <input 
                    type="date" 
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-slate-50"
                    value={formData.dataInicio}
                    onChange={(e) => setFormData({...formData, dataInicio: e.target.value})}
                    required
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Previsão Término</label>
                <input 
                    type="date" 
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-slate-50"
                    value={formData.dataPrevisaoTermino}
                    onChange={(e) => setFormData({...formData, dataPrevisaoTermino: e.target.value})}
                    required
                />
            </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vagas Totais</label>
             <input 
                type="number" 
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 bg-slate-50"
                value={formData.vagasTotais}
                onChange={(e) => setFormData({...formData, vagasTotais: parseInt(e.target.value)})}
                required
             />
          </div>

          <div className="flex justify-end pt-4">
            <button 
                type="submit"
                className="px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2"
            >
                <Save size={16} /> Criar Turma
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default TurmaFormModal;
