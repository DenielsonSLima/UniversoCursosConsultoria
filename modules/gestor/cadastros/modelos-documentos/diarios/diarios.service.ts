import { supabase } from '../../../../../lib/supabase';

export interface CapaCampo {
  id: string;
  label: string;
  valuePlaceholder: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  visible: boolean;
  color: string;
  bold: boolean;
  borderTop?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface DiarioTemplate {
  capaUrl: string | null;
  contracapaUrl: string | null;
  cabecalho: string;
  rodape: string;
  imprimirInstrucoes: boolean;
  orientacao: 'landscape';
  versao: number;
  capaCampos?: CapaCampo[];
}

export interface DiarioCurso {
  id: string;
  nome: string;
  modalidade: string;
}

export const DEFAULT_CAPA_CAMPOS: CapaCampo[] = [
  {
    id: 'curso',
    label: 'CURSO: ',
    valuePlaceholder: '[Nome do Curso]',
    x: 29.6,
    y: 52.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: '#071a33',
    bold: true,
    align: 'left',
  },
  {
    id: 'modulo',
    label: 'MÓDULO: ',
    valuePlaceholder: '[Módulo I]',
    x: 29.6,
    y: 58.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: '#071a33',
    bold: true,
    align: 'left',
  },
  {
    id: 'areaTematica',
    label: 'ÁREA TEMÁTICA: ',
    valuePlaceholder: '[Nome da Área Temática]',
    x: 29.6,
    y: 64.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: '#071a33',
    bold: true,
    align: 'left',
  },
  {
    id: 'disciplina',
    label: 'UNIDADE EDUCACIONAL: ',
    valuePlaceholder: '[Nome da Disciplina]',
    x: 29.6,
    y: 70.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: '#071a33',
    bold: true,
    align: 'left',
  },
  {
    id: 'turma',
    label: 'TURMA: ',
    valuePlaceholder: '[Nome da Turma]',
    x: 29.6,
    y: 76.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: '#071a33',
    bold: true,
    align: 'left',
  },
  {
    id: 'professor',
    label: '',
    valuePlaceholder: '[Nome do Professor]',
    x: 66.3,
    y: 83.5,
    width: 23.5,
    fontSize: 10,
    visible: true,
    color: '#071a33',
    bold: false,
    borderTop: true,
    align: 'center',
  },
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
};

const templateId = (key: string) => `diario_${key}`;

export const diariosService = {
  async getCursos(): Promise<DiarioCurso[]> {
    return [
      { id: 'TECNICO', nome: 'Cursos Técnicos', modalidade: 'TECNICO' },
      { id: 'LIVRE', nome: 'Cursos Livres', modalidade: 'LIVRE' },
      { id: 'ESPECIALIZACAO', nome: 'Cursos de Especialização', modalidade: 'ESPECIALIZACAO' },
    ];
  },

  async getTemplate(cursoIdOrModality: string): Promise<DiarioTemplate> {
    let key = cursoIdOrModality;
    if (cursoIdOrModality && !['TECNICO', 'LIVRE', 'ESPECIALIZACAO'].includes(cursoIdOrModality)) {
      const { data } = await supabase
        .from('cursos')
        .select('modalidade')
        .eq('id', cursoIdOrModality)
        .maybeSingle();
      if (data?.modalidade) {
        key = data.modalidade;
      }
    }

    const { data, error } = await supabase
      .from('documentos_templates')
      .select('conteudo')
      .eq('id', templateId(key))
      .maybeSingle();

    if (error) throw error;
    
    const parsedConteudo = (data?.conteudo || {}) as Partial<DiarioTemplate>;
    return {
      ...DEFAULT_DIARIO_TEMPLATE,
      ...parsedConteudo,
      capaCampos: parsedConteudo.capaCampos || DEFAULT_CAPA_CAMPOS,
    };
  },

  async saveTemplate(cursoIdOrModality: string, conteudo: DiarioTemplate): Promise<void> {
    let key = cursoIdOrModality;
    if (cursoIdOrModality && !['TECNICO', 'LIVRE', 'ESPECIALIZACAO'].includes(cursoIdOrModality)) {
      const { data } = await supabase
        .from('cursos')
        .select('modalidade')
        .eq('id', cursoIdOrModality)
        .maybeSingle();
      if (data?.modalidade) {
        key = data.modalidade;
      }
    }

    const { error } = await supabase
      .from('documentos_templates')
      .upsert({
        id: templateId(key),
        conteudo,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  },

  async uploadImage(
    cursoId: string,
    kind: 'capa' | 'contracapa',
    file: File,
  ): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Selecione um arquivo de imagem.');
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new Error('A imagem deve possuir no máximo 12 MB.');
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `templates/diarios/${cursoId}/${kind}-${Date.now()}.${extension}`;
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;
    return supabase.storage.from('documentos').getPublicUrl(data.path).data.publicUrl;
  },
};
