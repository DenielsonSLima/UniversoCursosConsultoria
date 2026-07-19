import { formatCpfCnpj } from '../../../../../lib/documentFormatters';

export const normalizePhone = (phone?: string | null) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  const international = digits.startsWith('55') ? digits : `55${digits}`;
  if (/^55[1-9][0-9][6-9][0-9]{7}$/.test(international)) {
    return `${international.slice(0, 4)}9${international.slice(4)}`;
  }
  return international;
};

export const formatPhone = (phone?: string | null) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone || 'Não cadastrado';
};

export const formatDocument = (value?: string | null) =>
  formatCpfCnpj(value) || 'Não cadastrado';

export const initials = (name?: string | null) => (
  String(name || 'UN')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
);

export const formatMessageTime = (value?: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export const formatMessageDate = (value?: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
};

export const defaultMessageFor = (contact?: { nome?: string | null; tipo?: string | null }) => {
  const firstName = String(contact?.nome || '').split(' ')[0] || 'tudo bem';
  if (contact?.tipo === 'Aluno') return `Olá, ${firstName}! Aqui é da Universo Cursos. Podemos falar sobre seu atendimento?`;
  return `Olá! Aqui é da Universo Cursos. Podemos falar sobre seu cadastro conosco?`;
};
