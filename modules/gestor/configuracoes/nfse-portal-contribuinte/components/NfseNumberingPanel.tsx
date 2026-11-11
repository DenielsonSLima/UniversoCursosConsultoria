import { Hash, RefreshCw } from 'lucide-react';
import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';
import type { NfseNumberingService } from '../services/nfse-numbering.contract';
import { useNfseNumbering } from '../hooks/useNfseNumbering';

const time = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export default function NfseNumberingPanel({ scope, service }: { scope: NfseScope; service?: NfseNumberingService }) {
  const query = useNfseNumbering(scope, service), data = query.error ? undefined : query.data;
  const environment = scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação';
  return <section className="nfse-portal-section" aria-label="Numeração fiscal" aria-busy={query.isFetching}>
    <h3><Hash size={17} aria-hidden="true" /> Numeração NFS-e e DPS · {environment}</h3>
    {query.isPending && <p role="status">Consultando numeração registrada neste sistema…</p>}
    {query.error && <p className="nfse-portal-state" data-tone="error" role="alert">Não foi possível consultar a numeração deste estabelecimento. Atualize a consulta.</p>}
    {data && <>
      <dl className="nfse-portal-identity">
        <div><dt>Última NFS-e autorizada por este sistema</dt><dd>{data.lastAuthorized?.number || 'Ainda sem nota confirmada neste sistema'}</dd></div>
        <div><dt>Situação da última NFS-e</dt><dd>{data.lastAuthorized ? data.lastAuthorized.state === 'CANCELLED' ? 'Cancelada · autorização histórica preservada' : 'Autorizada' : 'Sem registro'}</dd></div>
        {data.lastAuthorized && <div><dt>Autorização registrada em</dt><dd><time dateTime={data.lastAuthorized.authorizedAt}>{time(data.lastAuthorized.authorizedAt)} (Brasília)</time></dd></div>}
        {data.dps && <>
          <div><dt>Série DPS utilizada pelo sistema</dt><dd>{data.dps.series}</dd></div>
          <div><dt>Última DPS alocada neste estabelecimento e ambiente</dt><dd>{data.dps.lastAllocated || 'Nenhuma DPS alocada'}</dd></div>
          <div><dt>Próximo número DPS previsto</dt><dd>{data.dps.nextNumber || 'Sem próximo número disponível'}</dd></div>
        </>}
      </dl>
      {!data.dps && <p className="nfse-portal-note">A sequência DPS deste ambiente ainda não está disponível nesta consulta.</p>}
      <p className="nfse-portal-note">O número da NFS-e é atribuído pelo serviço fiscal. A DPS identifica a preparação e tem sequência própria; uma DPS rejeitada continua alocada.</p>
      {data.dps && <p className="nfse-portal-note">O próximo número DPS é uma estimativa da sequência compartilhada, sujeita a outras operações. A reserva definitiva ocorre na preparação.</p>}
      <p className="nfse-portal-note">Consulta somente ao histórico deste sistema, sem incluir notas emitidas em outros portais. Atualizado em <time dateTime={data.checkedAt}>{time(data.checkedAt)}</time> (Brasília).</p>
    </>}
    <div className="nfse-portal-actions"><button type="button" className="nfse-portal-button" disabled={query.isFetching} onClick={() => void query.refetch()}>
      <RefreshCw size={14} aria-hidden="true" /> Atualizar numeração</button></div>
  </section>;
}
