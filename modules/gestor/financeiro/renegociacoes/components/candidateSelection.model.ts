import type {
  RenegociacaoCandidateGroup,
  RenegociacaoCandidateItem,
  RenegociacaoIdentity,
} from '../renegociacoes.types';

type SelectableCandidate = Pick<RenegociacaoCandidateItem, 'receivableId' | 'eligibility'>;
type CandidateIdentity = Pick<RenegociacaoIdentity, 'poloId' | 'alunoId' | 'matriculaId' | 'turmaId'>;

export interface CandidateSelectionState {
  ownerIdentity: CandidateIdentity | null;
  selectedIds: string[];
}

export const emptyCandidateSelection = (): CandidateSelectionState => ({
  ownerIdentity: null,
  selectedIds: [],
});

export const candidateIdentityFromGroup = (group: CandidateIdentity): CandidateIdentity => ({
  poloId: group.poloId,
  alunoId: group.alunoId,
  matriculaId: group.matriculaId,
  turmaId: group.turmaId,
});

export const candidateIdentitiesMatch = (left: CandidateIdentity, right: CandidateIdentity) =>
  left.poloId === right.poloId &&
  left.alunoId === right.alunoId &&
  left.matriculaId === right.matriculaId &&
  left.turmaId === right.turmaId;

export const candidateSelectionOwnedBy = (selection: CandidateSelectionState, group: CandidateIdentity) =>
  Boolean(
    selection.ownerIdentity &&
      selection.selectedIds.length > 0 &&
      candidateIdentitiesMatch(selection.ownerIdentity, group),
  );

export const candidateSelectionIdsEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

export const updateCandidateSelection = (
  current: CandidateSelectionState,
  group: CandidateIdentity,
  selectedIds: readonly string[],
): CandidateSelectionState => {
  const normalizedIds = [...new Set(selectedIds.filter(Boolean))];
  const currentIsOwnedByGroup = candidateSelectionOwnedBy(current, group);
  if (!normalizedIds.length) return currentIsOwnedByGroup ? emptyCandidateSelection() : current;
  if (current.ownerIdentity && current.selectedIds.length > 0 && !currentIsOwnedByGroup) return current;
  if (currentIsOwnedByGroup && candidateSelectionIdsEqual(current.selectedIds, normalizedIds)) return current;
  return { ownerIdentity: candidateIdentityFromGroup(group), selectedIds: normalizedIds };
};

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
) => candidateIdentitiesMatch(group, identity);
