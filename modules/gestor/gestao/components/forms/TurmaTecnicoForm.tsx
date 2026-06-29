
import React, { useState, useEffect } from 'react';
import { X, Save, Layers, MapPin, Calendar, CalendarClock, Clock, Lock, MonitorPlay, Settings, Users2 } from 'lucide-react';
import { Turno } from '../../gestao.types';
import { polosService } from '../../../configuracoes/polos/polos.service';

interface TurmaTecnicoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
}

const TurmaTecnicoForm: React.FC<TurmaTecnicoFormProps> = ({ 
  isOpen, onClose, onSave, cursosDisponiveis, selectedPoloId
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    cursoId: '',
    poloId: '',
    dataInicio: '',
    dataPrevisaoTermino: '',
    dataInicioInscricao: '',
    dataFimInscricao: '',
    permitirInscricoesOnline: false,
    exigeMatricula: true,
    qtdVagasMinima: 0,
    bloquearMatriculasAposCompletarVagas: true,
    turno: 'NOTURNO' as Turno,
    vagasTotais: 40,
    origemFinanceira: 'NORMAL' as const,
    financeiroHerdado: false,
    gerarCobrancasFuturas: true,
    sincronizarAsaasFuturo: true,
    // Campos calculados
    nomeAutomatico: '',
    codigoAutomatico: ''
  });

  // Carregar Polos
  useEffect(() => {
    polosService.getAll().then(setPolos);
  }, []);

  useEffect(() => {
    if (selectedPoloId) {
      setFormData(prev => ({ ...prev, poloId: selectedPoloId }));
    }
  }, [selectedPoloId]);

  // Lógica de Automação
  useEffect(() => {
    if (formData.cursoId && formData.poloId && formData.dataInicio && formData.turno) {
        const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
        const polo = polos.find(p => p.id === formData.poloId);
        const date = new Date(formData.dataInicio);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const semester = month <= 6 ? 1 : 2;

        if (curso && polo && !isNaN(year)) {
            // Pegar sigla melhor do curso: Ex: "Técnico em Enfermagem" -> "ENF"
            const siglaCursoSmart = curso.nome.includes('Enfermagem') ? 'ENF' : curso.nome.includes('Radiologia') ? 'RAD' : curso.nome.substring(0,4).toUpperCase().replace(/\s/g, '');
            
            const poloSigla = polo.cidade.substring(0, 3).toUpperCase();
            const turnoSigla = formData.turno.substring(0, 3).toUpperCase();

            // Código: 2024.1-ENF-NOT-JAP
            const codigo = `${year}.${semester}-${siglaCursoSmart}-${turnoSigla}-${poloSigla}`;
            
            // Nome: Técnico em Enfermagem - Noturno - Japoatã - 2024.1
            const nome = `${curso.nome} - ${formData.turno.charAt(0) + formData.turno.slice(1).toLowerCase()} - ${polo.cidade} - ${year}.${semester}`;

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
        origemFinanceira: formData.origemFinanceira,
        financeiroHerdado: formData.financeiroHerdado,
        gerarCobrancasFuturas: formData.gerarCobrancasFuturas,
        sincronizarAsaasFuturo: formData.sincronizarAsaasFuturo,
        cursoNome: curso.nome,
        poloNome: polo.cidade,
        modalidade: 'TECNICO',
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
             <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Nova Turma Técnica</h3>
             <p className="text-xs text-slate-500 font-medium">Preencha os dados base para gerar a turma.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Curso */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                    <Layers size={14} className="text-emerald-600" /> Curso Técnico
                </label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-emerald-500"
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

             {/* Polo */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                    <MapPin size={14} className="text-emerald-600" /> Polo / Unidade
                </label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-emerald-500"
                    value={formData.poloId}
                    onChange={(e) => setFormData({...formData, poloId: e.target.value})}
                    disabled={Boolean(selectedPoloId)}
                    required
                >
                    <option value="">Selecione...</option>
                    {polos.filter(p => !selectedPoloId || p.id === selectedPoloId).map(p => (
                        <option key={p.id} value={p.id}>{p.nomeFantasia} ({p.cidade})</option>
                    ))}
                </select>
             </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Configuração financeira para turma em andamento
            </p>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.origemFinanceira === 'LEGADO'}
                onChange={(e) => setFormData((current) => ({
                  ...current,
                  origemFinanceira: e.target.checked ? 'LEGADO' : 'NORMAL',
                  financeiroHerdado: e.target.checked ? true : current.financeiroHerdado,
                  gerarCobrancasFuturas: e.target.checked ? false : current.gerarCobrancasFuturas,
                }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Turma com histórico financeiro anterior
            </label>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.gerarCobrancasFuturas}
                onChange={(e) => setFormData((current) => ({ ...current, gerarCobrancasFuturas: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Gerar cobranças futuras
            </label>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.sincronizarAsaasFuturo}
                onChange={(e) => setFormData((current) => ({ ...current, sincronizarAsaasFuturo: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Sincronizar futuras cobranças com Asaas
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Clock size={14} /> Turno
                </label>
                <select 
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none focus:border-emerald-500"
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
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-slate-50"
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
                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-slate-50"
                    value={formData.dataPrevisaoTermino}
                    onChange={(e) => setFormData({...formData, dataPrevisaoTermino: e.target.value})}
                    required
                />
            </div>
          </div>

          {/* Vagas */}
          <div className="space-y-2">
             <label className="text-xs font-bold text-slate-500 uppercase">Vagas Totais</label>
             <input 
                type="number" 
                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-slate-50"
                value={formData.vagasTotais}
                onChange={(e) => setFormData({...formData, vagasTotais: parseInt(e.target.value, 10) || 0})}
                required
             />
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 space-y-4">
            <label className="flex items-start gap-3 text-xs font-bold uppercase text-emerald-700">
              <input
                type="checkbox"
                checked={formData.permitirInscricoesOnline}
                onChange={(e) => setFormData((current) => ({ ...current, permitirInscricoesOnline: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600"
              />
              <span>
                <span className="flex items-center gap-2 text-[#001a33]">
                  <MonitorPlay size={14} className="text-emerald-600" />
                  Permitir inscrições online
                </span>
                <span className="mt-1 block text-[10px] font-bold normal-case leading-relaxed text-emerald-700/70">
                  Mostra o botão de matrícula no portal do aluno e no site para esta turma.
                </span>
              </span>
            </label>

            {formData.permitirInscricoesOnline && (
              <div className="space-y-4 border-t border-emerald-100 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
                      <CalendarClock size={14} />
                      Início Inscrições
                    </label>
                    <input
                      type="date"
                      className="w-full p-3 rounded-xl border border-emerald-100 outline-none focus:border-emerald-500 bg-white"
                      value={formData.dataInicioInscricao}
                      onChange={(e) => setFormData((current) => ({ ...current, dataInicioInscricao: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
                      <CalendarClock size={14} />
                      Fim Inscrições
                    </label>
                    <input
                      type="date"
                      className="w-full p-3 rounded-xl border border-emerald-100 outline-none focus:border-emerald-500 bg-white"
                      value={formData.dataFimInscricao}
                      onChange={(e) => setFormData((current) => ({ ...current, dataFimInscricao: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
                      <Users2 size={14} />
                      Limite de alunos online
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full p-3 rounded-xl border border-emerald-100 outline-none focus:border-emerald-500 bg-white"
                      value={formData.qtdVagasMinima}
                      onChange={(e) => setFormData((current) => ({ ...current, qtdVagasMinima: parseInt(e.target.value, 10) || 0 }))}
                    />
                  </div>
                  <div className="space-y-3 md:pt-7">
                    <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.bloquearMatriculasAposCompletarVagas}
                        onChange={(e) => setFormData((current) => ({ ...current, bloquearMatriculasAposCompletarVagas: e.target.checked }))}
                        className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
                      />
                      Fechar matrícula ao completar vagas
                    </label>
                    <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
                      <Settings size={14} />
                      <input
                        type="checkbox"
                        checked={formData.exigeMatricula}
                        onChange={(e) => setFormData((current) => ({ ...current, exigeMatricula: e.target.checked }))}
                        className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
                      />
                      Exigir pagamento de matrícula
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Área de Automação Visual */}
          <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 space-y-3">
             <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Lock size={12} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Campos Gerados Automaticamente</span>
             </div>
             
             <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Nome da Turma</label>
                <div className="font-bold text-[#001a33] text-sm break-words">
                    {formData.nomeAutomatico || '...'}
                </div>
             </div>
             <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Código Identificador</label>
                <div className="font-mono font-bold text-[#001a33] text-sm tracking-wider bg-white p-2 rounded border border-slate-200 inline-block">
                    {formData.codigoAutomatico || '...'}
                </div>
             </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
                type="submit"
                disabled={!formData.nomeAutomatico}
                className="px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-emerald-800 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save size={16} /> Confirmar Abertura
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default TurmaTecnicoForm;
