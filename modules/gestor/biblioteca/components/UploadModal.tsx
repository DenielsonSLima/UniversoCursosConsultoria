// File: modules/gestor/biblioteca/components/UploadModal.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Globe, MapPin, Users, Lock, Check, Search, Calendar, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { TargetAudience, Scope } from '../biblioteca.types';
import { polosService } from '../../configuracoes/polos/polos.service';
import { bibliotecaService } from '../biblioteca.service';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: any) => void;
  pastaId: string | null;
  teacherId: string | null;
}

const UploadModal: React.FC<UploadModalProps> = ({ 
  isOpen, 
  onClose, 
  onUpload,
  pastaId,
  teacherId
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [disciplinas, setDisciplinas] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetAudience: 'ALUNOS' as TargetAudience,
    scope: 'GLOBAL' as Scope,
    poloId: '',
    file: null as File | null
  });

  // Advanced States
  const [selectedCursos, setSelectedCursos] = useState<string[]>([]);
  const [selectedTurmas, setSelectedTurmas] = useState<string[]>([]);
  const [selectedDisciplinas, setSelectedDisciplinas] = useState<string[]>([]);
  const [liberacaoTipo, setLiberacaoTipo] = useState<'IMEDIATO' | 'POR_DATA' | 'DISCIPLINA_INICIO'>('IMEDIATO');
  const [liberacaoData, setLiberacaoData] = useState('');
  const [liberacaoDisciplinaId, setLiberacaoDisciplinaId] = useState('');
  const [liberacaoDiasValidade, setLiberacaoDiasValidade] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI Expand/Collapse
  const [showAdvancedAccess, setShowAdvancedAccess] = useState(false);
  const [showScheduling, setShowScheduling] = useState(false);

  // Search queries
  const [searchCurso, setSearchCurso] = useState('');
  const [searchTurma, setSearchTurma] = useState('');

  useEffect(() => {
    polosService.getAll().then(setPolos);
    bibliotecaService.getCursos().then(setCursos);
    bibliotecaService.getTurmas().then(setTurmas);
    bibliotecaService.getDisciplinas().then(setDisciplinas);
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        description: '',
        targetAudience: 'ALUNOS',
        scope: 'GLOBAL',
        poloId: '',
        file: null
      });
      setSelectedCursos([]);
      setSelectedTurmas([]);
      setSelectedDisciplinas([]);
      setLiberacaoTipo('IMEDIATO');
      setLiberacaoData('');
      setLiberacaoDisciplinaId('');
      setLiberacaoDiasValidade('');
      setShowAdvancedAccess(false);
      setShowScheduling(false);
      setSearchCurso('');
      setSearchTurma('');
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const formatSizeMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

  const detectFileType = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toUpperCase() || 'OTHER';
    let fileType: 'PDF' | 'DOC' | 'XLS' | 'IMG' | 'OTHER' = 'OTHER';
    if (['PDF'].includes(ext)) fileType = 'PDF';
    if (['DOC', 'DOCX'].includes(ext)) fileType = 'DOC';
    if (['XLS', 'XLSX'].includes(ext)) fileType = 'XLS';
    if (['JPG', 'PNG', 'JPEG', 'GIF', 'WEBP'].includes(ext)) fileType = 'IMG';
    return { ext, fileType };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const { ext } = detectFileType(selectedFile.name);
      const allowedExtensions = ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'JPG', 'PNG', 'JPEG', 'GIF', 'WEBP'];
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('Arquivo excede 10MB. Selecione um arquivo menor.');
        e.target.value = '';
        return;
      }
      if (!allowedExtensions.includes(ext)) {
        alert('Formato não suportado. Use PDF, DOC/DOCX, XLS/XLSX ou JPG/PNG/GIF/WEBP.');
        e.target.value = '';
        return;
      }
      setFormData(prev => ({
        ...prev,
        file: selectedFile,
        // Pre-fill title with filename (without extension) if title is empty
        title: prev.title || selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
        alert("Selecione um arquivo.");
        return;
    }

    const { fileType } = detectFileType(formData.file.name);
    const poloSelected = polos.find(p => p.id === formData.poloId);

    if (!formData.title.trim()) {
      alert('Informe o título do documento.');
      return;
    }

    if (liberacaoTipo === 'POR_DATA' && !liberacaoData) {
      alert('Para liberação por data, informe data e hora de liberação.');
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

    const disciplinaIds = new Set(selectedDisciplinas);
    if (liberacaoDisciplinaId) {
      disciplinaIds.add(liberacaoDisciplinaId);
    }

    setIsSubmitting(true);
    try {
      await onUpload({
        title: formData.title,
        description: formData.description,
        fileType,
        size: `${formatSizeMB(formData.file.size)} MB`,
        sizeBytes: formData.file.size,
        url: '',
        file: formData.file,
        targetAudience: formData.targetAudience,
        scope: formData.scope,
        poloId: formData.scope === 'GLOBAL' ? null : formData.poloId || null,
        poloName: formData.scope === 'GLOBAL' ? undefined : poloSelected?.nome,
        pastaId: pastaId || null,
        teacherId: teacherId || null,
        cursoIds: selectedCursos,
        turmaIds: selectedTurmas,
        disciplinaIds: Array.from(disciplinaIds),
        liberacaoTipo,
        liberacaoData: liberacaoTipo === 'POR_DATA' && liberacaoData ? new Date(liberacaoData).toISOString() : null,
        liberacaoDisciplinaId: liberacaoTipo === 'DISCIPLINA_INICIO' && liberacaoDisciplinaId ? liberacaoDisciplinaId : null,
        liberacaoDiasValidade: parsedDiasValidade
      });
      onClose();
    } catch (err) {
      alert('Não foi possível publicar o documento. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-fadeIn border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <div>
             <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Publicar Documento</h3>
             <p className="text-xs text-slate-500 font-medium">Adicione arquivos ao acervo da biblioteca.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Área de Upload */}
          <div className="relative group">
            <input 
                type="file" 
                id="file-upload" 
                className="hidden" 
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
            />
            <label 
                htmlFor="file-upload"
                className={`w-full h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                    formData.file 
                    ? 'border-emerald-300 bg-emerald-50' 
                    : 'border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-400'
                }`}
            >
                {formData.file ? (
                    <>
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                            <Check size={20} />
                        </div>
                        <p className="text-sm font-bold text-emerald-805 truncate max-w-xs">{formData.file.name}</p>
                        <p className="text-xs text-emerald-600 font-bold uppercase text-[9px] mt-1">Clique para trocar</p>
                    </>
                ) : (
                    <>
                        <div className="w-10 h-10 bg-white text-slate-400 rounded-full flex items-center justify-center mb-2 shadow-sm group-hover:text-blue-500 transition-colors">
                            <Upload size={20} />
                        </div>
                        <p className="text-sm font-bold text-slate-650 group-hover:text-blue-700">Clique para selecionar o arquivo</p>
                        <p className="text-[10px] text-slate-400">PDF, DOCX, XLS, JPG, PNG (Máx 10MB)</p>
                    </>
                )}
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Título do Documento</label>
                <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700 font-medium"
                    placeholder="Ex: Calendário Acadêmico 2024"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                />
            </div>
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Descrição (Opcional)</label>
                <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700 font-medium"
                    placeholder="Breve descrição do conteúdo"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
            </div>
                  {/* Sessão de Permissões Básicas */}
          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-150 space-y-4">
             <div className="flex items-center gap-2 text-[#001a33] mb-2">
                <Lock size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Permissões de Acesso</h4>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Users size={12} /> Público Alvo
                    </label>
                    <select 
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 cursor-pointer font-bold uppercase text-slate-660 text-xs"
                        value={formData.targetAudience}
                        onChange={(e) => setFormData({...formData, targetAudience: e.target.value as TargetAudience})}
                    >
                        <option value="ALUNOS">Somente Alunos</option>
                        <option value="PROFESSORES">Somente Professores</option>
                        <option value="INTERNO">Somente Interno (Gestão)</option>
                        <option value="TODOS">Público (Todos)</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Globe size={12} /> Abrangência
                    </label>
                    <select 
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 cursor-pointer font-bold uppercase text-slate-660 text-xs"
                        value={formData.scope}
                        onChange={(e) => setFormData({...formData, scope: e.target.value as Scope, poloId: ''})}
                    >
                        <option value="GLOBAL">Global (Todos os Polos)</option>
                        <option value="POLO_ESPECIFICO">Polo Específico</option>
                    </select>
                </div>

                {formData.scope === 'POLO_ESPECIFICO' && (
                    <div className="md:col-span-2 space-y-2 animate-fadeIn">
                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            <MapPin size={12} /> Selecione o Polo
                        </label>
                        <select 
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 cursor-pointer font-bold text-slate-600 text-xs"
                            value={formData.poloId}
                            onChange={(e) => setFormData({...formData, poloId: e.target.value})}
                            required
                        >
                            <option value="">-- Selecione --</option>
                            {polos.map(p => (
                                <option key={p.id} value={p.id}>{p.nome}</option>
                            ))}
                        </select>
                    </div>
                )}
             </div>

             {/* Restrição Avançada de Cursos e Turmas */}
             <div className="border-t border-slate-200 pt-3">
               <button
                 type="button"
                 onClick={() => setShowAdvancedAccess(!showAdvancedAccess)}
                 className="flex items-center justify-between w-full text-left text-xs font-bold text-slate-650 hover:text-blue-650 py-1"
               >
                 <span className="flex items-center gap-1.5 uppercase tracking-wide">
                   <Layers size={14} className="text-slate-400" /> Restringir por Cursos / Turmas (Opcional)
                 </span>
                 {showAdvancedAccess ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               </button>

               {showAdvancedAccess && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-dashed border-slate-200 animate-fadeIn">
                   {/* Seleção de Cursos */}
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Filtrar Cursos ({selectedCursos.length})</label>
                     <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs">
                       <Search size={10} className="text-slate-400 mr-1.5" />
                       <input 
                         type="text" 
                         placeholder="Buscar curso..." 
                         value={searchCurso}
                         onChange={(e) => setSearchCurso(e.target.value)}
                         className="bg-transparent outline-none w-full text-[11px] font-medium"
                       />
                     </div>
                     <div className="max-h-28 overflow-y-auto bg-white p-2 rounded-xl border border-slate-200 space-y-1 custom-scrollbar">
                       {cursos.filter(c => c.nome.toLowerCase().includes(searchCurso.toLowerCase())).map(c => {
                         const isSel = selectedCursos.includes(c.id);
                         return (
                           <button
                             type="button"
                             key={c.id}
                             onClick={() => setSelectedCursos(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                             className={`w-full text-left px-2 py-1 rounded text-[10px] font-bold uppercase flex justify-between items-center ${
                               isSel ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'
                             }`}
                           >
                             <span className="truncate">{c.nome}</span>
                             {isSel && <Check size={10} />}
                           </button>
                         );
                       })}
                     </div>
                   </div>

                   {/* Seleção de Turmas */}
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Filtrar Turmas ({selectedTurmas.length})</label>
                     <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs">
                       <Search size={10} className="text-slate-400 mr-1.5" />
                       <input 
                         type="text" 
                         placeholder="Buscar turma..." 
                         value={searchTurma}
                         onChange={(e) => setSearchTurma(e.target.value)}
                         className="bg-transparent outline-none w-full text-[11px] font-medium"
                       />
                     </div>
                     <div className="max-h-28 overflow-y-auto bg-white p-2 rounded-xl border border-slate-200 space-y-1 custom-scrollbar">
                       {turmas
                         .filter(t => t.nome.toLowerCase().includes(searchTurma.toLowerCase()) && (selectedCursos.length === 0 || selectedCursos.includes(t.curso_id)))
                         .map(t => {
                           const isSel = selectedTurmas.includes(t.id);
                           return (
                             <button
                               type="button"
                               key={t.id}
                               onClick={() => setSelectedTurmas(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                               className={`w-full text-left px-2 py-1 rounded text-[10px] font-bold uppercase flex justify-between items-center ${
                                 isSel ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'
                               }`}
                             >
                               <span className="truncate">{t.nome}</span>
                               {isSel && <Check size={10} />}
                             </button>
                           );
                         })}
                     </div>
                   </div>
                 </div>
               )}
             </div>

             {/* Regra de Liberação Temporal/Gatilho */}
             <div className="border-t border-slate-200 pt-3">
               <button
                 type="button"
                 onClick={() => setShowScheduling(!showScheduling)}
                 className="flex items-center justify-between w-full text-left text-xs font-bold text-slate-650 hover:text-blue-650 py-1"
               >
                 <span className="flex items-center gap-1.5 uppercase tracking-wide">
                   <Calendar size={14} className="text-slate-400" /> Agendamento de Liberação (Opcional)
                 </span>
                 {showScheduling ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
               </button>

               {showScheduling && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-dashed border-slate-200 animate-fadeIn">
                   {/* Regra Tipo */}
                   <div className="space-y-2 md:col-span-2">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Regra</label>
                     <select
                       className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold uppercase text-slate-650 outline-none"
                       value={liberacaoTipo}
                       onChange={(e) => setLiberacaoTipo(e.target.value as any)}
                     >
                       <option value="IMEDIATO">Imediato (Sem restrição de data)</option>
                       <option value="POR_DATA">Liberar em data específica</option>
                       <option value="DISCIPLINA_INICIO">Ao iniciar disciplina</option>
                     </select>
                   </div>

                   {liberacaoTipo === 'POR_DATA' && (
                     <div className="space-y-2 md:col-span-2 animate-fadeIn">
                       <label className="text-[10px] font-bold text-slate-500 uppercase">Data/Hora Liberação</label>
                       <input
                         type="datetime-local"
                         className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                         value={liberacaoData}
                         onChange={(e) => setLiberacaoData(e.target.value)}
                         required
                       />
                     </div>
                   )}

                   {liberacaoTipo === 'DISCIPLINA_INICIO' && (
                     <>
                       <div className="space-y-2 animate-fadeIn">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Disciplina Gatilho</label>
                         <select
                           className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-650 outline-none cursor-pointer"
                           value={liberacaoDisciplinaId}
                           onChange={(e) => setLiberacaoDisciplinaId(e.target.value)}
                           required
                         >
                           <option value="">-- Selecione --</option>
                           {disciplinas
                             .filter(d => selectedCursos.length === 0 || selectedCursos.includes(d.cursoId))
                             .map(d => (
                               <option key={d.id} value={d.id}>{d.nome}</option>
                             ))}
                         </select>
                       </div>

                       <div className="space-y-2 animate-fadeIn">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Período de Acesso (Dias)</label>
                         <input
                           type="number"
                           placeholder="Ex: 15 (opcional)"
                           className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                           value={liberacaoDiasValidade}
                           onChange={(e) => setLiberacaoDiasValidade(e.target.value)}
                         />
                       </div>
                     </>
                   )}
                 </div>
               )}
             </div>
          </div>          </div>

          <div className="flex justify-end pt-4">
            <button 
                type="submit"
                disabled={isSubmitting}
                className={`px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg flex items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-900'}`}
            >
                <Upload size={16} /> {isSubmitting ? 'Enviando...' : 'Publicar Documento'}
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  );
};

export default UploadModal;
