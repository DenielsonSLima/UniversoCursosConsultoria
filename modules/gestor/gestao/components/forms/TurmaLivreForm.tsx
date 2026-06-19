
import React, { useState, useEffect } from 'react';
import { X, Save, Zap, MapPin, Calendar, Clock, Lock } from 'lucide-react';
import { Turno } from '../../gestao.types';
import { polosService } from '../../../configuracoes/polos/polos.service';

interface TurmaLivreFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[];
}

const TurmaLivreForm: React.FC<TurmaLivreFormProps> = ({ 
  isOpen, onClose, onSave, cursosDisponiveis 
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    cursoId: '',
    poloId: '',
    dataInicio: '',
    dataPrevisaoTermino: '',
    turno: 'NOTURNO' as Turno,
    vagasTotais: 30,
    nomeAutomatico: '',
    codigoAutomatico: ''
  });

  useEffect(() => {
    polosService.getAll().then(setPolos);
  }, []);

  useEffect(() => {
    if (formData.cursoId && formData.poloId && formData.dataInicio && formData.turno) {
        const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
        const polo = polos.find(p => p.id === formData.poloId);
        const date = new Date(formData.dataInicio);
        const year = date.getFullYear();
        // Cursos livres usam o mes como referencia no código muitas vezes
        const month = (date.getMonth() + 1).toString().padStart(2, '0');

        if (curso && polo && !isNaN(year)) {
            const siglaCurso = curso.nome.substring(0, 4).toUpperCase().replace(/\s/g, '');
            const poloSigla = polo.cidade.substring(0, 3).toUpperCase();
            const turnoSigla = formData.turno.substring(0, 3).toUpperCase();

            // Código: LIVRE-EXCEL-NOT-JAP-04/24
            const codigo = `LIVRE-${siglaCurso}-${turnoSigla}-${poloSigla}-${month}/${year.toString().slice(-2)}`;
            
            // Nome: Excel Avançado - Noturno - Japoatã
            const nome = `${curso.nome} - ${formData.turno.charAt(0) + formData.turno.slice(1).toLowerCase()} - ${polo.cidade}`;

            setFormData(prev => ({ ...prev, nomeAutomatico: nome, codigoAutomatico: codigo }));
        }
    }
  }, [formData.cursoId, formData.poloId, formData.dataInicio, formData.turno, cursosDisponiveis, polos]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
    const polo = polos.find(p => p.id === formData.poloId);

    if (!curso || !polo) { alert('Selecione curso e polo'); return; }

    onSave({
        ...formData,
        nome: formData.nomeAutomatico,
        codigo: formData.codigoAutomatico,
        cursoNome: curso.nome,
        poloNome: polo.cidade,
        modalidade: 'LIVRE',
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
             <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Nova Turma Curso Livre</h3>
             <p className="text-xs text-slate-500 font-medium">Capacitação rápida e prática.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" /> Curso Livre
                </label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-amber-500"
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

             <div className="space-y-2">
                <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                    <MapPin size={14} className="text-amber-500" /> Polo
                </label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-amber-500"
                    value={formData.poloId}
                    onChange={(e) => setFormData({...formData, poloId: e.target.value})}
                    required
                >
                    <option value="">Selecione...</option>
                    {polos.map(p => (
                        <option key={p.id} value={p.id}>{p.nomeFantasia} ({p.cidade})</option>
                    ))}
                </select>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Clock size={14} /> Turno
                </label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-amber-500"
                    value={formData.turno}
                    onChange={(e) => setFormData({...formData, turno: e.target.value as Turno})}
                >
                    <option value="MATUTINO">Matutino</option>
                    <option value="VESPERTINO">Vespertino</option>
                    <option value="NOTURNO">Noturno</option>
                    <option value="INTEGRAL">Integral</option>
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Calendar size={14} /> Início
                </label>
                <input 
                    type="date" 
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-amber-500 bg-slate-50"
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
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-amber-500 bg-slate-50"
                    value={formData.dataPrevisaoTermino}
                    onChange={(e) => setFormData({...formData, dataPrevisaoTermino: e.target.value})}
                    required
                />
            </div>
          </div>

          <div className="space-y-2">
             <label className="text-xs font-bold text-slate-500 uppercase">Vagas Totais</label>
             <input 
                type="number" 
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-amber-500 bg-slate-50"
                value={formData.vagasTotais}
                onChange={(e) => setFormData({...formData, vagasTotais: parseInt(e.target.value)})}
                required
             />
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3">
             <div className="flex items-center gap-2 text-amber-700/60 mb-1">
                <Lock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Identificação Automática</span>
             </div>
             <div>
                <div className="font-bold text-[#001a33] text-sm break-words">
                    {formData.nomeAutomatico || 'Selecione os dados acima...'}
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
                className="px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-amber-600 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save size={16} /> Abrir Turma
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default TurmaLivreForm;
