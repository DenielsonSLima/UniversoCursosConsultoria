import React from 'react';
import type { RenegociacaoIdentity } from '../renegociacoes.types';
import { useRenegociacaoSelectionSummary } from '../hooks/useRenegociacaoSelectionSummary';
import SelectionSummaryPanel from './SelectionSummaryPanel';

const SelectionFinancialSummary: React.FC<{
  group: RenegociacaoIdentity;
  selectedIds: string[];
  asOf?: string | null;
}> = ({ group, selectedIds, asOf }) => {
  const summary = useRenegociacaoSelectionSummary(group, selectedIds, asOf);
  return <SelectionSummaryPanel
    summary={summary.data}
    count={selectedIds.length}
    loading={summary.loading}
    error={summary.error}
    onRetry={() => { void summary.refetch(); }}
  />;
};

export default SelectionFinancialSummary;
