import React from 'react';
import {
  Copy,
  FileText,
  Key,
  Landmark,
  Link as LinkIcon,
  Loader2,
  PlugZap,
  Save,
  ServerCog,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import {
  ENVIRONMENTS,
  PROVIDER_BRANDS,
  environmentLabel,
  statusLabel,
} from './integracao-bancaria.constants';
import {
  CredentialProviderCard,
  EnvironmentBadge,
  EnvironmentBanner,
  InfoCard,
  ProviderLogo,
  StatusPill,
  TextInput,
} from './integracao-bancaria.ui';
import {
  GatewayCredential,
  GatewayEnvironment,
  GatewayOverview,
  GatewayProvider,
  GatewayProviderCode,
} from './integracao-bancaria.service';
import { CredentialFormState } from './integracao-bancaria.types';

interface ChavesTokensPanelProps {
  overview?: GatewayOverview;
  providers: GatewayProvider[];
  keysEnvironment: GatewayEnvironment;
  credentialProviderCode: GatewayProviderCode;
  credentialProvider?: GatewayProvider;
  editCredential?: GatewayCredential;
  credentialForm: CredentialFormState;
  saveCredentialPending: boolean;
  testPending: boolean;
  setKeysEnvironment: (value: GatewayEnvironment) => void;
  setCredentialProviderCode: (value: GatewayProviderCode) => void;
  getCredential: (providerCode: GatewayProviderCode, environment: GatewayEnvironment) => GatewayCredential | undefined;
  updateCredentialForm: (key: keyof CredentialFormState, value: string) => void;
  saveCredentials: (event: React.FormEvent) => void;
  copyWebhookUrl: () => void;
  testConnection: () => void;
}

const ChavesTokensPanel: React.FC<ChavesTokensPanelProps> = ({
  overview,
  providers,
  keysEnvironment,
  credentialProviderCode,
  credentialProvider,
  editCredential,
  credentialForm,
  saveCredentialPending,
  testPending,
  setKeysEnvironment,
  setCredentialProviderCode,
  getCredential,
  updateCredentialForm,
  saveCredentials,
  copyWebhookUrl,
  testConnection,
}) => {
  const brand = PROVIDER_BRANDS[credentialProviderCode];
  const webhookUrl = editCredential?.webhookUrl || overview?.webhookUrls?.[credentialProviderCode] || '';
  const copyDisabled = !webhookUrl;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-3">
        <InfoCard icon={Key} title="Chave única por banco" tone="blue">
          Asaas, Mercado Pago e Banese ficam cadastrados uma vez por ambiente. A modalidade só escolhe qual banco usar.
        </InfoCard>
        <InfoCard icon={ServerCog} title="Sandbox e produção" tone={keysEnvironment === 'production' ? 'emerald' : 'amber'}>
          Cada ambiente tem tokens próprios, webhook próprio e status próprio para evitar mistura de teste com cobrança real.
        </InfoCard>
        <InfoCard icon={LinkIcon} title="Webhook individual">
          Cada banco recebe sua URL de retorno. Quando a cobrança mudar de status, o sistema identifica a origem.
        </InfoCard>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Ambiente das chaves</p>
            <h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
              Parametrização · {environmentLabel(keysEnvironment)}
            </h4>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {ENVIRONMENTS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setKeysEnvironment(item.value)}
                className={`inline-flex min-h-[42px] items-center justify-center rounded-md border px-4 text-xs font-black uppercase tracking-wider ${
                  keysEnvironment === item.value ? item.chip : 'border-transparent text-slate-500 hover:bg-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <EnvironmentBanner
        environment={keysEnvironment}
        title="Chaves, tokens e webhooks"
      />

      {credentialProviderCode === 'banese_card' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <InfoCard icon={Key} title="OAuth Banese" tone="emerald">
            Peça ao gerente o Client ID e o Client Secret da API de Cobrança para sandbox e produção.
          </InfoCard>
          <InfoCard icon={FileText} title="Boleto Banese" tone="blue">
            Solicite o código do convênio de boleto, CPF/CNPJ do beneficiário, carteira e regras de Nosso Número.
          </InfoCard>
          <InfoCard icon={PlugZap} title="Pix Banese" tone="amber">
            Para SAB Guias, peça convênio Pix, chave Pix, CRT Access Token/certificado e confirme o header Terminal.
          </InfoCard>
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="grid min-w-0 gap-3">
          {providers.map((item) => (
            <React.Fragment key={item.code}>
              <CredentialProviderCard
                provider={item}
                credential={getCredential(item.code, keysEnvironment)}
                selected={credentialProviderCode === item.code}
                environment={keysEnvironment}
                onClick={() => setCredentialProviderCode(item.code)}
              />
            </React.Fragment>
          ))}
        </section>

        <form onSubmit={saveCredentials} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <ProviderLogo code={credentialProviderCode} hero className="mb-5 w-full" />
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest" style={{ color: brand.text }}>
                <Key size={15} />
                Chaves e tokens globais
              </p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h4 className="min-w-0 truncate text-xl font-black uppercase tracking-tight text-[#001a33]">
                  {credentialProvider?.name}
                </h4>
                <EnvironmentBadge environment={keysEnvironment} />
              </div>
              <p className="mt-1 max-w-xl text-xs font-semibold leading-relaxed text-slate-500">
                Estas chaves valem para todas as modalidades que escolherem {credentialProvider?.name} em {environmentLabel(keysEnvironment)}.
              </p>
            </div>
            <span className="max-w-full shrink-0">
              <StatusPill active={editCredential?.configured === true} label={statusLabel(editCredential)} />
            </span>
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {credentialProviderCode === 'asaas' && (
              <>
                <TextInput
                  icon={Key}
                  label="Chave de API"
                  value={credentialForm.apiKey}
                  onChange={(value) => updateCredentialForm('apiKey', value)}
                  configured={editCredential?.apiKeyConfigured}
                  type="password"
                />
                <TextInput
                  icon={LinkIcon}
                  label="Token webhook"
                  value={credentialForm.webhookToken}
                  onChange={(value) => updateCredentialForm('webhookToken', value)}
                  configured={editCredential?.webhookSecretConfigured}
                  type="password"
                />
                <TextInput
                  icon={Landmark}
                  label="Wallet ID"
                  value={credentialForm.walletId}
                  onChange={(value) => updateCredentialForm('walletId', value)}
                />
              </>
            )}

            {credentialProviderCode === 'mercado_pago' && (
              <>
                <TextInput
                  icon={Key}
                  label="Access token"
                  value={credentialForm.accessToken}
                  onChange={(value) => updateCredentialForm('accessToken', value)}
                  configured={editCredential?.accessTokenConfigured}
                  type="password"
                />
                <TextInput
                  icon={ShieldCheck}
                  label="Public key"
                  value={credentialForm.publicKey}
                  onChange={(value) => updateCredentialForm('publicKey', value)}
                  configured={editCredential?.publicKeyConfigured}
                  type="password"
                />
                <TextInput
                  icon={LinkIcon}
                  label="Webhook secret"
                  value={credentialForm.webhookSecret}
                  onChange={(value) => updateCredentialForm('webhookSecret', value)}
                  configured={editCredential?.webhookSecretConfigured}
                  type="password"
                />
                <TextInput
                  icon={WalletCards}
                  label="Merchant ID"
                  value={credentialForm.merchantId}
                  onChange={(value) => updateCredentialForm('merchantId', value)}
                />
              </>
            )}

            {credentialProviderCode === 'banese_card' && (
              <>
                <TextInput
                  icon={Key}
                  label="Client ID"
                  value={credentialForm.clientId}
                  onChange={(value) => updateCredentialForm('clientId', value)}
                  configured={editCredential?.clientIdConfigured}
                  type="password"
                />
                <TextInput
                  icon={ShieldCheck}
                  label="Client Secret"
                  value={credentialForm.clientSecret}
                  onChange={(value) => updateCredentialForm('clientSecret', value)}
                  configured={editCredential?.clientSecretConfigured}
                  type="password"
                />
                <TextInput
                  icon={LinkIcon}
                  label="Webhook secret Pix"
                  value={credentialForm.webhookSecret}
                  onChange={(value) => updateCredentialForm('webhookSecret', value)}
                  configured={editCredential?.webhookSecretConfigured}
                  type="password"
                />
                <TextInput
                  icon={ShieldCheck}
                  label="CRT Access Token Pix"
                  value={credentialForm.crtAccessToken}
                  onChange={(value) => updateCredentialForm('crtAccessToken', value)}
                  configured={editCredential?.metadata?.baneseCrtAccessTokenConfigured === true}
                  type="password"
                />
                <TextInput
                  icon={Landmark}
                  label="Convênio boleto"
                  value={credentialForm.baneseBoletoConvenio || credentialForm.baneseConvenio}
                  onChange={(value) => {
                    updateCredentialForm('baneseBoletoConvenio', value);
                    updateCredentialForm('baneseConvenio', value);
                  }}
                  configured={Boolean(editCredential?.metadata?.baneseBoletoConvenio || editCredential?.metadata?.baneseConvenio)}
                />
                <TextInput
                  icon={FileText}
                  label="CPF/CNPJ beneficiário"
                  value={credentialForm.baneseBeneficiarioInscricao}
                  onChange={(value) => updateCredentialForm('baneseBeneficiarioInscricao', value)}
                  configured={Boolean(editCredential?.metadata?.baneseBeneficiarioInscricao)}
                />
                <TextInput
                  icon={Landmark}
                  label="Convênio Pix/SAB Guias"
                  value={credentialForm.banesePixConvenio}
                  onChange={(value) => updateCredentialForm('banesePixConvenio', value)}
                  configured={Boolean(editCredential?.metadata?.banesePixConvenio)}
                />
                <TextInput
                  icon={Key}
                  label="Chave Pix Banese"
                  value={credentialForm.banesePixChave}
                  onChange={(value) => updateCredentialForm('banesePixChave', value)}
                  configured={Boolean(editCredential?.metadata?.banesePixChave)}
                />
                <TextInput
                  icon={FileText}
                  label="Carteira boleto"
                  value={credentialForm.baneseCarteira}
                  onChange={(value) => updateCredentialForm('baneseCarteira', value)}
                />
                <TextInput
                  icon={Landmark}
                  label="Agência"
                  value={credentialForm.baneseAgencia}
                  onChange={(value) => updateCredentialForm('baneseAgencia', value)}
                />
                <TextInput
                  icon={Landmark}
                  label="Conta"
                  value={credentialForm.baneseConta}
                  onChange={(value) => updateCredentialForm('baneseConta', value)}
                />
              </>
            )}

            <label className="space-y-2 md:col-span-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Observação interna</span>
              <textarea
                value={credentialForm.notes}
                onChange={(event) => updateCredentialForm('notes', event.target.value)}
                className="min-h-[84px] w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
              />
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Webhook de {credentialProvider?.name}</p>
                <code className="mt-1 block truncate text-xs font-bold text-slate-600">
                  {webhookUrl || 'URL será gerada após salvar'}
                </code>
              </div>
              <button
                type="button"
                onClick={copyWebhookUrl}
                disabled={copyDisabled}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#001a33] disabled:opacity-40"
              >
                <Copy size={15} />
                Copiar
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              type="submit"
              disabled={saveCredentialPending}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all disabled:opacity-50 sm:col-span-2 ${brand.action}`}
            >
              {saveCredentialPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Salvar chaves
            </button>
            <button
              type="button"
              onClick={testConnection}
              disabled={testPending || editCredential?.configured !== true}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-[#001a33] disabled:opacity-40"
            >
              {testPending ? <Loader2 className="animate-spin" size={16} /> : <PlugZap size={16} />}
              Testar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChavesTokensPanel;
