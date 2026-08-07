import { ActiveInstruments } from './diario-classe.types';

export const DIARIO_INSTRUMENT_KEYS = ['p', 'ti', 'tg', 's', 'cq', 'o'] as const;

export const DEFAULT_ACTIVE_INSTRUMENTS: ActiveInstruments = {
  p: true,
  ti: true,
  tg: true,
  s: true,
  cq: true,
  o: true,
};

const isActiveInstruments = (value: unknown): value is ActiveInstruments => {
  if (!value || typeof value !== 'object') return false;
  return DIARIO_INSTRUMENT_KEYS.every(
    (key) => typeof (value as Record<string, unknown>)[key] === 'boolean',
  );
};

export const normalizeActiveInstruments = (value: unknown): ActiveInstruments => (
  isActiveInstruments(value)
    ? {
        p: value.p,
        ti: value.ti,
        tg: value.tg,
        s: value.s,
        cq: value.cq,
        o: value.o,
      }
    : { ...DEFAULT_ACTIVE_INSTRUMENTS }
);
