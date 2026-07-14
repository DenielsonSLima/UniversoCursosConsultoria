export type TurmaGradeColorTheme = 'emerald' | 'amber' | 'rose';

export interface TurmaGradeTheme {
  text: string;
  textDark: string;
  bg: string;
  border: string;
  focusBorder: string;
  hoverBg: string;
  hoverBorder: string;
  fill: string;
  loader: string;
  hoverBorderDark: string;
}

const THEMES: Record<TurmaGradeColorTheme, TurmaGradeTheme> = {
  rose: {
    text: 'text-rose-600',
    textDark: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    focusBorder: 'focus:border-rose-500',
    hoverBg: 'hover:bg-rose-600',
    hoverBorder: 'hover:border-rose-300',
    fill: 'bg-rose-500',
    loader: 'text-rose-600',
    hoverBorderDark: 'hover:border-rose-400',
  },
  amber: {
    text: 'text-amber-600',
    textDark: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    focusBorder: 'focus:border-amber-500',
    hoverBg: 'hover:bg-amber-600',
    hoverBorder: 'hover:border-amber-300',
    fill: 'bg-amber-500',
    loader: 'text-amber-600',
    hoverBorderDark: 'hover:border-amber-400',
  },
  emerald: {
    text: 'text-emerald-600',
    textDark: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    focusBorder: 'focus:border-emerald-500',
    hoverBg: 'hover:bg-emerald-600',
    hoverBorder: 'hover:border-emerald-300',
    fill: 'bg-emerald-500',
    loader: 'text-emerald-600',
    hoverBorderDark: 'hover:border-emerald-400',
  },
};

export const getTurmaGradeTheme = (colorTheme: TurmaGradeColorTheme) => THEMES[colorTheme];

export const formatGradeHours = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
};
