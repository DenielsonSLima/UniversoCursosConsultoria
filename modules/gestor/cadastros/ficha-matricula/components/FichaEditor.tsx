import React, { useState } from 'react';
import { ArrowLeft, Save, Plus, Trash2, GripVertical, FileSignature } from 'lucide-react';

interface FichaEditorProps {
  ficha: any;
  onSave: (ficha: any) => void;
  onCancel: () => void;
}

const FichaEditor: React.FC<FichaEditorProps> = ({ ficha, onSave, onCancel }) => {
  const [formData, setFormData] = useState(ficha || {
    id: `new-${Date.now()}`,
    nome: '',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    requerAssinatura: true,
    textoContrato: '',
    camposCount: 0,
    camposCustomizados: []
  });

  const [novoCampo, setNovoCampo] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const addCampo = () => {
    if (novoCampo.trim()) {
      setFormData({
        ...formData,
        camposCustomizados: [...(formData.camposCustomizados || []), { id: Date.now(), label: novoCampo }],
        camposCount: (formData.camposCount || 0) + 1
      });
      setNovoCampo('');
    }
  };

  const removeCampo = (id: number) => {
    const updated = (formData.camposCustomizados || []).filter((c: any) => c.id !== id);
    setFormData({
      ...formData,
      camposCustomizados: updated,
      camposCount: updated.length
    });
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm animate-fadeIn">
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <button 
            onClick={onCancel}
            className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              <FileSignature size={24} className="text-blue-600" />
              {ficha ? 'Editar Modelo de Ficha' : 'Novo Modelo de Ficha'}
            </h3>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Configure os campos e termos</p>
          </div>
        </div>
        <button 
          onClick={() => onSave(formData)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Save size={16} /> {ficha ? 'Salvar Alterações' : 'Criar Modelo'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Modelo <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                placeholder="Ex: Ficha Ouro - Pós Graduação"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tipo de Curso</label>
              <select 
                name="tipoCurso"
                value={formData.tipoCurso}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none"
              >
                <option value="Ensino Superior">Ensino Superior (Graduação/Pós)</option>
                <option value="Cursos Técnicos">Cursos Técnicos</option>
                <option value="Cursos Livres">Cursos Livres / Extensão</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
              <select 
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none"
              >
                <option value="ativo">Ativo - Visível para matrículas</option>
                <option value="inativo">Inativo - Apenas rascunho</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Vincular a Curso Específico (Opcional)</label>
              <select 
                name="cursoEspecificoId"
                value={formData.cursoEspecificoId || ''}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none"
              >
                <option value="">Aplicar a todos os cursos do tipo selecionado</option>
                <option value="c1">Direito - Bacharelado</option>
                <option value="c2">Enfermagem - Técnico</option>
                <option value="c3">Gestão de RH - Tecnólogo</option>
              </select>
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Se vazio, a ficha vale como padrão para o tipo de curso escolhido.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Termo de Aceite / Contrato Simplificado</label>
            <textarea 
              name="textoContrato"
              value={formData.textoContrato}
              onChange={handleChange}
              placeholder="Cole aqui o texto padrão do termo de matrícula..."
              className="w-full min-h-[200px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all custom-scrollbar resize-y"
            ></textarea>
            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
              Dica: Você pode usar variáveis como {'{{nome_aluno}}'}, {'{{curso}}'} e {'{{data_atual}}'}.
            </p>
          </div>
          
          <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox" 
              name="requerAssinatura" 
              checked={formData.requerAssinatura} 
              onChange={handleChange}
              className="w-5 h-5 text-blue-600 rounded" 
            />
            <div>
              <span className="block text-sm font-bold text-[#001a33] uppercase">Exigir Assinatura Digital</span>
              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Obriga o aluno a assinar ao concluir via portal</span>
            </div>
          </label>
        </div>

        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
          <h4 className="text-sm font-black text-[#001a33] uppercase tracking-tight mb-1">Campos Extras</h4>
          <p className="text-xs text-slate-500 font-medium mb-6">Além dos dados pessoais padrão (CPF, RG, Endereço), que dados mais esta ficha exige?</p>

          <div className="flex gap-2 mb-6">
            <input 
              type="text" 
              value={novoCampo}
              onChange={(e) => setNovoCampo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCampo()}
              placeholder="Ex: Tipo Sanguíneo"
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-blue-500"
            />
            <button 
              onClick={addCampo}
              className="px-4 bg-[#001a33] text-white rounded-xl hover:bg-blue-900 transition-colors flex items-center justify-center shadow-md"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2 min-h-[200px]">
             {(!formData.camposCustomizados || formData.camposCustomizados.length === 0) ? (
                <div className="text-center p-8 bg-slate-100/50 rounded-xl border border-slate-200 border-dashed h-full flex flex-col items-center justify-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum campo extra<br/>adicionado</p>
                </div>
             ) : (
                formData.camposCustomizados.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm group">
                    <GripVertical size={16} className="text-slate-300 cursor-grab" />
                    <span className="flex-1 text-sm font-bold text-slate-700">{c.label}</span>
                    <button 
                      onClick={() => removeCampo(c.id)}
                      className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FichaEditor;
