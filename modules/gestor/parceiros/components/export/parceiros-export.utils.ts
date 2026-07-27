import {
  formatCnpj,
  formatCpf,
  formatPhone,
  onlyDigits,
} from '../../../../../lib/documentFormatters';

export interface ParceiroExportRow {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  documento: string;
  telefone: string;
  email: string;
  cidadeUf: string;
  polo: string;
}

const normalizeStatus = (status?: string | null) => {
  const normalized = String(status || 'Não informado').trim().toLocaleLowerCase('pt-BR');
  return normalized.charAt(0).toLocaleUpperCase('pt-BR') + normalized.slice(1);
};

const formatDocument = (item: any) => {
  const value = item?.cpf || item?.cnpj || item?.cpfCnpj || item?.cpf_cnpj || '';
  const digits = onlyDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return String(value || 'Não informado');
};

export const normalizeParceiroForExport = (item: any): ParceiroExportRow => {
  const cidade = String(item?.cidade || '').trim();
  const uf = String(item?.uf || '').trim();
  const cidadeUf = [cidade, uf].filter(Boolean).join('/');
  const telefone = item?.telefone || item?.contato1 || '';

  return {
    id: String(item?.id || ''),
    nome: String(item?.nome || item?.nomeCompleto || 'Nome não informado'),
    tipo: String(item?.tipo || 'Não informado'),
    status: normalizeStatus(item?.status),
    documento: formatDocument(item),
    telefone: telefone ? formatPhone(telefone) : 'Não informado',
    email: String(item?.email || 'Não informado'),
    cidadeUf: cidadeUf || 'Não informado',
    polo: String(item?.poloNome || 'Não informado'),
  };
};

export const normalizeParceirosForExport = (items: any[]) =>
  items.map(normalizeParceiroForExport);

const escapeCsvValue = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

export const buildParceirosCsv = (rows: ParceiroExportRow[]) => {
  const headers = [
    'Nome',
    'Tipo',
    'Status',
    'Documento',
    'Telefone',
    'E-mail',
    'Cidade/UF',
    'Polo',
  ];
  const dataRows = rows.map((row) => [
    row.nome,
    row.tipo,
    row.status,
    row.documento,
    row.telefone,
    row.email,
    row.cidadeUf,
    row.polo,
  ]);

  return `\ufeffsep=;\r\n${[headers, ...dataRows]
    .map((row) => row.map(escapeCsvValue).join(';'))
    .join('\r\n')}`;
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const buildParceirosReportFileName = () => {
  const date = new Date().toISOString().slice(0, 10);
  return `relatorio-parceiros-${date}`;
};
