import React, { useState } from 'react';
import { Building2, FileText, LockKeyhole, RefreshCw } from 'lucide-react';
import FinancialUnderlineTabs from '../../financeiro/components/FinancialUnderlineTabs';
import { useNfsePolos } from './hooks/useNfsePolos';
import NfseCompanyPanel from './components/NfseCompanyPanel';
import './nfse-portal-contribuinte.css';

export interface NfsePortalContribuinteConfigProps {
  isMatriz: boolean;
  poloId?: string | null;
  contextKey?: string;
  authUserId?: string;
  canAccessNfse?: boolean;
}

const NfsePortalContribuinteConfig: React.FC<NfsePortalContribuinteConfigProps> = ({
  isMatriz, poloId, contextKey = '', authUserId = '', canAccessNfse = false,
}) => {
  const [selectedPoloId, setSelectedPoloId] = useState('');
  const polosQuery = useNfsePolos(isMatriz && canAccessNfse, poloId || '', contextKey, authUserId);
  const polos = polosQuery.data || [];
  const selected = polos.find((polo) => polo.id === selectedPoloId)
    || polos.find((polo) => polo.id === poloId)
    || polos[0];

  if (!canAccessNfse || !authUserId || !isMatriz || !poloId || !contextKey.trim()) {
    return <div className="nfse-portal-config"><div className="nfse-portal-state" role="status">
      <LockKeyhole size={18} aria-hidden="true" />
      <p>O acesso às configurações da NFS-e está disponível no contexto autorizado da matriz.</p>
    </div></div>;
  }

  return (
    <div className="nfse-portal-config">
      <header className="nfse-portal-heading">
        <div>
          <h2>NFS-e Portal Contribuinte</h2>
          <p>Gerencie o acesso fiscal de cada unidade a partir da matriz.</p>
        </div>
        <span className="nfse-portal-tag"><LockKeyhole size={14} aria-hidden="true" /> Exclusivo da matriz</span>
      </header>

      {polosQuery.isLoading ? <p role="status">Carregando matriz e filiais…</p> : null}
      {polosQuery.isError ? <div className="nfse-portal-state" data-tone="error" role="alert">
        <FileText size={18} aria-hidden="true" />
        <div>
          <p>Não foi possível carregar as unidades autorizadas.</p>
          <button type="button" className="nfse-portal-button mt-3" onClick={() => void polosQuery.refetch()} disabled={polosQuery.isFetching}>
            <RefreshCw size={14} aria-hidden="true" /> Tentar novamente
          </button>
        </div>
      </div> : null}

      {!polosQuery.isLoading && !polosQuery.isError && polos.length === 0 ? <div className="nfse-portal-state" role="status">
        <Building2 size={18} aria-hidden="true" />
        <p>Nenhuma unidade disponível. Confira os cadastros em Polos e Filiais.</p>
      </div> : null}

      {!polosQuery.isError && selected ? <>
        <FinancialUnderlineTabs
          items={polos.map((polo) => ({
            id: polo.id,
            label: polo.is_matriz ? `Matriz · ${polo.cidade || polo.nome}` : polo.cidade || polo.nome,
            icon: <Building2 size={14} />,
          }))}
          value={selected.id}
          onChange={setSelectedPoloId}
          ariaLabel="Estabelecimentos emissores de NFS-e"
          idPrefix="nfse-empresa"
          compact
          showHorizontalScrollbar
        />
        <div role="tabpanel" id={`nfse-empresa-${selected.id}-panel`} aria-labelledby={`nfse-empresa-${selected.id}-tab`}>
          <NfseCompanyPanel key={`${contextKey}:${selected.id}`} polo={selected} contextKey={contextKey} />
        </div>
      </> : null}
    </div>
  );
};

export default NfsePortalContribuinteConfig;
