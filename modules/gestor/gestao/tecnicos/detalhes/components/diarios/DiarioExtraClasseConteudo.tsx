import React from 'react';
import type { DiarioExtraClasseActivity } from './diario-extra-classe.types';
import { formatDiarioPdfAcademicDate } from './diario-pdf.contract';

interface DiarioExtraClasseConteudoProps {
  activity: DiarioExtraClasseActivity;
  originLabel: string;
}

const DiarioExtraClasseConteudo: React.FC<DiarioExtraClasseConteudoProps> = ({ activity, originLabel }) => (
  <tr className="bg-emerald-50/60 text-emerald-950">
    <td className="border-r border-emerald-100 p-4 align-top text-sm font-bold">
      {formatDiarioPdfAcademicDate(activity.dataSource).slice(0, 5)}
    </td>
    <td className="border-r border-emerald-100 p-4 align-top">
      <p className="mb-2 border-l-2 border-emerald-400 pl-3 text-[11px] font-bold">{originLabel}</p>
      <p className="whitespace-pre-wrap break-words pl-3 text-sm leading-relaxed">{activity.titulo}</p>
      <p className="mt-1 pl-3 font-mono text-[10px] font-semibold">Carga horária: {activity.cargaHoraria}H</p>
    </td>
    <td className="p-4 align-top text-xs text-emerald-800">Atividade complementar extra-classe</td>
  </tr>
);

export default DiarioExtraClasseConteudo;
