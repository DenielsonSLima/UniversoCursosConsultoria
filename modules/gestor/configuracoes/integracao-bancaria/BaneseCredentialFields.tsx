import React from 'react';
import { FileText, Key, Landmark, ShieldCheck } from 'lucide-react';
import type { GatewayCredential } from './integracao-bancaria.service';
import type { CredentialFormState } from './integracao-bancaria.types';
import { normalizeBaneseEdi7Code } from './integracao-bancaria.validation';
import { TextInput } from './integracao-bancaria.ui';

interface BaneseCredentialFieldsProps {
  credentialForm: CredentialFormState;
  editCredential?: GatewayCredential;
  updateCredentialForm: (key: keyof CredentialFormState, value: string) => void;
  baneseEdi7CodeEntered: boolean;
  baneseEdi7CodeValid: boolean;
}

export default function BaneseCredentialFields({
  credentialForm, editCredential, updateCredentialForm, baneseEdi7CodeEntered, baneseEdi7CodeValid,
}: BaneseCredentialFieldsProps) {
  return (
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
  );
}
