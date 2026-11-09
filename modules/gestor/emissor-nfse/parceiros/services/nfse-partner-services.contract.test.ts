import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../../types/nfse.types';
import { NfseContractError } from '../../services/nfse.errors';
import type { NfsePartnerServiceInput } from '../types/nfse-partner-services.types';
import { createNfsePartnerServices } from './nfse-partner-services.service-core';
import { nfsePartnerServiceDefinition, parseNfsePartnerServiceOptions, parseNfsePartnerServicesPage } from './nfse-partner-services.contract';
import { nfsePartnerServicesKeys } from '../queries/nfse-partner-services.keys';
import { nfsePartnerAmountInput, nfsePartnerInputAmount } from '../nfse-partner-services.presentation';

const id = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), month: '2026-11', environment: 'HOMOLOGACAO' };
const input: NfsePartnerServiceInput = { requestId: id(3), partnerId: id(4), modelId: id(5), modelVersion: 2,
  serviceDate: '2026-11-08', serviceDescription: 'Serviço prestado ao parceiro.', amount: '1234.56',
  generateReceivable: false, existingReceivableId: null, dueDate: null, categoryId: null };
const envelope = (data: unknown, echo = scope) => ({ version: 1, scope: echo, data });

test('partner preparation transports an explicit no-finance definition without incidental fields', async () => {
  const service = createNfsePartnerServices(async (name, args) => {
    assert.equal(name, 'save_nfse_partner_service_secure');
    assert.deepEqual(args, { p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment,
      p_month: scope.month, p_request_id: input.requestId, p_definition: nfsePartnerServiceDefinition(input) });
    return envelope({ id: id(6), receivableId: null, receivableAction: 'NONE', message: 'Salvo.' });
  });
  const result = await service.save(scope, { ...input, taxTotal: '999.99', issue: true } as NfsePartnerServiceInput);
  assert.equal(result.receivableAction, 'NONE');
});

test('new and existing receivables use distinct explicit financial fields and confirmed results', async () => {
  const create = { ...input, generateReceivable: true, dueDate: '2026-11-30', categoryId: id(7) };
  const link = { ...input, generateReceivable: true, existingReceivableId: id(8) };
  assert.equal(nfsePartnerServiceDefinition(create).categoryId, id(7));
  assert.equal(nfsePartnerServiceDefinition(link).amount, '1234.56');
  const linked = createNfsePartnerServices(async () => envelope({ id: id(6), receivableId: id(8), receivableAction: 'LINKED', message: 'Vinculado.' }));
  assert.equal((await linked.save(scope, link)).receivableId, id(8));
  const incorrect = createNfsePartnerServices(async () => envelope({ id: id(6), receivableId: null, receivableAction: 'NONE', message: 'Salvo.' }));
  await assert.rejects(incorrect.save(scope, create), NfseContractError);
  const wrongTitle = createNfsePartnerServices(async () => envelope({ id: id(6), receivableId: id(9), receivableAction: 'LINKED', message: 'Vinculado.' }));
  await assert.rejects(wrongTitle.save(scope, link), NfseContractError);
});

test('ambiguous money, variables, financial contradictions and foreign months never reach transport', async () => {
  const service = createNfsePartnerServices(async () => { throw new Error('Unexpected transport'); });
  for (const changed of [{ amount: '0.00' }, { amount: '1234,56' }, { amount: '1.234' }, { amount: '-1.00' },
    { serviceDescription: 'Valores em {{mes_referencia}}.' }, { serviceDescription: 'Texto }}' },
    { serviceDescription: 'x'.repeat(1001) }, { serviceDate: '2026-10-08' }, { modelVersion: 0 },
    { dueDate: '2026-11-30' }, { existingReceivableId: id(8) }, { generateReceivable: true },
    { generateReceivable: true, existingReceivableId: id(8), categoryId: id(7) }]) {
    await assert.rejects(service.save(scope, { ...input, ...changed }), NfseContractError);
  }
});

test('partner options preserve only PF/PJ identities and reject duplicated choices', () => {
  const options = { partners: [{ id: id(4), name: 'Parceiro sintético', tradeName: null, document: null, type: 'PJ' }],
    categories: [{ id: id(7), name: 'Serviços' }], existingReceivables: [{ id: id(8), partnerId: id(4), description: 'Conta sintética',
      amount: '1234.56', dueDate: '2026-11-30', categoryId: id(7), status: 'PENDENTE' }], capabilities: { canGenerateReceivable: true } };
  assert.deepEqual(parseNfsePartnerServiceOptions(options), options);
  assert.deepEqual(parseNfsePartnerServiceOptions({ ...options, partners: [{ ...options.partners[0], tradeName: ' ', document: '' }] }).partners, options.partners);
  assert.throws(() => parseNfsePartnerServiceOptions({ ...options, partners: [...options.partners, ...options.partners] }), NfseContractError);
  assert.throws(() => parseNfsePartnerServiceOptions({ ...options, partners: [{ ...options.partners[0], type: 'ALUNO' }] }), NfseContractError);
});

test('list preserves the server total and fails on a foreign scope', async () => {
  const data = { rows: [], page: 1, pageSize: 50, totalItems: 0, totalAmount: '0.00' };
  assert.deepEqual(parseNfsePartnerServicesPage(data, 1), data);
  const service = createNfsePartnerServices(async (name, args) => {
    assert.equal(name, 'get_nfse_partner_services_secure'); assert.equal(args.p_page_size, 50);
    return envelope(data);
  });
  assert.equal((await service.list(scope, 1)).totalAmount, '0.00');
  const otherPolo = createNfsePartnerServices(async () => envelope(data, { ...scope, poloId: id(99) }));
  await assert.rejects(otherPolo.list(scope, 1), NfseContractError);
});

test('service cache and money presentation preserve scope and decimal digits', () => {
  for (const changed of [{ poloId: id(99) }, { contextKey: id(99) }, { month: '2026-10' }, { environment: 'PRODUCAO' as const }]) {
    assert.notDeepEqual(nfsePartnerServicesKeys.scope(scope), nfsePartnerServicesKeys.scope({ ...scope, ...changed }));
  }
  assert.equal(nfsePartnerInputAmount('1.234,56'), '1234.56');
  assert.equal(nfsePartnerAmountInput('987654321012345.67'), '987.654.321.012.345,67');
});
