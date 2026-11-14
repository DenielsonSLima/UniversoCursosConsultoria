export interface ProfessorProfileForm {
  nomeCompleto: string;
  dataNascimento: string;
  telefone: string;
  tipoDocumento: string;
  rg: string;
  orgaoEmissor: string;
  rgUfEmissao: string;
  rgDataEmissao: string;
  especialidade: string;
  registroProfissional: string;
  numeroRegistro: string;
  banco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  chavePix: string;
}

export const professorProfileForm = (profile?: Record<string, any>): ProfessorProfileForm => ({
  nomeCompleto: profile?.nomeCompleto || profile?.nome || '',
  dataNascimento: profile?.dataNascimento || '',
  telefone: profile?.telefone || '',
  tipoDocumento: profile?.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
  rg: profile?.rg || '',
  orgaoEmissor: profile?.orgaoEmissor || '',
  rgUfEmissao: profile?.rgUfEmissao || '',
  rgDataEmissao: profile?.rgDataEmissao || '',
  especialidade: profile?.especialidade || '',
  registroProfissional: profile?.registroProfissional || '',
  numeroRegistro: profile?.numeroRegistro || '',
  banco: profile?.banco || '',
  agencia: profile?.agencia || '',
  conta: profile?.conta || '',
  tipoConta: profile?.tipoConta || 'CORRENTE',
  chavePix: profile?.chavePix || '',
});

export const maskProfessorProfileDate = (value: string) => value
  .replace(/\D/g, '')
  .replace(/(\d{2})(\d)/, '$1/$2')
  .replace(/(\d{2})(\d)/, '$1/$2')
  .slice(0, 10);

export const professorPasswordError = (password: string, confirmation: string) => {
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula e 1 número.';
  }
  return password === confirmation ? null : 'As senhas não conferem.';
};

export const PROFESSOR_PROFILE_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];
