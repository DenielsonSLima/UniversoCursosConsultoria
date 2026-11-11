import { useNfseDocuments } from '../hooks/useNfseQueries';
import { formatNfseMoney } from '../components/nfse.presentation';
import type { NfseScope } from '../types/nfse.types';
import { useNfseIssuedPeriod } from './NfseIssuedPeriodContext';
import { createNfseIssuedPeriod, nfseIssuedQueryFilters } from './nfse-issued-period';

export default function NfseIssuedTotalMetric({ scope, enabled }: { scope: NfseScope | null; enabled: boolean }) {
  const period = useNfseIssuedPeriod();
  const filters = period?.queryFilters ?? nfseIssuedQueryFilters(createNfseIssuedPeriod(scope?.month));
  const validDates = !filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo;
  const query = useNfseDocuments(enabled ? scope : null, filters, validDates);
  const current = enabled && validDates && !period?.isSettling && !query.error && !query.isFetching && query.data;
  return <div className="nfse-metric" aria-busy={enabled && query.isFetching}>
    <span>Total emitido no período</span>
    <strong>{formatNfseMoney(current ? query.data?.totalAmount : null)}</strong>
  </div>;
}
