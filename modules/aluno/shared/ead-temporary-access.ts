/** A trust grant grants course access only, never financial settlement. */
export const hasTemporaryEadAccess = (enrollment: {
  status?: string | null;
  acesso_temporario_ate?: string | null;
  turmas?: { cursos?: { modalidade?: string | null } | null } | null;
} | null | undefined, now = Date.now()) => {
  if (String(enrollment?.turmas?.cursos?.modalidade || '').toUpperCase() !== 'EAD') return false;
  if (!['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO']
    .includes(String(enrollment?.status || '').toUpperCase())) return false;
  const expiry = Date.parse(enrollment?.acesso_temporario_ate || '');
  return Number.isFinite(expiry) && expiry > now;
};

export const isHomeEnrollmentVisible = (enrollment: Parameters<typeof hasTemporaryEadAccess>[0]) =>
  ['ATIVO', 'CONCLUIDO', 'EM_DEPENDENCIA'].includes(String(enrollment?.status || '').toUpperCase())
  || hasTemporaryEadAccess(enrollment);
