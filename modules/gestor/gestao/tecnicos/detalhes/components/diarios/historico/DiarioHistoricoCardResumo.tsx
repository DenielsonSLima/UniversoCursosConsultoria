import React from 'react';
import { CalendarRange } from 'lucide-react';
import type { TurmaDiarioHistoricoResumo } from '../turma-diarios.types';
import { historicalDate, historicalNumber } from './diario-historico.presentation';

const DiarioHistoricoCardResumo: React.FC<{ history: TurmaDiarioHistoricoResumo }> = ({ history }) => (
  <div className="mt-3 space-y-3">
    <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Histórico importado</p>
      <p className="mt-1 break-words text-[11px] text-slate-600">{history.sourceName}</p>
      <p className="mt-2 text-xs font-bold text-[#001a33]">{historicalNumber(history.aulasDocumentadas)} aulas documentadas</p>
    </div>
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
        <CalendarRange size={13} className="text-blue-600" /> Datas do documento
      </p>
      {history.datasEstado === 'CONFERIDO' ? (
        <p className="mt-1.5 text-xs font-bold text-slate-700">
          {historicalDate(history.primeiraAula)} a {historicalDate(history.ultimaAula)}
        </p>
      ) : <p className="mt-1.5 text-xs font-bold text-amber-700">Datas em conferência</p>}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-slate-100 px-3 py-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Frequência importada</p>
        <p className="mt-1 text-sm font-black text-[#001a33]">{historicalNumber(history.frequenciasRegistradas)} registros</p>
        <p className="mt-1 text-[10px] text-slate-500">{historicalNumber(history.frequenciasConferidas)} conferidos</p>
      </div>
      <div className="rounded-xl border border-slate-100 px-3 py-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Horas no documento</p>
        <p className="mt-1 text-sm font-black text-[#001a33]">{historicalNumber(history.horasDocumentadas)} h</p>
        <p className="mt-1 text-[10px] text-slate-500">Oficial: {historicalNumber(history.horasOficiais)} h</p>
        {history.horasEstado === 'EM_CONFERENCIA' && <p className="mt-1 text-[10px] font-bold text-amber-700">Conferir carga horária</p>}
      </div>
    </div>
  </div>
);

export default DiarioHistoricoCardResumo;
