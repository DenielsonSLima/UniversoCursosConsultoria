import { getDocumentValidationUrl } from '../document-validation/document-validation.url';

interface DocumentVariableContext {
  aluno: any;
  enrollment: any;
  polo: any;
  formattedEnrollment: string;
  template: any;
  selectedYear: number;
  irpfPayments: any[];
}

const amountInWords = (value: number): string => {
  if (value === 0) return 'zero reais';
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const tens = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const group = (number: number) => {
    const hundred = Math.floor(number / 100);
    const ten = Math.floor((number % 100) / 10);
    const unit = number % 10;
    if (hundred === 1 && ten === 0 && unit === 0) return 'cem';
    const parts: string[] = [];
    if (hundred) parts.push(hundreds[hundred]);
    if (ten === 1) parts.push(teens[unit]);
    else {
      if (ten) parts.push(tens[ten]);
      if (unit) parts.push(units[unit]);
    }
    return parts.join(' e ');
  };
  const integer = Math.floor(value);
  const cents = Math.round((value - integer) * 100);
  const parts: string[] = [];
  const millions = Math.floor(integer / 1_000_000);
  const thousands = Math.floor((integer % 1_000_000) / 1_000);
  const remainder = integer % 1_000;
  if (millions) parts.push(`${group(millions)} ${millions === 1 ? 'milhão' : 'milhões'}`);
  if (thousands) parts.push(`${group(thousands)} mil`);
  if (remainder) parts.push(group(remainder));
  if (integer) parts.push(integer === 1 ? 'real' : 'reais');
  if (cents) parts.push(`e ${group(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const replaceToken = (text: string, token: string, value: string) =>
  text.replace(new RegExp(`\\{\\{${token}\\}\\}|\\{${token}\\}`, 'g'), value);

export const buildDocumentVariableReplacer = (context: DocumentVariableContext) => (source: string) => {
  if (!source) return '';
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const validityDays = context.template?.validityDays || 30;
  const validity = new Date(now);
  validity.setDate(validity.getDate() + validityDays);
  const alunoName = context.aluno?.nome || '';
  const alunoCpf = context.aluno?.cpf || context.aluno?.cpf_cnpj || '';
  const responsibleName = context.aluno?.responsavel_financeiro && context.aluno?.responsavel_nome
    ? context.aluno.responsavel_nome
    : alunoName;
  const responsibleCpf = context.aluno?.responsavel_financeiro && context.aluno?.responsavel_cpf
    ? context.aluno.responsavel_cpf
    : alunoCpf;
  const poloName = context.enrollment?.turmas?.polos?.nome || context.polo?.nomeFantasia || '';
  const irpfTotal = context.irpfPayments.reduce(
    (sum, payment) => sum + Number(payment.valor_pago || payment.valor || 0),
    0,
  );
  const replacements: Record<string, string> = {
    ALUNO_NOME: alunoName.toUpperCase(),
    ALUNO_CPF: alunoCpf,
    RESPONSAVEL_FINANCEIRO_NOME: responsibleName.toUpperCase(),
    RESPONSAVEL_FINANCEIRO_CPF: responsibleCpf,
    ALUNO_RG: context.aluno?.rg || '',
    ALUNO_MATRICULA: context.formattedEnrollment,
    CURSO_NOME: String(context.enrollment?.turmas?.cursos?.nome || '').toUpperCase(),
    TURMA_NOME: context.enrollment?.turmas?.nome || '',
    POLO_NOME: poloName,
    CIDADE_POLO: context.polo?.cidade || poloName || 'Aracaju',
    DATA_ATUAL: date,
    HORA_ATUAL: time,
    DATA_GERACAO: `${now.toLocaleDateString('pt-BR')} às ${time}`,
    VALIDADE_DIAS: String(validityDays),
    VALIDADE_DATA: validity.toLocaleDateString('pt-BR'),
    ANO_CALENDARIO: String(context.selectedYear),
    VALOR_TOTAL: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(irpfTotal),
    VALOR_EXTENSO: amountInWords(irpfTotal),
  };
  return Object.entries(replacements).reduce((text, [token, value]) => replaceToken(text, token, value), source);
};

interface ValidationCodeContext {
  prefix: 'DEC' | 'IRPF';
  registeredCode?: string;
  pattern?: string[];
  separator?: string;
  enrollment: any;
  alunoCpf: string;
  formattedEnrollment: string;
}

export const buildFallbackValidationCode = (context: ValidationCodeContext) => {
  if (context.registeredCode) return context.registeredCode;
  let body = context.formattedEnrollment;
  if (context.pattern?.length && context.enrollment) {
    body = context.pattern.map((token) => {
      if (token === '{POLO_ID}') return String(context.enrollment.turmas?.polo_id || context.enrollment.polo_id || '').slice(0, 3).toUpperCase();
      if (token === '{CURSO_ID}') return String(context.enrollment.turmas?.cursos?.id || '').slice(0, 4).toUpperCase();
      if (token === '{ALUNO_MATRICULA}') return String(context.enrollment.id);
      if (token === '{ALUNO_CPF}') return context.alunoCpf.replace(/\D/g, '');
      if (token === '{DATA_DIA}') return String(new Date().getDate()).padStart(2, '0');
      if (token === '{DATA_MES}') return String(new Date().getMonth() + 1).padStart(2, '0');
      if (token === '{ANO_ATUAL}') return String(new Date().getFullYear());
      if (token === '{RANDOM_HASH}') return String(context.enrollment.id).slice(-6).toUpperCase();
      return token.replace(/[{}]/g, '').substring(0, 4);
    }).join(context.separator || '-');
  }
  return `${context.prefix}-${body}`;
};

export const buildValidationUrl = (registeredCode: string | undefined, fallbackCode: string, baseUrl?: string) => {
  if (registeredCode) return getDocumentValidationUrl(registeredCode);
  const validationBase = baseUrl || 'https://www.universocc.com.br/validador';
  return `${validationBase}${validationBase.includes('?') ? '&' : '?'}q=${encodeURIComponent(fallbackCode)}`;
};
