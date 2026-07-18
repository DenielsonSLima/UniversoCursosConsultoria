import type {
  SiteTickerModality,
  SiteTickerPhraseCategory,
} from '../../../public/siteTicker.service';

export type SiteTickerCursoOption = {
  id: string;
  nome: string;
  modalidade: SiteTickerModality;
};

type SiteTickerPoloOption = {
  nome?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

export type SiteTickerTurmaOption = {
  id: string;
  nome: string;
  curso_id: string;
  status: string;
  data_inicio_inscricao?: string | null;
  data_fim_inscricao?: string | null;
  publicar_no_site?: boolean;
  permitir_inscricoes_online?: boolean;
  cursos?: SiteTickerCursoOption | SiteTickerCursoOption[] | null;
  polos?: SiteTickerPoloOption | SiteTickerPoloOption[] | null;
};

export type SiteTickerFraseOption = {
  id: string;
  texto: string;
  categoria: SiteTickerPhraseCategory;
  ordem: number | null;
};

export const SITE_TICKER_MODALIDADES: { value: SiteTickerModality; label: string }[] = [
  { value: 'EAD', label: 'EAD' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'ESPECIALIZACAO', label: 'Especialização' },
];

export const SITE_TICKER_PHRASE_CATEGORIES: {
  value: SiteTickerPhraseCategory;
  label: string;
  desc: string;
}[] = [
  { value: 'all', label: 'Mistas', desc: 'Motivacionais e reflexão' },
  { value: 'motivacional', label: 'Motivacionais', desc: 'Energia para começar o dia' },
  { value: 'reflexao', label: 'Reflexão', desc: 'Mensagens mais contemplativas' },
];
