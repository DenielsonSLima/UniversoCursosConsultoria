import React from 'react';
import type { ExternalTransferPreview } from './external-transfer.contract';
import type { ExternalTransferDraft } from './external-transfer-draft';
import type { ExternalTransferDiscipline } from './ExternalTransferAcademicFields';

interface Props {
  draft: ExternalTransferDraft;
  studentName: string;
  destinationLabel?: string;
  disciplines: ExternalTransferDiscipline[];
  review: ExternalTransferPreview | null;
}
const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value.split('-').reverse().join('/');
const statusLabel = { EQUIVALENCIA: 'Equivalência', APROVEITADO: 'Aproveitado', DISPENSADO: 'Dispensado' };

const ExternalTransferReview: React.FC<Props> = ({ draft, studentName, destinationLabel, disciplines, review }) => {
  const credits = disciplines.filter((discipline) => draft.credits[discipline.id]?.selected);
  const plan = review?.financeiro;
  const conditions = plan?.condicoes;
  return <div className="space-y-4 text-sm text-slate-700">
    <section className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
      <h4 className="text-xs font-black uppercase text-violet-800">Conferência acadêmica</h4>
      <p className="font-bold">{studentName}</p>
      {destinationLabel && <p><span className="font-bold">Destino:</span> {destinationLabel}</p>}
      <p><span className="font-bold">Origem:</span> {draft.institution}{draft.course ? ` — ${draft.course}` : ''}</p>
      <p><span className="font-bold">Transferência em:</span> {date(draft.transferDate)}</p>
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
    {plan && conditions && review ? <section className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <h4 className="text-xs font-black uppercase text-blue-900">Condições conferidas</h4>
      <p><span className="font-bold">Ciclo inicial:</span> {plan.cicloNumero}º · <span className="font-bold">Primeiro vencimento:</span> {date(plan.primeiroVencimento)}</p>
      {plan.justificativaCiclo2 && <p className="text-xs">{plan.justificativaCiclo2}</p>}
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-slate-500">Mensalidades</dt><dd className="mt-1 font-bold">{plan.cobrarMensalidades ? `${plan.quantidadeParcelas} parcelas de ${money(conditions.valorMensalidade)}` : 'Sem mensalidades'}</dd></div>
        <div><dt className="text-slate-500">Matrícula no 1º ciclo</dt><dd className="mt-1 font-bold">{conditions.cobrarMatricula ? money(conditions.valorMatricula) : 'Sem taxa de matrícula'}</dd></div>
        {review.maxCiclos === 2 && <div><dt className="text-slate-500">Rematrícula no 2º ciclo</dt><dd className="mt-1 font-bold">{conditions.cobrarRematricula ? money(conditions.valorRematricula) : 'Sem taxa de rematrícula'}</dd></div>}
        <div><dt className="text-slate-500">Desconto por pontualidade</dt><dd className="mt-1 font-bold">{Number(conditions.descontoPontualidade) > 0 ? money(conditions.descontoPontualidade) : 'Sem desconto'}</dd></div>
        <div><dt className="text-slate-500">Multa por atraso</dt><dd className="mt-1 font-bold">{Number(conditions.multaAtrasoPercentual) > 0 ? `${conditions.multaAtrasoPercentual}%` : 'Sem multa'}</dd></div>
        <div><dt className="text-slate-500">Juros ao mês</dt><dd className="mt-1 font-bold">{Number(conditions.jurosAtrasoPercentual) > 0 ? `${conditions.jurosAtrasoPercentual}%` : 'Sem juros'}</dd></div>
      </dl>
      <div className="space-y-1 border-t border-blue-100 pt-3 text-xs">
        <p>Aplicação nas mensalidades: desconto {conditions.aplicarDescontoMensalidade && Number(conditions.descontoPontualidade) > 0 ? 'sim' : 'não'}; multa/juros {conditions.aplicarMultaJurosMensalidade && (Number(conditions.multaAtrasoPercentual) > 0 || Number(conditions.jurosAtrasoPercentual) > 0) ? 'sim' : 'não'}.</p>
        <p>Aplicação na matrícula: desconto {conditions.aplicarDescontoMatricula && Number(conditions.descontoPontualidade) > 0 ? 'sim' : 'não'}; multa/juros {conditions.aplicarMultaJurosMatricula && (Number(conditions.multaAtrasoPercentual) > 0 || Number(conditions.jurosAtrasoPercentual) > 0) ? 'sim' : 'não'}.</p>
        {review.maxCiclos === 2 && <p>Aplicação na rematrícula: desconto {conditions.aplicarDescontoRematricula && Number(conditions.descontoPontualidade) > 0 ? 'sim' : 'não'}; multa/juros {conditions.aplicarMultaJurosRematricula && (Number(conditions.multaAtrasoPercentual) > 0 || Number(conditions.jurosAtrasoPercentual) > 0) ? 'sim' : 'não'}.</p>}
      </div>
      <p className="text-xs"><span className="font-bold">Total nominal do ciclo inicial:</span> {money(review.totais.cicloInicialNominal)}</p>
      <p className="text-xs"><span className="font-bold">Total nominal do plano:</span> {money(review.totais.totalNominal)}</p>
      <p className="text-xs text-slate-500">Totais calculados pelo sistema antes de descontos e encargos de pagamento. O recebimento registra o plano; a emissão das cobranças fica no Financeiro.</p>
      {review.avisos.map((warning, index) => <p key={index} className="text-xs text-amber-800">{warning}</p>)}
    </section> : <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">As condições financeiras mudaram. Volte ao Financeiro para conferir o plano.</p>}
  </div>;
};

export default ExternalTransferReview;
