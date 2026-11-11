import { lazy, Suspense, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { NfseScope } from '../../types/nfse.types';
import { useNfseIssuedPeriod } from '../NfseIssuedPeriodContext';
import { nfseDocumentFilterArgs } from '../../services/nfse-document-filters';
import './nfse-issued-export.css';

const NfseIssuedExportModal = lazy(() => import('./NfseIssuedExportModal'));

export default function NfseIssuedExportAction({ scope, enabled }: { scope: NfseScope | null; enabled: boolean }) {
  const period = useNfseIssuedPeriod();
  const filters = period?.filters ?? {};
  const [openKey, setOpenKey] = useState<string | null>(null);
  const key = JSON.stringify([scope, filters]);
  let valid = true;
  try { nfseDocumentFilterArgs({ status: 'EMITIDA', ...filters }); } catch { valid = false; }
  const available = Boolean(enabled && scope && valid && period && !period.isSettling);
  useEffect(() => { if (!available || openKey !== key) setOpenKey(null); }, [available, key, openKey]);
  return <>
    <button type="button" className="nfse-button nfse-button-secondary nfse-issued-export-button" disabled={!available}
      aria-haspopup="dialog" onClick={() => setOpenKey(key)}><Download size={15} />Exportar</button>
    {openKey === key && available && scope && <Suspense fallback={<span role="status">Abrindo exportação…</span>}>
      <NfseIssuedExportModal key={key} scope={scope} filters={filters} onClose={() => setOpenKey(null)} />
    </Suspense>}
  </>;
}
