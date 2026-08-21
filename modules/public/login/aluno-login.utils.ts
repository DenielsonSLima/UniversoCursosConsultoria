export type AuthMode = 'login' | 'cadastro';

export type AuthMessage = {
  tone: 'success' | 'error';
  text: string;
  action?: 'existing-account' | 'request-new-link';
};

export type PasswordChecks = {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  score: number;
  strength: 'Forte' | 'Médio' | 'Fraco';
};

export const formatCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
};

export const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length > 0) return `(${digits}`;
  return digits;
};
