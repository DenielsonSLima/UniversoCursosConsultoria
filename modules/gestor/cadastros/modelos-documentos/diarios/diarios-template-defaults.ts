import type { CapaCampo, DiarioTemplate } from './diarios.service';

const coverRows: Array<[string, string, string, number]> = [
  ['curso', 'CURSO: ', '[Nome do Curso]', 52.8],
  ['modulo', 'MÓDULO: ', '[Módulo I]', 58.8],
  ['areaTematica', 'ÁREA TEMÁTICA: ', '[Nome da Área Temática]', 64.8],
  ['disciplina', 'UNIDADE EDUCACIONAL: ', '[Nome da Disciplina]', 70.8],
  ['turma', 'TURMA: ', '[Nome da Turma]', 76.8],
];

export const DEFAULT_CAPA_CAMPOS: CapaCampo[] = coverRows.map(([
  id, label, valuePlaceholder, y,
]): CapaCampo => ({
  id: String(id), label: String(label), valuePlaceholder: String(valuePlaceholder),
  x: 29.6, y: Number(y), width: 50.5, fontSize: 11, visible: true,
  color: '#071a33', bold: true, align: 'left',
}));

DEFAULT_CAPA_CAMPOS.push({
  id: 'professor', label: '', valuePlaceholder: '[Nome do Professor]',
  x: 66.3, y: 83.5, width: 23.5, fontSize: 10, visible: true,
  color: '#071a33', bold: false, borderTop: true, align: 'center',
});

const backText = (
  id: string,
  label: string,
  valuePlaceholder: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  options: Partial<CapaCampo> = {},
): CapaCampo => ({
  id, label, valuePlaceholder, x, y, width, fontSize, visible: true,
  color: '#071a33', bold: true, align: 'left', ...options,
});

export const DEFAULT_CONTRACAPA_CAMPOS: CapaCampo[] = [
  backText('contracapaTitulo', 'REGISTRO DE VALIDAÇÃO E ASSINATURA ELETRÔNICA', '', 10, 10, 80, 12, { align: 'center' }),
  backText('contracapaCurso', 'CURSO: ', '[Nome do Curso]', 10, 25, 45, 9),
  backText('contracapaTurma', 'TURMA: ', '[Turma 101]', 58, 25, 25, 9),
  backText('contracapaDisciplina', 'DISCIPLINA: ', '[Componente Curricular]', 10, 31, 45, 9),
  backText('contracapaModulo', 'MÓDULO: ', '[Módulo I]', 58, 31, 25, 9),
  backText('contracapaProfessor', 'PROFESSOR(A): ', '[Nome do Professor]', 10, 37, 73, 9),
  backText('contracapaRegulamento', '', '[Texto de Validação e Assinatura Eletrônica]', 10, 47, 58, 8, { bold: false }),
  backText('contracapaAutenticacao', 'CHAVE DE AUTENTICAÇÃO: ', 'DIA-TECNICO-XXXXXXXX', 10, 65, 58, 7.5, { color: '#64748b', bold: false }),
  backText('contracapaQrCode', 'ESCANEAR PARA VALIDAR', '[QR Code]', 72, 25, 18, 7, { align: 'center' }),
  backText('contracapaAssinaturaProfessor', 'ASSINATURA DO PROFESSOR', '', 10, 84, 38, 6.5, { color: '#64748b', borderTop: true, align: 'center' }),
  backText('contracapaAssinaturaCoordenador', 'ASSINATURA DO COORDENADOR DO CURSO', '', 52, 84, 38, 6.5, { color: '#64748b', borderTop: true, align: 'center' }),
];

export const DEFAULT_DIARIO_TEMPLATE: DiarioTemplate = {
  capaUrl: null,
  contracapaUrl: null,
  cabecalho: 'UNIVERSO CURSOS E CONSULTORIA',
  rodape: 'Documento Oficial — Diário de Classe emitido eletronicamente',
  imprimirInstrucoes: true,
  orientacao: 'landscape',
  versao: 1,
  capaCampos: DEFAULT_CAPA_CAMPOS,
  contracapaCampos: DEFAULT_CONTRACAPA_CAMPOS,
  imprimirValidacaoContracapa: true,
  mensagemValidacao: 'Este diário de classe eletrônico foi gerado e assinado digitalmente nos termos do Regimento Escolar da instituição e da legislação de validação de documentos acadêmicos do Ministério da Educação.',
  qrCodeSize: 50,
};
