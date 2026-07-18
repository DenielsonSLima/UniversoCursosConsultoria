import { getDocumentValidationUrl } from '../../../../shared/document-validation/document-validation.url';
import { CertificadoAcademico } from '../certificados.types';

const formatCertificateDate = (date?: string | null) =>
  date ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR') : '';

const formatCertificateDateLong = (date?: string | null) =>
  date
    ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

const highlightApprovalStatus = (html: string) =>
  String(html || '').replace(
    /\s*-\s*Aprovado\b/gi,
    '<br /><br /><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#001a33;color:#ffffff;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;">APROVADO</span>',
  );

const getTechnicalCourseTitle = (courseName?: string | null) => {
  const normalized = String(courseName || '').trim();
  if (!normalized) return 'TÉCNICO EM __________________';
  const title = /^t[eé]cnico\s+em\s+/i.test(normalized)
    ? normalized
    : `Técnico em ${normalized}`;
  return title.toLocaleUpperCase('pt-BR');
};

const inferTechnologicalAxis = (certificado: CertificadoAcademico) => {
  const configured = certificado.curso?.ead_config?.eixo_tecnologico
    || certificado.curso?.ead_config?.eixoTecnologico;
  if (configured) return String(configured).toLocaleLowerCase('pt-BR');

  const courseContext = `${certificado.curso?.nome || ''} ${certificado.curso?.area || ''}`;
  if (/enfermagem|radiologia|sa[uú]de|odont|farm[aá]cia/i.test(courseContext)) {
    return 'ambiente e saúde';
  }

  return '________________';
};

const buildCertificateTemplateVars = (certificado: CertificadoAcademico) => {
  const dataInicio = formatCertificateDate(certificado.data_inscricao);
  const dataFim = formatCertificateDate(certificado.data_conclusao);
  const dataFimExtenso = formatCertificateDateLong(certificado.data_conclusao);

  return {
    nome_aluno: certificado.aluno?.nome || '',
    cpf: certificado.aluno?.cpf_cnpj || '',
    curso_nome: certificado.curso?.nome || '',
    curso_titulo: getTechnicalCourseTitle(certificado.curso?.nome),
    carga_horaria: String(certificado.curso?.carga_horaria || ''),
    rg: certificado.aluno?.rg || '________________',
    naturalidade: certificado.aluno?.naturalidade || '________________',
    data_nascimento: formatCertificateDate(certificado.aluno?.data_nascimento) || '________________',
    eixo_tecnologico: inferTechnologicalAxis(certificado),
    cidade: certificado.polo?.cidade || 'Não informado',
    uf: certificado.polo?.estado || 'Não informado',
    cidade_uf: `${certificado.polo?.cidade || 'Não informado'}/${certificado.polo?.estado || 'Não informado'}`,
    data_inicio: dataInicio,
    data_fim: dataFim,
    periodo: dataInicio && dataFim ? `${dataInicio} até ${dataFim}` : dataFim,
    data_conclusao: dataFim,
    data_conclusao_extenso: dataFimExtenso || dataFim,
    grade_curricular: 'Grade curricular conforme histórico acadêmico do aluno.',
    livro_registro: `Certificado Expedido N° ${certificado.certificado_numero || '____'} · Página ${certificado.pagina_livro || '____'} · Livro ${certificado.livro_registro || '____'}`,
    certificado_numero: certificado.certificado_numero || '____',
    codigo_certificado: certificado.codigo_validacao || certificado.certificado_numero || '____',
    pagina_livro: certificado.pagina_livro || '____',
    livro: certificado.livro_registro || '____',
    validacao_sistec: certificado.validacao_sistec || '________________',
    ensino_medio_estabelecimento: certificado.ensino_medio_estabelecimento || 'Não informado',
    ensino_medio_localidade_uf: certificado.ensino_medio_localidade_uf || 'Não informado',
    ensino_medio_ano_conclusao: certificado.ensino_medio_ano_conclusao || 'Não informado',
    url_validacao: getDocumentValidationUrl(certificado.codigo_validacao || ''),
  };
};

export const parseProgrammaticRows = (content: string) => {
  const plain = String(content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');

  return plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^conte[uú]do program[aá]tico:?$/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return null;

      return {
        nome: parts[0],
        carga: parts[1] || '',
        status: parts.slice(2).join(' - '),
      };
    })
    .filter(Boolean) as Array<{ nome: string; carga: string; status: string }>;
};

const replaceCertificateVars = (
  text: string,
  certificado: CertificadoAcademico,
  extraVars: Record<string, string>,
  strong: boolean,
) => Object.entries({ ...buildCertificateTemplateVars(certificado), ...extraVars }).reduce(
  (result, [key, value]) => result.replace(
    new RegExp(`{{${key}}}`, 'g'),
    strong ? `<strong>${value}</strong>` : value,
  ),
  text || '',
);

export const replaceVars = (
  text: string,
  certificado: CertificadoAcademico,
  extraVars: Record<string, string> = {},
) => highlightApprovalStatus(replaceCertificateVars(text, certificado, extraVars, true));

export const replaceVarsPlain = (
  text: string,
  certificado: CertificadoAcademico,
  extraVars: Record<string, string> = {},
) => replaceCertificateVars(text, certificado, extraVars, false);
