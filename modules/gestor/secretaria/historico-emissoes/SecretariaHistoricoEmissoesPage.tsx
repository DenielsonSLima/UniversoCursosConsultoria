import React, { useState, useEffect, useRef } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Printer, 
  Download, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Calendar, 
  X,
  CreditCard,
  FileBadge,
  BadgeCheck,
  ClipboardCheck,
  Landmark,
  ScrollText,
  FileCheck2,
  RefreshCcw,
  BriefcaseBusiness,
  ArrowRightLeft,
  Award,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { getSecretariaContext } from '../shared/secretaria-documentos.service';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import { formatMatricula } from '../../../../lib/academicUtils';
import DocumentHeader from '../../components/DocumentHeader';
import CertificadoPreview from '../certificados/components/CertificadoPreview';
import { CertificadoAcademico, CertificadoModalidade } from '../certificados/certificados.types';
import CarteirinhaPreview from '../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
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
import ToastNotification, { useToast } from '../../components/ToastNotification';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';


// Page size for pagination
const PAGE_SIZE = 10;

// Type definition for Document Emission log
interface EmissionLog {
  id: string;
  identidade: string;
  codigo: string;
  documento: string;
  matricula_id: string;
  aluno_id: string;
  polo_id: string;
  periodo_referencia: string | null;
  referencia_externa: string | null;
  status: 'ATIVO' | 'REVOGADO';
  emitido_em: string;
  ultima_emissao_em: string;
  validade_ate: string | null;
  revogado_em: string | null;
  emitido_por: string | null;
  quantidade_emissoes: number;
  dados_emissao: any;
  aluno?: {
    id: string;
    nome: string;
    cpf_cnpj: string;
    rg?: string;
    data_nascimento?: string;
    foto_url?: string;
  };
  matricula?: {
    id: string;
    status: string;
    turma?: {
      id: string;
      nome: string;
      codigo: string;
    };
  };
}

// Available tabs mapping db value -> UI label
const DOCUMENT_TABS = [
  { key: 'todos', label: 'Todos', icon: History, color: 'blue' },
  { key: 'carteirinha', label: 'Carteirinha', icon: CreditCard, color: 'purple' },
  { key: 'cracha_estagio', label: 'Crachá de Estágio', icon: FileCheck2, color: 'rose' },
  { key: 'declaracao_matricula', label: 'Declaração Matrícula', icon: FileBadge, color: 'emerald' },
  { key: 'declaracao_frequencia', label: 'Declaração Frequência', icon: BadgeCheck, color: 'sky' },
  { key: 'declaracao_irpf', label: 'Declaração IRPF', icon: Landmark, color: 'amber' },
  { key: 'boletim', label: 'Boletim Escolar', icon: ClipboardCheck, color: 'indigo' },
  { key: 'atestado_conclusao_tecnico', label: 'Atestado de Conclusão', icon: BadgeCheck, color: 'emerald' },
  { key: 'historico_escolar', label: 'Histórico Escolar', icon: ScrollText, color: 'slate' },
  { key: 'rematricula', label: 'Rematrícula', icon: RefreshCcw, color: 'violet' },
  { key: 'termo_estagio', label: 'Termo de Estágio', icon: BriefcaseBusiness, color: 'teal' },
  { key: 'transferencia', label: 'Transferência', icon: ArrowRightLeft, color: 'orange' },
  { key: 'certificado_tecnico', label: 'Certificado Técnico', icon: Award, color: 'blue' },
  { key: 'certificado_livre', label: 'Certificado Livre', icon: Award, color: 'amber' },
  { key: 'certificado_ead', label: 'Certificado EAD', icon: Award, color: 'purple' },
  { key: 'certificado_especializacao', label: 'Certificado Especialização', icon: Award, color: 'rose' },
] as const;

const CERTIFICATE_DOCUMENT_MODALITY: Record<string, CertificadoModalidade> = {
  certificado_tecnico: 'TECNICO',
  certificado_livre: 'LIVRE',
  certificado_ead: 'EAD',
  certificado_especializacao: 'ESPECIALIZACAO',
};

const isCertificateDocument = (documento: string) => documento in CERTIFICATE_DOCUMENT_MODALITY;

const SecretariaHistoricoEmissoesPage: React.FC = () => {
  const context = getSecretariaContext();
  const { toasts, removeToast, toast } = useToast();
  
  // State variables
  const [activeTab, setActiveTab] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('todos');
  const [turmas, setTurmas] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [emissions, setEmissions] = useState<EmissionLog[]>([]);
  
  // Modal / Reprint State
  const [selectedEmission, setSelectedEmission] = useState<EmissionLog | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isReissuing, setIsReissuing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [templateConfig, setTemplateConfig] = useState<any>(null);
  const [certificatePreview, setCertificatePreview] = useState<CertificadoAcademico | null>(null);
  const [watermark, setWatermark] = useState<any>(null);
  const [poloInfo, setPoloInfo] = useState<any>(null);
  const printContentRef = useRef<HTMLDivElement>(null);

  // Load classes (turmas) for active polo
  useEffect(() => {
    const loadTurmasAndUsers = async () => {
      try {
        // Fetch turmas
        const { data: dbTurmas } = await supabase
          .from('turmas')
          .select('id, nome, codigo')
          .or(`polo_id.eq.${context.poloId},polo_id.is.null`)
          .order('nome', { ascending: true });
        
        setTurmas(dbTurmas || []);

        // Fetch system users to map operator names
        const { data: dbUsers } = await supabase
          .from('usuarios_sistema')
          .select('id, nome');
        
        const userMap: Record<string, string> = {};
        (dbUsers || []).forEach((u) => {
          userMap[u.id] = u.nome;
        });
        setSystemUsers(userMap);
      } catch (err) {
        console.error('Erro ao inicializar filtros do histórico:', err);
      }
    };

    loadTurmasAndUsers();
  }, [context.poloId]);

  // Fetch paginated and filtered emissions
  const loadEmissionsData = async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('documentos_validacao')
        .select(`
          *,
          aluno:parceiros(id, nome, cpf_cnpj, rg, data_nascimento, foto_url),
          matricula:matriculas(
            id,
            status,
            turma:turmas(id, nome, codigo)
          )
        `, { count: 'exact' })
        .eq('status', 'ATIVO');

      // Tab filter
      if (activeTab !== 'todos') {
        query = query.eq('documento', activeTab);
      }

      // Polo filter
      if (context.poloId) {
        query = query.eq('polo_id', context.poloId);
      }

      // Class (Turma) filter
      if (selectedTurmaId !== 'todos') {
        query = query.eq('matriculas.turma_id', selectedTurmaId);
      }

      // Search term
      if (searchQuery.trim()) {
        const cleanSearch = searchQuery.trim();
        query = query.or(`codigo.ilike.%${cleanSearch}%,dados_emissao->>studentName.ilike.%${cleanSearch}%,dados_emissao->>studentCpf.ilike.%${cleanSearch}%`);
      }

      const { data, count, error } = await query
        .order('ultima_emissao_em', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setEmissions((data || []) as EmissionLog[]);
      setTotalRecords(count || 0);
    } catch (err: any) {
      console.error('Erro ao carregar histórico de emissões:', err);
      toast.error('Erro Supabase', err?.message || String(err));
    } finally {
      setLoading(false);
    }

  };

  useEffect(() => {
    loadEmissionsData();
  }, [activeTab, selectedTurmaId, page]);

  // Search execution helper
  const handleSearchClick = () => {
    setPage(1);
    loadEmissionsData();
  };

  const fetchCertificateForEmission = async (emission: EmissionLog): Promise<CertificadoAcademico | null> => {
    if (!isCertificateDocument(emission.documento)) return null;

    const select = `
      *,
      aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj),
      turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
      curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria, ead_config),
      polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
    `;

    const byCode = await supabase
      .from('certificados_academicos')
      .select(select)
      .eq('codigo_validacao', emission.codigo)
      .maybeSingle();

    if (byCode.error) throw byCode.error;
    if (byCode.data) return byCode.data as unknown as CertificadoAcademico;

    const certificateId = emission.dados_emissao?.certificateId;
    if (certificateId) {
      const byId = await supabase
        .from('certificados_academicos')
        .select(select)
        .eq('id', certificateId)
        .maybeSingle();

      if (byId.error) throw byId.error;
      if (byId.data) return byId.data as unknown as CertificadoAcademico;
    }

    const byEnrollment = await supabase
      .from('certificados_academicos')
      .select(select)
      .eq('matricula_id', emission.matricula_id)
      .eq('modalidade', CERTIFICATE_DOCUMENT_MODALITY[emission.documento])
      .eq('status', 'FINALIZADO')
      .order('emitido_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byEnrollment.error) throw byEnrollment.error;
    return (byEnrollment.data || null) as unknown as CertificadoAcademico | null;
  };

  // Re-issue Second Copy (2ª Via) handler
  const handleOpenPreview = async (emission: EmissionLog) => {
    setSelectedEmission(emission);
    setIsPreviewOpen(true);
    setIsLoadingPreview(true);
    setTemplateConfig(null);
    setCertificatePreview(null);
    
    try {
      const poloId = emission.polo_id || context.poloId;
      const [polo, watermarks, academicConfigs] = await Promise.all([
        polosService.getById(poloId),
        marcaDaguaService.getCompaniesWithWatermark(),
        academicosService.getConfigs(),
      ]);

      let template: any = null;
      if (emission.documento === 'carteirinha') {
        const savedTemplate = await carteirinhaService.getTemplate();
        template = {
          ...savedTemplate,
          corPrimaria: academicConfigs.carteirinhaPrimaryColor || savedTemplate?.corPrimaria,
          corSecundaria: academicConfigs.carteirinhaSecondaryColor || savedTemplate?.corSecundaria,
        };
      } else if (emission.documento === 'cracha_estagio') {
        template = await crachaService.getTemplate();
      } else if (emission.documento === 'declaracao_matricula') {
        template = await declaracaoService.getTemplate(poloId);
      } else if (emission.documento === 'declaracao_frequencia') {
        template = await declaracaoFrequenciaService.getTemplate(poloId);
      } else if (emission.documento === 'declaracao_irpf') {
        template = await irpfService.getTemplate(poloId);
      } else if (emission.documento === 'boletim') {
        template = await boletimService.getTemplate('TECNICO');
      } else if (emission.documento === 'historico_escolar') {
        template = await historicoService.getTemplate(poloId);
      } else if (emission.documento === 'transferencia') {
        template = await transferenciaService.getTemplate(poloId);
      } else if (isCertificateDocument(emission.documento)) {
        const certificate = await fetchCertificateForEmission(emission);
        setCertificatePreview(certificate);
        const { data } = await supabase
          .from('documentos_templates')
          .select('conteudo')
          .eq('id', 'diplomas')
          .maybeSingle();
        const tipoMap: Record<string, string> = {
          certificado_tecnico: 'Cursos Técnicos',
          certificado_livre: 'Cursos Livres',
          certificado_ead: 'Educação a Distância (EAD)',
          certificado_especializacao: 'Cursos Especialização',
        };
        template = Array.isArray(data?.conteudo)
          ? data.conteudo.find((item: any) => item.tipoCurso === tipoMap[emission.documento])
          : null;
      } else {
        const templatePrefix: Record<string, string> = {
          boletim: 'boletim_tecnico',
          atestado_conclusao_tecnico: 'atestado_conclusao_tecnico',
          historico_escolar: 'historico',
          termo_estagio: 'estagio',
        };
        const modalityScopedDocuments = new Set(['boletim', 'atestado_conclusao_tecnico']);
        const templateScope = modalityScopedDocuments.has(emission.documento) ? 'TECNICO' : poloId;
        const templateId = `${templatePrefix[emission.documento] || emission.documento}_${templateScope}`;
        const { data } = await supabase
          .from('documentos_templates')
          .select('conteudo')
          .eq('id', templateId)
          .maybeSingle();
        template = data?.conteudo || null;
      }

      setTemplateConfig(template);
      setWatermark(watermarks.find((item) => item.id === poloId) || null);
      setPoloInfo(polo);
    } catch (err) {
      console.error('Erro ao carregar templates para segunda via:', err);
      toast.error('Erro ao carregar modelo', 'Não foi possível abrir o modelo oficial deste documento.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const getPreviewStudent = (emission: EmissionLog) => {
    const birthDate = emission.dados_emissao?.studentBirthDate || emission.aluno?.data_nascimento || '';
    const birthParts = birthDate.split('T')[0]?.split('-') || [];
    const nascimento = birthParts.length === 3
      ? `${birthParts[2]}/${birthParts[1]}/${birthParts[0]}`
      : birthDate;
    const expiresAt = emission.validade_ate ? new Date(emission.validade_ate) : null;

    return {
      id: emission.aluno_id,
      nome: emission.dados_emissao?.studentName || emission.aluno?.nome || '',
      cpf: emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || '',
      rg: emission.aluno?.rg || '',
      nascimento,
      matricula: emission.dados_emissao?.studentMatricula
        || formatMatricula(emission.matricula_id, emission.emitido_em, emission.polo_id),
      curso: emission.dados_emissao?.courseName || '',
      instituicao: emission.dados_emissao?.institutionName || 'Universo Cursos e Consultoria',
      validade: expiresAt ? expiresAt.toLocaleDateString('pt-BR') : '',
      fotoUrl: emission.dados_emissao?.studentPhotoUrl || emission.aluno?.foto_url || null,
      validationCode: emission.codigo,
      poloRazaoSocial: poloInfo?.nome,
      poloCnpj: poloInfo?.cnpj,
      poloTelefone: poloInfo?.telefone,
    };
  };

  const handleRegisterReissue = async () => {
    if (!selectedEmission) return;
    setIsReissuing(true);
    try {
      // Execute the database function update
      await documentValidationService.issue({
        type: selectedEmission.documento as any,
        enrollmentId: selectedEmission.matricula_id,
        referencePeriod: selectedEmission.periodo_referencia || undefined,
        sourceReference: selectedEmission.referencia_externa || undefined,
        issuedBy: context.userId,
        registerReissue: true
      });

      // Reload the data count and list in the background
      loadEmissionsData();

      // Trigger the browser print
      setTimeout(() => {
        window.print();
      }, 500);

    } catch (err) {
      console.error('Erro ao registrar segunda via:', err);
      toast.error('Erro ao Registrar', 'Não foi possível registrar a emissão da segunda via no banco.');
    } finally {
      setIsReissuing(false);
    }
  };

  // HTML canvas & jsPDF download helper
  const handleDownloadPdf = async () => {
    const container = printContentRef.current;
    if (!container || !selectedEmission) return;

    setIsDownloading(true);
    try {
      const certificatePages = Array.from(container.querySelectorAll('[data-certificate-pdf-page="true"]')) as HTMLElement[];
      const pageNodes = certificatePages.length
        ? certificatePages
        : [container.querySelector('.print-page') as HTMLElement].filter(Boolean);

      if (!pageNodes.length) throw new Error('Elemento de página não localizado.');
      const isLandscape = certificatePages.length > 0;

      // Wait briefly for images and styling
      await new Promise(r => setTimeout(r, 400));

      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      for (const [index, pageNode] of pageNodes.entries()) {
        const canvas = await html2canvas(pageNode, {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: false,
        });

        if (index > 0) pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          isLandscape ? 297 : 210,
          isLandscape ? 210 : 297,
          undefined,
          'FAST'
        );
      }

      pdf.save(`2-via-${selectedEmission.documento}-${selectedEmission.codigo}.pdf`);
      
      // Update DB counter for duplicate release
      await documentValidationService.issue({
        type: selectedEmission.documento as any,
        enrollmentId: selectedEmission.matricula_id,
        referencePeriod: selectedEmission.periodo_referencia || undefined,
        sourceReference: selectedEmission.referencia_externa || undefined,
        issuedBy: context.userId,
        registerReissue: true
      });
      loadEmissionsData();
    } catch (err) {
      console.error('Erro ao gerar PDF da segunda via:', err);
      toast.error('Erro ao Processar', 'Erro ao processar o PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Text template parsing method
  const parseTemplate = (htmlText: string, data: EmissionLog) => {
    if (!htmlText) return '';
    let parsed = htmlText;

    const today = new Date(data.emitido_em);
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const dataExtenso = `${today.getDate()} de ${meses[today.getMonth()]} de ${today.getFullYear()}`;
    const horaAtual = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

    const validityDays = templateConfig?.validityDays || 30;
    const expiresAt = data.validade_ate 
      ? new Date(data.validade_ate) 
      : new Date(today.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const validadeFormatada = `${String(expiresAt.getDate()).padStart(2, '0')}/${String(expiresAt.getMonth() + 1).padStart(2, '0')}/${expiresAt.getFullYear()}`;

    const formatarData = (dataStr?: string) => {
      if (!dataStr) return 'Não informada';
      const dateOnly = dataStr.split('T')[0];
      const parts = dateOnly.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dataStr;
    };

    const dados = data.dados_emissao || {};

    parsed = parsed.replace(/{{ALUNO_NOME}}/g, (dados.studentName || data.aluno?.nome || '').toUpperCase());
    parsed = parsed.replace(/{{ALUNO_CPF}}/g, dados.studentCpf || data.aluno?.cpf_cnpj || 'Não informado');
    parsed = parsed.replace(/{{ALUNO_DOCUMENTO_TIPO}}/g, 'RG');
    parsed = parsed.replace(/{{ALUNO_RG}}/g, data.aluno?.rg || 'Não informado');
    parsed = parsed.replace(/{{ALUNO_NASCIMENTO}}/g, formatarData(dados.studentBirthDate || data.aluno?.data_nascimento));
    parsed = parsed.replace(/{{ALUNO_MATRICULA}}/g, dados.studentMatricula || formatMatricula(data.matricula_id, data.emitido_em, data.polo_id));
    parsed = parsed.replace(/{{CURSO_NOME}}/g, dados.courseName || '');
    parsed = parsed.replace(/{{TURMA_NOME}}/g, dados.className || '');
    parsed = parsed.replace(/{{POLO_NOME}}/g, dados.unitName || poloInfo?.nome || 'Universo Cursos e Consultoria');
    parsed = parsed.replace(/{{POLO_CNPJ}}/g, poloInfo?.cnpj || '');
    parsed = parsed.replace(/{{CIDADE_POLO}}/g, poloInfo?.cidade || 'Aracaju');
    parsed = parsed.replace(/{{DATA_ATUAL}}/g, dataExtenso);
    parsed = parsed.replace(/{{HORA_ATUAL}}/g, horaAtual);
    parsed = parsed.replace(/{{DATA_GERACAO}}/g, `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} às ${horaAtual}`);
    parsed = parsed.replace(/{{VALIDADE_DIAS}}/g, String(validityDays));
    parsed = parsed.replace(/{{VALIDADE_DATA}}/g, validadeFormatada);
    parsed = parsed.replace(/{{nome_aluno}}/g, (dados.studentName || data.aluno?.nome || '').toUpperCase());
    parsed = parsed.replace(/{{cpf}}/g, dados.studentCpf || data.aluno?.cpf_cnpj || 'Não informado');
    parsed = parsed.replace(/{{curso_nome}}/g, dados.courseName || '');
    parsed = parsed.replace(/{{carga_horaria}}/g, String(dados.courseHours || ''));
    parsed = parsed.replace(/{{data_conclusao}}/g, formatarData(dados.completionDate));
    parsed = parsed.replace(/{{certificado_numero}}/g, dados.certificateNumber || '—');
    parsed = parsed.replace(/{{pagina_livro}}/g, dados.registryPage || '—');
    parsed = parsed.replace(/{{livro}}/g, dados.registryBook || '—');
    parsed = parsed.replace(/{{validacao_sistec}}/g, dados.sistecValidation || '—');
    parsed = parsed.replace(/{{ensino_medio_estabelecimento}}/g, dados.highSchoolInstitution || 'Não informado');
    parsed = parsed.replace(/{{ensino_medio_localidade_uf}}/g, dados.highSchoolLocation || 'Não informado');
    parsed = parsed.replace(/{{ensino_medio_ano_conclusao}}/g, dados.highSchoolCompletionYear || 'Não informado');

    return parsed;
  };

  // Tab change wrapper
  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    setPage(1);
  };

  const pagesCount = Math.ceil(totalRecords / PAGE_SIZE);

  return (
    <div className="space-y-6 text-xs font-sans animate-fadeIn">
      {/* Search and filtering options */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        
        {/* Search query input */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por nome do aluno, CPF ou código validador..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchClick()}
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-semibold text-slate-700 text-sm transition-all"
          />
        </div>

        {/* Group / Class filter */}
        <div className="flex gap-3 w-full md:w-auto shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-3.5 border border-slate-200 rounded-2xl flex-1 md:flex-initial">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select 
              value={selectedTurmaId} 
              onChange={(e) => { setSelectedTurmaId(e.target.value); setPage(1); }} 
              className="outline-none font-bold text-slate-600 bg-transparent border-none text-xs cursor-pointer w-full"
            >
              <option value="todos">Filtrar por Turma (Todas)</option>
              {turmas.map(t => (
                <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSearchClick}
            className="px-6 py-3.5 bg-[#001a33] hover:bg-blue-900 text-white rounded-2xl font-black uppercase tracking-wider transition-colors shadow-sm text-xs"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-1.5 flex flex-wrap gap-1">
        {DOCUMENT_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all ${
                isSelected
                  ? 'bg-[#001a33] text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <TabIcon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed text-left border-collapse">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[17%]" />
              <col className="w-[16%]" />
              <col className="w-[13%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase font-black tracking-wider text-[9px]">
                <th className="px-5 py-3.5">Data / Tipo</th>
                <th className="px-5 py-3.5">Estudante / CPF</th>
                <th className="px-5 py-3.5">Cód. Validador</th>
                <th className="px-5 py-3.5">Validade</th>
                <th className="px-5 py-3.5">Emitido por</th>
                <th className="px-5 py-3.5 text-center">Emissões</th>
                <th className="px-5 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Loader2 className="animate-spin text-blue-600 mx-auto" size={32} />
                    <span className="block text-slate-400 font-bold uppercase tracking-widest mt-2 text-[10px]">
                      Carregando logs do histórico...
                    </span>
                  </td>
                </tr>
              ) : emissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400 font-bold uppercase text-[10px]">
                    Nenhuma emissão registrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                emissions.map((item) => {
                  const operatorName = item.emitido_por 
                    ? (systemUsers[item.emitido_por] || 'Operador do Sistema') 
                    : 'Aluno (Auto-emissão)';
                  
                  const tabInfo = DOCUMENT_TABS.find(t => t.key === item.documento);
                  const docLabel = tabInfo ? tabInfo.label : item.documento.replace('_', ' ');

                  const dtEmissao = new Date(item.emitido_em).toLocaleString('pt-BR');
                  const validityDate = item.validade_ate ? new Date(item.validade_ate) : null;
                  const hasExpired = validityDate ? validityDate.getTime() < Date.now() : false;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                      {/* Date & Type */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-[#001a33] text-xs leading-none">
                            {docLabel}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold mt-1 leading-none">
                            {dtEmissao}
                          </span>
                        </div>
                      </td>

                      {/* Student info */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-xs block leading-tight">
                            {item.dados_emissao?.studentName || item.aluno?.nome || 'NÃO IDENTIFICADO'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold mt-0.5 leading-none">
                            CPF: {item.dados_emissao?.studentCpf || item.aluno?.cpf_cnpj || '---'}
                          </span>
                        </div>
                      </td>

                      {/* Validation Code */}
                      <td className="px-5 py-4">
                        <span className="block truncate font-mono font-black text-blue-600 text-[11px] select-all" title={item.codigo}>
                          {item.codigo}
                        </span>
                      </td>

                      {/* Validity */}
                      <td className="px-5 py-4">
                        {validityDate ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-700 whitespace-nowrap">
                              <Calendar size={12} className={hasExpired ? 'text-rose-500' : 'text-emerald-500'} />
                              {validityDate.toLocaleDateString('pt-BR')}
                            </span>
                            <span className={`rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                              hasExpired
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {hasExpired ? 'Expirado' : 'Vigente'}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">
                            Sem validade
                          </span>
                        )}
                      </td>

                      {/* Operator */}
                      <td className="px-5 py-4">
                        <span className="block truncate text-xs font-semibold text-slate-500" title={operatorName}>
                          {operatorName}
                        </span>
                      </td>

                      {/* Emission Count */}
                      <td className="px-5 py-4 text-center">
                        <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-black">
                          {item.quantidade_emissoes}x
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenPreview(item)}
                          className="px-3.5 py-1.5 bg-[#001a33] hover:bg-blue-600 text-white rounded-lg font-bold uppercase tracking-wider text-[10px] transition-colors inline-flex items-center gap-1.5"
                        >
                          <Printer size={12} />
                          Visualizar / 2ª Via
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination element */}
        {pagesCount > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/30">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Página {page} de {pagesCount} · {totalRecords} registros
            </span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setPage(1)} 
                disabled={page === 1} 
                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"
              >
                <ChevronsLeft size={13} />
              </button>
              <button 
                onClick={() => setPage(page - 1)} 
                disabled={page === 1} 
                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"
              >
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: Math.min(5, pagesCount) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, pagesCount - 4));
                const p = start + i;
                if (p > pagesCount) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-lg font-black text-[10px] transition-colors ${
                      p === page ? 'bg-[#001a33] text-white' : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button 
                onClick={() => setPage(page + 1)} 
                disabled={page === pagesCount} 
                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"
              >
                <ChevronRight size={13} />
              </button>
              <button 
                onClick={() => setPage(pagesCount)} 
                disabled={page === pagesCount} 
                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"
              >
                <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2ª Via / Reprint Visualizer Modal */}
      {isPreviewOpen && selectedEmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn" id="reprint-modal">
          <div className="bg-white rounded-3xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slideUp">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
              <div>
                <h4 className="font-black text-[#001a33] text-sm uppercase tracking-wide">
                  Segunda Via de Documento
                </h4>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                  Visualização do Código: {selectedEmission.codigo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold uppercase tracking-wider text-[10px] transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  PDF
                </button>
                <button
                  onClick={handleRegisterReissue}
                  disabled={isReissuing}
                  className="px-4 py-2 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] transition-colors shadow-md inline-flex items-center gap-1.5"
                >
                  {isReissuing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                  Imprimir (Registrar 2ª Via)
                </button>
                <button
                  onClick={() => { setIsPreviewOpen(false); setSelectedEmission(null); setTemplateConfig(null); setCertificatePreview(null); }}
                  className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body / Document Preview Area */}
            <div className="flex-1 bg-slate-100 p-8 overflow-y-auto flex justify-center custom-scrollbar">
              <div ref={printContentRef} className="print-content-container">
                {isLoadingPreview && (
                  <div className="w-[210mm] h-[297mm] max-w-full bg-white flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="animate-spin text-blue-600 mb-4" size={36} />
                    <span className="font-black uppercase tracking-widest text-[10px]">Carregando modelo oficial...</span>
                  </div>
                )}

                {/* 1. CARTEIRINHA PREVIEW */}
                {!isLoadingPreview && selectedEmission.documento === 'carteirinha' && templateConfig && (
                  <div className="print-page reprint-card-page w-[210mm] h-[297mm] bg-white text-black p-[5mm] mx-auto shadow-xl box-border border border-slate-200 overflow-hidden">
                    <div className="print-fold-grid grid grid-rows-5 gap-y-[1.5mm]">
                      <div className="flex items-center justify-center w-full relative">
                        <div className="flex border border-slate-300 rounded-[2.5mm] overflow-hidden shadow-sm relative">
                          <div className="w-[85.6mm] h-[54mm] relative border-r border-dashed border-slate-400">
                            <CarteirinhaPreview
                              formData={templateConfig}
                              page="frente"
                              zoomLevel={100}
                              aluno={getPreviewStudent(selectedEmission)}
                            />
                          </div>
                          <div className="w-[85.6mm] h-[54mm] relative">
                            <CarteirinhaPreview
                              formData={templateConfig}
                              page="verso"
                              zoomLevel={100}
                              aluno={getPreviewStudent(selectedEmission)}
                            />
                          </div>
                        </div>
                      </div>
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-center w-[171.2mm] h-[54mm] border-2 border-dashed border-slate-100 rounded-[2.5mm] mx-auto bg-slate-50/30 text-[10px] text-slate-300 font-bold uppercase tracking-widest print:hidden"
                        >
                          Espaço disponível
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. CRACHÁ DE ESTÁGIO PREVIEW */}
                {!isLoadingPreview && selectedEmission.documento === 'cracha_estagio' && templateConfig && (
                  <div className="flex flex-col gap-4 items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm print:shadow-none">
                    <div className="print-page border border-slate-150 p-2 rounded-2xl bg-white">
                      <h5 className="text-[10px] text-center font-bold text-slate-400 mb-2 uppercase print:hidden">Frente</h5>
                      <CrachaPreview
                        formData={templateConfig}
                        page="frente"
                        zoomLevel={100}
                        aluno={{
                          nome: selectedEmission.dados_emissao?.studentName || selectedEmission.aluno?.nome || '',
                          cpf: selectedEmission.dados_emissao?.studentCpf || selectedEmission.aluno?.cpf_cnpj || '',
                          rg: selectedEmission.aluno?.rg || '',
                          matricula: selectedEmission.dados_emissao?.studentMatricula || '',
                          cargo: 'ESTUDANTE',
                          polo: selectedEmission.dados_emissao?.unitName || '',
                          fotoUrl: selectedEmission.dados_emissao?.studentPhotoUrl || selectedEmission.aluno?.foto_url || null,
                          validationCode: selectedEmission.codigo
                        }}
                      />
                    </div>
                    <div className="print-page border border-slate-150 p-2 rounded-2xl bg-white mt-4">
                      <h5 className="text-[10px] text-center font-bold text-slate-400 mb-2 uppercase print:hidden">Verso</h5>
                      <CrachaPreview
                        formData={templateConfig}
                        page="verso"
                        zoomLevel={100}
                        aluno={{
                          nome: selectedEmission.dados_emissao?.studentName || selectedEmission.aluno?.nome || '',
                          cpf: selectedEmission.dados_emissao?.studentCpf || selectedEmission.aluno?.cpf_cnpj || '',
                          rg: selectedEmission.aluno?.rg || '',
                          matricula: selectedEmission.dados_emissao?.studentMatricula || '',
                          cargo: 'ESTUDANTE',
                          polo: selectedEmission.dados_emissao?.unitName || '',
                          fotoUrl: selectedEmission.dados_emissao?.studentPhotoUrl || selectedEmission.aluno?.foto_url || null,
                          validationCode: selectedEmission.codigo
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 3. CERTIFICADOS OFICIAIS */}
                {!isLoadingPreview && isCertificateDocument(selectedEmission.documento) && certificatePreview && (
                  <div id="certificate-reprint-pages" className="space-y-6">
                    <CertificadoPreview certificado={certificatePreview} modelo={templateConfig} pdfMode />
                  </div>
                )}

                {!isLoadingPreview && isCertificateDocument(selectedEmission.documento) && !certificatePreview && (
                  <div className="w-[210mm] min-h-[120mm] max-w-full rounded-2xl border border-amber-100 bg-white p-8 text-center shadow-xl">
                    <Award className="mx-auto mb-4 text-amber-500" size={38} />
                    <h5 className="text-sm font-black uppercase tracking-widest text-[#001a33]">
                      Certificado oficial não localizado
                    </h5>
                    <p className="mx-auto mt-3 max-w-md text-xs font-bold leading-relaxed text-slate-500">
                      O histórico possui um código de certificado, mas não há um registro acadêmico finalizado correspondente para renderizar a segunda via oficial.
                    </p>
                  </div>
                )}

                {/* 3. A4 STANDARD TEMPLATE DOCUMENTS */}
                {!isLoadingPreview && selectedEmission.documento !== 'carteirinha' && selectedEmission.documento !== 'cracha_estagio' && !isCertificateDocument(selectedEmission.documento) && (
                  <div
                    className="print-page w-[210mm] min-h-[297mm] bg-white text-black p-[20mm] mx-auto shadow-xl relative box-border border border-slate-200 overflow-hidden text-left"
                    style={{ fontFamily: '"Times New Roman", Times, serif' }}
                  >
                    {/* Watermark */}
                    {watermark?.watermarkUrl && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                        <img
                          src={watermark.watermarkUrl}
                          alt="Watermark"
                          style={{
                            opacity: watermark.watermarkOpacity || 0.1,
                            width: `${watermark.watermarkScale || 50}%`,
                            transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none'
                          }}
                        />
                      </div>
                    )}

                    {/* Header */}
                    <DocumentHeader polo={poloInfo} orientation="portrait" />

                    {/* Title */}
                    <div className="text-center mb-12 relative z-10 mt-6">
                      <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
                        {DOCUMENT_TABS.find(t => t.key === selectedEmission.documento)?.label || 'DOCUMENTO'}
                      </h2>
                    </div>

                    {/* Body text content */}
                    {templateConfig ? (
                      <div 
                        className="relative z-20 mb-20 text-justify leading-loose text-lg text-black" 
                        dangerouslySetInnerHTML={{ __html: parseTemplate(templateConfig.textContent || templateConfig.textoFrente, selectedEmission) }} 
                      />
                    ) : (
                      <div className="relative z-20 mb-20 text-justify leading-relaxed text-sm text-black">
                        <p>
                          Declaramos para os devidos fins que o(a) aluno(a) <b>{(selectedEmission.dados_emissao?.studentName || selectedEmission.aluno?.nome || '').toUpperCase()}</b>, 
                          portador(a) do CPF nº <b>{selectedEmission.dados_emissao?.studentCpf || selectedEmission.aluno?.cpf_cnpj || 'Não informado'}</b>, 
                          regularmente matriculado(a) no curso de <b>{selectedEmission.dados_emissao?.courseName || ''}</b>, 
                          na turma <b>{selectedEmission.dados_emissao?.className || ''}</b>, encontra-se regular com suas obrigações acadêmicas.
                        </p>
                      </div>
                    )}

                    {/* Absolute Fields (QR validation link and signatures) */}
                    {templateConfig?.absoluteFields?.map((field: any) => {
                      const parsedVal = parseTemplate(field.value, selectedEmission);
                      return (
                        <div
                          key={field.id}
                          className="absolute z-30"
                          style={{
                            left: field.x,
                            top: field.y,
                            color: '#000',
                            width: field.width ? `${field.width}px` : 'auto',
                            height: 'auto',
                            ...field.style
                          }}
                        >
                          {field.type === 'qrcode' && (
                            <div className="w-full bg-white p-1 rounded border border-slate-100 flex flex-col items-center justify-center text-center">
                              <div className="w-full aspect-square bg-white flex items-center justify-center mb-0.5" style={{ width: field.width ? `${field.width}px` : '80px' }}>
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`https://www.universocc.com.br/validador?q=${selectedEmission.codigo}`)}`}
                                  alt="QR Code"
                                  className="w-full h-full object-contain pointer-events-none"
                                />
                              </div>
                              <p className="text-[6px] font-bold text-slate-400 uppercase tracking-wide leading-none">CÓD. VALIDAÇÃO</p>
                              <p className="text-[8px] font-mono font-black text-blue-600 tracking-wider mt-0.5 leading-none select-all">
                                {selectedEmission.codigo}
                              </p>
                            </div>
                          )}

                          {field.type === 'image' && (
                            <img
                              src={field.value}
                              alt="Assinatura"
                              className="w-full h-auto object-contain pointer-events-none"
                              style={{ width: field.width ? `${field.width}px` : '150px' }}
                            />
                          )}

                          {field.type === 'text' && (
                            <span dangerouslySetInnerHTML={{ __html: parsedVal }} className="w-full break-words" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #reprint-modal, #reprint-modal * {
                visibility: visible;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #reprint-modal {
                position: absolute;
                left: 0;
                top: 0;
                width: ${isCertificateDocument(selectedEmission.documento) ? '297mm' : '210mm'} !important;
                height: auto !important;
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                box-shadow: none !important;
              }
              .print-page {
                width: 210mm !important;
                height: 297mm !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                margin: 0 !important;
                padding: 20mm !important;
                box-shadow: none !important;
                border: none !important;
                background: white !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
              }
              .print-page.reprint-card-page {
                padding: 5mm !important;
              }
              [data-certificate-pdf-page="true"] {
                width: 297mm !important;
                height: 210mm !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                margin: 0 !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                overflow: hidden !important;
              }
              .reprint-card-page .print-fold-grid {
                display: grid !important;
                grid-template-rows: repeat(5, 54mm) !important;
                row-gap: 1.5mm !important;
                align-content: start !important;
              }
              .print-page img {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print:hidden {
                display: none !important;
              }
            }
            @page {
              size: ${isCertificateDocument(selectedEmission.documento) ? 'A4 landscape' : 'A4 portrait'};
              margin: 0;
            }
          `}} />
        </div>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default SecretariaHistoricoEmissoesPage;
