// File: modules/gestor/biblioteca/components/DocumentPermissionsModal.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Check, Search, Calendar, BookOpen, Layers, Users } from 'lucide-react';
import { LibraryDocument } from '../biblioteca.types';
import { bibliotecaService } from '../biblioteca.service';

interface DocumentPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LibraryDocument | null;
  onSave: () => void;
}

const DocumentPermissionsModal: React.FC<DocumentPermissionsModalProps> = ({
  isOpen,
  onClose,
  document: doc,
  onSave
}) => {
  const [cursos, setCursos] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [disciplinas, setDisciplinas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [targetAudience, setTargetAudience] = useState<'ALUNOS' | 'PROFESSORES' | 'INTERNO' | 'TODOS'>('TODOS');
  const [scope, setScope] = useState<'GLOBAL' | 'POLO_ESPECIFICO'>('GLOBAL');
  const [poloId, setPoloId] = useState<string | null>(null);

  const [selectedCursos, setSelectedCursos] = useState<string[]>([]);
  const [selectedTurmas, setSelectedTurmas] = useState<string[]>([]);
  const [selectedDisciplinas, setSelectedDisciplinas] = useState<string[]>([]);

  const [liberacaoTipo, setLiberacaoTipo] = useState<'IMEDIATO' | 'POR_DATA' | 'DISCIPLINA_INICIO'>('IMEDIATO');
  const [liberacaoData, setLiberacaoData] = useState('');
  const [liberacaoDisciplinaId, setLiberacaoDisciplinaId] = useState('');
  const [liberacaoDiasValidade, setLiberacaoDiasValidade] = useState('');

  // Searches
  const [searchCurso, setSearchCurso] = useState('');
  const [searchTurma, setSearchTurma] = useState('');
  const [searchDisciplina, setSearchDisciplina] = useState('');

  // Load data
  useEffect(() => {
    if (isOpen && doc) {
      setIsLoading(true);
      Promise.all([
        bibliotecaService.getCursos(),
        bibliotecaService.getTurmas(),
        bibliotecaService.getDisciplinas()
      ]).then(([c, t, d]) => {
        setCursos(c);
        setTurmas(t);
        setDisciplinas(d);
        setIsLoading(false);
      }).catch(err => {
        console.error('Erro ao buscar dados de permissão:', err);
        setIsLoading(false);
      });

      // Populate document values
      setTargetAudience(doc.targetAudience);
      setScope(doc.scope);
      setPoloId(doc.poloId || null);
      setSelectedCursos(doc.cursoIds || []);
      setSelectedTurmas(doc.turmaIds || []);
      setSelectedDisciplinas(doc.disciplinaIds || []);
      setLiberacaoTipo(doc.liberacaoTipo || 'IMEDIATO');
      
      if (doc.liberacaoData) {
        // Convert to YYYY-MM-DDTHH:MM local format for input
        const dateObj = new Date(doc.liberacaoData);
        const tzOffset = dateObj.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 16);
        setLiberacaoData(localISOTime);
      } else {
        setLiberacaoData('');
      }

      setLiberacaoDisciplinaId(doc.liberacaoDisciplinaId || '');
      setLiberacaoDiasValidade(doc.liberacaoDiasValidade?.toString() || '');
    }
  }, [isOpen, doc]);

  if (!isOpen || !doc) return null;
  if (typeof window === 'undefined') return null;

  // Filter lists based on selected courses and search queries
  const filteredCursos = cursos.filter(c => 
    c.nome.toLowerCase().includes(searchCurso.toLowerCase())
  );

  const filteredTurmas = turmas.filter(t => {
    const matchesSearch = t.nome.toLowerCase().includes(searchTurma.toLowerCase()) || 
                          t.codigo.toLowerCase().includes(searchTurma.toLowerCase());
    const matchesCourse = selectedCursos.length === 0 || selectedCursos.includes(t.curso_id);
    return matchesSearch && matchesCourse;
  });

  const filteredDisciplinas = disciplinas.filter(d => {
    const matchesSearch = d.nome.toLowerCase().includes(searchDisciplina.toLowerCase());
    const matchesCourse = selectedCursos.length === 0 || selectedCursos.includes(d.cursoId);
    return matchesSearch && matchesCourse;
  });

  const handleToggleCurso = (id: string) => {
    setSelectedCursos(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleTurma = (id: string) => {
    setSelectedTurmas(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleDisciplina = (id: string) => {
    setSelectedDisciplinas(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liberacaoTipo === 'POR_DATA' && !liberacaoData) {
      alert('Para liberação por data, informe a data/hora de liberação.');
      return;
    }

    if (
      liberacaoTipo === 'DISCIPLINA_INICIO' &&
      (selectedDisciplinas.length === 0 || !liberacaoDisciplinaId)
    ) {
      alert('Para liberação por início de disciplina, selecione a disciplina gatilho e ao menos uma disciplina relacionada.');
      return;
    }

    if (
      liberacaoTipo === 'DISCIPLINA_INICIO' &&
      liberacaoDiasValidade &&
      !/^\d+$/.test(liberacaoDiasValidade)
    ) {
      alert('Período de acesso por dias deve conter apenas números inteiros.');
      return;
    }

    const parsedDiasValidade = liberacaoTipo === 'DISCIPLINA_INICIO' && liberacaoDiasValidade
      ? parseInt(liberacaoDiasValidade, 10)
      : null;

    try {
      const dataToSave = {
        targetAudience,
        scope,
        poloId,
        cursoIds: selectedCursos,
        turmaIds: selectedTurmas,
        disciplinaIds: selectedDisciplinas,
        liberacaoTipo,
        liberacaoData: liberacaoTipo === 'POR_DATA' && liberacaoData ? new Date(liberacaoData).toISOString() : null,
        liberacaoDisciplinaId: liberacaoTipo === 'DISCIPLINA_INICIO' && liberacaoDisciplinaId ? liberacaoDisciplinaId : null,
        liberacaoDiasValidade: parsedDiasValidade
      };

      await bibliotecaService.updateDocumentPermissions(doc.id, dataToSave);
      onSave();
      onClose();
    } catch (err) {
      alert('Erro ao salvar permissões do documento.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-4xl p-8 shadow-2xl animate-fadeIn border border-slate-100 max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                <Lock size={10} /> Regras de Acesso
              </span>
            </div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Liberar & Configurar: {doc.title}</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Defina quem pode acessar este documento e quando ele será disponibilizado.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase animate-pulse flex-1">
            Carregando estruturas acadêmicas...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6 flex-1">
            
            {/* 1. SELEÇÃO DE CURSOS E TURMAS (GRID) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Box Cursos */}
              <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={14} className="text-blue-550 text-blue-500" /> Cursos Ativos ({selectedCursos.length} selecionados)
                  </span>
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <Search size={12} className="text-slate-400 mr-2 shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Filtrar cursos..."
                    value={searchCurso}
                    onChange={(e) => setSearchCurso(e.target.value)}
                    className="bg-transparent border-none outline-none w-full font-medium"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar bg-white p-2.5 rounded-lg border border-slate-200">
                  {filteredCursos.map(c => {
                    const isSelected = selectedCursos.includes(c.id);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => handleToggleCurso(c.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex justify-between items-center transition-all ${
                          isSelected ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'hover:bg-slate-50 text-slate-650'
                        }`}
                      >
                        <span className="truncate">{c.nome} <span className="text-[9px] text-slate-400 font-medium">({c.modalidade})</span></span>
                        {isSelected && <Check size={12} />}
                      </button>
                    );
                  })}
                  {filteredCursos.length === 0 && (
                    <p className="text-[10px] text-slate-400 text-center py-4">Nenhum curso encontrado.</p>
                  )}
                </div>
              </div>

              {/* Box Turmas */}
              <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-emerald-500" /> Turmas Operacionais ({selectedTurmas.length} selecionadas)
                  </span>
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
                  <Search size={12} className="text-slate-400 mr-2 shrink-0" />
                  <input 
                    type="text" 
                    placeholder={selectedCursos.length > 0 ? "Filtrar turmas do curso..." : "Filtrar todas as turmas..."}
                    value={searchTurma}
                    onChange={(e) => setSearchTurma(e.target.value)}
                    className="bg-transparent border-none outline-none w-full font-medium"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar bg-white p-2.5 rounded-lg border border-slate-200">
                  {filteredTurmas.map(t => {
                    const isSelected = selectedTurmas.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => handleToggleTurma(t.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide flex justify-between items-center transition-all ${
                          isSelected ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'hover:bg-slate-50 text-slate-650'
                        }`}
                      >
                        <span className="truncate">{t.nome} <span className="text-[9px] text-slate-400 font-mono">({t.codigo})</span></span>
                        {isSelected && <Check size={12} />}
                      </button>
                    );
                  })}
                  {filteredTurmas.length === 0 && (
                    <p className="text-[10px] text-slate-400 text-center py-4">
                      {selectedCursos.length > 0 ? 'Nenhuma turma para os cursos selecionados.' : 'Nenhuma turma encontrada.'}
                    </p>
                  )}
                </div>
              </div>

            </div>

            {/* 2. REGRAS DE LIBERAÇÃO CRONOMETRADA / GATILHO */}
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-150 space-y-6">
              <div className="flex items-center gap-2 text-[#001a33] mb-2 border-b border-slate-200 pb-3">
                <Calendar size={18} className="text-blue-600" />
                <h4 className="text-xs font-black uppercase tracking-wider">Agendamento de Liberação de Conteúdo</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Tipo de Regra */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Regra de Liberação</label>
                  <select
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 cursor-pointer font-bold uppercase text-slate-650"
                    value={liberacaoTipo}
                    onChange={(e) => setLiberacaoTipo(e.target.value as any)}
                  >
                    <option value="IMEDIATO">Disponibilidade Imediata</option>
                    <option value="POR_DATA">Liberar em Data Específica</option>
                    <option value="DISCIPLINA_INICIO">Ao Iniciar uma Disciplina</option>
                  </select>
                </div>

                {/* Condicional POR_DATA */}
                {liberacaoTipo === 'POR_DATA' && (
                  <div className="space-y-2 animate-fadeIn col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data e Hora de Liberação</label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 text-slate-700 font-bold"
                      value={liberacaoData}
                      onChange={(e) => setLiberacaoData(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Condicionais DISCIPLINA_INICIO */}
                {liberacaoTipo === 'DISCIPLINA_INICIO' && (
                  <>
                    <div className="space-y-2 animate-fadeIn">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Disciplina Gatilho</label>
                      <select
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 cursor-pointer font-bold text-slate-650"
                        value={liberacaoDisciplinaId}
                        onChange={(e) => setLiberacaoDisciplinaId(e.target.value)}
                        required
                      >
                        <option value="">-- Selecione a Disciplina --</option>
                        {filteredDisciplinas.map(d => (
                          <option key={d.id} value={d.id}>{d.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 animate-fadeIn">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Período de Acesso (Dias)</label>
                      <input
                        type="number"
                        placeholder="Ex: 15 (opcional)"
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 text-slate-700 font-bold"
                        value={liberacaoDiasValidade}
                        onChange={(e) => setLiberacaoDiasValidade(e.target.value)}
                      />
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
              <button 
                type="button" 
                onClick={onClose}
                className="px-6 py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2.5 bg-[#001a33] text-white hover:bg-blue-900 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg"
              >
                Salvar Configurações
              </button>
            </div>

          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default DocumentPermissionsModal;
