import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Save, Settings2 } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import ToastNotification, { useToast } from '../../../components/ToastNotification';
import { useSaveNfseConfiguration } from '../../../emissor-nfse/hooks/useNfseMutations';
import { NFSE_WRITES_ENABLED } from '../../../emissor-nfse/services/nfse.runtime';
import type { NfseConfiguration, NfseConfigurationInput, NfseScope } from '../../../emissor-nfse/types/nfse.types';

type MetadataDraft = Omit<NfseConfigurationInput, 'requestId'>;
interface Props { scope: NfseScope; configuration?: NfseConfiguration; activePolo: boolean }

const initialDraft = (scope: NfseScope, config?: NfseConfiguration): MetadataDraft => ({
  municipalityCode: config?.municipalityCode || '',
  municipalRegistration: config?.municipalRegistration || '',
  portalAccess: config?.portalAccess || 'CERTIFICATE',
  credentialSource: config?.credentialSource || 'MATRIZ',
  environment: scope.environment,
});

const NfseConfigurationForm: React.FC<Props> = ({ scope, configuration, activePolo }) => {
  const [draft, setDraft] = useState(() => initialDraft(scope, configuration));
  const [dirty, setDirty] = useState(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const mutation = useSaveNfseConfiguration(scope, configuration?.canManage === true && activePolo);
  const { toasts, removeToast, toast } = useToast();
  const canEdit = Boolean(NFSE_WRITES_ENABLED && configuration?.canManage && activePolo);

  useEffect(() => {
    if (!dirty) setDraft(initialDraft(scope, configuration));
  }, [configuration, scope, dirty]);

  const update = <K extends keyof MetadataDraft>(key: K, value: MetadataDraft[K]) => {
    setDirty(true);
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || mutation.isPending || !dirty) return;
    const fingerprint = JSON.stringify(draft);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await mutation.mutateAsync({ ...draft, requestId: request.current.id });
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
            <input aria-label="Inscrição municipal" maxLength={30} value={draft.municipalRegistration}
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
      </fieldset>
      {!configuration ? <p className="nfse-portal-note">As opções exibidas são sugestões iniciais. Nenhuma configuração foi salva para esta unidade.</p> : null}
      {configuration && !activePolo ? <p className="nfse-portal-note">Esta unidade está inativa em Polos e Filiais.</p> : null}
    </section>

    <section className="nfse-portal-section" aria-label="Credenciais fiscais">
      <h3><KeyRound size={17} aria-hidden="true" /> Credenciais e representação</h3>
      <dl className="nfse-portal-identity">
        <div><dt>Certificado</dt><dd>{configuration ? configuration.certificate.configured ? 'Cadastrado' : 'Ainda não cadastrado' : 'Situação ainda não verificada'}</dd></div>
        <div><dt>Acesso com login e senha</dt><dd>{configuration ? configuration.portalLoginConfigured ? 'Cadastrado' : 'Ainda não cadastrado' : 'Situação ainda não verificada'}</dd></div>
      </dl>
      <p className="nfse-portal-note">O cadastro seguro de credenciais será disponibilizado na próxima etapa. A emissão automática exige certificado e representação validados, mesmo quando o portal é acessado por senha.</p>
      <div className="nfse-portal-actions">
        <button type="submit" className="nfse-portal-button" data-primary="true" disabled={!canEdit || !dirty || mutation.isPending}>
          <Save size={14} aria-hidden="true" /> {mutation.isPending ? 'Salvando…' : 'Salvar parâmetros'}
        </button>
      </div>
    </section>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </form>;
};

export default NfseConfigurationForm;
