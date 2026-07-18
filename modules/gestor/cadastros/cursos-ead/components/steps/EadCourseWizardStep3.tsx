import { Clock, Trash2 } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';

const EadCourseWizardStep3 = () => {
  const {
    cronograma,
    newCronogramaTitle,
    setNewCronogramaTitle,
    newCronogramaHours,
    setNewCronogramaHours,
    handleAddCronograma,
    handleRemoveCronograma,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Clock size={20} /></span>
        <div>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Cronograma de Matérias (Certificado)</h4>
          <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre o cronograma detalhado de disciplinas/módulos para constar no verso do certificado impresso.</p>
        </div>
      </div>

      {/* Form Cadastro */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-end">
        <div className="flex-1 space-y-1.5 w-full">
          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Módulo/Matéria *</label>
          <input
            type="text"
            placeholder="Ex: Introdução ao Planejamento de Saúde"
            className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-slate-800"
            value={newCronogramaTitle}
            onChange={e => setNewCronogramaTitle(e.target.value)}
          />
        </div>
        <div className="w-full md:w-32 space-y-1.5">
          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Carga Horária *</label>
          <input
            type="number"
            placeholder="Ex: 20"
            className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-center text-slate-800"
            value={newCronogramaHours}
            onChange={e => setNewCronogramaHours(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCronograma()}
          />
        </div>
        <button
          onClick={handleAddCronograma}
          className="px-5 py-2.5 bg-[#001a33] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider h-fit shrink-0 w-full md:w-auto"
        >
          Adicionar
        </button>
      </div>

      {/* Tabela de Matérias */}
      <div className="space-y-3">
        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrutura de Matérias Cadastradas ({cronograma.length})</h5>
        {cronograma.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-250 rounded-2xl bg-slate-50/50">
            <Clock className="text-slate-300 mx-auto mb-2" size={32} />
            <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma matéria adicionada ao cronograma.</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
            {cronograma.map((item, idx) => (
              <div key={item.id} className="flex justify-between items-center p-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-black text-xs">{idx + 1}</span>
                  <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] font-bold text-slate-600">{item.cargaHoraria}h</span>
                  <button
                    onClick={() => handleRemoveCronograma(item.id)}
                    className="text-slate-350 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <div className="p-4 bg-slate-50 flex justify-between items-center text-xs font-black text-slate-700">
              <span>Carga Horária Total Cadastrada:</span>
              <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-md">{cronograma.reduce((acc, c) => acc + c.cargaHoraria, 0)}h</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EadCourseWizardStep3;
