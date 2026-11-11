import type { NfseModel, NfseScope } from '../../types/nfse.types';
import type { NfseModelIssuerMetadata } from '../services/nfse-model-issuer.service-core';
import { describeNfsePresetCode } from '../additional/nfse-preset-review.domains';
import { modelReportRows, type NfseModelReportCatalogs, type NfseModelReportSection, type NfseModelReportRow } from './nfse-model-export.rows';

export interface NfseModelExportReport {
  modelId: string; modelName: string; version: number; environment: string; generatedAt: string;
  issuer: NfseModelIssuerMetadata; sections: NfseModelReportSection[];
}
const treatments = { TRIBUTAVEL: 'Operação tributável', IMUNIDADE: 'Imunidade', EXPORTACAO: 'Exportação de serviço', NAO_INCIDENCIA: 'Não incidência do ISSQN' };
const serviceLabels: Record<string, string> = { nationalServiceCode: 'Código de tributação nacional', nbsCode: 'NBS', operationIndicatorCode: 'Indicador da operação',
  serviceDescription: 'Descrição do serviço', issTreatment: 'Tratamento do ISSQN', immunityType: 'Tipo de imunidade',
  technicalResponsibilityDocument: 'Documento de responsabilidade técnica', referenceDocument: 'Documento de referência',
  complementaryInfo: 'Informações complementares', orderReference: 'Pedido/ordem/projeto' };
const present = (value: unknown) => value === null || value === undefined || value === '' ? 'Não informado' : String(value);

export function createNfseModelExportReport(model: NfseModel, scope: NfseScope, issuer: NfseModelIssuerMetadata,
  catalogs: NfseModelReportCatalogs, generatedAt: string): NfseModelExportReport {
  if (issuer.poloId !== scope.poloId || !model.id || !Number.isInteger(model.version) || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Os dados do modelo e da unidade não pertencem à mesma revisão.');
  }
  const row = (path: string, label: string, value: unknown, origin = 'Pré-modelo'): NfseModelReportRow => ({ path, label, value: present(value), origin });
  const code = (key: string, value: unknown) => value === null || value === '' || value === undefined ? 'Sem valor definido'
    : describeNfsePresetCode(key, String(value), [], catalogs.fiscal, catalogs.values, catalogs.profile) || String(value);
  const identity = [row('id', 'Identificador do modelo', model.id), row('name', 'Nome', model.name), row('version', 'Versão do modelo', model.version),
    row('active', 'Situação', model.active ? 'Ativo' : 'Inativo'), row('environment', 'Ambiente', scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação', 'Escopo consultado'),
    row('poloId', 'Identificador da unidade', scope.poloId, 'Unidade'), row('generatedAt', 'Relatório gerado em', new Date(generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília)', 'Momento da exportação')];
  const address = issuer.address;
  const unit = [['name', 'Nome cadastrado', issuer.name], ['legalName', 'Razão social', issuer.legalName], ['cnpj', 'CNPJ', issuer.cnpj],
    ['municipalityCode', 'Município IBGE', issuer.municipalityCode], ['municipalRegistration', 'Inscrição municipal', issuer.municipalRegistration],
    ['address.street', 'Logradouro', address.street], ['address.number', 'Número', address.number], ['address.complement', 'Complemento', address.complement],
    ['address.district', 'Bairro', address.district], ['address.city', 'Cidade', address.city], ['address.state', 'UF', address.state], ['address.postalCode', 'CEP', address.postalCode],
    ['phone', 'Telefone', issuer.phone], ['email', 'E-mail cadastrado', issuer.email], ['configurationVersion', 'Versão da configuração fiscal', issuer.configurationVersion],
    ['opSimpNac', 'Opção pelo Simples Nacional', code('simpleNationalOption', issuer.opSimpNac)],
    ['regApTribSN', 'Apuração tributária do Simples', code('simpleNationalAssessment', issuer.regApTribSN)],
    ['regEspTrib', 'Regime especial de tributação', code('specialTaxRegime', issuer.regEspTrib)]]
    .map(([key, label, value]) => row(`issuer.${key}`, String(label), value, 'Unidade atual'));
  const people = [model.additionalOptions ? row('additionalOptions.version', 'Versão dos parâmetros complementares', model.additionalOptions.version)
    : row('additionalOptions', 'Parâmetros complementares', null),
    ...modelReportRows(model.peopleOptions ?? null, 'peopleOptions', catalogs),
    ...modelReportRows(model.additionalOptions?.people ?? null, 'additionalOptions.people', catalogs, 'Complementos')];
  // The serialized null is the explicit inheritance strategy when the whole SN choice follows the unit.
  if (model.peopleOptions?.simpleNationalOption === 'FROM_ESTABLISHMENT') {
    for (const item of people) {
      if (item.path === 'peopleOptions.simpleNationalOption') item.value += ` · Atual: ${code('simpleNationalOption', issuer.opSimpNac)}`;
      if (item.path === 'peopleOptions.simpleNationalAssessment' && model.peopleOptions.simpleNationalAssessment === null) {
        item.origin = 'Configuração da unidade'; item.value = `Herdar da unidade · Atual: ${code('simpleNationalAssessment', issuer.regApTribSN)}`;
      }
    }
  }
  const service = Object.entries(serviceLabels).map(([key, label]) => {
    const value = model[key as keyof NfseModel];
    return row(key, label, key === 'issTreatment' ? treatments[model.issTreatment] : code(key, value),
      key === 'serviceDescription' && model.serviceDescription.includes('{{') ? 'Modelo + dados da emissão' : 'Pré-modelo');
  });
  if (model.serviceDescription.includes('{{mes_referencia}}')) service.push(row('serviceDescriptionResolution', 'Mês na descrição',
    '{{mes_referencia}} será substituído conforme a competência confirmada na operação', 'Na emissão'));
  service.push(...modelReportRows(model.serviceOptions ?? null, 'serviceOptions', catalogs, 'Prestação'),
    ...modelReportRows(model.additionalOptions?.service ?? null, 'additionalOptions.service', catalogs, 'Complementos'));
  const execution = [row('execution.recipient', 'Identidade do tomador', 'Cadastro escolhido ao preparar a emissão', 'Na emissão'),
    row('execution.amount', 'Valor efetivo', 'Resolvido pela regra do modelo e pela origem canônica da preparação', 'Na emissão'),
    row('execution.dpsNumber', 'Número da DPS', 'Gerado e reservado para cada documento', 'Na emissão'),
    row('execution.issuedAt', 'Data e hora da emissão', 'Registradas para cada documento', 'Na emissão'),
    row('execution.references', 'Documentos, chaves e datas operacionais', 'Resolvidos conforme as estratégias configuradas e a operação preparada', 'Na emissão'),
    row('execution.taxAmounts', 'Apuração e valores finais dos tributos', 'Conferidos no documento fiscal e no retorno do emissor; estimativas de transparência não são alíquotas de apuração', 'Na emissão')];
  return { modelId: model.id, modelName: model.name, version: model.version,
    environment: scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação', generatedAt, issuer: globalThis.structuredClone(issuer),
    sections: [{ title: 'Identificação do pré-modelo', rows: identity }, { title: 'Estabelecimento e configuração consultada', rows: unit },
      { title: 'Configuração e regras da emissão', rows: people }, { title: 'Serviço e informações complementares', rows: service },
      { title: 'Valores, tributos e transparência', rows: modelReportRows(model.valuesOptions ?? null, 'valuesOptions', catalogs) },
      { title: 'Dados resolvidos ao preparar cada emissão', rows: execution }] };
}
