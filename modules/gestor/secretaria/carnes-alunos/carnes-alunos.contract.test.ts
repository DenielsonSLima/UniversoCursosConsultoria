import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeSecretariaAccessTabs } from '../secretaria-access.ts';
import { parseDocumentGroupsResponse } from './carnes-alunos.contract.ts';
import {
  addDocumentGroupsAtomically,
  assertDocumentGenerationLimits,
  assertVectorPdfByteLimit,
  buildDocumentRequests,
  countDocumentRequests,
  MAX_VECTOR_PDF_BYTES,
  removeDocumentGroups,
  resetsSelectionWhenCriteriaChange,
  toggleDocumentGroup,
} from './carnes-alunos.selection.ts';
import type { BaneseDocumentGroup } from './carnes-alunos.types.ts';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const groupFixture = (
  index: number,
  documentType: 'carnet' | 'boletos' = 'carnet',
  installmentCount = documentType === 'carnet' ? 3 : 2,
): BaneseDocumentGroup => {
  const receivableIds = Array.from(
    { length: installmentCount },
    (_, offset) => id(10_000 + (index * 100) + offset),
  );
  return {
    id: `banese:${receivableIds[0]}`,
    representativeReceivableId: receivableIds[0],
    receivableIds,
    studentName: `Aluno ${index}`,
    maskedCpf: '***.***.***-09',
    enrollmentId: id(2_000 + index),
    enrollmentCode: `MAT-${index}`,
    courseId: id(3_000 + (index % 2)),
    courseName: `Curso ${index % 2}`,
    classId: id(4_000 + (index % 3)),
    className: `Turma ${index % 3}`,
    installmentCount,
    reenrollmentCount: 0,
    monthlyCount: installmentCount,
    totalAmount: installmentCount * 100,
    firstDueDate: '2026-09-10',
    lastDueDate: '2026-12-10',
    documentType,
  };
};

test('Individual alterna uma matrícula e permite removê-la', () => {
  const group = groupFixture(1);
  const selected = toggleDocumentGroup([], group, true);
  assert.deepEqual(selected, [group]);
  assert.deepEqual(toggleDocumentGroup(selected, group, true), []);
  assert.deepEqual(toggleDocumentGroup(selected, groupFixture(2), true), [groupFixture(2)]);
});

test('seleção coletiva é atômica no limite conservador de 6 carnês', () => {
  const current = Array.from({ length: 5 }, (_, index) => groupFixture(index + 1));
  const accepted = addDocumentGroupsAtomically(current, [groupFixture(6)]);
  assert.equal(accepted.length, 6);

  assert.throws(
    () => addDocumentGroupsAtomically(current, [groupFixture(6), groupFixture(7)]),
    /no máximo 6 carnês.*Divida este lote/i,
  );
  assert.equal(current.length, 5, 'a seleção original não pode ser parcialmente alterada');
});

test('seleção coletiva é atômica no limite conservador de 20 boletos e remove só os visíveis', () => {
  const current = Array.from(
    { length: 9 },
    (_, index) => groupFixture(index + 1, 'boletos', 2),
  );
  const page = [groupFixture(10, 'boletos', 2)];
  const accepted = addDocumentGroupsAtomically(current, page);
  assert.equal(buildDocumentRequests(accepted).length, 20);

  assert.throws(
    () => addDocumentGroupsAtomically(accepted, [groupFixture(11, 'boletos', 1)]),
    /no máximo 20 boletos.*Divida este lote/i,
  );
  assert.deepEqual(removeDocumentGroups(accepted, page), current);
});

test('estima três títulos por página e respeita o teto agregado de 80 páginas', () => {
  const carnets = Array.from(
    { length: 6 },
    (_, index) => groupFixture(index + 1, 'carnet', 30),
  );
  const boletos = Array.from(
    { length: 20 },
    (_, index) => groupFixture(100 + index, 'boletos', 1),
  );
  const accepted = [...carnets, ...boletos];
  assert.equal(countDocumentRequests(accepted).estimatedPages, 80);
  assert.doesNotThrow(() => assertDocumentGenerationLimits(accepted));
  assert.equal(countDocumentRequests([groupFixture(200, 'carnet', 13)]).estimatedPages, 5);
});

test('limita os bytes vetoriais recebidos a 24 MiB antes da fusão', () => {
  assert.equal(assertVectorPdfByteLimit(MAX_VECTOR_PDF_BYTES), MAX_VECTOR_PDF_BYTES);
  assert.throws(
    () => assertVectorPdfByteLimit(MAX_VECTOR_PDF_BYTES + 1),
    /ultrapassam 24 MiB.*Divida a seleção/i,
  );
});

test('mudança de critérios limpa Individual/Lote e preserva somente Personalizado', () => {
  assert.equal(resetsSelectionWhenCriteriaChange('individual'), true);
  assert.equal(resetsSelectionWhenCriteriaChange('batch'), true);
  assert.equal(resetsSelectionWhenCriteriaChange('custom'), false);
});

test('controller limpa seleção e PDF preparado ao trocar curso ou turma do Lote', async () => {
  const source = await readFile(
    new URL('./hooks/useCarnesAlunosController.ts', import.meta.url),
    'utf8',
  );
  const courseChange = source.slice(
    source.indexOf('const changeCourse'),
    source.indexOf('const changeClass'),
  );
  const classChange = source.slice(
    source.indexOf('const changeClass'),
    source.indexOf('const toggleGroup'),
  );
  assert.match(courseChange, /setClassId\(''\)/);
  assert.match(courseChange, /clearPreparedSelection\(\)/);
  assert.match(classChange, /clearPreparedSelection\(\)/);
});

test('troca de polo ou desmontagem aborta o PDF e descarta progresso/resultado antigo', async () => {
  const source = await readFile(
    new URL('./hooks/useCarnesAlunosController.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /generationAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /return cancelActiveGeneration/);
  assert.match(source, /new globalThis\.AbortController\(\)/);
  assert.match(source, /requestId !== generationIdRef\.current \|\| signal\.aborted/);
  assert.match(source, /requestId === generationIdRef\.current && !signal\.aborted/);
  assert.doesNotMatch(source, /placeholderData:\s*\(previous\)\s*=>\s*previous/);
});

test('contrato aceita facetas completas e rejeita filtros inconsistentes', () => {
  const group = groupFixture(1);
  const payload = {
    groups: [group],
    total: 1,
    page: 1,
    pageSize: 20,
    filters: {
      courses: [{ id: group.courseId, name: group.courseName }],
      classes: [{ id: group.classId, name: group.className, courseId: group.courseId }],
    },
  };
  assert.deepEqual(parseDocumentGroupsResponse(payload), payload);
  assert.throws(
    () => parseDocumentGroupsResponse({ ...payload, filters: undefined }),
    /filtros do catálogo/i,
  );
  assert.throws(
    () => parseDocumentGroupsResponse({
      ...payload,
      filters: {
        ...payload.filters,
        classes: [{ ...payload.filters.classes[0], courseId: id(999_999) }],
      },
    }),
    /turma sem curso correspondente/i,
  );
  assert.throws(
    () => parseDocumentGroupsResponse({
      ...payload,
      groups: [{ ...group, maskedCpf: '123.456.789-09' }],
    }),
    /CPF fora do formato mascarado/i,
  );
  assert.throws(
    () => parseDocumentGroupsResponse({
      ...payload,
      groups: [{ ...group, id: `outro:${group.representativeReceivableId}` }],
    }),
    /identificador de grupo fora do escopo Banese/i,
  );
  const oversizedCarnet = groupFixture(31, 'carnet', 31);
  assert.throws(
    () => parseDocumentGroupsResponse({
      ...payload,
      groups: [oversizedCarnet],
    }),
    /tipo de documento não corresponde/i,
  );
});

test('mapeia exatamente um carnê representativo ou um boleto por título', () => {
  const carnet = groupFixture(1, 'carnet', 12);
  const boletos = groupFixture(2, 'boletos', 2);
  assert.deepEqual(buildDocumentRequests([carnet]), [{
    groupId: carnet.id,
    receivableId: carnet.representativeReceivableId,
    functionName: 'banese-carnet-document',
  }]);
  assert.deepEqual(
    buildDocumentRequests([boletos]).map((request) => request.functionName),
    ['banese-boleto-document', 'banese-boleto-document'],
  );
});

test('permissão nova herda consulta/legado sem conceder baixa no sentido inverso', () => {
  const granular = normalizeSecretariaAccessTabs(['consulta-financeira']);
  assert.equal(granular.includes('consulta-financeira'), true);
  assert.equal(granular.includes('carnes-alunos'), true);

  const legacy = normalizeSecretariaAccessTabs(['recebimentos']);
  assert.equal(legacy.includes('consulta-financeira'), true);
  assert.equal(legacy.includes('carnes-alunos'), true);

  const documentOnly = normalizeSecretariaAccessTabs(['carnes-alunos']);
  assert.deepEqual(documentOnly, ['carnes-alunos']);
});

test('Secretaria separa Recebimentos de Carnês dos Alunos em card e rota próprios', async () => {
  const [page, dashboard] = await Promise.all([
    readFile(new URL('../SecretariaPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/SecretariaDashboard.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /'carnes-alunos': \(\) => import\('\.\/carnes-alunos\/SecretariaCarnesAlunosPage'\)/);
  assert.match(page, /title: 'Recebimentos'/);
  assert.match(page, /case 'carnes-alunos':/);
  assert.match(dashboard, /id: 'consulta-financeira', title: 'Recebimentos'/);
  assert.match(dashboard, /id: 'carnes-alunos', title: 'Carnês dos Alunos'/);
});

test('Recebimentos e Carnês começam pelos modos sem repetir o hero do título externo', async () => {
  const [receiptsPage, carnetsPage] = await Promise.all([
    readFile(new URL('../consulta-financeira/SecretariaConsultaFinanceiraPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaCarnesAlunosPage.tsx', import.meta.url), 'utf8'),
  ]);

  for (const source of [receiptsPage, carnetsPage]) {
    assert.doesNotMatch(source, /<header/);
    assert.doesNotMatch(source, /bg-\[#001a33\]/);
  }
  assert.doesNotMatch(receiptsPage, /CircleDollarSign|WalletCards/);
  assert.match(receiptsPage, /<h3[^>]*className="sr-only"[\s\S]*?Recebimentos por aluno e curso/);
  assert.doesNotMatch(carnetsPage, /FileStack|ShieldCheck/);
  assert.match(carnetsPage, /aria-label="Carnês dos alunos — somente leitura"/);
  assert.match(receiptsPage, /<FinanceModeNavigation/);
  assert.match(carnetsPage, /<CarnesModeNavigation/);
});

test('Lote usa facetas completas e oferece seleção coletiva explícita', async () => {
  const [controller, workspace] = await Promise.all([
    readFile(new URL('./hooks/useCarnesAlunosController.ts', import.meta.url), 'utf8'),
    readFile(new URL('./components/CarnesWorkspace.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(controller, /groupsQuery\.data\?\.filters\.courses/);
  assert.match(controller, /groupsQuery\.data\?\.filters\.classes/);
  assert.match(controller, /addDocumentGroupsAtomically\(selectedGroups, visibleGroups\)/);
  assert.match(workspace, /Selecionar matrículas desta página/);
  assert.match(workspace, /Remover visíveis/);
});

test('serviço documental não contém rotas de criação, reemissão ou sincronização', async () => {
  const source = await readFile(new URL('./carnes-alunos.service.ts', import.meta.url), 'utf8');
  assert.match(source, /secretaria-banese-document-groups/);
  assert.doesNotMatch(source, /get_secretaria_banese_document_groups_secure/);
  assert.doesNotMatch(source, /supabase\.rpc\(/);
  assert.match(source, /banese-carnet-document/);
  assert.match(source, /banese-boleto-document/);
  assert.match(source, /signal,/);
  assert.match(source, /assertVectorPdfByteLimit\(receivedBytes \+ document\.size\)/);
  assert.match(source, /combineVectorPdfBlobs\(documents, signal\)/);
  assert.doesNotMatch(
    source,
    /generate-official-carnet|manual-settlement|sync-enrollment|sync-receivable|refresh-receivable-status|create-other-credit|payment-checkout|reissue/i,
  );
});
