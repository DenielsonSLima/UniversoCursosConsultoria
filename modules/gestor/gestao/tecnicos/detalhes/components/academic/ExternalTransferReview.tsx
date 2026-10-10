import React from 'react';
import type { ExternalTransferPreview } from './external-transfer.contract';
import type { ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferDiscipline } from './ExternalTransferAcademicFields';
import { externalTransferDate, externalTransferMoney, formatExternalTransferDecimal } from './external-transfer-presentation';

interface Props {
  draft: ExternalTransferDraft;
  studentName: string;
  destinationLabel?: string;
  disciplines: ExternalTransferDiscipline[];
  review: ExternalTransferPreview | null;
}
const statusLabel = { EQUIVALENCIA: 'Equivalência', APROVEITADO: 'Aproveitado', DISPENSADO: 'Dispensado' };
const typeLabel = { MATRICULA: 'Matrícula', PARCELA: 'Mensalidade', REMATRICULA: 'Rematrícula' };
const ExternalTransferReview: React.FC<Props> = ({ draft, studentName, destinationLabel, disciplines, review }) => {
  const credits = disciplines.filter((discipline) => draft.credits[discipline.id]?.selected);
  return <div className="space-y-4 text-sm text-slate-700">
    <section className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
      <h4 className="text-xs font-black uppercase text-violet-800">Conferência acadêmica</h4>
      <p className="font-bold">{studentName}</p>
      {destinationLabel && <p><span className="font-bold">Nosso curso e turma:</span> {destinationLabel}</p>}
      <p><span className="font-bold">Escola anterior:</span> {draft.institution}</p>
      <p><span className="font-bold">Transferência em:</span> {externalTransferDate(draft.transferDate)}</p>
      <p className="whitespace-pre-wrap"><span className="font-bold">Motivo:</span> {draft.reason}</p>
      {draft.notes && <p className="whitespace-pre-wrap"><span className="font-bold">Observações:</span> {draft.notes}</p>}
      <div className="border-t border-violet-100 pt-2">
        <p className="text-xs font-bold">Disciplinas aproveitadas: {credits.length}</p>
        {credits.length === 0 ? <p className="mt-1 text-xs text-slate-500">Nenhum aproveitamento informado.</p> : <ul className="mt-2 space-y-2 text-xs">
          {credits.map((discipline) => {
            const credit = draft.credits[discipline.id];
            return <li key={discipline.id} className="rounded-lg bg-white p-2">
              <p className="font-bold">{discipline.nome} — {statusLabel[credit.situacao]}</p>
              <p className="mt-1">Média: {credit.mediaFinal || 'não informada'} · Frequência: {credit.frequenciaPercent === '' ? 'não informada' : `${credit.frequenciaPercent}%`}</p>
            </li>;
          })}
        </ul>}
      </div>
    </section>
    {review ? <section className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <h4 className="text-xs font-black uppercase text-blue-900">Cronograma conferido</h4>
      {review.financeiro.itens.length === 0 ? <p className="text-xs">Recebimento sem cobranças planejadas.</p> : <ol className="space-y-2">
        {review.financeiro.itens.map((item) => <li key={item.itemId} className="rounded-lg bg-white p-3 text-xs">
          <p className="font-bold">C{item.cicloNumero} · {typeLabel[item.tipo]} · {externalTransferDate(item.vencimento)} · {externalTransferMoney(item.valor)}</p>
          <p className="mt-1 text-slate-500">Desconto: {Number(item.descontoPontualidade) > 0 ? externalTransferMoney(item.descontoPontualidade) : 'sem desconto'} · Multa: {formatExternalTransferDecimal(item.multaAtrasoPercentual, true)}% · Juros ao mês: {formatExternalTransferDecimal(item.jurosAtrasoPercentual, true)}%</p>
        </li>)}
      </ol>}
      <div className="space-y-1 border-t border-blue-100 pt-3 text-xs">{review.totais.porCiclo.map((total) => <p key={total.cicloNumero}>C{total.cicloNumero}: {total.quantidadeParcelas} mensalidades · Total nominal {externalTransferMoney(total.totalNominal)}</p>)}</div>
      <p className="text-xs font-bold">Total nominal do plano: {externalTransferMoney(review.totais.totalNominal)}</p>
      <p className="text-xs text-slate-500">Totais calculados pelo sistema antes de descontos e encargos de pagamento. O recebimento salva o plano; a emissão das cobranças fica no Financeiro.</p>
      {review.avisos.map((warning, index) => <p key={index} className="text-xs text-amber-800">{warning}</p>)}
    </section> : <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">O cronograma mudou. Volte ao Financeiro para conferir novamente.</p>}
  </div>;
};
export default ExternalTransferReview;
