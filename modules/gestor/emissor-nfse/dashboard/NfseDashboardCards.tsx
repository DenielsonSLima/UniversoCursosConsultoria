import type { NfseScope } from '../types/nfse.types';
import { formatNfseMoney } from '../components/nfse.presentation';
import { NfseAccessError } from '../services/nfse.errors';
import { useNfseDashboardTotals } from './useNfseDashboardTotals';
import NfseIssuedTotalMetric from '../emitidas/NfseIssuedTotalMetric';
import './nfse-dashboard.css';

export function NfseIssueCounts({ issued, pending }: { issued?: number | null; pending?: number | null }) {
  return <dl className="nfse-metric nfse-counts" aria-label="Situação das notas">
    <div><dt>Emitidas</dt><dd>{issued ?? '—'}</dd></div>
    <div><dt>Pendentes</dt><dd>{pending ?? '—'}</dd></div>
  </dl>;
}

export interface NfsePoloLocation {
  id: string;
  cidade: string | null;
  estado: string | null;
}

function locationLabel(polo: NfsePoloLocation | undefined, fallback: string) {
  const city = polo?.cidade?.trim();
  const uf = polo?.estado?.trim().toUpperCase();
  if (!city) return fallback;
  return uf && /^[A-Z]{2}$/.test(uf) ? `${city}/${uf}` : city;
}

export function NfseDashboardAmounts({ scope, poloLocations }: {
  scope: NfseScope | null;
  poloLocations?: readonly NfsePoloLocation[];
}) {
  const query = useNfseDashboardTotals(scope);
  const data = scope && !query.error ? query.data : undefined;
  const locations = new Map(poloLocations?.map(polo => [polo.id, polo]));
  const status = query.error instanceof NfseAccessError ? 'Acesso não disponível'
    : query.error ? 'Dados indisponíveis' : scope && query.isFetching ? 'Carregando…' : '—';
  return <>
    <div className="nfse-metric nfse-dashboard-money" aria-busy={Boolean(scope && query.isFetching)}>
      <span>Total emitido · todos os polos</span>
      <strong>{formatNfseMoney(data?.totalAmount)}</strong>
      <small>{query.error ? status : 'No mês selecionado'}</small>
    </div>
    {scope && query.error ? <NfseIssuedTotalMetric scope={scope} enabled monthlyPolo /> :
    <div className="nfse-metric nfse-dashboard-by-polo" role="group" aria-label="Valor emitido por polo"
      aria-busy={Boolean(scope && query.isFetching)}>
      {data ? <dl className="nfse-polo-values">
        {data.byPolo.map(polo => <div key={polo.poloId}>
          <dt>{locationLabel(locations.get(polo.poloId), polo.poloId === scope?.poloId ? 'Matriz' : polo.poloName)}</dt>
          <dd>{formatNfseMoney(polo.amount)}</dd>
        </div>)}
      </dl> : <small>{status}</small>}
    </div>}
  </>;
}
