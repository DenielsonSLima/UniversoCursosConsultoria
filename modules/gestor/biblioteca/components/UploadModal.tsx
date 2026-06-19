
import React, { useState, useEffect } from 'react';
import { X, Upload, Globe, MapPin, Users, Lock, FileText, Check } from 'lucide-react';
import { TargetAudience, Scope } from '../biblioteca.types';
import { polosService } from '../../configuracoes/polos/polos.service';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: any) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUpload }) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetAudience: 'ALUNOS' as TargetAudience,
    scope: 'GLOBAL' as Scope,
    poloId: '',
    file: null as File | null
  });

  useEffect(() => {
    polosService.getAll().then(setPolos);
  }, []);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
        alert("Selecione um arquivo.");
        return;
    }
    
    // Preparar payload
    const poloSelected = polos.find(p => p.id === formData.poloId);
    
    // Simula tamanho e tipo
    const sizeMB = (formData.file.size / (1024 * 1024)).toFixed(2);
    const ext = formData.file.name.split('.').pop()?.toUpperCase() || 'OTHER';
    let fileType = 'OTHER';
    if(['PDF'].includes(ext)) fileType = 'PDF';
    if(['DOC', 'DOCX'].includes(ext)) fileType = 'DOC';
    if(['XLS', 'XLSX'].includes(ext)) fileType = 'XLS';
    if(['JPG', 'PNG', 'JPEG'].includes(ext)) fileType = 'IMG';

    onUpload({
        title: formData.title,
        description: formData.description,
        fileType,
        size: sizeMB + ' MB',
        url: '#', // Em produção seria a URL do Storage
        targetAudience: formData.targetAudience,
        scope: formData.scope,
        poloId: formData.scope === 'GLOBAL' ? undefined : formData.poloId,
        poloName: formData.scope === 'GLOBAL' ? undefined : poloSelected?.nomeFantasia
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-fadeIn border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <div>
             <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Publicar Documento</h3>
             <p className="text-xs text-slate-500 font-medium">Adicione arquivos ao acervo institucional.</p>
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
                        <p className="text-sm font-bold text-emerald-800">{formData.file.name}</p>
                        <p className="text-xs text-emerald-600">Clique para trocar</p>
                    </>
                ) : (
                    <>
                        <div className="w-10 h-10 bg-white text-slate-400 rounded-full flex items-center justify-center mb-2 shadow-sm group-hover:text-blue-500 transition-colors">
                            <Upload size={20} />
                        </div>
                        <p className="text-sm font-bold text-slate-600 group-hover:text-blue-700">Clique para selecionar o arquivo</p>
                        <p className="text-[10px] text-slate-400">PDF, DOCX, XLS, JPG (Máx 10MB)</p>
                    </>
                )}
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Título do Documento</label>
                <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700"
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
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700"
                    placeholder="Breve descrição do conteúdo"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
             <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Lock size={16} />
                <h4 className="text-xs font-black uppercase tracking-wider">Permissões de Acesso</h4>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Users size={12} /> Público Alvo
                    </label>
                    <select 
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 cursor-pointer"
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
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 cursor-pointer"
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
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 cursor-pointer"
                            value={formData.poloId}
                            onChange={(e) => setFormData({...formData, poloId: e.target.value})}
                            required
                        >
                            <option value="">-- Selecione --</option>
                            {polos.map(p => (
                                <option key={p.id} value={p.id}>{p.nomeFantasia} ({p.cidade})</option>
                            ))}
                        </select>
                    </div>
                )}
             </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
                type="submit"
                className="px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2"
            >
                <Upload size={16} /> Publicar Documento
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default UploadModal;
