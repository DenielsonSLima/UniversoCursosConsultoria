import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.NFSE_TEST_PGLITE_MODULE;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
export const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const scope = { context: id(10), polo: id(1), environment: 'HOMOLOGACAO', month: '2026-11' };
export const clone = (value) => globalThis.structuredClone(value);
export const none = () => ({ source: 'NONE', value: null, base: null });
export const deferred = () => ({ source: 'AT_ISSUANCE', value: null });
export const fixed = (value) => ({ source: 'FIXED', value });
export const documentRule = () => ({ source: 'LINKED_OPERATION_DOCUMENTS', documentType: 'NFE', categoryCode: '2',
  categoryDescription: null, documentDescription: null, allocationMode: 'ELIGIBLE_AMOUNT', allocationValue: null,
  supplierSource: 'DOCUMENT', supplierPartnerId: null });
export const serviceOptions = { version: 1, countryCode: 'BRA', municipalityCode: '3550308', exportResultCountryCode: null,
  includeIbsCbs: false, governmentPurchase: null, governmentEntityType: null, operationType: null };
export const peopleOptions = { version: 1, competenceMode: 'ISSUE_DATE', competenceDate: null,
  dpsSeriesMode: 'AUTOMATIC', dpsSeries: null, issuerRole: 'PROVIDER', simpleNationalOption: 'FROM_ESTABLISHMENT',
  simpleNationalAssessment: 'FROM_ESTABLISHMENT', recipientLocation: 'BRASIL', recipientIncludeAddress: false,
  recipientIsDestination: null, destinationPartnerId: null, intermediaryLocation: 'NOT_INFORMED', intermediaryPartnerId: null };
export const additionalOptions = { version: 1, people: { destinationLocation: null, personalUse: null,
  providerPartner: null, providerLocation: null, emissionReason: null, rejectedInvoiceReference: null,
  nif: { provider: null, recipient: null, destination: null, intermediary: null } },
service: { municipalServiceCode: null, internalContributorCode: null, construction: null, property: null,
  event: null, foreignTrade: null, operationReferences: null, orderItems: null, rentedMovableAssets: null } };
export const valuesOptions = { version: 1, serviceAmount: { source: 'RECEIPTS', fixedAmount: null },
  intermediaryAmount: none(), unconditionalDiscount: none(), conditionalDiscount: none(),
  iss: { specialTaxRegime: 'FROM_ESTABLISHMENT', suspensionType: 'NONE', suspensionProcessNumber: null,
    retention: 'NONE', rateSource: 'FROM_RULES', ratePercent: null, benefitId: null, benefitReduction: none() },
  deduction: { mode: 'NONE', value: null, documents: [] },
  federal: { mode: 'FROM_ESTABLISHMENT', pisCofinsCst: null, base: none(), pisRatePercent: null,
    cofinsRatePercent: null, retentionType: null, withheldCp: none(), withheldIrrf: none(), withheldSocialContributions: none() },
  ibscbs: null, transparency: { mode: 'PERCENTAGES', federal: none(), state: none(), municipal: none(),
    federalPercent: '1', statePercent: '0', municipalPercent: '0', simpleNationalPercent: null }, rental: null };
export const definition = { name: 'PRÉ-MODELO INATIVO SINTÉTICO', active: false, nationalServiceCode: '080201', nbsCode: '122020000',
  operationIndicatorCode: '', serviceDescription: 'SERVIÇO SINTÉTICO', issTreatment: 'TRIBUTAVEL', immunityType: null,
  technicalResponsibilityDocument: '', referenceDocument: '', complementaryInfo: '', orderReference: '',
  serviceOptions, peopleOptions, additionalOptions, valuesOptions };
export const ibsDefinition = () => {
  const value = clone(definition);
  value.serviceOptions.includeIbsCbs = true; value.serviceOptions.governmentPurchase = false;
  value.peopleOptions.recipientIsDestination = true; value.operationIndicatorCode = '100301';
  value.valuesOptions.ibscbs = { cst: '000', classificationCode: '000001', presumedCreditCode: null,
    regularTaxation: null, deferral: null, reimbursementDocuments: [] };
  return value;
};
const readMigration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
export const expandedMigrations = ['20261110221924_nfse_model_fiscal_catalog.sql', '20261110221926_nfse_model_currency_catalog.sql',
  '20261110221929_nfse_model_service_codes_1.sql', '20261110221931_nfse_model_service_codes_2.sql',
  '20261110221934_nfse_model_service_codes_3.sql',
  '20261110221936_nfse_model_preset_rules.sql', '20261110221939_nfse_model_service_rule_objects.sql',
  '20261110221941_nfse_model_additional_options.sql', '20261110221943_nfse_model_value_rules.sql',
  '20261110221946_nfse_model_values_validation.sql', '20261110221948_nfse_model_complete_presets_rpc.sql'];
export const applyExpanded = async (db) => {
  for (const name of expandedMigrations) await db.exec(await readMigration(name));
};
export async function createDatabase(expanded = true) {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('./nfse_model_presets.fixture.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
      INSERT INTO public.polos VALUES('${id(1)}','ativo'),('${id(2)}','ativo'); SET test.actor='${id(11)}';
      INSERT INTO public.parceiros VALUES('${id(30)}','PARCEIRO LOCAL SINTÉTICO','PF','ativo','${id(1)}','{}'),
      ('${id(31)}','PARCEIRO GLOBAL SINTÉTICO','PJ','ativo',NULL,'{}'),
      ('${id(32)}','PARCEIRO OUTRO POLO','PF','ativo','${id(2)}','{}'),
      ('${id(33)}','PARCEIRO INATIVO','PF','inativo','${id(1)}','{}'),
      ('${id(34)}','ALUNO SEM POLO','Aluno','ativo',NULL,'{}');`);
    for (const name of ['20261108225453_nfse_models_private_store.sql', '20261108225459_nfse_models_save_rpc.sql',
      '20261108233250_nfse_model_reference_month.sql', '20261110212829_nfse_model_service_presets.sql',
      '20261110212831_nfse_model_people_presets_and_save.sql', '20261109015954_nfse_configuration_store.sql']) {
      await db.exec(await readMigration(name));
    }
    await db.query(`INSERT INTO private.nfse_configurations(polo_id,environment,credential_polo_id,definition,version,updated_by)
      VALUES($1,'HOMOLOGACAO',$1,$2,1,$3),($1,'PRODUCAO',$1,$2,1,$3)`,
    [id(1), { opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', municipalityCode: '3550308' }, id(11)]);
    if (expanded) await applyExpanded(db);
    return db;
  } catch (error) { await db.close(); throw error; }
}
export const client = (db) => ({
  save: async (value = definition, request = 50, model = null, expected = null, changes = {}) => (await db.query(
    'SELECT public.save_nfse_model_secure($1,$2,$3,$4,$5,$6,$7,$8) value',
    [...Object.values({ ...scope, ...changes }), id(request), model, expected, value])).rows[0].value,
  get: async (changes = {}) => (await db.query('SELECT public.get_nfse_models_secure($1,$2,$3,$4) value',
    Object.values({ ...scope, ...changes }))).rows[0].value.data.rows,
  additional: async (value = additionalOptions, model = definition) => (await db.query(
    'SELECT private.normalize_nfse_model_additional_options($1,$2,$3,$4) value', [value, model, id(1), 'HOMOLOGACAO'])).rows[0].value,
  values: async (value = valuesOptions, model = definition, environment = 'HOMOLOGACAO') => (await db.query(
    'SELECT private.normalize_nfse_model_values_options($1,$2,$3,$4) value', [value, model, id(1), environment])).rows[0].value,
});
