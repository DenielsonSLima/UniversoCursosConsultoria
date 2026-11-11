import { formatNfseMoney } from '../../components/nfse.presentation';
import { formatNfseMonth } from '../../preparar/nfse-month.presentation';
import type { NfseFiscalReview } from './nfse-fiscal-review.types';

const regimes: Record<string, string> = { '1': 'Não optante', '2': 'MEI', '3': 'Optante pelo Simples Nacional · não MEI' };
const regime = (value: string | null) => regimes[value || ''] || 'Não informado';
const status = { NOT_REVIEWED: 'Revisão ainda não salva', CONFIRMED: 'Revisão fiscal salva', STALE: 'Revisão precisa ser atualizada', BLOCKED: 'Revisão com pendências' };
const checkStatus = { PASSED: 'Conferido', BLOCKED: 'Pendente', UNKNOWN: 'Não confirmado' };

export default function NfseFiscalReviewDetails({ review }: { review: NfseFiscalReview }) {
  const { preparation, issuer, recipient } = review;
  const address = [recipient.address.street, recipient.address.number, recipient.address.complement,
    recipient.address.district, recipient.address.city, recipient.address.state, recipient.address.postalCode].filter(Boolean).join(' · ');
  return <>
    <section className="nfse-fiscal-review-section" aria-label="Origem da preparação">
      <h3>Preparação preservada</h3>
      <dl className="nfse-fiscal-review-grid">
        <div><dt>Aluno / turma</dt><dd>{preparation.studentName}<small>{preparation.classLabel}</small></dd></div>
        <div><dt>Recebimentos preparados</dt><dd>{formatNfseMoney(preparation.amount)}<small>{preparation.receiptCount} recebimento(s) · {formatNfseMonth(preparation.paymentMonth)}</small></dd></div>
        <div className="nfse-fiscal-review-wide"><dt>Modelo original da preparação</dt><dd>{preparation.originalModel.name}<small>Tributação {preparation.originalModel.nationalServiceCode}. O modelo original permanece no histórico.</small></dd></div>
      </dl>
    </section>
    <section className="nfse-fiscal-review-section" aria-label="Emitente e tomador">
      <h3>Emitente e tomador do serviço</h3>
      <dl className="nfse-fiscal-review-grid">
        <div><dt>Emitente</dt><dd>{issuer.name || 'Nome não informado'}<small>{issuer.cnpj}</small></dd></div>
        <div><dt>Inscrição municipal</dt><dd>{issuer.municipalRegistration || 'Não informada'}<small>{regime(issuer.opSimpNac)}</small></dd></div>
        <div><dt>Aluno como tomador</dt><dd>{recipient.name || 'Nome não informado'}<small>{recipient.document || 'Documento não informado'}</small></dd></div>
        <div><dt>Endereço do tomador</dt><dd>{address || 'Não informado'}</dd></div>
      </dl>
    </section>
    <section className="nfse-fiscal-review-section" aria-label="Situação da revisão e dependências">
      <h3>Situação da conferência</h3>
      <p className="nfse-status" data-tone={review.reviewComplete ? 'success' : 'warning'}>{status[review.reviewStatus]}</p>
      {review.savedAt && <p className="nfse-inline-help">Revisão {review.revision} salva em {new Date(review.savedAt).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}.</p>}
      <h4>Dependências para transmissão</h4>
      <ul className="nfse-fiscal-review-checks">{review.checks.map(check => <li key={check.code}>
        <span className="nfse-status" data-tone={check.status === 'PASSED' ? 'success' : 'warning'}>{checkStatus[check.status]}</span>
        <span>{check.message}</span></li>)}</ul>
      <p className="nfse-inline-help">A revisão salva registra a conferência fiscal. A prontidão para emitir é verificada na prévia da emissão, com revalidação dos dados e recebimentos.</p>
    </section>
  </>;
}
