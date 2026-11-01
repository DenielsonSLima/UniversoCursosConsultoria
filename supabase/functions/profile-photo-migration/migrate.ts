type Job = { sourcePath: string; targetPath: string; partnerId: string | null; status: string; sha256: string | null };
const digest = async (blob: Blob) => {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const rpc = async (admin: any, name: string, payload: unknown) => {
  const { data, error } = await admin.rpc(name, payload);
  if (error) throw new Error('MIGRATION_STATE_REJECTED');
  return data;
};

// O Storage legado pode transportar not_found/404 dentro de HTTP400.
// Só confirme esse caso pelo GET público da mesma URL, sem contornar o cache.
const legacyNotFound = async (response: Response) => {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    await response.body?.cancel();
    return false;
  }
  const reader = response.body?.getReader();
  if (!reader) return false;
  try {
    const decoder = new globalThis.TextDecoder();
    let size = 0;
    let text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) return false;
      text += decoder.decode(chunk.value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    return [404, '404'].includes(body?.statusCode)
      && ['NoSuchKey', 'not_found'].includes(body?.code || body?.error);
  } catch { return false; }
  finally { await reader.cancel().catch(() => {}); }
};

/** Autorização conferida pela Edge antes da fila; nunca retorna dados de pessoas. */
export const migrateProfilePhoto = async (
  admin: any,
  projectUrl: string,
  sourcePath: string,
  actorId: string,
  reason: string,
  fetcher: typeof fetch = fetch,
) => {
  const job = await rpc(admin, 'prepare_profile_photo_migration', {
    p_source_path: sourcePath, p_actor_id: actorId, p_reason: reason,
  }) as Job;
  if (job.status === 'completed') return { completed: true, quarantined: !job.partnerId };
  const source = admin.storage.from('documentos');
  const target = admin.storage.from('fotos-perfil');
  const original = await source.download(job.sourcePath);
  if (original.error && job.status !== 'finalized') throw new Error('MIGRATION_SOURCE_UNAVAILABLE');

  let destination = await target.download(job.targetPath);
  if (destination.error) {
    if (original.error) throw new Error('MIGRATION_COPY_UNAVAILABLE');
    const copied = await source.copy(job.sourcePath, job.targetPath, { destinationBucket: 'fotos-perfil' });
    if (copied.error) throw new Error('MIGRATION_COPY_FAILED');
    destination = await target.download(job.targetPath);
  }
  if (destination.error || !destination.data) throw new Error('MIGRATION_COPY_UNAVAILABLE');
  const destinationHash = await digest(destination.data);
  const sourceHash = original.data ? await digest(original.data) : job.sha256;
  if (!sourceHash || destinationHash !== sourceHash || (job.sha256 && job.sha256 !== sourceHash)) {
    throw new Error('MIGRATION_HASH_MISMATCH');
  }
  await rpc(admin, 'verify_profile_photo_migration', { p_source_path: sourcePath, p_sha256: sourceHash });
  await rpc(admin, 'finalize_profile_photo_migration', { p_source_path: sourcePath });
  if (!original.error) {
    const removed = await source.remove([job.sourcePath]);
    if (removed.error) throw new Error('MIGRATION_PUBLIC_SOURCE_NOT_REMOVED');
  }

  // Remover a origem não remove cópias que alguém já baixou. O HEAD também
  // detecta propagação pendente no CDN e impede declarar esse job concluído.
  const encoded = job.sourcePath.split('/').map(encodeURIComponent).join('/');
  const publicUrl = new URL(`/storage/v1/object/public/documentos/${encoded}`, projectUrl);
  let inaccessible = false;
  let publicStatus: number | null = null;
  try {
    const response = await fetcher(publicUrl, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(5000) });
    publicStatus = response.status;
    inaccessible = [403, 404, 410].includes(response.status);
    if (response.status === 400) {
      const checked = await fetcher(publicUrl, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000) });
      inaccessible = [403, 404, 410].includes(checked.status);
      if (checked.status === 400) inaccessible = await legacyNotFound(checked);
      else await checked.body?.cancel();
    }
  } catch { /* Falha de rede não comprova revogação de acesso. */ }
  if (!inaccessible) return { completed: false, quarantined: !job.partnerId, pendingPublicCache: true, publicStatus };
  await rpc(admin, 'complete_profile_photo_migration', { p_source_path: sourcePath });
  return { completed: true, quarantined: !job.partnerId };
};
