import type { IndividualPayload } from './nfse-individual.types';
import { formatNfseMoney } from '../components/nfse.presentation';
const date = (value: string) => value.split('-').reverse().join('/');
export default function NfseIndividualSnapshot({ payload }: { payload: IndividualPayload }) {
  const ibs = payload.ibsCbs, choice = (value: boolean | null) => value === null ? 'Não informado' : value ? 'Sim' : 'Não';
  const rows = [['Emitente', `${payload.issuerName} · ${payload.issuerCnpj}`], ['Tomador', `${payload.recipientName} · ${payload.recipientDocument}`],
    ['Modelo', `${payload.modelName} · versão ${payload.modelVersion}`], ['Tributação nacional / NBS', `${payload.nationalServiceCode} / ${payload.nbsCode}`],
    ['Competência', date(payload.competenceDate)], ['Prestação', date(payload.serviceDate)], ['Valor do serviço', formatNfseMoney(payload.amount)],
    ['Município / inscrição municipal', `${payload.municipalityCode} / ${payload.municipalRegistration || 'Não informada'}`],
    ['Simples Nacional', { '1': 'Não optante', '2': 'Optante · MEI', '3': 'Optante · ME/EPP' }[payload.opSimpNac]],
    ['Apuração do Simples', payload.regApTribSN ? { '1': 'Federais e ISSQN no Simples', '2': 'Federais no Simples; ISSQN fora', '3': 'Federais e ISSQN fora do Simples' }[payload.regApTribSN] : 'Não se aplica'],
    ['Série DPS', payload.series], ['Descrição do serviço', payload.serviceDescription],
    ...(payload.simpleNationalTransparencyPercent != null ? [['Tributos aproximados do Simples', `${payload.simpleNationalTransparencyPercent.replace('.', ',')}%`]] : []),
    ...(ibs ? [['IBS/CBS', ibs.included ? 'Incluído' : 'Não incluído'], ...(ibs.included ? [
      ['CST IBS/CBS', ibs.cst || 'Não informado'], ['Classificação tributária IBS/CBS', ibs.classificationCode || 'Não informada'],
      ['Indicador da operação', ibs.operationIndicatorCode || 'Não informado'], ['Destinatário é o adquirente', choice(ibs.recipientSameAsAcquirer)],
      ['Uso ou consumo pessoal', choice(ibs.personalUse)], ['Compra governamental', choice(ibs.governmentPurchase)]] : [])] : [])];
  return <section className="nfse-individual-review" aria-label="Revisão canônica da nota em produção"><h3>Dados conferidos pelo servidor</h3>
    <dl className="nfse-individual-grid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
