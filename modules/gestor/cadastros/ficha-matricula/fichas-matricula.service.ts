import { supabase } from '../../../../lib/supabase';
import { fichaMatriculaDefaultTemplate } from './document-layouts';

export interface FichaMatriculaModel {
  id: string;
  nome: string;
  tipoCurso: string;
  status: 'ATIVO' | 'INATIVO';
  requerAssinatura: boolean;
  textoContrato: string;
  camposCustomizados: Array<{ id: string | number; label: string }>;
  camposCount: number;
  cursoEspecificoId: string | null;
  templateConfig: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface FichaMatriculaCourseOption {
  id: string;
  nome: string;
  modalidade: string;
}

const normalizeStatus = (status?: string): 'ATIVO' | 'INATIVO' =>
  String(status || 'ATIVO').toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO';

const cloneDefaultTemplate = () => JSON.parse(JSON.stringify(fichaMatriculaDefaultTemplate));

const getStoredTemplate = (row: any) => (
  row?.template_config && typeof row.template_config === 'object'
    ? row.template_config
    : {}
);

const needsTemplateUpgrade = (row: any) => (
  Number(getStoredTemplate(row).v || 0) < fichaMatriculaDefaultTemplate.v
);

const mergeDefaultAbsoluteFields = (storedFields: unknown) => {
  const defaults = JSON.parse(JSON.stringify(fichaMatriculaDefaultTemplate.absoluteFields || []));
  const stored = Array.isArray(storedFields) ? storedFields : [];
  return [
    ...defaults,
    ...stored.filter((field: any) => (
      !defaults.some((defaultField: any) => defaultField.id === field?.id)
    )),
  ];
};

const buildTemplateConfig = (row: any) => {
  const customFields = Array.isArray(row.campos_customizados) ? row.campos_customizados : [];
  const requiresSignature = row.requer_assinatura !== false;
  const contractText = row.texto_contrato || '';
  const storedTemplate = getStoredTemplate(row);
  const templateConfig = needsTemplateUpgrade(row)
    ? {
        ...cloneDefaultTemplate(),
        absoluteFields: mergeDefaultAbsoluteFields(storedTemplate.absoluteFields),
      }
    : {
        ...cloneDefaultTemplate(),
        ...storedTemplate,
      };

  return {
    ...templateConfig,
    enrollmentFormTerm: contractText,
    enrollmentFormCustomFields: customFields,
    enrollmentFormRequiresSignature: requiresSignature,
  };
};

const mapModel = (row: any): FichaMatriculaModel => {
  const customFields = Array.isArray(row.campos_customizados) ? row.campos_customizados : [];
  const requiresSignature = row.requer_assinatura !== false;
  const contractText = row.texto_contrato || '';
  return {
    id: row.id,
    nome: row.nome,
    tipoCurso: row.tipo_curso,
    status: normalizeStatus(row.status),
    requerAssinatura: requiresSignature,
    textoContrato: contractText,
    camposCustomizados: customFields,
    camposCount: customFields.length,
    cursoEspecificoId: row.curso_especifico_id || null,
    templateConfig: buildTemplateConfig(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const persistTemplateUpgrades = async (rows: any[]) => {
  const outdatedRows = rows.filter(needsTemplateUpgrade);
  if (outdatedRows.length === 0) return;

  await Promise.all(outdatedRows.map(async (row) => {
    const { error } = await supabase
      .from('modelos_fichas')
      .update({
        template_config: buildTemplateConfig(row),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) throw error;
  }));
};

const toPersistence = (model: Partial<FichaMatriculaModel>) => ({
  nome: String(model.nome || '').trim(),
  tipo_curso: model.tipoCurso || 'TODOS',
  status: normalizeStatus(model.status),
  requer_assinatura: model.requerAssinatura !== false,
  texto_contrato: model.textoContrato || '',
  campos_customizados: model.camposCustomizados || [],
  curso_especifico_id: model.cursoEspecificoId || null,
  template_config: model.templateConfig || fichaMatriculaDefaultTemplate,
  updated_at: new Date().toISOString(),
});

export const fichasMatriculaService = {
  async getAvailableCourses(): Promise<FichaMatriculaCourseOption[]> {
    const { data, error } = await supabase
      .from('cursos')
      .select('id, nome, modalidade, status')
      .order('nome', { ascending: true });
    if (error) throw error;
    return (data || [])
      .filter((course: any) => String(course.status || '').toUpperCase() !== 'INATIVO')
      .map((course: any) => ({
        id: course.id,
        nome: course.nome,
        modalidade: String(course.modalidade || '').toUpperCase(),
      }));
  },

  async getAll(): Promise<FichaMatriculaModel[]> {
    const { data, error } = await supabase
      .from('modelos_fichas')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = data || [];
    await persistTemplateUpgrades(rows);
    return rows.map(mapModel);
  },

  async getGeneral(): Promise<FichaMatriculaModel | null> {
    const { data, error } = await supabase
      .from('modelos_fichas')
      .select('*')
      .eq('tipo_curso', 'TODOS')
      .is('curso_especifico_id', null)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = data || [];
    await persistTemplateUpgrades(rows);
    const models = rows.map(mapModel);
    return models.find((model) => (
      model.status === 'ATIVO'
      && model.nome.trim().toLocaleLowerCase('pt-BR') === 'ficha de matrícula geral'
    ))
      || models.find((model) => model.status === 'ATIVO')
      || null;
  },

  async getActive(): Promise<FichaMatriculaModel[]> {
    const { data, error } = await supabase
      .from('modelos_fichas')
      .select('*')
      .eq('status', 'ATIVO')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapModel);
  },

  async getById(id: string): Promise<FichaMatriculaModel | null> {
    const { data, error } = await supabase
      .from('modelos_fichas')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapModel(data) : null;
  },

  async create(model: Partial<FichaMatriculaModel>): Promise<FichaMatriculaModel> {
    const payload = toPersistence(model);
    if (!payload.nome) throw new Error('Informe o nome do modelo.');
    const { data, error } = await supabase
      .from('modelos_fichas')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return mapModel(data);
  },

  async update(model: FichaMatriculaModel): Promise<FichaMatriculaModel> {
    const payload = toPersistence(model);
    if (!payload.nome) throw new Error('Informe o nome do modelo.');
    const { data, error } = await supabase
      .from('modelos_fichas')
      .update(payload)
      .eq('id', model.id)
      .select()
      .single();
    if (error) throw error;
    return mapModel(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('modelos_fichas').delete().eq('id', id);
    if (error) throw error;
  },
};
