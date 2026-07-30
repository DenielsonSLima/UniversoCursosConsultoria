import React, { Dispatch, SetStateAction } from 'react';
import { BookOpen, CheckCircle2, Loader2, Save } from 'lucide-react';
import { isAcademicClassContentPending } from '../../../../../../../lib/academicClassMeetings';
import { DiarioAula } from './diario-classe.service';

interface DiarioConteudoTabProps {
  aulas: DiarioAula[];
  localTitulos: Record<string, string>;
  setLocalTitulos: Dispatch<SetStateAction<Record<string, string>>>;
  localPraticas: Record<string, string>;
  setLocalPraticas: Dispatch<SetStateAction<Record<string, string>>>;
  canEditAulaTitle: boolean;
  canEditPratica: boolean;
  savingAulaId?: string;
  onSaveAulaTitle: (aulaId: string, titulo: string) => void;
  onSavePratica: (aulaId: string, text: string) => void;
}

const DiarioConteudoTab: React.FC<DiarioConteudoTabProps> = ({
  aulas,
  localTitulos,
  setLocalTitulos,
  localPraticas,
  setLocalPraticas,
  canEditAulaTitle,
  canEditPratica,
  savingAulaId,
  onSaveAulaTitle,
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
      <div className="space-y-3">
        {canEditAulaTitle && (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-800">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <p className="font-black">Diário aberto para edição</p>
              <p className="mt-0.5 font-medium text-blue-700">
                Gestão e professor podem ajustar o conteúdo programático e a prática pedagógica. Data e carga horária continuam sob responsabilidade da Gestão.
              </p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
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
                  {canEditAulaTitle ? (
                    <div className="space-y-2">
                      <textarea
                        className="min-h-[92px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm font-bold leading-relaxed text-[#001a33] outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                        value={localTitulos[aula.id] || ''}
                        onChange={(event) => {
                          const titulo = event.target.value;
                          setLocalTitulos((previous) => ({ ...previous, [aula.id]: titulo }));
                        }}
                        placeholder="Descreva o título ou conteúdo programático desta aula..."
                        aria-label={`Conteúdo programático da aula de ${aula.dataLabel}`}
                        maxLength={1000}
                      />
                      <button
                        type="button"
                        onClick={() => onSaveAulaTitle(aula.id, localTitulos[aula.id] || '')}
                        disabled={
                          savingAulaId === aula.id
                          || !(localTitulos[aula.id] || '').trim()
                          || (localTitulos[aula.id] || '').trim() === aula.titulo.trim()
                        }
                        className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {savingAulaId === aula.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Save size={13} />}
                        Salvar conteúdo
                      </button>
                    </div>
                  ) : (
                    <div className={`text-sm font-bold leading-snug ${
                      isAcademicClassContentPending(aula.titulo)
                        ? 'italic text-amber-600'
                        : 'text-[#001a33]'
                    }`}>
                      {isAcademicClassContentPending(aula.titulo)
                        ? 'Aguardando conteúdo do professor'
                        : aula.titulo}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 font-semibold font-mono mt-1">
                    Carga horária: {aula.cargaHoraria}H
                  </div>
                </td>
                <td className="p-4 align-top">
                  <textarea
                    className="w-full bg-slate-50/60 focus:bg-white outline-none text-xs font-medium text-slate-800 leading-relaxed resize-y min-h-[70px] p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={localPraticas[aula.id] || ''}
                    onChange={(event) => {
                      if (!canEditPratica) return;
                      const text = event.target.value;
                      setLocalPraticas((previous) => ({ ...previous, [aula.id]: text }));
                    }}
                    onBlur={(event) => {
                      if (canEditPratica) onSavePratica(aula.id, event.target.value);
                    }}
                    readOnly={!canEditPratica}
                    placeholder="Descreva a prática pedagógica executada nesta aula..."
                  />
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);

export default DiarioConteudoTab;
