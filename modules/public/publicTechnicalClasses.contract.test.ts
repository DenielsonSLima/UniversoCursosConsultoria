import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPublicTechnicalClassesClient, getPublicTechnicalClassReason, isPublicTechnicalClassOpen,
  requirePublicTechnicalCheckoutClass, requirePublicTechnicalClass, toPublicTechnicalTurma,
} from './publicTechnicalClasses.client.ts';
import { getTechnicalEnrollmentState } from './landing-pages/cursos-tecnicos/shared/technicalLanding.utils.ts';
import type { TechnicalLandingClass } from './landing-pages/cursos-tecnicos/technicalLanding.types.ts';

const turmaId = '00000000-0000-4000-8000-000000000001';
const courseId = '00000000-0000-4000-8000-000000000002';
const allowed = () => ({
  versao: 1, turmaId, dataReferencia: '2026-10-10', dataInicio: '2025-10-10',
  dataLimiteMatriculaDireta: '2026-10-10', diasDesdeInicio: 365,
  matriculaDiretaPermitida: true, transferenciaObrigatoria: false, motivo: 'PERMITIDA',
  mensagem: 'Matrícula direta permitida nesta turma.',
});
const expired = () => ({
  ...allowed(), dataReferencia: '2026-10-11', diasDesdeInicio: 366,
  matriculaDiretaPermitida: false, transferenciaObrigatoria: true, motivo: 'PRAZO_EXPIRADO',
  mensagem: 'O prazo de matrícula direta desta turma terminou. O ingresso exige transferência de outra escola.',
});
const row = (ingresso: unknown = allowed()) => ({
  turma_id: turmaId, curso_id: courseId, turma_nome: 'Turma técnica', turma_codigo: 'T46',
  inscricoes_online_disponiveis: true, situacao_vagas: 'VAGAS DISPONÍVEIS', ingresso,
  vagas_totais: 40, vagas_ocupadas: 10, polo_nome: 'Polo', polo_cidade: 'Japoatã', polo_estado: 'SE',
});
const landingClass = (value: ReturnType<typeof requirePublicTechnicalClass>) => ({
  admission: value.ingresso, onlineEnrollmentAvailable: value.inscricoes_online_disponiveis,
  availabilityLabel: value.situacao_vagas,
}) as TechnicalLandingClass;

test('decisão canônica permite dia365 e bloqueia dia366 mesmo com flag online inconsistente', () => {
  const available = requirePublicTechnicalClass(row());
  assert.equal(isPublicTechnicalClassOpen(available), true);
  assert.equal(getTechnicalEnrollmentState(landingClass(available)), 'OPEN');
  assert.equal(requirePublicTechnicalCheckoutClass(available, courseId, turmaId), available);

  const denied = requirePublicTechnicalClass(row(expired()));
  assert.equal(isPublicTechnicalClassOpen(denied), false);
  assert.equal(getTechnicalEnrollmentState(landingClass(denied)), 'TRANSFER_ONLY');
  assert.equal(getPublicTechnicalClassReason(denied), expired().mensagem);
  assert.equal(toPublicTechnicalTurma(denied).permitir_inscricoes_online, false);
  assert.throws(() => requirePublicTechnicalCheckoutClass(denied, courseId, turmaId), /exige transferência/);
});

test('data ausente bloqueia; fase ou configuração online continuam respeitadas', () => {
  const missing = requirePublicTechnicalClass(row({
    ...allowed(), dataInicio: null, dataLimiteMatriculaDireta: null, diasDesdeInicio: null,
    matriculaDiretaPermitida: false, motivo: 'DATA_INICIO_AUSENTE', mensagem: 'Confira a data inicial da turma.',
  }));
  assert.equal(getTechnicalEnrollmentState(landingClass(missing)), 'BLOCKED');
  assert.throws(() => requirePublicTechnicalCheckoutClass(missing, courseId, turmaId), /data inicial/);
  const offline = requirePublicTechnicalClass({ ...row(), inscricoes_online_disponiveis: false, situacao_vagas: 'INSCRIÇÕES ENCERRADAS' });
  assert.equal(isPublicTechnicalClassOpen(offline), false);
  assert.equal(getTechnicalEnrollmentState(landingClass(offline)), 'CLOSED');
  assert.throws(() => requirePublicTechnicalCheckoutClass(offline, courseId, turmaId), /ENCERRADAS/);
  const future = requirePublicTechnicalClass({
    ...row({ ...allowed(), dataInicio: '2026-11-10', dataLimiteMatriculaDireta: '2027-11-10', diasDesdeInicio: -31 }),
    inscricoes_online_disponiveis: false, situacao_vagas: 'INSCRIÇÕES EM BREVE',
  });
  assert.equal(getTechnicalEnrollmentState(landingClass(future)), 'UPCOMING');
  assert.equal(isPublicTechnicalClassOpen(future), false);
});

test('catálogo não trunca turmas e filtro de curso/turma chega à RPC canônica', async () => {
  const calls: unknown[] = [];
  const client = createPublicTechnicalClassesClient(async (name, args) => {
    calls.push([name, args]);
    return { data: [row()], error: null };
  });
  assert.equal((await client.list()).length, 1);
  await client.list({ limit: 1, courseId, turmaId });
  assert.deepEqual(calls, [
    ['list_public_technical_classes_ingresso', { p_limit: null, p_turma_id: null, p_curso_id: null }],
    ['list_public_technical_classes_ingresso', { p_limit: 1, p_turma_id: turmaId, p_curso_id: courseId }],
  ]);
});

test('resposta sem política, IDs trocados, erro ou duplicidade nunca libera checkout', async () => {
  assert.throws(() => requirePublicTechnicalClass({ ...row(), ingresso: undefined }));
  assert.throws(() => requirePublicTechnicalClass(row({ ...allowed(), turmaId: courseId })));
  assert.throws(() => requirePublicTechnicalCheckoutClass(requirePublicTechnicalClass(row()), turmaId, courseId));
  for (const data of [null, [row(), row()], [{ ...row(), curso_id: turmaId }]]) {
    const client = createPublicTechnicalClassesClient(async () => ({ data, error: null }));
    await assert.rejects(client.list({ courseId }));
  }
  const client = createPublicTechnicalClassesClient(async () => ({ data: null, error: { message: 'Servidor indisponível' } }));
  await assert.rejects(client.list(), /Servidor indisponível/);
});

test('consulta específica refaz a decisão: disponibilidade anterior não autoriza prazo vencido', async () => {
  let current = allowed();
  const client = createPublicTechnicalClassesClient(async () => ({ data: [row(current)], error: null }));
  const [initial] = await client.list({ limit: 1, turmaId });
  assert.equal(isPublicTechnicalClassOpen(initial), true);
  current = expired();
  const [fresh] = await client.list({ limit: 1, turmaId, courseId });
  assert.throws(() => requirePublicTechnicalCheckoutClass(fresh, courseId, turmaId), /exige transferência/);
});
