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
import { pastaIdentificacaoService, fichaMatriculaDefaultTemplate } from '../../cadastros/ficha-matricula/document-layouts';
import { normalizeLegacyPastaFooterGeometry } from '../../cadastros/ficha-matricula/pasta-template-geometry';
import { fichasMatriculaService } from '../../cadastros/ficha-matricula/fichas-matricula.service';
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
import {
  shouldUseSharedPreviewCache,
  type PreviewCacheMode,
} from './reissue-flow';
import { assertCertificateAlignedWithEmission } from './certificate-emission-contract';

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
    .eq('status', 'FINALIZADO')
    .maybeSingle();
  if (byCode.error) throw byCode.error;
  if (byCode.data) return byCode.data as unknown as CertificadoAcademico;

  const certificateId = emission.dados_emissao?.certificateId;
  if (certificateId) {
    const byId = await supabase
      .from('certificados_academicos')
      .select(certificateSelect)
      .eq('id', certificateId)
      .eq('status', 'FINALIZADO')
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) {
      const certificate = byId.data as unknown as CertificadoAcademico;
      assertCertificateAlignedWithEmission(certificate, emission);
      return certificate;
    }
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
  if (!byEnrollment.data) return null;
  const certificate = byEnrollment.data as unknown as CertificadoAcademico;
  assertCertificateAlignedWithEmission(certificate, emission);
  return certificate;
};

const loadTemplate = async (
  emission: EmissionLog,
  poloId: string,
  academicConfigs: any
) => {
  const hasFrozenRegistrationTemplate = Object.prototype.hasOwnProperty.call(
    emission.dados_emissao || {},
    'documentTemplateSnapshot',
  );
  const frozenRegistrationTemplate = emission.dados_emissao?.documentTemplateSnapshot;
  if (
    hasFrozenRegistrationTemplate
    && ['pasta_identificacao', 'ficha_matricula'].includes(emission.documento)
  ) {
    return emission.documento === 'pasta_identificacao'
      ? normalizeLegacyPastaFooterGeometry(frozenRegistrationTemplate)
      : frozenRegistrationTemplate;
  }

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
  if (emission.documento === 'pasta_identificacao') {
    return pastaIdentificacaoService.getTemplate(poloId);
  }
  if (emission.documento === 'ficha_matricula') {
    if (!emission.periodo_referencia) return fichaMatriculaDefaultTemplate;
    const model = await fichasMatriculaService.getById(emission.periodo_referencia);
    return model?.templateConfig || fichaMatriculaDefaultTemplate;
  }

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

const PREVIEW_RESOURCE_TTL_MS = 5 * 60_000;
type CachedPromise<T> = { expiresAt: number; promise: Promise<T> };

const sharedPreviewCache = new Map<string, CachedPromise<any>>();

const getCachedPreviewResource = <T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> => {
  const cached = sharedPreviewCache.get(key) as CachedPromise<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = loader().catch((error) => {
    sharedPreviewCache.delete(key);
    throw error;
  });
  sharedPreviewCache.set(key, {
    expiresAt: Date.now() + PREVIEW_RESOURCE_TTL_MS,
    promise,
  });
  return promise;
};

const loadPreviewResource = <T>(
  mode: PreviewCacheMode,
  key: string,
  loader: () => Promise<T>,
): Promise<T> => (
  shouldUseSharedPreviewCache(mode)
    ? getCachedPreviewResource(key, loader)
    : loader()
);

const getTemplateCacheKey = (emission: EmissionLog, poloId: string) => {
  if (Object.prototype.hasOwnProperty.call(
    emission.dados_emissao || {},
    'documentTemplateSnapshot',
  )) return null;
  return [
    'template',
    emission.documento,
    poloId,
    emission.periodo_referencia || 'padrao',
  ].join(':');
};

const mapWithConcurrency = async <Item, Result>(
  items: Item[],
  limit: number,
  mapper: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const loadPreviewBatch = async (
  emissions: EmissionLog[],
  fallbackPoloId: string,
  onProgress?: (completedDocuments: number, totalDocuments: number) => void,
  cacheMode: PreviewCacheMode = 'shared',
): Promise<PreviewResources[]> => {
  if (!emissions.length) return [];

  const hasSnapshotKey = (emission: EmissionLog, key: string) => (
    Object.prototype.hasOwnProperty.call(emission.dados_emissao || {}, key)
  );
  const needsLiveWatermark = emissions.some((emission) => !hasSnapshotKey(emission, 'watermarkSnapshot'));
  const livePoloIds = [...new Set(emissions
    .filter((emission) => !hasSnapshotKey(emission, 'institutionSnapshot'))
    .map((emission) => emission.polo_id || fallbackPoloId))];

  const watermarksPromise = needsLiveWatermark
    ? loadPreviewResource(
        cacheMode,
        'watermarks',
        () => marcaDaguaService.getCompaniesWithWatermark(),
      )
    : Promise.resolve([]);
  const academicConfigsPromise = loadPreviewResource(
    cacheMode,
    'academic-configs',
    () => academicosService.getConfigs(),
  );
  const polosPromise = Promise.all(livePoloIds.map(async (poloId) => [
    poloId,
    await loadPreviewResource(cacheMode, `polo:${poloId}`, () => polosService.getById(poloId)),
  ] as const));

  const [watermarks, academicConfigs, polos] = await Promise.all([
    watermarksPromise,
    academicConfigsPromise,
    polosPromise,
  ]);
  const polosById = new Map(polos);

  let completedDocuments = 0;
  return mapWithConcurrency(emissions, 8, async (emission) => {
    const poloId = emission.polo_id || fallbackPoloId;
    const needsAcademic = [
      'boletim',
      'atestado_conclusao_tecnico',
      'historico_escolar',
      'transferencia',
    ].includes(emission.documento);
    const templateKey = getTemplateCacheKey(emission, poloId);
    const [academicData, certificate, template] = await Promise.all([
      needsAcademic
        ? loadPreviewResource(
            cacheMode,
            `academic:${emission.codigo}`,
            () => loadAcademicPreview(emission),
          )
        : Promise.resolve(null),
      isCertificateDocument(emission.documento)
        ? loadPreviewResource(
            cacheMode,
            `certificate:${emission.codigo}`,
            () => fetchCertificateForEmission(emission),
          )
        : Promise.resolve(null),
      templateKey
        ? loadPreviewResource(
            cacheMode,
            templateKey,
            () => loadTemplate(emission, poloId, academicConfigs),
          )
        : loadTemplate(emission, poloId, academicConfigs),
    ]);

    if (isCertificateDocument(emission.documento) && !certificate) {
      throw new Error('O certificado acadêmico finalizado não foi localizado para esta emissão.');
    }
    const preview = {
      template,
      watermark: hasSnapshotKey(emission, 'watermarkSnapshot')
        ? emission.dados_emissao.watermarkSnapshot
        : watermarks.find((item) => item.id === poloId) || null,
      polo: hasSnapshotKey(emission, 'institutionSnapshot')
        ? emission.dados_emissao.institutionSnapshot
        : polosById.get(poloId) || null,
      academicData,
      certificate,
    };
    completedDocuments += 1;
    onProgress?.(completedDocuments, emissions.length);
    return preview;
  });
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
    const { data, error } = await supabase.rpc('search_secretaria_emissions_secure', {
      p_polo_id: params.poloId,
      p_documento: params.activeTab === 'todos' ? null : params.activeTab,
      p_turma_id: params.turmaId === 'todos' ? null : params.turmaId,
      p_search: params.search.trim().replace(/[%_,()]/g, ' '),
      p_offset: from,
      p_limit: PAGE_SIZE,
    });
    if (error) throw error;
    const payload = (data || {}) as { items?: EmissionLog[]; total?: number };
    return {
      emissions: payload.items || [],
      total: Number(payload.total || 0),
    };
  },

  async loadEmissionByCode(code: string): Promise<EmissionLog> {
    const normalizedCode = code.trim().toUpperCase();
    const { data, error } = await supabase
      .from('documentos_validacao')
      .select(`
        *,
        aluno:parceiros(
          id, nome, cpf_cnpj, rg, data_nascimento, foto_url, sexo,
          nacionalidade, naturalidade, orgao_emissor, titulo_eleitor, titulo_eleitor_zona,
          titulo_eleitor_secao, titulo_eleitor_data_emissao, titulo_eleitor_uf, reservista,
          nome_mae, nome_pai, escola_ensino_medio, ano_conclusao_ensino_medio
        ),
        matricula:matriculas(id, status, turma:turmas(id, nome, codigo))
      `)
      .eq('codigo', normalizedCode)
      .eq('status', 'ATIVO')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(`A emissão canônica atualizada não foi localizada para o código ${normalizedCode}.`);
    }
    return data as EmissionLog;
  },

  async loadPreview(emission: EmissionLog, fallbackPoloId: string): Promise<PreviewResources> {
    const [preview] = await loadPreviewBatch([emission], fallbackPoloId);
    return preview;
  },

  async loadPreviewFresh(emission: EmissionLog, fallbackPoloId: string): Promise<PreviewResources> {
    const [preview] = await loadPreviewBatch([emission], fallbackPoloId, undefined, 'fresh');
    return preview;
  },

  async loadPreviews(
    emissions: EmissionLog[],
    fallbackPoloId: string,
    onProgress?: (completedDocuments: number, totalDocuments: number) => void,
  ): Promise<PreviewResources[]> {
    return loadPreviewBatch(emissions, fallbackPoloId, onProgress);
  },
};
