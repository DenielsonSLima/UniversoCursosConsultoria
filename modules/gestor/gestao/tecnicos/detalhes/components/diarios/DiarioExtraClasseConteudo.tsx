import type { DiarioExtraClassCredit } from './diario-extra-classe.types';
import { formatDiarioPdfAcademicDate } from './diario-pdf.contract';
import { useDiarioDocumentary } from './historico/DiarioDocumentaryContext';

const DiarioExtraClasseConteudo = ({ credit }: { credit?: DiarioExtraClassCredit }) => {
  const documentary = useDiarioDocumentary();
  if (documentary || !credit?.activities.length) return null;

  return (
    <section className="mt-5 space-y-3" aria-label="Conteúdo das atividades extra-classe">
      <div>
        <h3 className="text-sm font-bold text-[#001a33]">Atividades extra-classe</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          A carga destas atividades conta na frequência mínima de 75% da disciplina
          para os alunos com vínculo elegível na data da atividade. Trancamentos e
          transferências são respeitados a partir da data da movimentação.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-emerald-100">
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead className="bg-emerald-50 text-emerald-900">
            <tr>
              <th className="w-28 p-3 font-bold">Data</th>
              <th className="p-3 font-bold">Conteúdo extra-classe</th>
              <th className="w-24 p-3 text-right font-bold">Carga horária</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {credit.activities.map((activity) => (
              <tr key={activity.id}>
                <td className="p-3 align-top font-medium">{formatDiarioPdfAcademicDate(activity.dataSource)}</td>
                <td className="whitespace-pre-wrap break-words p-3 align-top">{activity.titulo}</td>
                <td className="p-3 text-right align-top font-semibold">{activity.cargaHoraria}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default DiarioExtraClasseConteudo;
