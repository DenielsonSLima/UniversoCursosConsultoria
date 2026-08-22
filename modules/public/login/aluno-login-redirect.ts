export const openAlunoAppDocument = (path: string): boolean => {
  if (path !== '/aluno' && !path.startsWith('/aluno/')) return false;

  // O Safari captura manifesto, nome e ícone no carregamento do documento.
  // Uma navegação completa impede que a identidade global do site permaneça
  // em cache quando o aluno entra no portal a partir do login público.
  window.location.replace(path);
  return true;
};

export const isExpiredAuthLink = (message: string) => {
  // Não disparamos e-mail daqui: o CTA abre o fluxo protegido por Turnstile,
  // sem expor se o endereço possui uma conta. "invalid" isolado é comum em
  // callbacks OAuth e não deve ser confundido com um convite vencido.
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('token')
    || lower.includes('expired')
    || lower.includes('otp')
  );
};

export const EXPIRED_AUTH_LINK_MESSAGE =
  'Este link de acesso expirou ou já foi usado. Se este era seu primeiro acesso, você ainda não possui senha: solicite um novo link para criar sua senha e aceitar os termos. Se sua conta já estava ativa, use o mesmo fluxo para recuperar a senha.';
