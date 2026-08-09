import { formatMatricula } from '../../../../lib/academicUtils';
import { formatCpf } from '../../../../lib/documentFormatters';
import { supabase } from '../../../../lib/supabase';
import { formatCep } from '../../../shared/utils/brazilianCep';

export interface StudentTemplatePreview {
  enrollmentId: string;
  label: string;
  replacements: Record<string, string>;
}

const EMPTY_VALUE = '—';

const displayValue = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return normalized || EMPTY_VALUE;
};

const formatDate = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return EMPTY_VALUE;
  const date = new Date(normalized.includes('T') ? normalized : `${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? normalized : date.toLocaleDateString('pt-BR');
};

const joinPresent = (values: unknown[], separator = ', ') => {
  const present = values
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  return present.length ? present.join(separator) : EMPTY_VALUE;
};

const normalizeStudentPreview = (enrollment: any, referencePolo: any): StudentTemplatePreview => {
  const student = enrollment.parceiros || {};
  const turma = enrollment.turmas || {};
  const course = turma.cursos || {};
  const polo = referencePolo || {};
  const city = polo.cidade || '';
  const state = polo.estado || polo.uf || '';
  const streetAddress = joinPresent([
    student.endereco,
    student.numero,
    student.complemento,
    student.bairro,
    student.cidade,
    student.uf,
  ]);
  const poloAddress = joinPresent([
    polo.endereco,
    polo.numero,
    polo.bairro,
    city,
    state,
    polo.cep ? `CEP ${formatCep(polo.cep)}` : '',
  ]);
  const now = new Date();
  const studentName = displayValue(student.nome);
  const responsibleName = student.responsavel_nome || student.nome;
  const responsibleCpf = student.responsavel_cpf || student.cpf_cnpj;
  const responsiblePhone = student.responsavel_telefone || student.telefone;

  return {
    enrollmentId: enrollment.id,
    label: `${studentName} · ${displayValue(course.nome)}`,
    replacements: {
      '{{ALUNO_NOME}}': studentName,
      '{{ALUNO_FOTO_URL}}': student.foto_url || '/sem-foto-aluno.svg',
      '{{ALUNO_NOME_SOCIAL}}': displayValue(student.nome_social || student.nome),
      '{{ALUNO_CPF}}': displayValue(formatCpf(student.cpf_cnpj)),
      '{{ALUNO_RG}}': displayValue(student.rg),
      '{{ALUNO_NASCIMENTO}}': formatDate(student.data_nascimento),
      '{{ALUNO_SEXO}}': displayValue(student.sexo),
      '{{ALUNO_ESTADO_CIVIL}}': displayValue(student.estado_civil),
      '{{ALUNO_RACA_COR}}': displayValue(student.raca_cor),
      '{{ALUNO_NACIONALIDADE}}': displayValue(student.nacionalidade),
      '{{ALUNO_NATURALIDADE}}': displayValue(student.naturalidade),
      '{{ALUNO_MAE}}': displayValue(student.nome_mae),
      '{{ALUNO_PAI}}': displayValue(student.nome_pai),
      '{{ALUNO_EMAIL}}': displayValue(student.email),
      '{{ALUNO_TELEFONE}}': displayValue(student.telefone),
      '{{ALUNO_ENDERECO}}': streetAddress,
      '{{ALUNO_CEP}}': displayValue(formatCep(student.cep)),
      '{{ALUNO_LOGRADOURO}}': displayValue(student.endereco),
      '{{ALUNO_NUMERO}}': displayValue(student.numero),
      '{{ALUNO_COMPLEMENTO}}': displayValue(student.complemento),
      '{{ALUNO_BAIRRO}}': displayValue(student.bairro),
      '{{ALUNO_CIDADE}}': displayValue(student.cidade),
      '{{ALUNO_UF}}': displayValue(student.uf),
      '{{ALUNO_TIPO_DOCUMENTO}}': displayValue(student.tipo_documento),
      '{{ALUNO_RG_ORGAO}}': displayValue(student.orgao_emissor),
      '{{ALUNO_RG_UF}}': displayValue(student.rg_uf_emissao),
      '{{ALUNO_RG_EMISSAO}}': formatDate(student.rg_data_emissao),
      '{{ALUNO_TITULO_ELEITOR}}': displayValue(student.titulo_eleitor),
      '{{ALUNO_TITULO_ZONA}}': displayValue(student.titulo_eleitor_zona),
      '{{ALUNO_TITULO_SECAO}}': displayValue(student.titulo_eleitor_secao),
      '{{ALUNO_TITULO_EMISSAO}}': formatDate(student.titulo_eleitor_data_emissao),
      '{{ALUNO_TITULO_UF}}': displayValue(student.titulo_eleitor_uf),
      '{{ALUNO_RESERVISTA}}': displayValue(student.reservista),
      '{{ALUNO_PCD}}': student.pcd ? 'SIM' : 'NÃO',
      '{{ALUNO_PCD_TIPO}}': displayValue(student.pcd_tipo),
      '{{ALUNO_RESPONSAVEL}}': displayValue(responsibleName),
      '{{ALUNO_RESPONSAVEL_CPF}}': displayValue(formatCpf(responsibleCpf)),
      '{{ALUNO_RESPONSAVEL_PARENTESCO}}': displayValue(student.responsavel_parentesco),
      '{{ALUNO_RESPONSAVEL_TELEFONE}}': displayValue(responsiblePhone),
      '{{ALUNO_OBSERVACOES}}': displayValue(student.observacao),
      '{{ALUNO_MATRICULA}}': formatMatricula(
        enrollment.id,
        enrollment.data_matricula,
        turma.polo_id || polo.id,
      ),
      '{{CURSO_NOME}}': displayValue(course.nome),
      '{{CURSO_MODALIDADE}}': displayValue(course.modalidade),
      '{{CURSO_TURNO}}': displayValue(turma.turno),
      '{{TURMA_NOME}}': displayValue(turma.nome || turma.codigo),
      '{{MATRICULA_STATUS}}': displayValue(enrollment.status),
      '{{DATA_INGRESSO}}': formatDate(enrollment.data_matricula),
      '{{POLO_NOME}}': displayValue(polo.nomeFantasia || polo.nome_fantasia || polo.nome),
      '{{CIDADE_POLO}}': displayValue(city),
      '{{POLO_CNPJ}}': displayValue(polo.cnpj),
      '{{POLO_ENDERECO_COMPLETO}}': poloAddress,
      '{{POLO_TELEFONE}}': displayValue(polo.telefone),
      '{{POLO_EMAIL}}': displayValue(polo.email),
      '{{LOCAL_DOCUMENTO}}': joinPresent([city, state], '/'),
      '{{DATA_ATUAL}}': now.toLocaleDateString('pt-BR'),
      '{{DATA_GERACAO}}': now.toLocaleString('pt-BR'),
    },
  };
};

const loadPreviewPool = async (poloId: string) => {
  const { data, error } = await supabase
    .from('matriculas')
    .select(`
      id, status, data_matricula,
      parceiros!inner(
        nome, nome_social, cpf_cnpj, email, telefone, foto_url,
        data_nascimento, sexo, estado_civil, raca_cor,
        rg, tipo_documento, orgao_emissor, rg_uf_emissao, rg_data_emissao,
        nacionalidade, naturalidade, titulo_eleitor, titulo_eleitor_zona,
        titulo_eleitor_secao, titulo_eleitor_data_emissao, titulo_eleitor_uf, reservista,
        nome_mae, nome_pai, pcd, pcd_tipo,
        cep, endereco, numero, complemento, bairro, cidade, uf,
        responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone,
        observacao
      ),
      turmas!inner(nome, codigo, turno, polo_id, status, cursos!inner(nome, modalidade))
    `)
    .eq('turmas.polo_id', poloId)
    .eq('status', 'ATIVO')
    .eq('turmas.status', 'EM_ANDAMENTO')
    .order('data_matricula', { ascending: false })
    .limit(24);

  if (error) throw error;
  return data || [];
};

export const studentTemplatePreviewService = {
  async getPool(referencePolo: any): Promise<StudentTemplatePreview[]> {
    const rows = await loadPreviewPool(referencePolo.id);
    return rows.map(row => normalizeStudentPreview(row, referencePolo));
  },
};
