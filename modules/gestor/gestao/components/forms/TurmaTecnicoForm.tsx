
import React, { useState, useEffect } from 'react';
import { X, Save, Layers, MapPin, Calendar, Clock, Lock } from 'lucide-react';
import { Turno } from '../../gestao.types';
import { polosService } from '../../../configuracoes/polos/polos.service';
import { getInitialTechnicalStatus } from '../../tecnicos/technicalClassDates';
import TechnicalEnrollmentSettings from './TechnicalEnrollmentSettings';
import TechnicalAcademicSettings from './TechnicalAcademicSettings';

interface TurmaTecnicoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void> | void;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
}

const getFriendlySubmitError = (error: any) => {
  const message = String(error?.message || '').trim();
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('row-level security')) {
    return 'Seu usuário não tem permissão para criar turma neste polo. Verifique o polo ativo ou o escopo do gestor.';
  }

  if (lowerMessage.includes('duplicate key') || lowerMessage.includes('turmas_codigo_key')) {
    return 'Já existe uma turma com este código. Altere curso, turno, polo ou data de início para gerar outro código.';
  }

  if (lowerMessage.includes('turmas_turno_check') || (lowerMessage.includes('check constraint') && lowerMessage.includes('turno'))) {
    return 'O turno selecionado não está aceito no banco. A migration de turnos precisa estar aplicada.';
  }

  return message || 'Não foi possível criar a turma. Verifique os dados e tente novamente.';
};

const TurmaTecnicoForm: React.FC<TurmaTecnicoFormProps> = ({ 
  isOpen, onClose, onSave, cursosDisponiveis, selectedPoloId
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
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
    frequenciaMinimaPercent: 75,
    mediaMinima: 6,
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

  useEffect(() => {
    if (isOpen) {
      setSubmitError('');
      setIsSaving(false);
    }
  }, [isOpen]);

  // Lógica de Automação
  useEffect(() => {
    if (formData.cursoId && formData.poloId && formData.dataInicio && formData.turno) {
        const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
        const polo = polos.find(p => p.id === formData.poloId);
        const [yearValue, monthValue] = formData.dataInicio.split('-').map(Number);
        const year = yearValue;
        const month = monthValue;
        const semester = month <= 6 ? 1 : 2;

        if (curso && polo && Number.isInteger(year) && Number.isInteger(month)) {
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
  const selectedPolo = polos.find(p => p.id === formData.poloId);
  const initialStatus = formData.dataInicio
    ? getInitialTechnicalStatus(formData)
    : 'PLANEJADA';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
    const polo = selectedPolo;

    if (!curso || !polo) {
      setSubmitError('Selecione curso e polo antes de confirmar a abertura.');
      return;
    }

    if (!formData.nomeAutomatico || !formData.codigoAutomatico) {
      setSubmitError('Confira curso, polo, data de início e turno para gerar nome e código da turma.');
      return;
    }

    if (formData.dataPrevisaoTermino < formData.dataInicio) {
      setSubmitError('A data prevista de término deve ser posterior à data de início.');
      return;
    }

    if (
      formData.permitirInscricoesOnline
      && formData.dataInicioInscricao
      && formData.dataFimInscricao
      && formData.dataFimInscricao < formData.dataInicioInscricao
    ) {
      setSubmitError('O fim das inscrições deve ser posterior ao início das inscrições.');
      return;
    }

    setSubmitError('');
    setIsSaving(true);

    try {
      await onSave({
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
        status: initialStatus,
      });
      onClose();
    } catch (error: any) {
      console.error('Erro ao abrir turma técnica:', error);
      setSubmitError(getFriendlySubmitError(error));
    } finally {
      setIsSaving(false);
    }
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
          <div className={selectedPoloId ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
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
             {selectedPoloId ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700/70">Polo atual</p>
                      <p className="truncate text-sm font-black uppercase text-[#001a33]">
                        {selectedPolo ? `${selectedPolo.nomeFantasia || selectedPolo.nome} (${selectedPolo.cidade})` : 'Carregando polo...'}
                      </p>
                    </div>
                  </div>
                </div>
             ) : (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                      <MapPin size={14} className="text-emerald-600" /> Polo / Unidade
                  </label>
                  <select
                      className="w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-emerald-500"
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
             )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Configuração financeira da nova turma
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

          <TechnicalEnrollmentSettings
            value={formData}
            onChange={(patch) => setFormData((current) => ({ ...current, ...patch }))}
          />

          <TechnicalAcademicSettings
            frequenciaMinimaPercent={formData.frequenciaMinimaPercent}
            mediaMinima={formData.mediaMinima}
            onChange={(patch) => setFormData((current) => ({ ...current, ...patch }))}
          />

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
                <label className="text-[10px] text-slate-500 uppercase font-bold">Fase inicial</label>
                <div className="font-black text-emerald-700 text-sm">
                  {initialStatus.replaceAll('_', ' ')}
                </div>
                <p className="mt-1 text-[10px] font-medium text-slate-500">
                  A turma só entra em andamento pela ação “Iniciar turma”, na data configurada.
                </p>
             </div>
             <div>
                <label className="text-[10px] text-slate-500 uppercase font-bold">Código Identificador</label>
                <div className="font-mono font-bold text-[#001a33] text-sm tracking-wider bg-white p-2 rounded border border-slate-200 inline-block">
                    {formData.codigoAutomatico || '...'}
                </div>
             </div>
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-700" role="alert">
              {submitError}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button 
                type="submit"
                disabled={isSaving || !formData.nomeAutomatico}
                className="px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-emerald-800 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Save size={16} /> {isSaving ? 'Salvando...' : 'Criar turma'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default TurmaTecnicoForm;
