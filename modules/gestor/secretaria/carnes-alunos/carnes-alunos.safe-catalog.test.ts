import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type BaneseCarnetReceivableRow,
  selectBaneseCarnetDocumentRows,
  takeRegisteredBaneseCarnetCandidateRows,
} from '../../../../supabase/functions/banese-carnet-document/document-policy.ts';
import { baneseDocumentFixtureAt } from '../../../../supabase/functions/banese/internal/testing/document-fixture.ts';
import { buildBaneseDocumentGroups } from '../../../../supabase/functions/secretaria-banese-document-groups/document-groups.ts';
import { buildDocumentRequests } from './carnes-alunos.selection.ts';

const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const ENROLLMENT_ID = '33333333-3333-4333-8333-333333333333';
const POLO_ID = '44444444-4444-4444-8444-444444444444';
const ISSUER_ID = '55555555-5555-4555-8555-555555555555';
const CLASS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COURSE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const rowAt = (
  index: number,
  overrides: Partial<BaneseCarnetReceivableRow> = {},
): BaneseCarnetReceivableRow => {
  const bank = baneseDocumentFixtureAt(index);
  return {
    id: bank.receivableId,
    cliente_id: STUDENT_ID,
    matricula_id: ENROLLMENT_ID,
    turma_id: CLASS_ID,
    polo_id: POLO_ID,
    descricao: `Parcela ${index + 1}`,
    tipo_lancamento: 'PARCELA',
    parcela_numero: index + 1,
    valor: bank.amount,
    data_vencimento: bank.dueDate,
    status: 'PENDENTE',
    gateway_provider: 'banese_card',
    gateway_environment: 'production',
    gateway_payment_method: 'BOLETO',
    gateway_status: '2',
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_boleto_issued_at: '2026-07-16T12:00:00Z',
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: '15528',
    gateway_boleto_agencia: '033',
    gateway_issuer_polo_id: ISSUER_ID,
    gateway_financial_terms: bank.financialTerms as Record<string, unknown>,
    gateway_financial_terms_confirmed_at: '2026-07-16T12:05:00Z',
    ...overrides,
  };
};

const quarantinedRowAt = (index: number): BaneseCarnetReceivableRow => rowAt(index, {
  gateway_status: null,
  gateway_boleto_issued_at: null,
  gateway_boleto_linha_digitavel: null,
  gateway_boleto_codigo_barras: null,
  gateway_boleto_nosso_numero: null,
  gateway_financial_terms_confirmed_at: null,
});

const catalogInput = (receivables: BaneseCarnetReceivableRow[]) => ({
  receivables,
  students: [{
    id: STUDENT_ID,
    nome: 'Aluno Seguro',
    cpf_cnpj: '123.456.789-09',
  }],
  enrollments: [{
    id: ENROLLMENT_ID,
    aluno_id: STUDENT_ID,
    turma_id: CLASS_ID,
    data_matricula: '2026-01-20T12:00:00Z',
  }],
  classes: [{
    id: CLASS_ID,
    nome: 'Turma Segura',
    codigo: 'SEG-2026',
    curso_id: COURSE_ID,
    polo_id: POLO_ID,
  }],
  courses: [{ id: COURSE_ID, nome: 'Curso Seguro' }],
});

test('catálogo seguro não apresenta matrícula composta somente por títulos quarentenados', () => {
  const groups = buildBaneseDocumentGroups(catalogInput([
    quarantinedRowAt(0),
    quarantinedRowAt(1),
    quarantinedRowAt(2),
  ]));

  assert.deepEqual(groups, []);
});

test('request do carnê usa representante pertencente ao mesmo grupo válido do endpoint', () => {
  const validRows = [rowAt(0), rowAt(1), rowAt(2)];
  const quarantined = quarantinedRowAt(3);
  const groups = buildBaneseDocumentGroups(catalogInput([
    quarantined,
    ...validRows,
  ]));

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].receivableIds, validRows.map((row) => row.id));
  assert.equal(groups[0].receivableIds.includes(quarantined.id), false);

  const [request] = buildDocumentRequests(groups);
  assert.equal(request.functionName, 'banese-carnet-document');
  assert.equal(request.receivableId, groups[0].representativeReceivableId);

  const endpointCandidates = takeRegisteredBaneseCarnetCandidateRows([
    quarantined,
    ...validRows,
  ]);
  const endpointRows = selectBaneseCarnetDocumentRows(
    validRows[0],
    endpointCandidates,
  );
  assert.deepEqual(
    endpointRows.map((row) => row.id),
    groups[0].receivableIds,
  );
  assert.equal(
    endpointRows.some((row) => row.id === request.receivableId),
    true,
  );
});
