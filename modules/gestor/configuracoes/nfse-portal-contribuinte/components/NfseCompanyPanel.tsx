import React, { useMemo, useState } from 'react';
import { Building2, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import { useNfseConfigurationMetadata } from '../../../emissor-nfse/services/configuration/useNfseConfigurationMetadata';
import { NfseUnavailableError } from '../../../emissor-nfse/services/nfse.errors';
import { getNfseCurrentMonth } from '../../../emissor-nfse/types/nfse.scope';
import type { NfseEnvironment, NfseScope } from '../../../emissor-nfse/types/nfse.types';
import type { NfsePolo } from '../services/nfse-polos.service';
import NfseConfigurationForm from './NfseConfigurationForm';
import { useNfseRealtime } from '../../../emissor-nfse/hooks/useNfseRealtime';
import { useNfseQueueRealtime } from '../../../emissor-nfse/fila/useNfseQueueRealtime';
import NfseNumberingPanel from './NfseNumberingPanel';

interface Props { polo: NfsePolo; contextKey: string }

const NfseCompanyPanel: React.FC<Props> = ({ polo, contextKey }) => {
  const [environment, setEnvironment] = useState<NfseEnvironment>('HOMOLOGACAO');
  const scope = useMemo<NfseScope>(() => ({
    poloId: polo.id, contextKey, environment, month: getNfseCurrentMonth(),
  }), [polo.id, contextKey, environment]);
  const configQuery = useNfseConfigurationMetadata(scope);
  useNfseRealtime(scope);
  useNfseQueueRealtime(scope);
  const configuration = configQuery.error ? undefined : configQuery.data;
  const unavailable = configQuery.error instanceof NfseUnavailableError;
  const failed = configQuery.isError && !unavailable;

  return <>
    <section className="nfse-portal-section" aria-label="Identificação do estabelecimento">
      <h3><Building2 size={17} aria-hidden="true" /> Estabelecimento emissor</h3>
      <dl className="nfse-portal-identity">
        <div><dt>Razão social / nome cadastrado</dt><dd>{polo.nome}</dd></div>
        <div><dt>CNPJ do emitente</dt><dd>{polo.cnpj || 'Não informado em Polos e Filiais'}</dd></div>
        <div><dt>Município</dt><dd>{[polo.cidade, polo.estado].filter(Boolean).join(' / ') || 'Não informado'}</dd></div>
        <div><dt>Cadastro</dt><dd>{polo.is_matriz ? 'Matriz' : 'Filial'} · {polo.status === 'ativo' ? 'Ativo' : 'Inativo'}</dd></div>
      </dl>
      <p className="nfse-portal-note">Dados de Polos e Filiais. As notas desta unidade utilizarão o CNPJ acima.</p>
    </section>

    <section className="nfse-portal-section" aria-label="Ambiente fiscal">
      <h3><ShieldCheck size={17} aria-hidden="true" /> Acesso e habilitação</h3>
      <div className="nfse-portal-fields">
        <label>
          <span>Ambiente consultado</span>
          <InstitutionalSelect
            value={environment}
            onValueChange={(value) => setEnvironment(value as NfseEnvironment)}
            options={[{ value: 'HOMOLOGACAO', label: 'Homologação · testes' }, { value: 'PRODUCAO', label: 'Produção' }]}
            ariaLabel="Ambiente fiscal consultado"
          />
        </label>
        <div><span className="block text-xs text-slate-600 mb-1">Situação da emissão</span>
          <span className="nfse-portal-tag">{!configuration ? 'Situação não verificada' : configuration.readiness.status === 'READY' ? 'Habilitado no ambiente' : 'Aguardando habilitação'}</span>
        </div>
      </div>
      <div className={failed ? 'nfse-portal-state' : 'nfse-portal-info'} data-tone={failed ? 'error' : undefined} role={failed ? 'alert' : 'status'}>
        <Info size={17} aria-hidden="true" />
        <p>{configQuery.isLoading ? 'Consultando configuração fiscal…'
          : failed ? 'Não foi possível consultar o acesso fiscal desta unidade. Atualize a consulta para tentar novamente.'
            : configuration?.readiness.message || 'Configuração de acesso disponível na próxima etapa. O cadastro das unidades já está vinculado a esta tela.'}</p>
      </div>
      {failed ? <button type="button" className="nfse-portal-button mt-3" onClick={() => void configQuery.refetch()} disabled={configQuery.isFetching}>Atualizar consulta</button> : null}
      <p className="nfse-portal-note">O certificado da matriz poderá representar as filiais após a validação de acesso para cada CNPJ.</p>
    </section>

    <NfseConfigurationForm key={`${polo.id}:${environment}`} scope={scope} configuration={configuration} activePolo={polo.status === 'ativo'} />
    <NfseNumberingPanel scope={scope} />

    <div className="nfse-portal-actions">
      <a className="nfse-portal-button" href="https://www.nfse.gov.br/EmissorNacional" target="_blank" rel="noopener noreferrer">
        <ExternalLink size={14} aria-hidden="true" /> Abrir portal de produção
      </a>
    </div>
  </>;
};

export default NfseCompanyPanel;
