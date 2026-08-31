import { financeiroPayablesServiceMethods } from './financeiro.payables.service';
import { financeiroReceivablesPageServiceMethods } from './financeiro.receivables-page.service';
import { financeiroReceivablesServiceMethods } from './financeiro.receivables.service';
import { financeiroSharedServiceMethods } from './financeiro.shared.service';

export * from './financeiro.types';

export const financeiroService = {
  ...financeiroSharedServiceMethods,
  ...financeiroReceivablesServiceMethods,
  ...financeiroReceivablesPageServiceMethods,
  ...financeiroPayablesServiceMethods,
};
