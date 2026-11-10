import { formatNfseMoney } from '../components/nfse.presentation';
import type { NfseHomologationPayload } from './nfse-homologation.types';

const dateLabel = (value: string) => value.split('-').reverse().join('/');

export default function NfseHomologationPreview({ payload }: { payload: NfseHomologationPayload }) {
  return <section className="nfse-homologation-review" aria-label="Dados da nota de teste">
    <h3>Revisar a nota de teste</h3>
    <dl className="nfse-homologation-grid">
      <div><dt>Emitente</dt><dd>{payload.issuerName}<small>{payload.issuerDocument}</small></dd></div>
      <div><dt>Tomador de teste</dt><dd>{payload.recipientName}<small>{payload.recipientDocument}</small></dd></div>
      <div><dt>Competência</dt><dd>{dateLabel(payload.competence)}</dd></div>
      <div><dt>Data da prestação de teste</dt><dd>{dateLabel(payload.serviceDate)}</dd></div>
      <div><dt>Valor do teste</dt><dd>{formatNfseMoney(payload.serviceAmount)}</dd></div>
      <div><dt>Tributação Nacional</dt><dd>{payload.nationalServiceCode}</dd></div>
      <div><dt>Simples Nacional</dt><dd>{({ '1': 'Não optante', '3': 'Optante pelo Simples Nacional · não MEI' })[payload.opSimpNac]}</dd></div>
      <div><dt>Situação do ISSQN</dt><dd>Tributável</dd></div>
      <div className="nfse-homologation-wide"><dt>Descrição do serviço de teste</dt><dd>{payload.serviceDescription}</dd></div>
    </dl>
    <p className="nfse-inline-help">Teste técnico de R$ 1,00 com o CNPJ da própria matriz como tomador, sem valor fiscal.
      A ausência de IBS/CBS neste teste de homologação não confirma o enquadramento nem a adequação fiscal para produção.</p>
  </section>;
}
