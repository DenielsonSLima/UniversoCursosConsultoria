const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/perfil\/[a-z0-9][a-z0-9_.-]*$/i;
const TYPES = new Set(['carteirinha', 'cracha_estagio']);

export const signPublicDocumentPhoto = async (admin: any, input: unknown) => {
  const payload = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const path = typeof payload.path === 'string' ? payload.path : '';
  const code = typeof payload.code === 'string'
    ? payload.code.replace(/\s+/g, '').toUpperCase() : '';
  if (!PATH.test(path) || code.length < 5 || code.length > 200) return null;

  // A RPC canônica cruza o snapshot de emissão e a política atual, aplica o
  // kill switch e calcula revogação/validade/vínculo. O código é a capability.
  const { data, error } = await admin.rpc('validar_documento_por_codigo', { p_codigo: code });
  if (error || !data || data.code !== code || data.status !== 'ACTIVE'
    || !TYPES.has(data.type) || !Array.isArray(data.visibleFields)
    || !data.visibleFields.includes('studentPhotoUrl')
    || data.studentPhotoUrl !== `profile-photo://${path}`) return null;

  const { data: signed, error: signError } = await admin.storage
    .from('fotos-perfil').createSignedUrl(path, 300);
  if (signError || !signed?.signedUrl) return null;
  return { signedUrl: signed.signedUrl };
};
