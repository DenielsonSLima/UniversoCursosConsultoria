import { supabase } from '../../../../lib/supabase';

export type SignatureCategory = 'SECRETARIA' | 'COORDENADOR_CURSO' | 'PROFESSOR';
export type LegacySignatureKey = 'diretoriaGeral' | 'secretaria' | 'coordenacao';

interface SignaturePartnerRow {
  id: string;
  nome: string;
  email?: string | null;
  status?: string | null;
}

interface SignatureRegistryRow {
  id: string;
  categoria: SignatureCategory;
  parceiro_id?: string | null;
  nome: string;
  cargo: string;
  assinatura_url?: string | null;
  assinatura_path?: string | null;
  chave_legada?: LegacySignatureKey | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  parceiro?: SignaturePartnerRow | SignaturePartnerRow[] | null;
}

export interface SignatureRegistryItem {
  id: string;
  category: SignatureCategory;
  partnerId: string | null;
  name: string;
  role: string;
  signaturePath: string | null;
  signatureUrl: string | null;
  previewUrl: string | null;
  legacyKey: LegacySignatureKey | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  partner: SignaturePartnerRow | null;
}

export interface SignatureRegistryInput {
  id?: string;
  category: SignatureCategory;
  partnerId?: string | null;
  name: string;
  role: string;
  active?: boolean;
}

export interface SignatureProfessorOption {
  id: string;
  name: string;
  email: string | null;
  status: string;
}

const SIGNATURE_BUCKET = 'assinaturas';
const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;
const ALLOWED_SIGNATURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const ensureSignatureFile = (file: File) => {
  if (!ALLOWED_SIGNATURE_TYPES.has(file.type)) {
    throw new Error('Envie a assinatura em PNG, JPG ou WEBP.');
  }
  if (file.size <= 0 || file.size > MAX_SIGNATURE_SIZE) {
    throw new Error('A imagem da assinatura deve ter no máximo 2 MB.');
  }
};

const getSignedUrl = async (path?: string | null) => {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
};

/** Resolve somente caminhos do bucket privado canônico de assinaturas. */
export const getSignatureSignedUrl = (path?: string | null) => getSignedUrl(path);

const normalizePartner = (partner: SignatureRegistryRow['parceiro']) => {
  if (Array.isArray(partner)) return partner[0] || null;
  return partner || null;
};

const toRegistryItem = async (row: SignatureRegistryRow): Promise<SignatureRegistryItem> => {
  const partner = normalizePartner(row.parceiro);
  return {
    id: row.id,
    category: row.categoria,
    partnerId: row.parceiro_id || null,
    name: partner?.nome || row.nome,
    role: row.cargo,
    signaturePath: row.assinatura_path || null,
    signatureUrl: row.assinatura_url || null,
    previewUrl: row.assinatura_path
      ? await getSignedUrl(row.assinatura_path)
      : row.assinatura_url || null,
    legacyKey: row.chave_legada || null,
    active: row.ativo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    partner,
  };
};

const selectRegistry = () => supabase
  .from('assinaturas_pessoas')
  .select(`
    id,
    categoria,
    parceiro_id,
    nome,
    cargo,
    assinatura_url,
    assinatura_path,
    chave_legada,
    ativo,
    created_at,
    updated_at,
    parceiro:parceiros!assinaturas_pessoas_parceiro_id_fkey(id,nome,email,status)
  `);

const uploadSignature = async (
  path: string,
  file: File,
  options: { upsert?: boolean } = {},
) => {
  ensureSignatureFile(file);
  const { data, error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, file, {
      cacheControl: '0',
      contentType: file.type,
      upsert: options.upsert ?? true,
    });
  if (error) throw error;
  if (!data?.path) throw new Error('O Storage não retornou o caminho da assinatura.');
  return data.path;
};

export const assinaturasRegistryService = {
  validateFile(file: File): void {
    ensureSignatureFile(file);
  },

  async list(category: SignatureCategory): Promise<SignatureRegistryItem[]> {
    const { data, error } = await selectRegistry()
      .eq('categoria', category)
      .order('ativo', { ascending: false })
      .order('nome', { ascending: true });
    if (error) throw error;
    return Promise.all(((data || []) as unknown as SignatureRegistryRow[]).map(toRegistryItem));
  },

  async getProfessorSignature(professorId: string): Promise<SignatureRegistryItem | null> {
    const { data, error } = await selectRegistry()
      .eq('categoria', 'PROFESSOR')
      .eq('parceiro_id', professorId)
      .maybeSingle();
    if (error) throw error;
    return data ? toRegistryItem(data as unknown as SignatureRegistryRow) : null;
  },

  async listProfessorOptions(): Promise<SignatureProfessorOption[]> {
    const { data, error } = await supabase
      .from('parceiros')
      .select('id,nome,email,status')
      .eq('tipo', 'Professor')
      .order('nome', { ascending: true });
    if (error) throw error;
    return (data || []).map((professor) => ({
      id: professor.id,
      name: professor.nome,
      email: professor.email || null,
      status: professor.status || '',
    }));
  },

  async save(input: SignatureRegistryInput): Promise<SignatureRegistryItem> {
    const payload = {
      categoria: input.category,
      parceiro_id: input.category === 'PROFESSOR' ? input.partnerId || null : null,
      nome: input.name.trim(),
      cargo: input.role.trim(),
      ativo: input.active ?? true,
    };
    if (!payload.nome) throw new Error('Informe o nome do assinante.');
    if (input.category === 'PROFESSOR' && !payload.parceiro_id) {
      throw new Error('Selecione um professor já cadastrado.');
    }

    const query = input.id
      ? supabase.from('assinaturas_pessoas').update(payload).eq('id', input.id)
      : supabase.from('assinaturas_pessoas').insert(payload);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return toRegistryItem(data as SignatureRegistryRow);
  },

  async uploadForRegistryItem(item: SignatureRegistryItem, file: File): Promise<SignatureRegistryItem> {
    const folder = item.category === 'PROFESSOR'
      ? `professores/${item.partnerId}`
      : `${item.category.toLowerCase()}/${item.id}`;
    const path = await uploadSignature(
      item.signaturePath || `${folder}/assinatura`,
      file,
    );
    const { data, error } = await supabase
      .from('assinaturas_pessoas')
      .update({ assinatura_path: path, assinatura_url: null })
      .eq('id', item.id)
      .select()
      .single();
    if (error) throw error;
    return toRegistryItem(data as SignatureRegistryRow);
  },

  async uploadMyProfessorSignature(professorId: string, file: File): Promise<SignatureRegistryItem> {
    ensureSignatureFile(file);

    const existingSignature = await this.getProfessorSignature(professorId);
    if (
      existingSignature?.signaturePath
      || existingSignature?.signatureUrl
      || existingSignature?.previewUrl
    ) {
      throw new Error(
        'Sua assinatura já está vinculada. Solicite à gestão qualquer alteração ou exclusão.',
      );
    }

    const path = `professores/${professorId}/assinatura`;
    let uploadError: unknown = null;

    try {
      await uploadSignature(path, file, { upsert: false });
    } catch (error) {
      // Pode existir um primeiro envio que concluiu no Storage, mas perdeu a
      // resposta antes do vínculo. O RPC abaixo finaliza esse mesmo arquivo;
      // ele nunca é sobrescrito pelo professor.
      uploadError = error;
    }

    const { error } = await supabase.rpc('salvar_minha_assinatura_professor', {
      p_assinatura_path: path,
    });
    if (error) {
      try {
        const linkedSignature = await this.getProfessorSignature(professorId);
        if (linkedSignature?.signaturePath === path) return linkedSignature;
      } catch {
        // Mantém abaixo o erro original do vínculo.
      }

      throw uploadError || error;
    }
    const signature = await this.getProfessorSignature(professorId);
    if (!signature) throw new Error('A assinatura foi enviada, mas o vínculo não foi localizado.');
    return signature;
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await supabase
      .from('assinaturas_pessoas')
      .update({ ativo: active })
      .eq('id', id);
    if (error) throw error;
  },

  async remove(item: SignatureRegistryItem): Promise<void> {
    if (item.signaturePath) {
      const { error: storageError } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .remove([item.signaturePath]);
      if (storageError) throw storageError;
    }
    const { error } = await supabase
      .from('assinaturas_pessoas')
      .delete()
      .eq('id', item.id);
    if (error) throw error;
  },

  async getLegacyMap(): Promise<Partial<Record<LegacySignatureKey, SignatureRegistryItem>>> {
    const { data, error } = await selectRegistry()
      .not('chave_legada', 'is', null)
      .eq('ativo', true);
    if (error) throw error;
    const items = await Promise.all(
      ((data || []) as unknown as SignatureRegistryRow[]).map(toRegistryItem),
    );
    return items.reduce<Partial<Record<LegacySignatureKey, SignatureRegistryItem>>>((map, item) => {
      if (item.legacyKey) map[item.legacyKey] = item;
      return map;
    }, {});
  },
};
