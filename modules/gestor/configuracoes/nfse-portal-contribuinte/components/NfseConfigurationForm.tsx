import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Save, Settings2 } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { useSaveNfseConfigurationMetadata } from '../../../emissor-nfse/services/configuration/useNfseConfigurationMetadata';
import { NFSE_CONFIGURATION_ENABLED } from '../../../emissor-nfse/services/configuration/configuration.service';
import type { NfseConfigurationDefinition, NfseConfigurationMetadata } from '../../../emissor-nfse/services/configuration/configuration.types';
import NfseTaxRegimeFields from './NfseTaxRegimeFields';
import NfseCertificateModal from './NfseCertificateModal';
import { certificateValidity } from './certificate-validity';
import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';

type MetadataDraft = Omit<NfseConfigurationDefinition, 'opSimpNac' | 'regEspTrib'> & {
  opSimpNac: NfseConfigurationDefinition['opSimpNac'] | '';
  regEspTrib: NfseConfigurationDefinition['regEspTrib'] | '';
};
interface Props { scope: NfseScope; configuration?: NfseConfigurationMetadata; activePolo: boolean }

const initialDraft = (scope: NfseScope, config?: NfseConfigurationMetadata): MetadataDraft => ({
  municipalityCode: config?.municipalityCode || '',
  municipalRegistration: config?.municipalRegistration || '',
  portalAccess: config?.portalAccess || 'CERTIFICATE',
  credentialSource: config?.credentialSource || 'MATRIZ',
  opSimpNac: config?.opSimpNac || '',
  regEspTrib: config?.regEspTrib || '',
  regApTribSN: config?.regApTribSN || null,
});

const NfseConfigurationForm: React.FC<Props> = ({ scope, configuration, activePolo }) => {
  const [draft, setDraft] = useState(() => initialDraft(scope, configuration));
  const [dirty, setDirty] = useState(false);
  const [certificateOpen,setCertificateOpen]=useState(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const mutation = useSaveNfseConfigurationMetadata(scope);
  const { toasts, removeToast, toast } = useToast();
  const canEdit = Boolean(NFSE_CONFIGURATION_ENABLED && configuration?.canManage && activePolo);
  const validity = configuration?.certificate.configured
    ? certificateValidity(configuration.certificate.expiresAt) : null;

  useEffect(() => {
    if (!dirty) setDraft(initialDraft(scope, configuration));
  }, [configuration, scope, dirty]);

  const update = <K extends keyof MetadataDraft>(key: K, value: MetadataDraft[K]) => {
    setDirty(true);
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || mutation.isPending || !dirty || !draft.opSimpNac || !draft.regEspTrib) return;
    const expectedVersion = configuration?.version ?? 0;
    const fingerprint = JSON.stringify({ definition: draft, expectedVersion });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await mutation.mutateAsync({ definition: { ...draft, opSimpNac: draft.opSimpNac, regEspTrib: draft.regEspTrib },
        requestId: request.current.id, expectedVersion });
      request.current = null;
      setDirty(false);
      toast.success('Configuração atualizada', 'Os parâmetros desta unidade foram salvos.');
    } catch {
      toast.error('Não foi possível salvar', 'Confira a disponibilidade do acesso e tente novamente.');
    }
  };

  return <form onSubmit={save}>
    <section className="nfse-portal-section" aria-label="Parâmetros fiscais da unidade">
      <h3><Settings2 size={17} aria-hidden="true" /> Parâmetros da unidade</h3>
      <fieldset disabled={!canEdit || mutation.isPending}>
        <div className="nfse-portal-fields">
          <label><span>Código IBGE do município</span>
            <input aria-label="Código IBGE do município" inputMode="numeric" pattern="[0-9]{7}" maxLength={7} required
              value={draft.municipalityCode} onChange={(event) => update('municipalityCode', event.target.value)} placeholder="Código do município" />
          </label>
          <label><span>Inscrição municipal</span>
            <input aria-label="Inscrição municipal" maxLength={15} value={draft.municipalRegistration}
              onChange={(event) => update('municipalRegistration', event.target.value)} placeholder="Quando aplicável" />
          </label>
          <label><span>Forma de acesso ao portal</span>
            <InstitutionalSelect value={draft.portalAccess}
              onValueChange={(value) => update('portalAccess', value as MetadataDraft['portalAccess'])}
              options={[{ value: 'CERTIFICATE', label: 'Certificado digital' }, { value: 'PASSWORD', label: 'Login e senha' }, { value: 'GOVBR', label: 'Conta GOV.BR' }]}
              ariaLabel="Forma de acesso ao Portal do Contribuinte" disabled={!canEdit || mutation.isPending} />
          </label>
          <label><span>Certificado para a integração</span>
            <InstitutionalSelect value={draft.credentialSource}
              onValueChange={(value) => update('credentialSource', value as MetadataDraft['credentialSource'])}
              options={[{ value: 'MATRIZ', label: 'Usar certificado da matriz' }, { value: 'PROPRIO', label: 'Certificado da própria unidade' }]}
              ariaLabel="Origem do certificado para a integração" disabled={!canEdit || mutation.isPending} />
          </label>
        </div>
        <NfseTaxRegimeFields draft={draft} disabled={!canEdit || mutation.isPending} onChange={patch => {
          setDirty(true); setDraft(previous => ({ ...previous, ...patch }));
        }} />
      </fieldset>
      {!configuration?.configured ? <p className="nfse-portal-note">As opções exibidas são sugestões iniciais. Nenhuma configuração foi salva para esta unidade.</p> : null}
      {configuration && !activePolo ? <p className="nfse-portal-note">Esta unidade está inativa em Polos e Filiais.</p> : null}
    </section>

    <section className="nfse-portal-section" aria-label="Credenciais fiscais">
      <h3><KeyRound size={17} aria-hidden="true" /> Credenciais e representação</h3>
      <dl className="nfse-portal-identity">
        <div><dt>Certificado</dt><dd>{configuration ? configuration.certificate.configured ? 'Cadastrado' : 'Ainda não cadastrado' : 'Situação ainda não verificada'}</dd></div>
        {configuration?.certificate.configured && <div><dt>Validade do certificado</dt><dd>
          {validity ? <time dateTime={validity.dateTime}>{validity.label}</time> : 'Validade indisponível. Atualize a consulta.'}
        </dd></div>}
        <div><dt>Acesso com login e senha</dt><dd>{configuration ? configuration.portalLoginConfigured ? 'Cadastrado' : 'Ainda não cadastrado' : 'Situação ainda não verificada'}</dd></div>
      </dl>
      {validity?.warning && <p className="nfse-portal-state" data-tone="error" role="status">{validity.warning}</p>}
      <p className="nfse-portal-note">O certificado A1 pode ser cadastrado após salvar os parâmetros. A emissão exige também verificação de revogação, representação e habilitação fiscal no ambiente.</p>
      <button type="button" className="nfse-portal-button" disabled={!canEdit || !configuration?.configured || dirty || mutation.isPending}
        onClick={()=>setCertificateOpen(true)}>Cadastrar certificado A1</button>
      <div className="nfse-portal-actions">
        <button type="submit" className="nfse-portal-button" data-primary="true" disabled={!canEdit || !dirty || mutation.isPending}>
          <Save size={14} aria-hidden="true" /> {mutation.isPending ? 'Salvando…' : 'Salvar parâmetros'}
        </button>
      </div>
    </section>
    {certificateOpen && <NfseCertificateModal scope={scope} onClose={()=>setCertificateOpen(false)} onSaved={(result)=>{
      const savedValidity = certificateValidity(result.expiresAt);
      setCertificateOpen(false); toast.success('Certificado cadastrado',
        `${savedValidity ? `Validade: ${savedValidity.label}. ` : ''}A emissão continua aguardando validação fiscal.`);
    }} />}
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </form>;
};

export default NfseConfigurationForm;

