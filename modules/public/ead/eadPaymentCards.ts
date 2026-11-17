import { CreditCard, FileText, Zap } from 'lucide-react';
import { resolveEadCheckoutOptions } from '../../aluno/cursos/eadCheckoutOptions';
import type { Curso } from '../../gestor/cadastros/cadastros.types';

export function buildEadPaymentCards(curso?: Curso) {
  if (!curso) return [];
  const options = resolveEadCheckoutOptions(curso);
    return options.options.map((option) => {
      if (option.method === 'PIX') {
        return {
          method: option.method,
          label: 'Pix',
          detail: 'Liberação rápida',
          icon: Zap,
          cardClass: 'border-emerald-100 bg-emerald-50 text-emerald-800',
          iconClass: 'bg-emerald-600 text-white',
        };
      }
      if (option.method === 'BOLETO') {
        return {
          method: option.method,
          label: 'Boleto',
          detail: 'Pagamento bancário',
          icon: FileText,
          cardClass: 'border-sky-100 bg-sky-50 text-sky-800',
          iconClass: 'bg-sky-600 text-white',
        };
      }
      return {
        method: option.method,
        label: 'Cartão',
        detail: options.maxParcelas > 1 ? `Até ${options.maxParcelas}x` : 'À vista',
        icon: CreditCard,
        cardClass: 'border-blue-100 bg-blue-50 text-blue-800',
        iconClass: 'bg-blue-600 text-white',
      };
    });
}
