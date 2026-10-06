import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { formatCep, lookupBrazilianCep } from '../../shared/utils/brazilianCep';
import { formatCpf } from '../../shared/utils/identityValidation';
import {
  getTechnicalEnrollmentMissingFields,
  normalizeTechnicalDocumentType,
} from '../../shared/utils/technicalEnrollmentRequirements';
import { PerfilData, PerfilSituacaoEnsinoMedio, PerfilUpdatePayload } from './perfil.types';

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
  const [nacionalidadeCodigoIso3, setNacionalidadeCodigoIso3] = useState('');
  const [naturalidade, setNaturalidade] = useState('');
  const [naturalidadeCodigoIbge, setNaturalidadeCodigoIbge] = useState('');
  const [naturalidadeUf, setNaturalidadeUf] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [rg, setRg] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('');
  const [rgUfEmissao, setRgUfEmissao] = useState('');
  const [rgDataEmissao, setRgDataEmissao] = useState('');
  const [nomeMae, setNomeMae] = useState('');
  const [nomePai, setNomePai] = useState('');
  const [escolaridadeAnterior, setEscolaridadeAnterior] = useState('');
  const [instituicaoOrigem, setInstituicaoOrigem] = useState('');
  const [anoConclusaoEnsinoMedio, setAnoConclusaoEnsinoMedio] = useState('');
  const [situacaoEnsinoMedio, setSituacaoEnsinoMedio] = useState<PerfilSituacaoEnsinoMedio>('');
  const [serieEnsinoMedioAtual, setSerieEnsinoMedioAtual] = useState('');
  const [escolaEnsinoMedio, setEscolaEnsinoMedio] = useState('');
  const [anoPrevistoConclusaoEnsinoMedio, setAnoPrevistoConclusaoEnsinoMedio] = useState('');
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
    const nationality = profile?.nacionalidade || 'BRASILEIRA';
    setNacionalidade(nationality);
    setNacionalidadeCodigoIso3(
      profile?.nacionalidadeCodigoIso3
      || (/^BRASILEIR(?:A|O(?:\s*\(A\))?)$/i.test(nationality.trim()) ? 'BRA' : ''),
    );
    setNaturalidade(profile?.naturalidade || '');
    setNaturalidadeCodigoIbge(profile?.naturalidadeCodigoIbge || '');
    setNaturalidadeUf(profile?.naturalidadeUf || '');
    setTipoDocumento(normalizeTechnicalDocumentType(profile?.tipoDocumento));
    setRg(profile?.rg || '');
    setOrgaoEmissor(profile?.orgaoEmissor || '');
    setRgUfEmissao(profile?.rgUfEmissao || '');
    setRgDataEmissao(profile?.rgDataEmissao || '');
    setNomeMae(profile?.nomeMae || '');
    setNomePai(profile?.nomePai || '');
    setEscolaridadeAnterior(profile?.escolaridadeAnterior || '');
    setInstituicaoOrigem(profile?.instituicaoOrigem || '');
    setAnoConclusaoEnsinoMedio(profile?.anoConclusaoEnsinoMedio || '');
    const legacySchoolSituation = profile?.escolaridadeAnterior === 'CURSANDO ENSINO MÉDIO'
      ? 'CURSANDO'
      : profile?.escolaridadeAnterior === 'ENSINO MÉDIO COMPLETO'
        ? 'CONCLUIDO'
        : '';
    setSituacaoEnsinoMedio(
      (profile?.situacaoEnsinoMedio || profile?.situacao_ensino_medio || legacySchoolSituation) as PerfilSituacaoEnsinoMedio,
    );
    setSerieEnsinoMedioAtual(String(profile?.serieEnsinoMedioAtual ?? profile?.serie_ensino_medio_atual ?? ''));
    setEscolaEnsinoMedio(
      profile?.escolaEnsinoMedio
      || profile?.escola_ensino_medio
      || profile?.instituicaoOrigem
      || '',
    );
    setAnoPrevistoConclusaoEnsinoMedio(String(
      profile?.anoPrevistoConclusaoEnsinoMedio
      ?? profile?.anoPrevisaoConclusaoEnsinoMedio
      ?? profile?.ano_previsto_conclusao_ensino_medio
      ?? '',
    ));
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
    { label: 'Nome da mãe (obrigatório para matrícula técnica)', value: nomeMae, setter: setNomeMae, placeholder: 'Nome completo' },
    { label: 'Nome do pai (opcional)', value: nomePai, setter: setNomePai, placeholder: 'Opcional' },
    { label: 'Responsável', value: responsavelNome, setter: setResponsavelNome, placeholder: 'Se aplicável' },
    { label: 'CPF responsável', value: responsavelCpf, setter: setResponsavelCpf, placeholder: '000.000.000-00' },
    { label: 'Telefone responsável', value: responsavelTelefone, setter: setResponsavelTelefone, placeholder: '(00) 00000-0000' },
    { label: 'E-mail responsável', value: responsavelEmail, setter: setResponsavelEmail, placeholder: 'responsavel@email.com' },
  ];

  const getDraftProfile = (payload?: Partial<PerfilUpdatePayload>) => ({
    ...(profile || {}),
    telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
    dataNascimento, sexo, estadoCivil, nacionalidade, nacionalidadeCodigoIso3,
    naturalidade, naturalidadeCodigoIbge, naturalidadeUf,
    tipoDocumento, rg, orgaoEmissor, rgUfEmissao, rgDataEmissao,
    nomeMae, nomePai, escolaridadeAnterior, instituicaoOrigem, anoConclusaoEnsinoMedio,
    situacaoEnsinoMedio, serieEnsinoMedioAtual, escolaEnsinoMedio,
    anoPrevistoConclusaoEnsinoMedio,
    // Compatibilidade com o nome camelCase legado ainda retornado pelo mapper.
    anoPrevisaoConclusaoEnsinoMedio: anoPrevistoConclusaoEnsinoMedio,
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
  const handleDocumentTypeChange = (value: string) => {
    const normalized = normalizeTechnicalDocumentType(value);
    setTipoDocumento(normalized);
  };

  const submit = () => {
    const payload = {
      telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
      dataNascimento, sexo, estadoCivil, nacionalidade, nacionalidadeCodigoIso3,
      naturalidade, naturalidadeCodigoIbge, naturalidadeUf,
      tipoDocumento, rg, orgaoEmissor, rgUfEmissao, rgDataEmissao,
      nomeMae, nomePai, escolaridadeAnterior, instituicaoOrigem, anoConclusaoEnsinoMedio,
      situacaoEnsinoMedio, serieEnsinoMedioAtual, escolaEnsinoMedio,
      anoPrevistoConclusaoEnsinoMedio,
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
    nacionalidade, setNacionalidade, nacionalidadeCodigoIso3, setNacionalidadeCodigoIso3,
    naturalidade, setNaturalidade, naturalidadeCodigoIbge, setNaturalidadeCodigoIbge,
    naturalidadeUf, setNaturalidadeUf, cpf: formatCpf(profile?.cpf || profile?.cpf_cnpj || ''),
    tipoDocumento, setTipoDocumento, handleDocumentTypeChange, rg, setRg,
    orgaoEmissor, setOrgaoEmissor, rgUfEmissao, setRgUfEmissao,
    rgDataEmissao, setRgDataEmissao, nomeMae, nomePai,
    escolaridadeAnterior, setEscolaridadeAnterior, instituicaoOrigem,
    anoConclusaoEnsinoMedio, situacaoEnsinoMedio, setSituacaoEnsinoMedio,
    serieEnsinoMedioAtual, setSerieEnsinoMedioAtual, escolaEnsinoMedio,
    setEscolaEnsinoMedio, anoPrevistoConclusaoEnsinoMedio,
    setAnoPrevistoConclusaoEnsinoMedio, setAnoConclusaoEnsinoMedio,
    responsavelNome, responsavelCpf, responsavelParentesco,
    setResponsavelParentesco, responsavelTelefone, responsavelEmail,
    responsavelFinanceiro, setResponsavelFinanceiro, supplementalFields,
    technicalMissingFields, updateUppercase, submit,
  };
};

export type PerfilDadosForm = ReturnType<typeof usePerfilDadosForm>;
