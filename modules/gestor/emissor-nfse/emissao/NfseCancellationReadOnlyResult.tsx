import type { IndividualCancelResult } from '../individual/nfse-individual.types';
import { cancellationReasons } from '../cancelamento/nfse-cancellation-models.contract';
const labels = { PREVIEWED: 'Cancelamento ainda não enviado', CANCELLED: 'Cancelada', CANCELLATION_PENDING: 'Cancelamento aguardando confirmação',
  CANCELLATION_REJECTED: 'Cancelamento rejeitado', AWAITING_ANALYSIS: 'Cancelamento aguardando análise', BLOCKED: 'Cancelamento pendente de revisão' };
export default function NfseCancellationReadOnlyResult({ result }: { result: IndividualCancelResult }) {
  return <section className="nfse-individual-review" aria-label="Consulta do cancelamento"><h3>{labels[result.state]}</h3><p>{result.message}</p>
    <dl className="nfse-individual-grid"><div><dt>NFS-e</dt><dd>{result.payload.number}</dd></div><div><dt>Motivo</dt><dd>{cancellationReasons.find(item => item.value === result.payload.reasonCode)?.label}</dd></div>
      <div><dt>Justificativa registrada</dt><dd>{result.payload.justification}</dd></div></dl>
    {Boolean(result.codes?.length) && <p>Código(s): {result.codes!.join(', ')}</p>}
  </section>;
}
