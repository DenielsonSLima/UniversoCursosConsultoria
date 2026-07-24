import React, { Dispatch, SetStateAction } from 'react';
import { BookOpen } from 'lucide-react';
import { DiarioAula } from './diario-classe.service';

interface DiarioConteudoTabProps {
  aulas: DiarioAula[];
  localPraticas: Record<string, string>;
  setLocalPraticas: Dispatch<SetStateAction<Record<string, string>>>;
  isReadOnly: boolean;
  onSavePratica: (aulaId: string, text: string) => void;
}

const DiarioConteudoTab: React.FC<DiarioConteudoTabProps> = ({
  aulas,
  localPraticas,
  setLocalPraticas,
  isReadOnly,
  onSavePratica,
}) => (
  <div className="p-6">
    {aulas.length === 0 ? (
      <div className="py-20 text-center text-slate-400 flex flex-col items-center">
        <BookOpen size={48} className="mb-4 opacity-50 text-slate-300" />
        <p className="font-bold text-sm">Nenhuma aula registrada nesta disciplina.</p>
        <p className="text-xs text-slate-500 mt-1">Adicione aulas e sua carga horária na aba "Grade & Profs".</p>
      </div>
    ) : (
      <div className="overflow-x-auto rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 border-r border-slate-200 text-xs font-black text-slate-500 uppercase w-[120px]">
                DIA/MÊS
              </th>
              <th className="p-4 border-r border-slate-200 text-xs font-black text-[#001a33] uppercase w-[calc(50%-60px)]">
                AULA / CONTEÚDO PROGRAMÁTICO
              </th>
              <th className="p-4 text-xs font-black text-slate-500 uppercase w-[calc(50%-60px)]">
                PRÁTICA PEDAGÓGICA REGISTRADA
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {aulas.map((aula) => (
              <tr key={aula.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 border-r border-slate-100 font-bold text-sm text-slate-700 align-top">
                  {aula.dataLabel}
                </td>
                <td className="p-4 border-r border-slate-100 align-top">
                  <div className="text-sm font-bold text-[#001a33] leading-snug">{aula.titulo}</div>
                  <div className="text-[10px] text-slate-500 font-semibold font-mono mt-1">
                    Carga horária: {aula.cargaHoraria}H
                  </div>
                </td>
                <td className="p-4 align-top">
                  <textarea
                    className="w-full bg-slate-50/60 focus:bg-white outline-none text-xs font-medium text-slate-800 leading-relaxed resize-y min-h-[70px] p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={localPraticas[aula.id] || ''}
                    onChange={(event) => {
                      if (isReadOnly) return;
                      const text = event.target.value;
                      setLocalPraticas((previous) => ({ ...previous, [aula.id]: text }));
                    }}
                    onBlur={(event) => {
                      if (!isReadOnly) onSavePratica(aula.id, event.target.value);
                    }}
                    readOnly={isReadOnly}
                    placeholder="Descreva a prática pedagógica executada nesta aula..."
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default DiarioConteudoTab;
