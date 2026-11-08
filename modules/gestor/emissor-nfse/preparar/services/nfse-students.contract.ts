import { NfseContractError } from '../../services/nfse.errors';
import { assertUniqueIds, boolean, integer, money, record, string } from '../../services/nfse.validation';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import {
  NFSE_STUDENT_PAGE_SIZE, NFSE_STUDENT_SELECTION_LIMIT,
  type NfseReceiptFilters, type NfseReceiptGroup, type NfseReceiptResponse, type NfseReceiptScope,
} from '../types/nfse-students.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANDIDATE = /^[0-9a-f-]{36}:[0-9a-f-]{36}$/i;
const array = <T>(value: unknown, parse: (item: unknown) => T, limit = 5000): T[] => {
  if (!Array.isArray(value) || value.length > limit) throw new NfseContractError();
  return value.map(parse);
};
const amount = (value: unknown): string => {
  const parsed = money(value);
  if (parsed === null) throw new NfseContractError();
  return parsed;
};
const uuid = (value: unknown): string => {
  const parsed = string(value);
  if (!UUID.test(parsed)) throw new NfseContractError();
  return parsed;
};
const candidate = (value: unknown): string => {
  const parsed = string(value);
  if (!CANDIDATE.test(parsed) || !parsed.split(':').every(id => UUID.test(id))) throw new NfseContractError();
  return parsed;
};
const option = (value: unknown) => {
  const row = record(value);
  return { id: string(row.id), label: string(row.label) };
};

export function isNfseReceiptScopeValid(scope: NfseReceiptScope | null): scope is NfseReceiptScope {
  return Boolean(scope && UUID.test(scope.contextId) && UUID.test(scope.poloId)
    && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(scope.paymentMonth));
}

function group(value: unknown): NfseReceiptGroup {
  const row = record(value);
  const id = uuid(row.id);
  const students = array(row.students, value => {
    const student = record(value);
    const studentId = uuid(student.studentId);
    const candidateId = candidate(student.id);
    if (candidateId !== `${id}:${studentId}`) throw new NfseContractError();
    return { id: candidateId, studentId, studentName: string(student.studentName),
      receivedAmount: amount(student.receivedAmount), receiptCount: integer(student.receiptCount, 1) };
  });
  assertUniqueIds(students);
  const studentCount = integer(row.studentCount);
  if (studentCount !== students.length) throw new NfseContractError();
  return { id, label: string(row.label), students, studentCount, receivedAmount: amount(row.receivedAmount) };
}

export function mapNfseReceiptResponse(
  value: unknown, expected: NfseReceiptScope, requestedIds: string[], expectedPage: number,
): NfseReceiptResponse {
  const row = record(value);
  const scope = record(row.scope);
  if (row.version !== 1 || scope.contextId !== expected.contextId || scope.poloId !== expected.poloId
    || scope.paymentMonth !== expected.paymentMonth || scope.basis !== 'PAYMENT_DATE') throw new NfseContractError();
  const courseTypes = array(row.courseTypes, option);
  const classes = array(row.classes, option);
  const groups = array(row.groups, group, NFSE_STUDENT_PAGE_SIZE);
  [courseTypes, classes, groups].forEach(assertUniqueIds);
  const page = integer(row.page, 1);
  const pageSize = integer(row.pageSize, 1);
  const totalGroups = integer(row.totalGroups);
  if (page !== expectedPage || pageSize !== NFSE_STUDENT_PAGE_SIZE || groups.length > totalGroups) throw new NfseContractError();
  const selection = record(row.selection);
  const ids = array(selection.ids, candidate, NFSE_STUDENT_SELECTION_LIMIT);
  const unavailableIds = array(selection.unavailableIds, candidate, NFSE_STUDENT_SELECTION_LIMIT);
  const valid = boolean(selection.valid);
  const selectedAmount = money(selection.selectedAmount);
  const selectedCount = integer(selection.selectedCount);
  const selectedGroups = array(selection.groups, group, NFSE_STUDENT_SELECTION_LIMIT);
  const returnedIds = selectedGroups.flatMap(item => item.students.map(student => student.id));
  assertUniqueIds(selectedGroups);
  if (new Set([...ids, ...unavailableIds]).size !== ids.length + unavailableIds.length
    || ids.length + unavailableIds.length !== requestedIds.length
    || [...ids, ...unavailableIds].some(id => !requestedIds.includes(id))
    || selectedCount !== ids.length || returnedIds.length !== ids.length
    || returnedIds.some(id => !ids.includes(id)) || new Set(returnedIds).size !== returnedIds.length
    || valid !== (unavailableIds.length === 0) || (valid && selectedAmount === null)
    || (!valid && selectedAmount !== null)) throw new NfseContractError();
  return { courseTypes, classes, groups, page, pageSize, totalGroups,
    totalStudents: integer(row.totalStudents), excludedUnknownCount: integer(row.excludedUnknownCount),
    selection: { ids, selectedCount, selectedAmount, valid, unavailableIds, groups: selectedGroups } };
}

export function createNfseReceiptReader(transport: NfseRpcTransport) {
  return async (
    scope: NfseReceiptScope, filters: NfseReceiptFilters, selectedIds: string[] = [],
    includeGroups = true, signal?: AbortSignal,
  ): Promise<NfseReceiptResponse> => {
    if (!isNfseReceiptScopeValid(scope) || selectedIds.length > NFSE_STUDENT_SELECTION_LIMIT
      || new Set(selectedIds).size !== selectedIds.length || filters.search.length > 120) throw new NfseContractError();
    selectedIds.forEach(candidate);
    if (filters.classId) uuid(filters.classId);
    const page = integer(filters.page, 1);
    const data = await transport('get_nfse_receipt_students_secure', {
      p_context_id: scope.contextId, p_polo_id: scope.poloId, p_payment_month: `${scope.paymentMonth}-01`,
      p_course_type: filters.courseType || null, p_class_id: filters.classId || null,
      p_search: filters.search.trim() || null, p_page: page, p_page_size: NFSE_STUDENT_PAGE_SIZE,
      p_selected_ids: [...selectedIds].sort(), p_include_groups: includeGroups,
    }, signal);
    return mapNfseReceiptResponse(data, scope, selectedIds, page);
  };
}
