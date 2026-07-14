import { isValidCpf, isValidEmail, normalizeEmail } from '../../../shared/utils/identityValidation';

export function validateAlunoProfessorIdentity(data: any) {
  const tipo = data?.tipo;
  if (tipo !== 'Aluno' && tipo !== 'Professor') return;

  const hasCpf = Object.prototype.hasOwnProperty.call(data, 'cpf') || Object.prototype.hasOwnProperty.call(data, 'cpf_cnpj');
  const hasEmail = Object.prototype.hasOwnProperty.call(data, 'email');

  if (hasCpf) {
    const cpf = data?.cpf || data?.cpf_cnpj;
    if (!isValidCpf(cpf || '')) {
      throw new Error(`CPF inválido para cadastro de ${tipo.toLowerCase()}.`);
    }
  }

  if (hasEmail) {
    if (!isValidEmail(data?.email || '')) {
      throw new Error(`E-mail inválido para cadastro de ${tipo.toLowerCase()}. Ele será usado como login.`);
    }
    data.email = normalizeEmail(data.email);
  }
}
