import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocumentGroupsResponse } from './carnes-alunos.contract.ts';
import {
  EnrollmentDocumentUnavailableError,
  selectEnrollmentDocumentGroup,
} from './carnes-alunos.diagnostics.ts';
import { buildDocumentRequests } from './carnes-alunos.selection.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const response = (count: number) => ({
  groups: count ? [{
    id: `banese:${id(10)}`, representativeReceivableId: id(10),
    receivableIds: Array.from({ length: count }, (_, index) => id(10 + index)),
    studentName: 'Aluno de teste', maskedCpf: '***.***.***-**',
    enrollmentId: id(1), enrollmentCode: 'TESTE', courseId: id(2),
    courseName: 'Curso de teste', classId: id(3), className: 'Turma de teste',
    installmentCount: count, reenrollmentCount: 0, monthlyCount: count,
    totalAmount: count * 100, firstDueDate: '2026-11-05', lastDueDate: '2026-12-05',
    documentType: count < 3 ? 'boletos' : 'carnet',
  }] : [],
  total: count ? 1 : 0, page: 1, pageSize: 2, filters: { courses: [], classes: [] },
});

test('ação individual prepara um e dois títulos como boletos; três continuam carnê', () => {
  for (const count of [1, 2, 3]) {
    const catalog = parseDocumentGroupsResponse(response(count));
    const selected = selectEnrollmentDocumentGroup(catalog, id(1));
    const requests = buildDocumentRequests([selected]);
    assert.equal(requests.length, count < 3 ? count : 1);
    assert.ok(requests.every((request) => request.functionName === (
      count < 3 ? 'banese-boleto-document' : 'banese-carnet-document'
    )));
  }
});

test('diagnóstico identifica ausência de confirmação e orienta conferência sem nova emissão', () => {
  const catalog = parseDocumentGroupsResponse({
    ...response(0),
    diagnostics: { inspectedCount: 2, availableCount: 0, complete: true,
      exclusions: [{ reason: 'BANK_EVIDENCE_MISSING', count: 2 }] },
  });
  assert.throws(() => selectEnrollmentDocumentGroup(catalog, id(1)), (error) => {
    assert.ok(error instanceof EnrollmentDocumentUnavailableError);
    assert.match(error.message, /2 sem identidade ou condições bancárias confirmadas completas/);
    assert.match(error.message, /Consulte o extrato/);
    assert.match(error.message, /não autoriza gerar o ciclo novamente/);
    return true;
  });
});

test('resposta antiga sem diagnóstico não inventa motivo ou ausência de histórico', () => {
  assert.throws(() => selectEnrollmentDocumentGroup(parseDocumentGroupsResponse(response(0)), id(1)),
    /catálogo não informou o motivo/);
});

test('não prepara documentos de outra matrícula nem escolhe um de grupos ambíguos', () => {
  const catalog = parseDocumentGroupsResponse(response(1));
  assert.throws(() => selectEnrollmentDocumentGroup(catalog, id(99)), /outra matrícula/);
  assert.throws(() => selectEnrollmentDocumentGroup({ ...catalog, total: 2,
    groups: [...catalog.groups, ...catalog.groups] }, id(1)), /mais de um grupo/);
});

test('parser recusa motivo livre, contagem divergente ou repetida', () => {
  for (const exclusions of [
    [{ reason: 'CPF_PRIVADO_QUALQUER', count: 1 }],
    [{ reason: 'BANK_EVIDENCE_MISSING', count: 2 }],
    [{ reason: 'BANK_EVIDENCE_MISSING', count: 1 }, { reason: 'BANK_EVIDENCE_MISSING', count: 1 }],
  ]) {
    assert.throws(() => parseDocumentGroupsResponse({ ...response(0),
      diagnostics: { inspectedCount: 1, availableCount: 0, complete: true, exclusions } }), /diagnóstico|motivo/);
  }
});

test('consulta parcial e escopo vazio são explicitados sem afirmar que não há cobrança', () => {
  const catalog = parseDocumentGroupsResponse({ ...response(0),
    diagnostics: { inspectedCount: 0, availableCount: 0, complete: false, exclusions: [] } });
  assert.throws(() => selectEnrollmentDocumentGroup(catalog, id(1)), /escopo consultado.*limite de inspeção/);
});
