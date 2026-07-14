import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { formatCep, lookupBrazilianCep } from '../../shared/utils/brazilianCep';
import { getTechnicalEnrollmentMissingFields } from '../../shared/utils/technicalEnrollmentRequirements';
import { PerfilData, PerfilUpdatePayload } from './perfil.types';

export type CepStatus = 'idle' | 'loading' | 'resolved' | 'not-found' | 'error';

export interface TextFieldConfig {
  label: string;
  value: string;
  setter: Dispatch<SetStateAction<string>>;
  placeholder: string;
}

type Options = {
  profile: PerfilData;
  editing: boolean;
  technicalEnrollmentNotice: boolean;
  onSave: Dispatch<PerfilUpdatePayload>;
};

export const readProfileValue = (value: string | null | undefined, fallback = '—') => value || fallback;

export const usePerfilDadosForm = ({ profile, editing, technicalEnrollmentNotice, onSave }: Options) => {
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [nacionalidade, setNacionalidade] = useState('');
  const [naturalidade, setNaturalidade] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
  const [rg, setRg] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('');
  const [rgUfEmissao, setRgUfEmissao] = useState('');
  const [rgDataEmissao, setRgDataEmissao] = useState('');
  const [nomeMae, setNomeMae] = useState('');
  const [nomePai, setNomePai] = useState('');
  const [escolaridadeAnterior, setEscolaridadeAnterior] = useState('');
  const [instituicaoOrigem, setInstituicaoOrigem] = useState('');
  const [anoConclusaoEnsinoMedio, setAnoConclusaoEnsinoMedio] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelCpf, setResponsavelCpf] = useState('');
  const [responsavelParentesco, setResponsavelParentesco] = useState('');
  const [responsavelTelefone, setResponsavelTelefone] = useState('');
  const [responsavelEmail, setResponsavelEmail] = useState('');
  const [responsavelFinanceiro, setResponsavelFinanceiro] = useState(false);

  useEffect(() => {
    setTelefone(profile?.telefone || '');
    setCep(profile?.cep || '');
    setEndereco(profile?.endereco || '');
    setNumero(profile?.numero || '');
    setComplemento(profile?.complemento || '');
    setBairro(profile?.bairro || '');
    setCidade(profile?.cidade || '');
    setUf(profile?.uf || '');
    setCepStatus('idle');
    setDataNascimento(profile?.dataNascimento || '');
    setSexo(profile?.sexo || '');
    setEstadoCivil(profile?.estadoCivil || '');
    setNacionalidade(profile?.nacionalidade || 'Brasileira');
    setNaturalidade(profile?.naturalidade || '');
    setTipoDocumento(profile?.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
    setRg(profile?.rg || '');
    setOrgaoEmissor(profile?.orgaoEmissor || '');
    setRgUfEmissao(profile?.rgUfEmissao || '');
    setRgDataEmissao(profile?.rgDataEmissao || '');
    setNomeMae(profile?.nomeMae || '');
    setNomePai(profile?.nomePai || '');
    setEscolaridadeAnterior(profile?.escolaridadeAnterior || '');
    setInstituicaoOrigem(profile?.instituicaoOrigem || '');
    setAnoConclusaoEnsinoMedio(profile?.anoConclusaoEnsinoMedio || '');
    setResponsavelNome(profile?.responsavelNome || '');
    setResponsavelCpf(profile?.responsavelCpf || '');
    setResponsavelParentesco(profile?.responsavelParentesco || '');
    setResponsavelTelefone(profile?.responsavelTelefone || '');
    setResponsavelEmail(profile?.responsavelEmail || '');
    setResponsavelFinanceiro(Boolean(profile?.responsavelFinanceiro));
  }, [profile]);

  useEffect(() => {
    if (!editing) return undefined;

    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepStatus('idle');
      return undefined;
    }

    const controller = new globalThis.AbortController();
    const timer = window.setTimeout(async () => {
      setCepStatus('loading');
      try {
        const address = await lookupBrazilianCep(cep, controller.signal);
        if (!address) {
          setCepStatus('not-found');
          return;
        }

        setCep(address.cep);
        setEndereco((current) => address.endereco || current);
        setBairro((current) => address.bairro || current);
        setCidade(address.cidade);
        setUf(address.uf);
        setCepStatus('resolved');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCepStatus('error');
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cep, editing]);

  const supplementalFields: TextFieldConfig[] = [
    { label: 'Data de nascimento', value: dataNascimento, setter: setDataNascimento, placeholder: 'DD/MM/AAAA' },
    { label: 'Naturalidade', value: naturalidade, setter: setNaturalidade, placeholder: 'Cidade/UF' },
    { label: 'Nacionalidade', value: nacionalidade, setter: setNacionalidade, placeholder: 'Brasileira' },
    { label: 'Órgão emissor', value: orgaoEmissor, setter: setOrgaoEmissor, placeholder: 'SSP, DETRAN...' },
    { label: 'UF emissão', value: rgUfEmissao, setter: setRgUfEmissao, placeholder: 'SE' },
    { label: 'Data emissão', value: rgDataEmissao, setter: setRgDataEmissao, placeholder: 'DD/MM/AAAA' },
    { label: 'Nome da mãe', value: nomeMae, setter: setNomeMae, placeholder: 'Nome completo' },
    { label: 'Nome do pai', value: nomePai, setter: setNomePai, placeholder: 'Opcional' },
    { label: 'Instituição de origem', value: instituicaoOrigem, setter: setInstituicaoOrigem, placeholder: 'Escola/faculdade anterior' },
    { label: 'Ano conclusão ensino médio', value: anoConclusaoEnsinoMedio, setter: setAnoConclusaoEnsinoMedio, placeholder: 'Ex: 2022' },
    { label: 'Responsável', value: responsavelNome, setter: setResponsavelNome, placeholder: 'Se aplicável' },
    { label: 'CPF responsável', value: responsavelCpf, setter: setResponsavelCpf, placeholder: '000.000.000-00' },
    { label: 'Telefone responsável', value: responsavelTelefone, setter: setResponsavelTelefone, placeholder: '(00) 00000-0000' },
    { label: 'E-mail responsável', value: responsavelEmail, setter: setResponsavelEmail, placeholder: 'responsavel@email.com' },
  ];

  const getDraftProfile = (payload?: Partial<PerfilUpdatePayload>) => ({
    ...(profile || {}),
    telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
    dataNascimento, sexo, estadoCivil, nacionalidade, naturalidade,
    tipoDocumento, rg, orgaoEmissor, rgUfEmissao, rgDataEmissao,
    nomeMae, nomePai, escolaridadeAnterior, instituicaoOrigem, anoConclusaoEnsinoMedio,
    responsavelNome, responsavelCpf, responsavelParentesco, responsavelTelefone,
    responsavelEmail, responsavelFinanceiro,
    ...payload,
  });

  const technicalMissingFields = getTechnicalEnrollmentMissingFields(getDraftProfile());
  const updateUppercase = (setter: Dispatch<SetStateAction<string>>) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => setter(event.target.value.toLocaleUpperCase('pt-BR'));
  const handleCepChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCepStatus('idle');
    setCep(formatCep(event.target.value));
  };

  const submit = () => {
    const payload = {
      telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
      dataNascimento, sexo, estadoCivil, nacionalidade, naturalidade,
      tipoDocumento, rg, orgaoEmissor, rgUfEmissao, rgDataEmissao,
      nomeMae, nomePai, escolaridadeAnterior, instituicaoOrigem, anoConclusaoEnsinoMedio,
      responsavelNome, responsavelCpf, responsavelParentesco, responsavelTelefone,
      responsavelEmail, responsavelFinanceiro,
    };
    const missingFields = getTechnicalEnrollmentMissingFields(getDraftProfile(payload));
    if (technicalEnrollmentNotice && missingFields.length > 0) {
      alert(`Para continuar a inscrição técnica, complete: ${missingFields.map((item) => item.label).join(', ')}.`);
      return false;
    }
    onSave(payload);
    return true;
  };

  return {
    telefone, setTelefone, cep, endereco, setEndereco, numero, setNumero,
    complemento, setComplemento, bairro, setBairro, cidade, setCidade, uf, setUf,
    cepStatus, handleCepChange, dataNascimento, sexo, setSexo, estadoCivil, setEstadoCivil,
    nacionalidade, naturalidade, tipoDocumento, setTipoDocumento, rg, setRg,
    orgaoEmissor, rgUfEmissao, rgDataEmissao, nomeMae, nomePai,
    escolaridadeAnterior, setEscolaridadeAnterior, instituicaoOrigem,
    anoConclusaoEnsinoMedio, responsavelNome, responsavelCpf, responsavelParentesco,
    setResponsavelParentesco, responsavelTelefone, responsavelEmail,
    responsavelFinanceiro, setResponsavelFinanceiro, supplementalFields,
    technicalMissingFields, updateUppercase, submit,
  };
};

export type PerfilDadosForm = ReturnType<typeof usePerfilDadosForm>;
