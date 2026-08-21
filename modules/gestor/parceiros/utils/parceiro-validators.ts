import { isValidCpf, isValidEmail, normalizeEmail } from '../../../shared/utils/identityValidation';

export function validateAlunoProfessorIdentity(data: any, options: { requireAlunoCpf?: boolean } = {}) {
  const tipo = data?.tipo;
  if (tipo !== 'Aluno' && tipo !== 'Professor') return;

  const hasCpf = Object.prototype.hasOwnProperty.call(data, 'cpf') || Object.prototype.hasOwnProperty.call(data, 'cpf_cnpj');
  const hasEmail = Object.prototype.hasOwnProperty.call(data, 'email');
  const cpf = data?.cpf || data?.cpf_cnpj;

  if (tipo === 'Aluno' && options.requireAlunoCpf && !isValidCpf(cpf || '')) {
    throw new Error('Informe um CPF válido para cadastrar o aluno.');
  }

  if (hasCpf) {
    const allowsBlankProfessorCpf = tipo === 'Professor' && !String(cpf || '').trim();
    if (!allowsBlankProfessorCpf && !isValidCpf(cpf || '')) {
      throw new Error(`CPF inválido para cadastro de ${tipo.toLowerCase()}.`);
    }
  }

  if (hasEmail) {
    const email = String(data?.email || '').trim();
    const allowsBlankProfessorEmail = tipo === 'Professor' && !email;
    if (!allowsBlankProfessorEmail && !isValidEmail(email)) {
      throw new Error(`E-mail inválido para cadastro de ${tipo.toLowerCase()}. Ele será usado como login.`);
    }
    if (email) data.email = normalizeEmail(email);
  }
}
