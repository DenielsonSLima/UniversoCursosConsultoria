import React from 'react';
import {
  CheckCircle2,
  Copy,
  FileText,
  Key,
  Landmark,
  Link as LinkIcon,
  LockKeyhole,
  Loader2,
  PlugZap,
  Save,
  ServerCog,
  ShieldCheck,
  UploadCloud,
  WalletCards,
} from 'lucide-react';
import {
  ENVIRONMENTS,
  PROVIDER_BRANDS,
  environmentLabel,
  statusLabel,
} from './integracao-bancaria.constants';
import {
  isValidBaneseEdi7Code,
  normalizeBaneseEdi7Code,
} from './integracao-bancaria.validation';
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

const MAX_CREDENTIAL_FILE_SIZE = 64 * 1024;

const SecureCredentialFile: React.FC<{
  label: string;
  help: string;
  accept: string;
  kind: 'certificate' | 'private-key';
  fileName: string;
  configured: boolean;
  onLoad: (content: string, fileName: string) => void;
}> = ({ label, help, accept, kind, fileName, configured, onLoad }) => {
  const [error, setError] = React.useState('');
  const inputId = React.useId();

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_CREDENTIAL_FILE_SIZE) {
      setError('Arquivo maior que 64 KB. Selecione o arquivo PEM original do Inter.');
      return;
    }

    const content = (await file.text()).trim();
    const isValid = kind === 'certificate'
      ? content.includes('-----BEGIN CERTIFICATE-----') && content.includes('-----END CERTIFICATE-----')
      : /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(content)
        && /-----END (?:RSA |EC )?PRIVATE KEY-----/.test(content);

    if (!isValid) {
      setError(kind === 'certificate'
        ? 'Certificado inválido. Use o arquivo .crt ou .pem baixado no Inter.'
        : 'Chave privada inválida. Use o arquivo .key ou .pem baixado no Inter.');
      return;
    }

    setError('');
    onLoad(content, file.name);
  };

  const ready = Boolean(fileName) || configured;

  return (
    <div className="min-w-0 space-y-2">
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <label
        htmlFor={inputId}
        className={`group flex min-h-[112px] cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 transition-all focus-within:ring-2 focus-within:ring-orange-200 ${
          ready
            ? 'border-emerald-300 bg-emerald-50/70 hover:border-emerald-400'
            : 'border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/50'
        }`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-orange-600 shadow-sm'}`}>
          {ready ? <CheckCircle2 size={22} /> : <UploadCloud size={22} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-[#001a33]">
            {fileName || (configured ? 'Arquivo protegido já configurado' : 'Selecionar arquivo')}
          </span>
          <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{help}</span>
        </span>
        <LockKeyhole className="shrink-0 text-slate-300 group-hover:text-orange-500" size={18} />
        <input id={inputId} type="file" accept={accept} onChange={readFile} className="sr-only" />
      </label>
      {error && <p role="alert" className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
};

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
  const webhookAvailable = credentialProviderCode === 'mercado_pago';
  const webhookUrl = webhookAvailable
    ? editCredential?.webhookUrl || overview?.webhookUrls?.[credentialProviderCode] || ''
    : '';
  const copyDisabled = !webhookAvailable || !webhookUrl;
  const baneseEdi7CodeEntered = credentialForm.baneseEdi7Code.length > 0;
  const baneseEdi7CodeValid = isValidBaneseEdi7Code(credentialForm.baneseEdi7Code);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-3">
        <InfoCard icon={Key} title="Chave única por banco" tone="blue">
          Mercado Pago e Banese ficam cadastrados uma vez por ambiente. A modalidade só escolhe qual banco usar.
        </InfoCard>
        <InfoCard icon={ServerCog} title="Sandbox e produção" tone={keysEnvironment === 'production' ? 'emerald' : 'amber'}>
          Cada ambiente tem credenciais e status próprios para evitar mistura de teste com cobrança real.
        </InfoCard>
        <InfoCard icon={LinkIcon} title="Retorno por provedor">
          Cobrança Banese usa consulta a PagamentosEfetivados; Mercado Pago só terá webhook depois da homologação completa.
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
        title="Chaves, tokens e retornos"
      />

      {credentialProviderCode === 'banco_inter' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <InfoCard icon={Key} title="OAuth do Inter" tone="amber">
            Use o Client ID e o Client Secret gerados na aplicação Inter correspondente ao ambiente selecionado.
          </InfoCard>
          <InfoCard icon={ShieldCheck} title="Certificado mTLS" tone="emerald">
            Envie o certificado .crt e a chave privada .key do mesmo ambiente. Os conteúdos serão guardados no Vault.
          </InfoCard>
          <InfoCard icon={Landmark} title="Conta corrente opcional" tone="blue">
            O Inter só exige x-conta-corrente quando a mesma aplicação estiver associada a mais de uma conta.
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
                  label="Merchant ID (conferido automaticamente)"
                  value={credentialForm.merchantId}
                  onChange={(value) => updateCredentialForm('merchantId', value)}
                />
              </>
            )}

            {credentialProviderCode === 'banco_inter' && (
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
                <SecureCredentialFile
                  label="Certificado mTLS"
                  help="Arquivo .crt ou .pem baixado na aplicação Inter deste ambiente."
                  accept=".crt,.cer,.pem,application/x-x509-ca-cert,text/plain"
                  kind="certificate"
                  fileName={credentialForm.certificateFileName}
                  configured={editCredential?.metadata?.interCertificateConfigured === true}
                  onLoad={(content, fileName) => {
                    updateCredentialForm('certificatePem', content);
                    updateCredentialForm('certificateFileName', fileName);
                  }}
                />
                <SecureCredentialFile
                  label="Chave privada"
                  help="Arquivo .key ou .pem correspondente ao certificado. Nunca será exibido após salvar."
                  accept=".key,.pem,application/pkcs8,text/plain"
                  kind="private-key"
                  fileName={credentialForm.privateKeyFileName}
                  configured={editCredential?.metadata?.interPrivateKeyConfigured === true}
                  onLoad={(content, fileName) => {
                    updateCredentialForm('privateKeyPem', content);
                    updateCredentialForm('privateKeyFileName', fileName);
                  }}
                />
                <TextInput
                  icon={Key}
                  label="Chave Pix recebedora"
                  value={credentialForm.interPixKey}
                  onChange={(value) => updateCredentialForm('interPixKey', value)}
                  configured={Boolean(editCredential?.metadata?.interPixKey)}
                />
                <div className="rounded-lg border border-orange-100 bg-orange-50/70 p-4 md:col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Permissões da aplicação no Inter</p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                    Para a homologação atual, habilite somente Cobrança/Boleto com Pix V3 (leitura e escrita). O teste valida OAuth e mTLS com esses escopos; ele não atesta Pix avulso nem webhook, que permanecem bloqueados até existir o adaptador correspondente.
                  </p>
                </div>
              </>
            )}

            {credentialProviderCode === 'banese_card' && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 md:col-span-2">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-800">Homologação Banese</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-700">
                    Em sandbox, o fluxo continua limitado. Em produção, o BolePix pode retornar junto ao boleto; então ative os dados de Pix abaixo para garantir a saída completa no ambiente real.
                  </p>
                </div>
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
                  icon={Key}
                  label="CrtAccessToken"
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
                  readOnly
                />
                <TextInput
                  icon={Landmark}
                  label="Convênio Pix"
                  value={credentialForm.banesePixConvenio || credentialForm.baneseConvenio}
                  onChange={(value) => {
                    updateCredentialForm('banesePixConvenio', value);
                    updateCredentialForm('baneseConvenio', value);
                  }}
                  configured={Boolean(editCredential?.metadata?.banesePixConvenio || editCredential?.metadata?.baneseConvenio)}
                  readOnly
                />
                <TextInput
                  icon={Key}
                  label="Chave Pix"
                  value={credentialForm.banesePixChave}
                  onChange={(value) => updateCredentialForm('banesePixChave', value)}
                  configured={Boolean(editCredential?.metadata?.banesePixChave)}
                />
                <TextInput
                  icon={FileText}
                  label="Beneficiário"
                  value={credentialForm.baneseBeneficiarioNome}
                  onChange={(value) => updateCredentialForm('baneseBeneficiarioNome', value)}
                  configured
                  readOnly
                />
                <TextInput
                  icon={FileText}
                  label="CPF/CNPJ beneficiário"
                  value={credentialForm.baneseBeneficiarioInscricao}
                  onChange={(value) => updateCredentialForm('baneseBeneficiarioInscricao', value)}
                  configured={Boolean(editCredential?.metadata?.baneseBeneficiarioInscricao)}
                  readOnly
                />
                <TextInput
                  icon={FileText}
                  label="Código beneficiário"
                  value={credentialForm.baneseCodigoBeneficiario}
                  onChange={(value) => updateCredentialForm('baneseCodigoBeneficiario', value)}
                  configured
                  readOnly
                />
                <TextInput
                  icon={FileText}
                  label="Carteira boleto"
                  value={credentialForm.baneseCarteira}
                  onChange={(value) => updateCredentialForm('baneseCarteira', value)}
                />
                <label className="space-y-2">
                  <span className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
                    <FileText size={14} />
                    Código EDI 7
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] text-slate-600">
                      opcional no OAuth
                    </span>
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={credentialForm.baneseEdi7Code}
                    onChange={(event) => updateCredentialForm(
                      'baneseEdi7Code',
                      normalizeBaneseEdi7Code(event.target.value),
                    )}
                    aria-invalid={baneseEdi7CodeEntered && !baneseEdi7CodeValid}
                    aria-describedby="banese-edi7-help"
                    className={`h-11 w-full rounded-md border px-3 font-mono text-sm tracking-[0.28em] text-slate-700 outline-none transition-all focus:bg-white ${
                      baneseEdi7CodeEntered && !baneseEdi7CodeValid
                        ? 'border-amber-400 bg-amber-50 focus:border-amber-500'
                        : baneseEdi7CodeValid
                          ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-500'
                          : 'border-slate-200 bg-white focus:border-blue-500'
                    }`}
                    placeholder="000000"
                  />
                  <p
                    id="banese-edi7-help"
                    className={`text-[10px] font-semibold ${
                      baneseEdi7CodeEntered && !baneseEdi7CodeValid
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {baneseEdi7CodeEntered && !baneseEdi7CodeValid
                      ? `Faltam ${6 - credentialForm.baneseEdi7Code.length} dígito(s). O código deve ter exatamente 6.`
                      : 'Usado somente na troca de arquivos CNAB. Não participa do teste OAuth do boleto.'}
                  </p>
                </label>
                <TextInput
                  icon={Landmark}
                  label="Agência"
                  value={credentialForm.baneseAgencia}
                  onChange={(value) => updateCredentialForm('baneseAgencia', value)}
                  configured
                  readOnly
                />
                <TextInput
                  icon={Landmark}
                  label="Conta"
                  value={credentialForm.baneseConta}
                  onChange={(value) => updateCredentialForm('baneseConta', value)}
                  configured
                  readOnly
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

          {credentialProviderCode === 'banese_card' ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                Baixa e Liquidação Automática Banese
              </p>
              <p className="mt-1.5 text-xs font-semibold leading-relaxed text-emerald-950">
                Conforme informado pelo banco, o Banese não utiliza Webhooks para cobrança. A presença em PagamentosEfetivados é a confirmação canônica e prevalece sobre o código de situação; o CNAB240 chega depois pela VAN EDI7 em produção.
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Webhook de {credentialProvider?.name}
                  </p>
                  <code className="mt-1 block truncate text-xs font-bold text-slate-600">
                    {webhookAvailable
                      ? webhookUrl || 'URL será gerada após salvar'
                      : 'Indisponível até homologar o consumidor de callbacks do Banco Inter'}
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
              {credentialProviderCode === 'banco_inter' && (
                <p className="mt-3 text-xs font-semibold leading-relaxed text-amber-700">
                  A API atual apenas valida as credenciais do BolePix V3. Nenhuma URL deve ser cadastrada no Inter enquanto emissão, assinatura e repetição dos callbacks não estiverem implementadas e homologadas.
                </p>
              )}
            </div>
          )}

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
