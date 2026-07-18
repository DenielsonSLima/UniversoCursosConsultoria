import { Clock, Save, Plus, Trash2, FileUp, Pencil, X, BookOpen, FileText } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';
import { formatDuration } from '../eadCourseWizard.utils';

const EadCourseWizardStep5 = () => {
  const {
    conteudos,
    newContTitle,
    setNewContTitle,
    newContDesc,
    setNewContDesc,
    newContApostila,
    setNewContApostila,
    newContTexto,
    setNewContTexto,
    newContDuracao,
    setNewContDuracao,
    newContObjetivos,
    setNewContObjetivos,
    newContTipo,
    setNewContTipo,
    editingConteudoId,
    resetConteudoForm,
    handleAddConteudo,
    handleEditConteudo,
    handleRemoveConteudo,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><BookOpen size={20} /></span>
        <div>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Aulas, páginas e materiais</h4>
          <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre as etapas que o aluno lê no portal; o vídeo do curso fica na etapa anterior.</p>
        </div>
      </div>

      {/* Form Cadastro */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        {editingConteudoId && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Editando aula cadastrada</p>
              <p className="text-xs font-semibold text-slate-600">Altere o texto, objetivos, material ou duração e salve a etapa.</p>
            </div>
            <button
              onClick={resetConteudoForm}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-150 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50"
            >
              <X size={13} /> Cancelar edição
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Título da Etapa/Aula *</label>
            <input
              type="text"
              placeholder="Ex: Introdução ao Módulo de Faturamento"
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs"
              value={newContTitle}
              onChange={e => setNewContTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo de Conteúdo</label>
            <select
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs appearance-none cursor-pointer"
              value={newContTipo}
              onChange={e => setNewContTipo(e.target.value as any)}
            >
              <option value="pagina">Aula do Sistema</option>
              <option value="material">Apenas Material de Apoio</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição (Opcional)</label>
          <input
            type="text"
            placeholder="Breve comentário explicativo..."
            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs"
            value={newContDesc}
            onChange={e => setNewContDesc(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Duração mínima desta etapa (min)</label>
            <input
              type="number"
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs"
              value={newContDuracao}
              onChange={e => setNewContDuracao(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Objetivos da etapa (um por linha)</label>
            <textarea
              rows={3}
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs resize-none"
              value={newContObjetivos}
              onChange={e => setNewContObjetivos(e.target.value)}
            />
          </div>
        </div>

        {(newContTipo === 'pagina' || newContTipo === 'ambos' || newContTipo === 'material') && (
          <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Texto da página do curso</label>
            <textarea
              rows={9}
              placeholder="Escreva ou cole aqui o texto da aula. O aluno verá este conteúdo como uma página do próprio sistema."
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs leading-relaxed resize-y"
              value={newContTexto}
              onChange={e => setNewContTexto(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(newContTipo === 'material' || newContTipo === 'ambos') && (
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">URL ou Link da Apostila (PDF)</label>
              <input
                type="url"
                placeholder="https://suaconta.storage.com/apostila.pdf"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-semibold text-xs"
                value={newContApostila}
                onChange={e => setNewContApostila(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleAddConteudo}
            className="px-6 py-2.5 bg-[#001a33] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
          >
            {editingConteudoId ? <Save size={14} /> : <Plus size={14} />}
            {editingConteudoId ? 'Salvar Alterações' : 'Adicionar Etapa'}
          </button>
        </div>
      </div>

      {/* Tabela de Conteúdos */}
      <div className="space-y-3">
        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Etapas Cadastradas ({conteudos.length})</h5>
        {conteudos.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-250 rounded-2xl bg-slate-50/50">
            <BookOpen className="text-slate-300 mx-auto mb-2" size={32} />
            <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma etapa criada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {conteudos.map((item, index) => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider">Etapa {item.etapa || index + 1}</span>
                    <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                  </div>
                  {item.descricao && <p className="text-[10px] text-slate-500 font-medium">{item.descricao}</p>}
                  {item.textoHtml && <p className="text-[10px] text-emerald-600 font-bold"><FileText size={10} className="inline mr-1" /> Página nativa configurada</p>}

                  <div className="flex gap-4 pt-1 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                    {item.apostilaUrl && <span className="flex items-center gap-1 text-blue-500"><FileUp size={10} /> PDF Configurado</span>}
                    <span className="flex items-center gap-1 text-amber-600"><Clock size={10} /> {formatDuration(item.duracaoMinutos || 0)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleEditConteudo(item)}
                    className="p-2 border border-slate-100 hover:border-blue-150 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all"
                    title="Editar etapa"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleRemoveConteudo(item.id)}
                    className="p-2 border border-slate-100 hover:border-red-150 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                    title="Excluir etapa"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EadCourseWizardStep5;
