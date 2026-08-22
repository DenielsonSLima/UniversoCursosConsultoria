import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatCep, lookupBrazilianCep } from '../../shared/utils/brazilianCep';
import { isValidCpf, isValidEmail } from '../../shared/utils/identityValidation';
import { isPublicAlunoOlderThanTen } from './aluno-birth-date';
import type { AuthMessage } from './aluno-login.utils';

export type SignupStep = 'dados' | 'endereco';
export type CepStatus = 'idle' | 'loading' | 'resolved' | 'not-found' | 'error';

interface UseAlunoSignupFormOptions {
  setMessage: (message: AuthMessage | null) => void;
}

export const useAlunoSignupForm = ({ setMessage }: UseAlunoSignupFormOptions) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [racaCor, setRacaCor] = useState('');
  const [password, setPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signupStep, setSignupStep] = useState<SignupStep>('dados');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');

  const passwordChecks = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const score = Number(hasMinLength)
      + Number(hasUppercase)
      + Number(hasLowercase)
      + Number(hasNumber);
    const strength = score >= 3 ? 'Forte' : score >= 2 ? 'Médio' : 'Fraco';

    return { hasMinLength, hasUppercase, hasLowercase, hasNumber, score, strength } as const;
  }, [password]);

  useEffect(() => {
    if (signupStep !== 'endereco') return undefined;

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
        setEndereco(address.endereco);
        setBairro(address.bairro);
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
  }, [cep, signupStep]);

  const validateSignupPersonalData = () => {
    setMessage(null);

    if (nome.trim().length < 3) {
      setMessage({ tone: 'error', text: 'Informe o nome completo para continuar.' });
      return false;
    }
    if (!isValidEmail(email)) {
      setMessage({
        tone: 'error',
        text: 'Informe um e-mail válido. Ele será usado como login do aluno.',
      });
      return false;
    }
    if (!isValidCpf(cpf)) {
      setMessage({ tone: 'error', text: 'Informe um CPF válido para concluir o cadastro.' });
      return false;
    }
    if (!dataNascimento) {
      setMessage({
        tone: 'error',
        text: 'Informe a data de nascimento para concluir o cadastro.',
      });
      return false;
    }
    if (!isPublicAlunoOlderThanTen(dataNascimento)) {
      setMessage({
        tone: 'error',
        text: 'O cadastro é permitido somente para alunos com mais de 10 anos de idade.',
      });
      return false;
    }
    if (!sexo) {
      setMessage({ tone: 'error', text: 'Selecione uma opção de sexo para continuar.' });
      return false;
    }
    if (!racaCor) {
      setMessage({ tone: 'error', text: 'Selecione uma opção de raça/cor para continuar.' });
      return false;
    }
    if (telefone.replace(/\D/g, '').length < 10) {
      setMessage({ tone: 'error', text: 'Informe um WhatsApp válido para continuar.' });
      return false;
    }
    if (
      password.length < 8
      || !/[A-Z]/.test(password)
      || !/[a-z]/.test(password)
      || !/\d/.test(password)
    ) {
      setMessage({
        tone: 'error',
        text: 'A senha deve ter no mínimo 8 caracteres, 1 letra maiúscula, 1 letra minúscula e 1 número.',
      });
      return false;
    }
    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return false;
    }
    if (!acceptedTerms) {
      setMessage({
        tone: 'error',
        text: 'Você precisa aceitar os Termos de Uso para finalizar o cadastro.',
      });
      return false;
    }
    return true;
  };

  const validateSignupAddress = () => {
    if (cep.replace(/\D/g, '').length !== 8) {
      setMessage({ tone: 'error', text: 'Informe um CEP válido com 8 números.' });
      return false;
    }
    if (
      !endereco.trim()
      || !numero.trim()
      || !bairro.trim()
      || !cidade.trim()
      || uf.trim().length !== 2
    ) {
      setMessage({
        tone: 'error',
        text: 'Complete endereço, número, bairro, cidade e UF para concluir o cadastro.',
      });
      return false;
    }
    return true;
  };

  const handleSignupNext = (event: FormEvent) => {
    event.preventDefault();
    if (!validateSignupPersonalData()) return;
    setSignupStep('endereco');
    setMessage(null);
  };

  return {
    values: {
      nome,
      email,
      telefone,
      cpf,
      dataNascimento,
      sexo,
      racaCor,
      password,
      acceptedTerms,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
    },
    cardProps: {
      nome,
      cpf,
      dataNascimento,
      sexo,
      racaCor,
      telefone,
      email,
      password,
      showSignupPassword,
      confirmPassword,
      showSignupConfirmPassword,
      acceptedTerms,
      signupStep,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      cepStatus,
      passwordChecks,
      onNomeChange: (value: string) => setNome(value.toLocaleUpperCase('pt-BR')),
      onCpfChange: setCpf,
      onDataNascimentoChange: setDataNascimento,
      onSexoChange: setSexo,
      onRacaCorChange: setRacaCor,
      onTelefoneChange: setTelefone,
      onEmailChange: setEmail,
      onPasswordChange: setPassword,
      onToggleSignupPassword: () => setShowSignupPassword((previous) => !previous),
      onConfirmPasswordChange: setConfirmPassword,
      onToggleSignupConfirmPassword: () => setShowSignupConfirmPassword((previous) => !previous),
      onAcceptedTermsChange: setAcceptedTerms,
      onCepChange: (value: string) => {
        setCepStatus('idle');
        setCep(formatCep(value));
      },
      onEnderecoChange: (value: string) => setEndereco(value.toLocaleUpperCase('pt-BR')),
      onNumeroChange: (value: string) => setNumero(value.toLocaleUpperCase('pt-BR')),
      onComplementoChange: (value: string) => setComplemento(value.toLocaleUpperCase('pt-BR')),
      onBairroChange: (value: string) => setBairro(value.toLocaleUpperCase('pt-BR')),
      onCidadeChange: (value: string) => setCidade(value.toLocaleUpperCase('pt-BR')),
      onUfChange: (value: string) => setUf(value.toLocaleUpperCase('pt-BR').slice(0, 2)),
    },
    setSignupStep,
    validateSignupPersonalData,
    validateSignupAddress,
    handleSignupNext,
  };
};
