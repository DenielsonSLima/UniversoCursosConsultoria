// File: modules/gestor/biblioteca/biblioteca.service.ts

import { supabase } from '../../../lib/supabase';
import {
  LibraryDocument,
  LibraryDocumentUploadPayload,
  LibraryFolder,
  TeacherRepository,
  TeacherStorageQuota
} from './biblioteca.types';

const LIBRARY_STORAGE_BUCKETS = ['biblioteca', 'anexos', 'documentos'];
const MAX_LIBRARY_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TEACHER_STORAGE_QUOTA_GB = 1;
const BYTES_PER_GB = 1024 * 1024 * 1024;
const ALLOWED_LIBRARY_FILE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
];

const normalizeFileName = (value: string) => {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 80);
};

const parseDbDecimal = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseDisplaySizeToBytes = (sizeText: string): number => {
  if (!sizeText) return 0;
  const raw = `${sizeText}`.trim().toLowerCase();
  const numberPart = raw.match(/([0-9]+(?:[.,][0-9]+)?)/)?.[1];
  if (!numberPart) return 0;

  const value = parseFloat(numberPart.replace(',', '.'));
  if (!Number.isFinite(value)) return 0;

  if (raw.includes('gb')) return Math.max(0, Math.round(value * BYTES_PER_GB));
  if (raw.includes('kb')) return Math.max(0, Math.round(value * 1024));
  if (raw.includes('mb')) return Math.max(0, Math.round(value * 1024 * 1024));
  if (raw.includes('bytes') || raw.includes('byte') || raw.includes('b')) {
    return Math.max(0, Math.round(value));
  }

  return Math.max(0, Math.round(value * 1024 * 1024));
};

const bytesToGb = (bytes: number) => {
  return bytes / BYTES_PER_GB;
};

const formatGb = (value: number) => {
  return Number.parseFloat(String(value)).toFixed(2);
};

const formatBytesForManager = (bytes: number) => {
  if (bytes >= BYTES_PER_GB) return `${formatGb(bytesToGb(bytes))} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const isAllowedLibraryFile = (file: File) => {
  if (file.size > MAX_LIBRARY_FILE_SIZE_BYTES) return false;
  if (ALLOWED_LIBRARY_FILE_MIME_TYPES.includes(file.type)) return true;

  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
  return !!extension && allowedExtensions.includes(extension);
};

const buildLibraryStoragePath = (file: File, title: string) => {
  const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const safeTitle = normalizeFileName(title || file.name.replace(/\.[^/.]+$/, ''));
  return `biblioteca/${Date.now()}_${randomSuffix}_${safeTitle}${ext.toLowerCase()}`;
};

const uploadLibraryFile = async (file: File, title: string) => {
  const path = buildLibraryStoragePath(file, title);

  const isRetryableStorageError = (error: any) => {
    const status = Number(error?.status || error?.statusCode || 0);
    const message = `${error?.message || ''}`.toLowerCase();
    return (
      status === 401 ||
      status === 403 ||
      status === 404 ||
      message.includes('bucket') ||
      message.includes('policy') ||
      message.includes('not found') ||
      message.includes('not authorized')
    );
  };

  let lastError = null as any;

  for (const bucketName of LIBRARY_STORAGE_BUCKETS) {
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream'
      });

    if (!error) {
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(path);
      return urlData?.publicUrl || null;
    }

    lastError = error;
    if (!isRetryableStorageError(error)) {
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

const getDefaultTeacherQuotaBytes = () => {
  return DEFAULT_TEACHER_STORAGE_QUOTA_GB * BYTES_PER_GB;
};

const getTeacherUsedBytes = async (teacherId: string): Promise<number> => {
  const { data: docUsageRows, error } = await supabase
    .from('biblioteca_documentos')
    .select('tamanho_bytes, tamanho')
    .eq('teacher_id', teacherId);

  if (error) {
    console.error('Erro ao buscar uso de storage por professor:', error);
    throw error;
  }

  return (docUsageRows || []).reduce((acc, row: any) => {
    const rawBytes = row?.tamanho_bytes;
    const directBytes = rawBytes === null || rawBytes === undefined ? Number.NaN : Number(rawBytes);
    const parsed = Number.isFinite(directBytes) ? directBytes : parseDisplaySizeToBytes(row?.tamanho || '');
    return acc + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
};

const getTeacherQuotaBytes = async (teacherId: string): Promise<number> => {
  const { data, error } = await supabase
    .from('biblioteca_professor_quotas')
    .select('max_storage_gb')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar quota de storage do professor:', error);
    throw error;
  }

  if (!data?.max_storage_gb) {
    return getDefaultTeacherQuotaBytes();
  }

  return Math.max(0, parseDbDecimal(data.max_storage_gb) * BYTES_PER_GB);
};

const assertTeacherStorageCapacity = async (teacherId: string, newFileBytes: number): Promise<void> => {
  if (!Number.isFinite(newFileBytes) || newFileBytes <= 0) {
    return;
  }

  const quotaBytes = await getTeacherQuotaBytes(teacherId);
  const usedBytes = await getTeacherUsedBytes(teacherId);

  if (usedBytes + newFileBytes > quotaBytes) {
    const quotaGb = bytesToGb(quotaBytes);
    throw new Error(
      `Limite de armazenamento excedido para este professor. ` +
      `Usado: ${formatBytesForManager(usedBytes)} de ${formatGb(quotaGb)} GB. `
      + `Novo total ficaria em ${formatBytesForManager(usedBytes + newFileBytes)}.`
    );
  }
};

const activeClassStatuses = new Set(['EM_ANDAMENTO', 'ATIVO']);

const normalizeIdList = (values?: string[] | null) => Array.from(
  new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))
);

export const bibliotecaService = {
  // 1. Buscar Documentos
  async getDocuments(filters?: { 
    pastaId?: string | null; 
    teacherId?: string | null; 
    search?: string;
  }): Promise<LibraryDocument[]> {
    let query = supabase
      .from('biblioteca_documentos')
      .select('*, polos(nome)');

    if (filters?.pastaId !== undefined) {
      if (filters.pastaId === null) {
        query = query.is('pasta_id', null);
      } else {
        query = query.eq('pasta_id', filters.pastaId);
      }
    }

    if (filters?.teacherId !== undefined) {
      if (filters.teacherId === null) {
        query = query.is('teacher_id', null);
      } else {
        query = query.eq('teacher_id', filters.teacherId);
      }
    }

    if (filters?.search) {
      query = query.or(`titulo.ilike.%${filters.search}%,descricao.ilike.%${filters.search}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao buscar documentos da biblioteca:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      poloName: doc.polos?.nome || '',
      acessos: doc.acessos || 0,
      teacherId: doc.teacher_id,
      authorName: doc.author_name,
      createdAt: doc.created_at,
      cursoIds: doc.curso_ids || [],
      turmaIds: doc.turma_ids || [],
      disciplinaIds: doc.disciplina_ids || [],
      liberacaoTipo: doc.liberacao_tipo || 'IMEDIATO',
      liberacaoData: doc.liberacao_data,
      liberacaoDisciplinaId: doc.liberacao_disciplina_id,
      liberacaoDiasValidade: doc.liberacao_dias_validade
    }));
  },

  // 2. Buscar Pastas
  async getFolders(
    parentId: string | null = null, 
    teacherId: string | null = null
  ): Promise<LibraryFolder[]> {
    if (parentId === null && teacherId !== null) {
      const { data: existingFolders, error: checkError } = await supabase
        .from('biblioteca_pastas')
        .select('id')
        .eq('teacher_id', teacherId)
        .is('parent_id', null);
      
      if (!checkError && (!existingFolders || existingFolders.length === 0)) {
        const { data: teacher } = await supabase
          .from('parceiros')
          .select('nome')
          .eq('id', teacherId)
          .single();
        
        if (teacher) {
          await supabase.from('biblioteca_pastas').insert({
            nome: `Arquivos de ${teacher.nome}`,
            teacher_id: teacherId,
            parent_id: null
          });
        }
      }
    }

    let query = supabase.from('biblioteca_pastas').select('*');

    if (parentId === null) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', parentId);
    }

    if (teacherId === null) {
      query = query.is('teacher_id', null);
    } else {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar pastas:', error);
      throw error;
    }

    return (data || []).map((folder: any) => ({
      id: folder.id,
      nome: folder.nome,
      parentId: folder.parent_id,
      teacherId: folder.teacher_id,
      createdAt: folder.created_at
    }));
  },

  async getFoldersForMove(
    teacherId: string | null = null
  ): Promise<Array<{ id: string; nome: string; parent_id: string | null }>> {
    let query = supabase.from('biblioteca_pastas').select('id, nome, parent_id');
    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    } else {
      query = query.is('teacher_id', null);
    }

    const { data, error } = await query.order('nome', { ascending: true });
    if (error) {
      console.error('Erro ao buscar pastas para movimentação:', error);
      throw error;
    }

    return data || [];
  },

  // 3. Criar Pasta
  async createFolder(nome: string, parentId: string | null = null, teacherId: string | null = null): Promise<void> {
    const { error } = await supabase.from('biblioteca_pastas').insert({
      nome,
      parent_id: parentId || null,
      teacher_id: teacherId || null
    });

    if (error) {
      console.error('Erro ao criar pasta:', error);
      throw error;
    }
  },

  // 4. Renomear Pasta
  async renameFolder(id: string, newNome: string): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_pastas')
      .update({ nome: newNome })
      .eq('id', id);

    if (error) {
      console.error('Erro ao renomear pasta:', error);
      throw error;
    }
  },

  // 5. Excluir Pasta (Cascateia no DB para subpastas e documentos)
  async deleteFolder(id: string): Promise<void> {
    const { error } = await supabase.from('biblioteca_pastas').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir pasta:', error);
      throw error;
    }
  },

  // 6. Publicar Documento
  async uploadDocument(doc: LibraryDocumentUploadPayload): Promise<void> {
    let arquivoUrl = doc.url || '';
    const fileSizeBytes = Number.isFinite(Number(doc.sizeBytes))
      ? Number(doc.sizeBytes)
      : (doc.file ? doc.file.size : 0);
    const normalizedTeacherId = doc.teacherId || null;
    let cursoIds = normalizeIdList(doc.cursoIds);
    let turmaIds = normalizeIdList(doc.turmaIds);

    if (normalizedTeacherId && doc.enforceTeacherScope) {
      const allowedTurmas = await this.getTeacherActiveTurmas(normalizedTeacherId);
      const allowedTurmaIds = new Set(allowedTurmas.map((turma: any) => turma.id));

      if (doc.targetAudience === 'INTERNO') {
        cursoIds = [];
        turmaIds = [];
      } else if (doc.targetAudience === 'ALUNOS') {
        if (turmaIds.length === 0) {
          throw new Error('Selecione ao menos uma turma ativa vinculada ao professor.');
        }

        const invalidTurmaIds = turmaIds.filter((turmaId) => !allowedTurmaIds.has(turmaId));
        if (invalidTurmaIds.length > 0) {
          throw new Error('O professor só pode publicar para turmas ativas em que possui vínculo.');
        }

        cursoIds = normalizeIdList(
          turmaIds
            .map((turmaId) => allowedTurmas.find((turma: any) => turma.id === turmaId)?.curso_id)
            .filter(Boolean) as string[]
        );
      } else {
        throw new Error('Professor só pode publicar documentos privados ou para turmas vinculadas ativas.');
      }
    }

    if (doc.file) {
      if (!doc.file.name?.trim()) {
        throw new Error('Arquivo inválido.');
      }
      if (!isAllowedLibraryFile(doc.file)) {
        throw new Error('Formato ou tamanho de arquivo não permitido. Aceitos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, GIF, WEBP (até 10MB).');
      }
      if (normalizedTeacherId) {
        await assertTeacherStorageCapacity(normalizedTeacherId, fileSizeBytes);
      }
      const uploaded = await uploadLibraryFile(doc.file, doc.title || 'documento');
      if (!uploaded) {
        throw new Error('Não foi possível gerar URL pública do documento.');
      }
      arquivoUrl = uploaded;
    }

    if (!arquivoUrl) {
      throw new Error('É necessário enviar um arquivo válido para publicar o documento.');
    }

    const { error } = await supabase.from('biblioteca_documentos').insert({
      pasta_id: doc.pastaId || null,
      titulo: doc.title,
      descricao: doc.description || null,
      tipo_arquivo: doc.fileType,
      tamanho: doc.size,
      tamanho_bytes: fileSizeBytes,
      arquivo_url: arquivoUrl,
      publico_alvo: doc.targetAudience,
      abrangencia: doc.scope,
      polo_id: doc.poloId || null,
      teacher_id: normalizedTeacherId,
      author_name: doc.authorName || 'Gestor',
      curso_ids: cursoIds,
      turma_ids: turmaIds,
      disciplina_ids: doc.disciplinaIds || [],
      liberacao_tipo: doc.liberacaoTipo || 'IMEDIATO',
      liberacao_data: doc.liberacaoData || null,
      liberacao_disciplina_id: doc.liberacaoDisciplinaId || null,
      liberacao_dias_validade: doc.liberacaoDiasValidade || null
    });

    if (error) {
      console.error('Erro ao publicar documento:', error);
      throw error;
    }
  },

  // 7. Excluir Documento
  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase.from('biblioteca_documentos').delete().eq('id', id);
    if (error) {
      console.error('Erro ao excluir documento:', error);
      throw error;
    }
  },

  // 8. Mover Documento
  async moveDocument(docId: string, targetFolderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_documentos')
      .update({ pasta_id: targetFolderId })
      .eq('id', docId);

    if (error) {
      console.error('Erro ao mover documento:', error);
      throw error;
    }
  },

  // 9. Mover Pasta
  async moveFolder(folderId: string, targetFolderId: string | null): Promise<void> {
    const { error } = await supabase
      .from('biblioteca_pastas')
      .update({ parent_id: targetFolderId })
      .eq('id', folderId);

    if (error) {
      console.error('Erro ao mover pasta:', error);
      throw error;
    }
  },

  async getTeacherStorageConfigs(): Promise<TeacherStorageQuota[]> {
    const { data: teachers, error } = await supabase
      .from('parceiros')
      .select('id, nome, especialidade, updated_at')
      .eq('tipo', 'Professor')
      .eq('status', 'ATIVO')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar professores para configuração de quota:', error);
      throw error;
    }

    const teacherIds = (teachers || []).map((t: any) => t.id);
    if (!teacherIds.length) {
      return [];
    }

    const { data: quotas, error: quotaError } = await supabase
      .from('biblioteca_professor_quotas')
      .select('teacher_id, max_storage_gb')
      .in('teacher_id', teacherIds);

    if (quotaError) {
      console.error('Erro ao buscar quotas de professores:', quotaError);
      throw quotaError;
    }

    const quotaMap: { [key: string]: number } = {};
    (quotas || []).forEach((quota: any) => {
      if (quota.teacher_id) {
        quotaMap[quota.teacher_id] = parseDbDecimal(quota.max_storage_gb);
      }
    });

    const { data: usageRows, error: usageError } = await supabase
      .from('biblioteca_documentos')
      .select('teacher_id, tamanho_bytes, tamanho')
      .in('teacher_id', teacherIds);

    if (usageError) {
      console.error('Erro ao buscar consumo de storage dos professores:', usageError);
      throw usageError;
    }

    const usageMap: { [key: string]: number } = {};
    const documentsCountMap: { [key: string]: number } = {};
    (usageRows || []).forEach((row: any) => {
      if (!row.teacher_id) return;
      const rawBytes = row.tamanho_bytes === null || row.tamanho_bytes === undefined
        ? Number.NaN
        : Number(row.tamanho_bytes);
      const parsedBytes = Number.isFinite(rawBytes) ? rawBytes : parseDisplaySizeToBytes(row.tamanho || '');
      usageMap[row.teacher_id] = (usageMap[row.teacher_id] || 0) + (Number.isFinite(parsedBytes) ? parsedBytes : 0);
      documentsCountMap[row.teacher_id] = (documentsCountMap[row.teacher_id] || 0) + 1;
    });

    return (teachers || []).map((teacher: any) => {
      const usedBytes = usageMap[teacher.id] || 0;
      const quotaGb = quotaMap[teacher.id] || DEFAULT_TEACHER_STORAGE_QUOTA_GB;
      return {
        teacherId: teacher.id,
        teacherName: teacher.nome,
        specialty: teacher.especialidade || 'Docente',
        documentsCount: documentsCountMap[teacher.id] || 0,
        lastUpdate: teacher.updated_at ? teacher.updated_at.split('T')[0] : new Date().toISOString().split('T')[0],
        storageQuotaGb: quotaGb,
        storageUsedBytes: usedBytes
      };
    });
  },

  async updateTeacherStorageQuota(teacherId: string, storageQuotaGb: number): Promise<void> {
    const normalizedQuota = Number(storageQuotaGb);
    if (!Number.isFinite(normalizedQuota) || normalizedQuota <= 0) {
      throw new Error('Quota deve ser maior que 0 GB.');
    }

    const { error } = await supabase
      .from('biblioteca_professor_quotas')
      .upsert({
        teacher_id: teacherId,
        max_storage_gb: normalizedQuota,
        updated_at: new Date().toISOString()
      }, { onConflict: 'teacher_id' });

    if (error) {
      console.error('Erro ao salvar quota do professor:', error);
      throw error;
    }
  },

  // 10. Incrementar Visualizações/Acessos
  async incrementAcessos(docId: string): Promise<void> {
    const { data } = await supabase
      .from('biblioteca_documentos')
      .select('acessos')
      .eq('id', docId)
      .single();

    const current = data?.acessos || 0;
    await supabase
      .from('biblioteca_documentos')
      .update({ acessos: current + 1 })
      .eq('id', docId);
  },

  // 11. Top 10 Acessados
  async getTop10Accessed(): Promise<LibraryDocument[]> {
    const { data, error } = await supabase
      .from('biblioteca_documentos')
      .select('*, polos(nome)')
      .order('acessos', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao buscar top 10 acessados:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      poloName: doc.polos?.nome || '',
      acessos: doc.acessos || 0,
      teacherId: doc.teacher_id,
      authorName: doc.author_name,
      createdAt: doc.created_at,
      cursoIds: doc.curso_ids || [],
      turmaIds: doc.turma_ids || [],
      disciplinaIds: doc.disciplina_ids || [],
      liberacaoTipo: doc.liberacao_tipo || 'IMEDIATO',
      liberacaoData: doc.liberacao_data,
      liberacaoDisciplinaId: doc.liberacao_disciplina_id,
      liberacaoDiasValidade: doc.liberacao_dias_validade
    }));
  },

  // 12. Top 10 Recentes
  async getTop10Recent(): Promise<LibraryDocument[]> {
    const { data, error } = await supabase
      .from('biblioteca_documentos')
      .select('*, polos(nome)')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao buscar top 10 recentes:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      poloName: doc.polos?.nome || '',
      acessos: doc.acessos || 0,
      teacherId: doc.teacher_id,
      authorName: doc.author_name,
      createdAt: doc.created_at,
      cursoIds: doc.curso_ids || [],
      turmaIds: doc.turma_ids || [],
      disciplinaIds: doc.disciplina_ids || [],
      liberacaoTipo: doc.liberacao_tipo || 'IMEDIATO',
      liberacaoData: doc.liberacao_data,
      liberacaoDisciplinaId: doc.liberacao_disciplina_id,
      liberacaoDiasValidade: doc.liberacao_dias_validade
    }));
  },

  // 13. Buscar Repositórios de Professores (Pastas baseadas em parceiros do tipo Professor)
  async getTeacherRepositories(): Promise<TeacherRepository[]> {
    const { data: teachers, error } = await supabase
      .from('parceiros')
      .select('id, nome, especialidade, updated_at')
      .eq('tipo', 'Professor')
      .eq('status', 'ATIVO')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar professores para biblioteca:', error);
      throw error;
    }

    // Garantir que cada professor ativo tenha uma pasta de repositório na biblioteca_pastas
    for (const t of (teachers || [])) {
      const { data: existingFolders } = await supabase
        .from('biblioteca_pastas')
        .select('id')
        .eq('teacher_id', t.id)
        .is('parent_id', null);
      
      if (!existingFolders || existingFolders.length === 0) {
        await supabase.from('biblioteca_pastas').insert({
          nome: `Arquivos de ${t.nome}`,
          teacher_id: t.id,
          parent_id: null
        });
      }
    }

    // Buscar contagem de documentos por professor
    const { data: docCounts } = await supabase
      .from('biblioteca_documentos')
      .select('teacher_id');

    const countsMap: { [key: string]: number } = {};
    (docCounts || []).forEach((doc: any) => {
      if (doc.teacher_id) {
        countsMap[doc.teacher_id] = (countsMap[doc.teacher_id] || 0) + 1;
      }
    });

    return (teachers || []).map((t: any) => ({
      teacherId: t.id,
      teacherName: t.nome,
      specialty: t.especialidade || 'Docente',
      documentsCount: countsMap[t.id] || 0,
      lastUpdate: t.updated_at ? t.updated_at.split('T')[0] : new Date().toISOString().split('T')[0]
    }));
  },

  // 14. Buscar Cursos Ativos
  async getCursos(): Promise<any[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('id, nome, modalidade')
      .eq('status', 'ativo')
      .order('nome', { ascending: true });
    
    if (error) {
      console.error('Erro ao buscar cursos:', error);
      throw error;
    }
    return data || [];
  },

  // 15. Buscar Turmas
  async getTurmas(): Promise<any[]> {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, curso_id')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar turmas:', error);
      throw error;
    }
    return data || [];
  },

  async getTeacherActiveTurmas(teacherId: string): Promise<any[]> {
    if (!teacherId) return [];

    const { data: assignments, error: assignmentsError } = await supabase
      .from('turmas_disciplinas')
      .select('turma_id')
      .eq('professor_id', teacherId);

    if (assignmentsError) {
      console.error('Erro ao buscar vínculos de turma do professor:', assignmentsError);
      throw assignmentsError;
    }

    const turmaIds = normalizeIdList((assignments || []).map((item: any) => item.turma_id));
    if (turmaIds.length === 0) return [];

    const { data, error } = await supabase
      .from('turmas')
      .select('id, nome, codigo, curso_id, status, polo_id')
      .in('id', turmaIds)
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar turmas ativas do professor:', error);
      throw error;
    }

    return (data || []).filter((turma: any) => activeClassStatuses.has(String(turma.status || '').toUpperCase()));
  },

  // 16. Buscar Disciplinas
  async getDisciplinas(): Promise<any[]> {
    const { data, error } = await supabase
      .from('disciplinas')
      .select('id, nome, modulo_id, modulos(curso_id)')
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar disciplinas:', error);
      throw error;
    }
    return (data || []).map((d: any) => ({
      id: d.id,
      nome: d.nome,
      moduloId: d.modulo_id,
      cursoId: d.modulos?.curso_id || null
    }));
  },

  // 17. Atualizar Permissões e Regras de Liberação do Documento
  async updateDocumentPermissions(
    docId: string,
    data: Partial<LibraryDocument>,
    options: { teacherScopeOnly?: boolean } = {}
  ): Promise<void> {
    const { data: currentDoc, error: currentDocError } = await supabase
      .from('biblioteca_documentos')
      .select('teacher_id')
      .eq('id', docId)
      .single();

    if (currentDocError) {
      console.error('Erro ao buscar documento para atualizar permissões:', currentDocError);
      throw currentDocError;
    }

    let cursoIds = normalizeIdList(data.cursoIds);
    let turmaIds = normalizeIdList(data.turmaIds);
    let targetAudience = data.targetAudience || 'TODOS';

    if (options.teacherScopeOnly && currentDoc?.teacher_id) {
      const allowedTurmas = await this.getTeacherActiveTurmas(currentDoc.teacher_id);
      const allowedTurmaIds = new Set(allowedTurmas.map((turma: any) => turma.id));

      if (turmaIds.length === 0) {
        targetAudience = 'INTERNO';
        cursoIds = [];
      } else {
        targetAudience = 'ALUNOS';
        const invalidTurmaIds = turmaIds.filter((turmaId) => !allowedTurmaIds.has(turmaId));
        if (invalidTurmaIds.length > 0) {
          throw new Error('O professor só pode liberar documentos para turmas ativas em que possui vínculo.');
        }
        cursoIds = normalizeIdList(
          turmaIds
            .map((turmaId) => allowedTurmas.find((turma: any) => turma.id === turmaId)?.curso_id)
            .filter(Boolean) as string[]
        );
      }
    }

    const { error } = await supabase
      .from('biblioteca_documentos')
      .update({
        publico_alvo: targetAudience,
        abrangencia: options.teacherScopeOnly && currentDoc?.teacher_id ? 'GLOBAL' : data.scope,
        polo_id: options.teacherScopeOnly && currentDoc?.teacher_id ? null : data.poloId || null,
        curso_ids: cursoIds,
        turma_ids: turmaIds,
        disciplina_ids: data.disciplinaIds || [],
        liberacao_tipo: data.liberacaoTipo || 'IMEDIATO',
        liberacao_data: data.liberacaoData || null,
        liberacao_disciplina_id: data.liberacaoDisciplinaId || null,
        liberacao_dias_validade: data.liberacaoDiasValidade || null
      })
      .eq('id', docId);

    if (error) {
      console.error('Erro ao atualizar permissões do documento:', error);
      throw error;
    }
  },

  // 18. Copiar Documento
  async copyDocument(docId: string, targetFolderId: string | null): Promise<void> {
    // Buscar documento original
    const { data: doc, error: fetchError } = await supabase
      .from('biblioteca_documentos')
      .select('*')
      .eq('id', docId)
      .single();
    
    if (fetchError || !doc) {
      console.error('Erro ao buscar documento para copiar:', fetchError);
      throw fetchError || new Error('Documento não encontrado.');
    }

    // Determinar o teacher_id correto baseado na pasta destino
    let teacherId = null;
    if (targetFolderId) {
      const { data: folder } = await supabase
        .from('biblioteca_pastas')
        .select('teacher_id')
        .eq('id', targetFolderId)
        .single();
      teacherId = folder?.teacher_id || null;
    }

    const rawCopyBytes = doc.tamanho_bytes === null || doc.tamanho_bytes === undefined
      ? Number.NaN
      : Number(doc.tamanho_bytes);
    const copySizeBytes = Number.isFinite(rawCopyBytes) ? rawCopyBytes : parseDisplaySizeToBytes(doc.tamanho || '');
    if (teacherId && copySizeBytes > 0) {
      await assertTeacherStorageCapacity(teacherId, copySizeBytes);
    }

    // Inserir cópia
    const { error: insertError } = await supabase
      .from('biblioteca_documentos')
      .insert({
        pasta_id: targetFolderId,
        titulo: doc.titulo + ' (Cópia)',
        descricao: doc.descricao,
        tipo_arquivo: doc.tipo_arquivo,
        tamanho: doc.tamanho,
        tamanho_bytes: copySizeBytes,
        arquivo_url: doc.arquivo_url,
        publico_alvo: doc.publico_alvo,
        abrangencia: doc.abrangencia,
        polo_id: doc.polo_id,
        curso_ids: doc.curso_ids,
        turma_ids: doc.turma_ids,
        disciplina_ids: doc.disciplina_ids,
        liberacao_tipo: doc.liberacao_tipo,
        liberacao_data: doc.liberacao_data,
        liberacao_disciplina_id: doc.liberacao_disciplina_id,
        liberacao_dias_validade: doc.liberacao_dias_validade,
        teacher_id: teacherId,
        author_name: doc.author_name
      });

    if (insertError) {
      console.error('Erro ao copiar documento:', insertError);
      throw insertError;
    }
  }
};
