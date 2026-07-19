import { supabase } from '../../../../lib/supabase';
import type { CertificadoAcademico } from '../certificados/certificados.types';
import { carteirinhaService } from '../../cadastros/modelos-documentos/carteirinha/carteirinha.service';
import { crachaService } from '../../cadastros/modelos-documentos/cracha/cracha.service';
import { declaracaoService } from '../../cadastros/modelos-documentos/declaracao/declaracao.service';
import { declaracaoFrequenciaService } from '../../cadastros/modelos-documentos/declaracao-frequencia/declaracao-frequencia.service';
import { irpfService } from '../../cadastros/modelos-documentos/irpf/irpf.service';
import { boletimService } from '../../cadastros/modelos-documentos/boletim/boletim.service';
import { historicoService } from '../../cadastros/modelos-documentos/historico/historico.service';
import { transferenciaService } from '../../cadastros/modelos-documentos/transferencia/transferencia.service';
import { academicosService } from '../../configuracoes/academicos/academicos.service';
import { marcaDaguaService } from '../../configuracoes/marca-dagua/marca-dagua.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import { loadAcademicPreview } from './academic-preview';
import {
  CERTIFICATE_DOCUMENT_MODALITY,
  isCertificateDocument,
  PAGE_SIZE,
} from './historico-emissoes.constants';
import type {
  EmissionLog,
  PreviewResources,
  TurmaFilter,
} from './historico-emissoes.types';

const certificateSelect = `
  *,
  aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj),
  turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
  curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria, ead_config),
  polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
`;

const fetchCertificateForEmission = async (
  emission: EmissionLog
): Promise<CertificadoAcademico | null> => {
  if (!isCertificateDocument(emission.documento)) return null;

  const byCode = await supabase
    .from('certificados_academicos')
    .select(certificateSelect)
    .eq('codigo_validacao', emission.codigo)
    .maybeSingle();
  if (byCode.error) throw byCode.error;
  if (byCode.data) return byCode.data as unknown as CertificadoAcademico;

  const certificateId = emission.dados_emissao?.certificateId;
  if (certificateId) {
    const byId = await supabase
      .from('certificados_academicos')
      .select(certificateSelect)
      .eq('id', certificateId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data as unknown as CertificadoAcademico;
  }

  const byEnrollment = await supabase
    .from('certificados_academicos')
    .select(certificateSelect)
    .eq('matricula_id', emission.matricula_id)
    .eq('modalidade', CERTIFICATE_DOCUMENT_MODALITY[emission.documento])
    .eq('status', 'FINALIZADO')
    .order('emitido_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byEnrollment.error) throw byEnrollment.error;
  return (byEnrollment.data || null) as unknown as CertificadoAcademico | null;
};

const loadTemplate = async (
  emission: EmissionLog,
  poloId: string,
  academicConfigs: any
) => {
  if (emission.documento === 'carteirinha') {
    const savedTemplate = await carteirinhaService.getTemplate();
    return {
      ...savedTemplate,
      corPrimaria: academicConfigs.carteirinhaPrimaryColor || savedTemplate?.corPrimaria,
      corSecundaria: academicConfigs.carteirinhaSecondaryColor || savedTemplate?.corSecundaria,
    };
  }
  if (emission.documento === 'cracha_estagio') return crachaService.getTemplate();
  if (emission.documento === 'declaracao_matricula') return declaracaoService.getTemplate(poloId);
  if (emission.documento === 'declaracao_frequencia') return declaracaoFrequenciaService.getTemplate(poloId);
  if (emission.documento === 'declaracao_irpf') return irpfService.getTemplate(poloId);
  if (emission.documento === 'boletim') return boletimService.getTemplate('TECNICO');
  if (emission.documento === 'historico_escolar') return historicoService.getTemplate(poloId);
  if (emission.documento === 'transferencia') return transferenciaService.getTemplate(poloId);

  if (isCertificateDocument(emission.documento)) {
    const { data, error } = await supabase
      .from('documentos_templates')
      .select('conteudo')
      .eq('id', 'diplomas')
      .maybeSingle();
    if (error) throw error;
    const tipoMap: Record<string, string> = {
      certificado_tecnico: 'Cursos Técnicos',
      certificado_livre: 'Cursos Livres',
      certificado_ead: 'Educação a Distância (EAD)',
      certificado_especializacao: 'Cursos Especialização',
    };
    return Array.isArray(data?.conteudo)
      ? data.conteudo.find((item: any) => item.tipoCurso === tipoMap[emission.documento])
      : null;
  }

  const templatePrefix: Record<string, string> = {
    boletim: 'boletim_tecnico',
    atestado_conclusao_tecnico: 'atestado_conclusao_tecnico',
    historico_escolar: 'historico',
    termo_estagio: 'estagio',
  };
  const modalityScopedDocuments = new Set(['boletim', 'atestado_conclusao_tecnico']);
  const templateScope = modalityScopedDocuments.has(emission.documento) ? 'TECNICO' : poloId;
  const templateId = `${templatePrefix[emission.documento] || emission.documento}_${templateScope}`;
  const { data, error } = await supabase
    .from('documentos_templates')
    .select('conteudo')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  return data?.conteudo || null;
};

export const historicoEmissoesService = {
  async loadFilters(poloId: string): Promise<{
    turmas: TurmaFilter[];
    systemUsers: Record<string, string>;
  }> {
    const [turmasResult, usersResult] = await Promise.all([
      supabase
        .from('turmas')
        .select('id, nome, codigo')
        .or(`polo_id.eq.${poloId},polo_id.is.null`)
        .order('nome', { ascending: true }),
      supabase.from('usuarios_sistema').select('id, nome'),
    ]);
    if (turmasResult.error) throw turmasResult.error;
    if (usersResult.error) throw usersResult.error;

    return {
      turmas: (turmasResult.data || []) as TurmaFilter[],
      systemUsers: Object.fromEntries(
        (usersResult.data || []).map((user) => [user.id, user.nome])
      ),
    };
  },

  async loadEmissions(params: {
    poloId: string;
    activeTab: string;
    turmaId: string;
    search: string;
    page: number;
  }): Promise<{ emissions: EmissionLog[]; total: number }> {
    const from = (params.page - 1) * PAGE_SIZE;
    const enrollmentRelation = params.turmaId === 'todos'
      ? 'matricula:matriculas(id, status, turma:turmas(id, nome, codigo))'
      : 'matricula:matriculas!inner(id, status, turma_id, turma:turmas(id, nome, codigo))';
    let query = supabase
      .from('documentos_validacao')
      .select(`
        *,
        aluno:parceiros(id, nome, cpf_cnpj, rg, data_nascimento, foto_url),
        ${enrollmentRelation}
      `, { count: 'exact' })
      .eq('status', 'ATIVO');

    if (params.activeTab !== 'todos') query = query.eq('documento', params.activeTab);
    if (params.poloId) query = query.eq('polo_id', params.poloId);
    if (params.turmaId !== 'todos') query = query.eq('matricula.turma_id', params.turmaId);
    if (params.search.trim()) {
      const search = params.search.trim().replace(/[%_,()]/g, ' ');
      query = query.or(
        `codigo.ilike.%${search}%,dados_emissao->>studentName.ilike.%${search}%,dados_emissao->>studentCpf.ilike.%${search}%`
      );
    }

    const { data, count, error } = await query
      .order('ultima_emissao_em', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    return { emissions: (data || []) as EmissionLog[], total: count || 0 };
  },

  async loadPreview(emission: EmissionLog, fallbackPoloId: string): Promise<PreviewResources> {
    const poloId = emission.polo_id || fallbackPoloId;
    const needsAcademic = ['historico_escolar', 'transferencia'].includes(emission.documento);
    const academicPreviewPromise = needsAcademic
      ? loadAcademicPreview(emission)
      : Promise.resolve(null);
    const [polo, watermarks, academicConfigs, academicData, certificate] = await Promise.all([
      polosService.getById(poloId),
      marcaDaguaService.getCompaniesWithWatermark(),
      academicosService.getConfigs(),
      academicPreviewPromise,
      fetchCertificateForEmission(emission),
    ]);
    if (isCertificateDocument(emission.documento) && !certificate) {
      throw new Error('O certificado acadêmico finalizado não foi localizado para esta emissão.');
    }
    const template = await loadTemplate(emission, poloId, academicConfigs);
    return {
      template,
      watermark: watermarks.find((item) => item.id === poloId) || null,
      polo,
      academicData,
      certificate,
    };
  },
};
