import assert from 'node:assert/strict';
import test from 'node:test';
import { NfseContractError } from '../../services/nfse.errors';
import { nfseStudentKeys } from '../queries/nfse-students.keys';
import { defaultNfseReceiptFilters, type NfseReceiptScope } from '../types/nfse-students.types';
import { createNfseReceiptReader, isNfseReceiptScopeValid, mapNfseReceiptResponse } from './nfse-students.contract';

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const classId = uuid(1);
const studentId = uuid(2);
const secondStudentId = uuid(3);
const id = `${classId}:${studentId}`;
const secondId = `${classId}:${secondStudentId}`;
const scope: NfseReceiptScope = { contextId: uuid(10), poloId: uuid(11), paymentMonth: '2026-11' };
const student = { id, studentId, studentName: 'Aluno sintético', receivedAmount: '120.35', receiptCount: 2 };
const group = { id: classId, label: 'Turma sintética', studentCount: 1, receivedAmount: '120.35', students: [student] };
const response = () => ({
  version: 1,
  scope: { ...scope, basis: 'PAYMENT_DATE' },
  courseTypes: [{ id: 'TECNICO', label: 'Técnico' }],
  classes: [{ id: classId, label: 'Turma sintética' }],
  groups: [globalThis.structuredClone(group)],
  page: 1,
  pageSize: 10,
  totalGroups: 1,
  totalStudents: 1,
  excludedUnknownCount: 0,
  selection: { ids: [id], selectedCount: 1, selectedAmount: '120.35' as string | null,
    valid: true, unavailableIds: [] as string[], groups: [globalThis.structuredClone(group)] },
});

test('registration fields remain exact strings or unknown in listing and selection', () => {
  const payload = response();
  Object.assign(payload.groups[0].students[0], { studentCpf: '00100200300', studentCity: ' Cidade sintética ', studentState: 'SE' });
  Object.assign(payload.selection.groups[0].students[0], { studentCpf: '001.002.003-00', studentCity: null, studentState: '' });
  const parsed = mapNfseReceiptResponse(payload, scope, [id], 1);
  assert.equal(parsed.groups[0].students[0].studentCpf, '00100200300');
  assert.equal(parsed.groups[0].students[0].studentCity, 'Cidade sintética');
  assert.equal(parsed.groups[0].students[0].studentState, 'SE');
  assert.equal(parsed.selection.groups[0].students[0].studentCpf, '001.002.003-00');
  assert.equal(parsed.selection.groups[0].students[0].studentCity, null);
  assert.equal(parsed.selection.groups[0].students[0].studentState, null);
  const old = mapNfseReceiptResponse(response(), scope, [id], 1).groups[0].students[0];
  assert.equal(old.studentCpf, null);
  assert.equal(old.studentCity, null);
  assert.equal(old.studentState, null);
  for (const field of ['studentCpf', 'studentCity', 'studentState']) {
    const invalid = response();
    Object.assign(invalid.groups[0].students[0], { [field]: 123 });
    assert.throws(() => mapNfseReceiptResponse(invalid, scope, [id], 1), NfseContractError);
  }
});

test('receipt reader sends only identities, filters and month; client amounts and fiscal fields never cross transport', async () => {
  let sent: Record<string, unknown> | undefined;
  let sentName: string | undefined;
  let sentSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const reader = createNfseReceiptReader(async (name, args, signal) => {
    sentName = name;
    sent = args;
    sentSignal = signal;
    return response();
  });
  const filters = { ...defaultNfseReceiptFilters(), search: '  Aluno  ', amount: '0.01', modelId: 'untrusted' };
  const result = await reader(scope, filters, [id], true, controller.signal);
  assert.equal(sentName, 'get_nfse_receipt_students_secure');
  assert.equal(sentSignal, controller.signal);
  assert.deepEqual(sent, {
    p_context_id: scope.contextId, p_polo_id: scope.poloId, p_payment_month: '2026-11-01',
    p_course_type: 'TECNICO', p_class_id: null, p_search: 'Aluno', p_page: 1,
    p_page_size: 10, p_selected_ids: [id], p_include_groups: true, p_environment: null,
  });
  assert.equal(result.selection.selectedAmount, '120.35');
});

test('availability transport and cache separate fiscal environments; mismatched availability is rejected', async () => {
  const production = { ...scope, environment: 'PRODUCAO' as const };
  const homologation = { ...scope, environment: 'HOMOLOGACAO' as const };
  const reader = createNfseReceiptReader(async (_name, args) => {
    assert.equal(args.p_environment, 'PRODUCAO');
    return { ...response(), scope: { ...production, basis: 'PAYMENT_DATE' } };
  });
  assert.equal((await reader(production, defaultNfseReceiptFilters(), [id])).selection.valid, true);
  assert.notDeepEqual(nfseStudentKeys.groups(production, defaultNfseReceiptFilters()),
    nfseStudentKeys.groups(homologation, defaultNfseReceiptFilters()));
  assert.notDeepEqual(nfseStudentKeys.selection(production, [id]), nfseStudentKeys.selection(homologation, [id]));
  assert.throws(() => mapNfseReceiptResponse(response(), production, [id], 1), NfseContractError);
  assert.throws(() => mapNfseReceiptResponse({ ...response(), scope: { ...homologation, basis: 'PAYMENT_DATE' } },
    production, [id], 1), NfseContractError);
});

test('selection transport sorts a copy of IDs and keeps listing filters separate from selected identities', async () => {
  const chosen = [secondId, id];
  const payload = response();
  const second = { ...student, id: secondId, studentId: secondStudentId, receivedAmount: '20.00' };
  payload.groups = [];
  payload.selection = { ids: [id, secondId], selectedCount: 2, selectedAmount: '140.35', valid: true,
    unavailableIds: [], groups: [{ ...group, studentCount: 2, receivedAmount: '140.35', students: [student, second] }] };
  const reader = createNfseReceiptReader(async (_name, args) => {
    assert.deepEqual(args.p_selected_ids, [id, secondId]);
    assert.equal(args.p_include_groups, false);
    assert.equal(args.p_search, null);
    assert.equal(args.p_course_type, null);
    return payload;
  });
  const result = await reader(scope, { ...defaultNfseReceiptFilters(), courseType: '', search: '  ' }, chosen, false);
  assert.deepEqual(chosen, [secondId, id]);
  assert.equal(result.selection.selectedCount, 2);
  assert.deepEqual(result.groups, []);
});

test('invalid scope, dates, selection identities, duplicates and oversized input fail before transport', async () => {
  let calls = 0;
  const reader = createNfseReceiptReader(async () => { calls += 1; return response(); });
  for (const patch of [{ contextId: '' }, { contextId: 'display-name' }, { poloId: 'todos' },
    { paymentMonth: '2026-00' }, { paymentMonth: '2026-13' }, { paymentMonth: '2026-1' }, { paymentMonth: '2026-11-01' }]) {
    assert.equal(isNfseReceiptScopeValid({ ...scope, ...patch }), false);
    await assert.rejects(reader({ ...scope, ...patch }, defaultNfseReceiptFilters()), NfseContractError);
  }
  assert.equal(isNfseReceiptScopeValid(null), false);
  for (const selected of [[id, id], ['untrusted'], [`${classId}:bad-student`], Array.from({ length: 1001 }, (_, i) => `${classId}:${uuid(i + 100)}`)]) {
    await assert.rejects(reader(scope, defaultNfseReceiptFilters(), selected), NfseContractError);
  }
  for (const patch of [{ page: 0 }, { page: 1.5 }, { classId: 'bad-class' }, { search: 'x'.repeat(121) }]) {
    await assert.rejects(reader(scope, { ...defaultNfseReceiptFilters(), ...patch }), NfseContractError);
  }
  assert.equal(calls, 0);
});

test('mapper rejects another identity, polo, month, version or receipt basis', () => {
  for (const patch of [{ contextId: uuid(20) }, { poloId: uuid(21) }, { paymentMonth: '2026-10' }, { basis: 'DUE_DATE' }]) {
    const payload = response();
    assert.throws(() => mapNfseReceiptResponse({ ...payload, scope: { ...payload.scope, ...patch } }, scope, [id], 1), NfseContractError);
  }
  assert.throws(() => mapNfseReceiptResponse({ ...response(), version: 2 }, scope, [id], 1), NfseContractError);
});

test('decimal strings keep precision and unknown selection totals never become zero', () => {
  const payload = response();
  payload.selection.selectedAmount = '9007199254740993.07';
  payload.selection.groups[0].receivedAmount = '9007199254740993.07';
  payload.selection.groups[0].students[0].receivedAmount = '9007199254740993.07';
  assert.equal(mapNfseReceiptResponse(payload, scope, [id], 1).selection.selectedAmount, '9007199254740993.07');
  for (const amount of [12.1, '', '1e3', '1,00', '01.00', '1.001', '-1.00', undefined, null]) {
    assert.throws(() => mapNfseReceiptResponse({ ...response(), selection: { ...response().selection, selectedAmount: amount } }, scope, [id], 1), NfseContractError);
  }
  const unknown = response();
  unknown.selection = { ids: [], selectedCount: 0, selectedAmount: null, valid: false, unavailableIds: [id], groups: [] };
  const result = mapNfseReceiptResponse(unknown, scope, [id], 1);
  assert.equal(result.selection.selectedAmount, null);
  assert.equal(result.selection.valid, false);
  assert.deepEqual(result.selection.unavailableIds, [id]);
});

test('invalid selections report unavailable IDs and cannot retain a stale amount', () => {
  const payload = response();
  payload.selection = { ...payload.selection, valid: false, selectedAmount: null, unavailableIds: [secondId] };
  const result = mapNfseReceiptResponse(payload, scope, [id, secondId], 1);
  assert.equal(result.selection.valid, false);
  assert.equal(result.selection.selectedCount, 1);
  assert.equal(result.selection.selectedAmount, null);
  for (const patch of [{ selectedAmount: '120.35' }, { valid: true }, { unavailableIds: [id] }, { unavailableIds: [] }]) {
    assert.throws(() => mapNfseReceiptResponse({ ...payload, selection: { ...payload.selection, ...patch } }, scope, [id, secondId], 1), NfseContractError);
  }
});

test('returned selected IDs, count and group members must exactly match the requested identity set', () => {
  for (const patch of [{ ids: [id, id] }, { ids: [secondId] }, { ids: [] }, { selectedCount: 2 },
    { groups: [] }, { groups: [group, group] }, { unavailableIds: [secondId] }]) {
    const payload = response();
    assert.throws(() => mapNfseReceiptResponse({ ...payload, selection: { ...payload.selection, ...patch } }, scope, [id], 1), NfseContractError);
  }
  const empty = response();
  empty.selection = { ids: [], selectedCount: 0, selectedAmount: '0.00', valid: true, unavailableIds: [], groups: [] };
  assert.equal(mapNfseReceiptResponse(empty, scope, [], 1).selection.selectedAmount, '0.00');
});

test('group pages contain complete classes and validate page identity, duplicates and count', () => {
  const payload = response();
  const students = Array.from({ length: 40 }, (_, index) => {
    const currentStudent = uuid(index + 100);
    return { ...student, id: `${classId}:${currentStudent}`, studentId: currentStudent };
  });
  payload.groups = [{ ...group, students, studentCount: 40 }];
  payload.totalStudents = 40;
  assert.equal(mapNfseReceiptResponse(payload, scope, [id], 1).groups[0].students.length, 40);
  for (const patch of [{ page: 2 }, { pageSize: 25 }, { totalGroups: 0 }, { groups: [group, group] },
    { groups: [{ ...group, studentCount: 2 }] }, { groups: [{ ...group, students: [student, student], studentCount: 2 }] },
    { groups: [{ ...group, students: [{ ...student, id: secondId }] }] }]) {
    assert.throws(() => mapNfseReceiptResponse({ ...response(), ...patch }, scope, [id], 1), NfseContractError);
  }
  const tooManyGroups = Array.from({ length: 11 }, (_, index) => {
    const currentClass = uuid(index + 100);
    return { ...group, id: currentClass, students: [{ ...student, id: `${currentClass}:${studentId}` }] };
  });
  assert.throws(() => mapNfseReceiptResponse({ ...response(), groups: tooManyGroups, totalGroups: 11 }, scope, [id], 1), NfseContractError);
  assert.equal(mapNfseReceiptResponse({ ...response(), page: 2, totalGroups: 11, totalStudents: 11 }, scope, [id], 2).page, 2);
});

test('unknown or malformed student received amounts are rejected instead of producing selectable zero values', () => {
  for (const amount of [null, 0, '1.001', undefined]) {
    assert.throws(() => mapNfseReceiptResponse({ ...response(), groups: [{ ...group, students: [{ ...student, receivedAmount: amount }] }] }, scope, [id], 1), NfseContractError);
  }
  assert.throws(() => mapNfseReceiptResponse({ ...response(), groups: [{ ...group, students: [{ ...student, receiptCount: 0 }] }] }, scope, [id], 1), NfseContractError);
});

test('query keys isolate context, polo, month, all list filters and canonical selection without order dependence', () => {
  const filters = defaultNfseReceiptFilters();
  const original = nfseStudentKeys.groups(scope, filters);
  for (const patch of [{ contextId: uuid(20) }, { poloId: uuid(21) }, { paymentMonth: '2026-10' }]) {
    assert.notDeepEqual(original, nfseStudentKeys.groups({ ...scope, ...patch }, filters));
    assert.notDeepEqual(nfseStudentKeys.selection(scope, [id]), nfseStudentKeys.selection({ ...scope, ...patch }, [id]));
  }
  for (const patch of [{ courseType: 'LIVRE' }, { classId: uuid(4) }, { search: 'Aluno' }, { page: 2 }]) {
    assert.notDeepEqual(original, nfseStudentKeys.groups(scope, { ...filters, ...patch }));
  }
  assert.deepEqual(nfseStudentKeys.selection(scope, [id, secondId]), nfseStudentKeys.selection(scope, [secondId, id]));
  assert.notDeepEqual(nfseStudentKeys.selection(scope, [id]), nfseStudentKeys.selection(scope, [secondId]));
  assert.equal(defaultNfseReceiptFilters().courseType, 'TECNICO');
});

