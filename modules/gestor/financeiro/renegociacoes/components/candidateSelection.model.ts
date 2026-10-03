import type {
  RenegociacaoCandidateGroup,
  RenegociacaoCandidateItem,
  RenegociacaoIdentity,
} from '../renegociacoes.types';

type SelectableCandidate = Pick<RenegociacaoCandidateItem, 'receivableId' | 'eligibility'>;

export const eligibleCandidateIds = (items: readonly SelectableCandidate[]) => {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of items) {
    if (!item.eligibility.eligible || seen.has(item.receivableId)) continue;
    seen.add(item.receivableId);
    ids.push(item.receivableId);
  }
  return ids;
};

export const reconcileCandidateSelection = (
  selectedIds: readonly string[],
  items: readonly SelectableCandidate[],
) => {
  const selected = new Set(selectedIds);
  return eligibleCandidateIds(items).filter((id) => selected.has(id));
};

export const toggleCandidateSelection = (
  selectedIds: readonly string[],
  receivableId: string,
  items: readonly SelectableCandidate[],
) => {
  const eligible = new Set(eligibleCandidateIds(items));
  if (!eligible.has(receivableId)) return reconcileCandidateSelection(selectedIds, items);
  const next = new Set(selectedIds);
  if (next.has(receivableId)) next.delete(receivableId);
  else next.add(receivableId);
  return eligibleCandidateIds(items).filter((id) => next.has(id));
};

export const allEligibleCandidatesSelected = (
  selectedIds: readonly string[],
  items: readonly SelectableCandidate[],
) => {
  const eligible = eligibleCandidateIds(items);
  if (!eligible.length) return false;
  const selected = new Set(selectedIds);
  return eligible.every((id) => selected.has(id));
};

export const toggleAllEligibleCandidates = (
  selectedIds: readonly string[],
  items: readonly SelectableCandidate[],
) => (allEligibleCandidatesSelected(selectedIds, items) ? [] : eligibleCandidateIds(items));

export const candidateIdentityMatchesGroup = (
  group: Pick<RenegociacaoCandidateGroup, 'poloId' | 'alunoId' | 'matriculaId' | 'turmaId'>,
  identity: RenegociacaoIdentity,
) =>
  group.poloId === identity.poloId &&
  group.alunoId === identity.alunoId &&
  group.matriculaId === identity.matriculaId &&
  group.turmaId === identity.turmaId;
