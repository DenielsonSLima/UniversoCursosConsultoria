import { CalendarDays } from 'lucide-react';
import { CalendarioAulasTemplateEditor } from './components/CalendarioAulasTemplateEditor';

const CalendarioAulasPage = () => (
  <div className="animate-fadeIn">
    <div className="mb-7 flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-indigo-700">
          <CalendarDays size={18} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Modelos de documentos</span>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Calendário de aulas</h2>
        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Modelo A4 retrato para a grade oficial de cada turma, seguindo o padrão documental institucional.</p>
      </div>
      <span className="self-start rounded-full border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 md:self-auto">Todas as modalidades</span>
    </div>
    <CalendarioAulasTemplateEditor />
  </div>
);

export default CalendarioAulasPage;
