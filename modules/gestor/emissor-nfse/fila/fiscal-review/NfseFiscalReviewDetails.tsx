import { formatNfseMoney } from '../../components/nfse.presentation';
import { formatNfseMonth } from '../../preparar/nfse-month.presentation';
import { formatNfseFiscalDocument } from './nfse-fiscal-document.presentation';
import type { NfseFiscalReview } from './nfse-fiscal-review.types';

const regimes: Record<string, string> = { '1': 'Não optante', '2': 'MEI', '3': 'Optante pelo Simples Nacional · não MEI' };
const regime = (value: string | null) => regimes[value || ''] || 'Não informado';
const status = { NOT_REVIEWED: 'Validação na emissão', CONFIRMED: 'Revisão fiscal salva', STALE: 'Atualizar revisão', BLOCKED: 'Dados com pendências' };
const checkStatus = { PASSED: 'Conferido', BLOCKED: 'Pendente', UNKNOWN: 'Não confirmado' };

export default function NfseFiscalReviewDetails({ review, requiresDateReview = false }: {
  review: NfseFiscalReview; requiresDateReview?: boolean;
}) {
  const { preparation, issuer, recipient } = review;
  const pendingChecks = review.checks.filter(check => check.status !== 'PASSED');
  const address = [recipient.address.street, recipient.address.number, recipient.address.complement,
    recipient.address.district, recipient.address.city, recipient.address.state, recipient.address.postalCode].filter(Boolean).join(' · ');
  return <section className="nfse-fiscal-review-section" aria-label="Resumo da preparação">
    <dl className="nfse-fiscal-review-grid">
      <div><dt>Tomador do serviço</dt><dd>{recipient.name || 'Nome do tomador não informado'}<small>{formatNfseFiscalDocument(recipient.document) || 'Documento não informado'}</small></dd></div>
      <div><dt>Valor do serviço</dt><dd>{formatNfseMoney(preparation.amount)}<small>{preparation.receiptCount} recebimento(s) · {formatNfseMonth(preparation.paymentMonth)}</small></dd></div>
    </dl>
    <div className="nfse-fiscal-review-summary"><span className="nfse-status" data-tone={review.reviewComplete && !requiresDateReview ? 'success' : 'warning'}>{requiresDateReview ? 'Atualizar revisão' : review.reviewComplete && review.validationSource === 'SYSTEM_VALIDATED' ? 'Dados validados automaticamente' : status[review.reviewStatus]}</span>
      {review.savedAt && <small>Salva em {new Date(review.savedAt).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}</small>}
    </div>
    <details className="nfse-fiscal-review-disclosure">
      <summary tabIndex={0}>Ver origem, emitente e verificações{pendingChecks.length ? ` (${pendingChecks.length} pendente${pendingChecks.length > 1 ? 's' : ''})` : ''}</summary>
      <div className="nfse-fiscal-review-disclosure-content">
        <dl className="nfse-fiscal-review-grid">
          <div><dt>Aluno / turma</dt><dd>{preparation.studentName}<small>{preparation.classLabel}</small></dd></div>
          <div><dt>Endereço do tomador</dt><dd>{address || 'Não informado'}</dd></div>
          <div><dt>Emitente</dt><dd>{issuer.name || 'Nome não informado'}<small>{formatNfseFiscalDocument(issuer.cnpj)}</small></dd></div>
          <div><dt>Inscrição municipal</dt><dd>{issuer.municipalRegistration || 'Não informada'}<small>{regime(issuer.opSimpNac)}</small></dd></div>
          <div className="nfse-fiscal-review-wide"><dt>Modelo original da preparação</dt><dd>{preparation.originalModel.name}<small>Tributação {preparation.originalModel.nationalServiceCode}. Preservado no histórico.</small></dd></div>
        </dl>
        <h4>Verificações para transmissão</h4>
        <ul className="nfse-fiscal-review-checks">{review.checks.map(check => <li key={check.code}>
          <span className="nfse-status" data-tone={check.status === 'PASSED' ? 'success' : 'warning'}>{checkStatus[check.status]}</span>
          <span>{check.message}</span></li>)}</ul>
        <p className="nfse-inline-help">A emissão revalida os dados e recebimentos. Revisão {review.revision}.</p>
      </div>
    </details>
  </section>;
}
