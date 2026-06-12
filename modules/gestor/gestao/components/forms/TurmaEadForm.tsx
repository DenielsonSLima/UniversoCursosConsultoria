
import React, { useState, useEffect } from 'react';
import { X, Save, MonitorPlay, Calendar, Lock } from 'lucide-react';
import { Turno } from '../../gestao.types';

interface TurmaEadFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[];
}

const TurmaEadForm: React.FC<TurmaEadFormProps> = ({ 
  isOpen, onClose, onSave, cursosDisponiveis 
}) => {
  const [formData, setFormData] = useState({
    cursoId: '',
    dataInicio: '',
    dataPrevisaoTermino: '',
    vagasTotais: 100,
    nomeAutomatico: '',
    codigoAutomatico: ''
  });

  // Lógica Automação EAD (Sem Polo)
  useEffect(() => {
    if (formData.cursoId && formData.dataInicio) {
        const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
        const date = new Date(formData.dataInicio);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const semester = month <= 6 ? 1 : 2;

        if (curso && !isNaN(year)) {
            const siglaCurso = curso.nome.substring(0, 4).toUpperCase().replace(/\s/g, '');
            
            // Código: 2024.1-GEST-EAD
            const codigo = `${year}.${semester}-${siglaCurso}-EAD`;
            
            // Nome: Gestão Hospitalar - EAD - 2024.1
            const nome = `${curso.nome} - EAD - ${year}.${semester}`;

            setFormData(prev => ({ ...prev, nomeAutomatico: nome, codigoAutomatico: codigo }));
        }
    }
  }, [formData.cursoId, formData.dataInicio, cursosDisponiveis]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
    if (!curso) { alert('Selecione o curso'); return; }

    onSave({
        ...formData,
        nome: formData.nomeAutomatico,
        codigo: formData.codigoAutomatico,
        cursoNome: curso.nome,
        turno: 'EAD' as Turno,
        modalidade: 'EAD',
        status: 'EM_ANDAMENTO'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-fadeIn border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <div>
             <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Nova Turma EAD</h3>
             <p className="text-xs text-slate-500 font-medium">Sem necessidade de polo físico.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                <MonitorPlay size={14} className="text-purple-600" /> Curso EAD
            </label>
            <select 
                className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-purple-500"
                value={formData.cursoId}
                onChange={(e) => setFormData({...formData, cursoId: e.target.value})}
                required
            >
                <option value="">Selecione...</option>
                {cursosDisponiveis.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Calendar size={14} /> Data Início
                </label>
                <input 
                    type="date" 
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-purple-500 bg-slate-50"
                    value={formData.dataInicio}
                    onChange={(e) => setFormData({...formData, dataInicio: e.target.value})}
                    required
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Calendar size={14} /> Fim Previsto
                </label>
                <input 
                    type="date" 
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-purple-500 bg-slate-50"
                    value={formData.dataPrevisaoTermino}
                    onChange={(e) => setFormData({...formData, dataPrevisaoTermino: e.target.value})}
                    required
                />
            </div>
          </div>

          <div className="space-y-2">
             <label className="text-xs font-bold text-slate-500 uppercase">Vagas Disponíveis</label>
             <input 
                type="number" 
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-purple-500 bg-slate-50"
                value={formData.vagasTotais}
                onChange={(e) => setFormData({...formData, vagasTotais: parseInt(e.target.value)})}
                required
             />
          </div>

          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-3">
             <div className="flex items-center gap-2 text-purple-700/60 mb-1">
                <Lock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Nomenclatura Padrão</span>
             </div>
             <div>
                <div className="font-bold text-[#001a33] text-sm break-words">
                    {formData.nomeAutomatico || 'Aguardando seleção...'}
                </div>
                <div className="font-mono font-bold text-[#001a33] text-xs tracking-wider mt-1 opacity-70">
                    {formData.codigoAutomatico}
                </div>
             </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
                type="submit"
                disabled={!formData.nomeAutomatico}
                className="px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-purple-700 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save size={16} /> Criar Turma Online
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default TurmaEadForm;
