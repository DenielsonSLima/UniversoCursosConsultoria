import React from 'react';
import type { DiarioConteudoTabProps } from '../DiarioConteudoTab';
import { useDiarioDocumentary } from '../historico/DiarioDocumentaryContext';
import { extraClassOriginLabel, orderedDiaryContent } from '../diario-content-order';
import { formatDiarioPdfAcademicDate } from '../diario-pdf.contract';
import type { DiarioAula } from '../diario-classe.service';

const DiarioConteudoMobile: React.FC<DiarioConteudoTabProps> = ({ aulas, extraClassCredit, localTitulos, setLocalTitulos, localPraticas, setLocalPraticas, canEditAulaTitle, canEditPratica, savingAulaId, onSaveAulaTitle, onSavePratica }) => {
  const documentary = useDiarioDocumentary();
  const entries = orderedDiaryContent<DiarioAula>(aulas, documentary ? undefined : extraClassCredit);
  return <section className="professor-diary-mobile" aria-label="Conteúdo por encontro">
    <p className="mb-4 text-xs text-slate-600">Prepare o conteúdo das próximas aulas nas datas definidas pela Gestão. Data, horário e carga horária são definidos pela Gestão.</p>
    <div className="space-y-3">{entries.map(entry => {
      if (entry.tipo === 'EXTRA_CLASSE') return <article key={`extra:${entry.activity.id}`} className="diary-mobile-card border-emerald-200 bg-emerald-50">
        <p className="text-xs text-emerald-800">{formatDiarioPdfAcademicDate(entry.activity.dataSource)} · {entry.activity.cargaHoraria}h</p>
        <h4 className="mt-2 font-medium">{entry.activity.titulo}</h4>
        <p className="mt-2 text-xs text-emerald-800">{extraClassOriginLabel(entry.activity, aulas)}</p>
        <p className="mt-1 text-xs text-emerald-800">Atividade complementar extra-classe</p>
      </article>;
      const aula = entry.aula;
      return <article key={aula.id} className="diary-mobile-card">
        <h4 className="font-medium">Aula de {aula.dataLabel} · {aula.cargaHoraria}h</h4>
        <label className="diary-mobile-label mt-3">Conteúdo programático
          <textarea aria-label={`Conteúdo programático da aula de ${aula.dataLabel}`} maxLength={1000}
            value={localTitulos[aula.id] || ''} readOnly={!canEditAulaTitle}
            onChange={event => { const value = event.target.value; if (canEditAulaTitle) setLocalTitulos(previous => ({ ...previous, [aula.id]: value })); }}
            placeholder="Prepare o conteúdo desta aula" />
        </label>
        {canEditAulaTitle && <button type="button" className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-white disabled:bg-slate-100 disabled:text-slate-500"
          disabled={savingAulaId === aula.id || !(localTitulos[aula.id] || '').trim() || (localTitulos[aula.id] || '').trim() === aula.titulo.trim()}
          onClick={() => onSaveAulaTitle(aula.id, localTitulos[aula.id] || '')}>{savingAulaId === aula.id ? 'Salvando conteúdo…' : 'Salvar conteúdo'}</button>}
        <label className="diary-mobile-label mt-4">Prática pedagógica registrada
          <textarea aria-label={`Prática pedagógica da aula de ${aula.dataLabel}`} value={localPraticas[aula.id] || ''} readOnly={!canEditPratica}
            onChange={event => { const value = event.target.value; if (canEditPratica) setLocalPraticas(previous => ({ ...previous, [aula.id]: value })); }}
            onBlur={event => { if (canEditPratica) onSavePratica(aula.id, event.target.value); }} placeholder="Registre a prática executada" />
        </label>
        {canEditPratica && <p className="mt-1 text-xs text-slate-500">A prática é salva ao sair do campo.</p>}
      </article>;
    })}</div>
    {!entries.length && <p className="py-4 text-slate-500">A Gestão ainda não definiu aulas para esta disciplina.</p>}
  </section>;
};

export default DiarioConteudoMobile;
