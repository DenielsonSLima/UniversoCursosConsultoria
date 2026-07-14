export type AuthMode = 'login' | 'cadastro';

export type AuthMessage = {
  tone: 'success' | 'error';
  text: string;
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

const readAuthReturnParams = () => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);

  return { hashParams, searchParams };
};

export const getAuthReturnError = () => {
  const { hashParams, searchParams } = readAuthReturnParams();
  return (
    hashParams.get('error_description') ||
    searchParams.get('error_description') ||
    hashParams.get('error_code') ||
    searchParams.get('error_code') ||
    hashParams.get('error') ||
    searchParams.get('error')
  );
};

export const getAuthReturnCode = () => {
  const { searchParams } = readAuthReturnParams();
  return searchParams.get('code');
};

export const clearAuthReturnParams = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${window.location.hash}`);
};

export const hasAuthReturnInUrl = () => (
  window.location.hash.includes('access_token') ||
  Boolean(getAuthReturnCode()) ||
  Boolean(getAuthReturnError())
);
