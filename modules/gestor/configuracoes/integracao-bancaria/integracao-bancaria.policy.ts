import type {
  GatewayCredential,
  GatewayEnvironment,
  GatewayModalidade,
  GatewayPaymentMethod,
  GatewayProviderCode,
} from './integracao-bancaria.service';

// Reflect the server's homologated routes; these hints never authorize a charge.
export function bankingRouteBlockedReason(
  modalidade: GatewayModalidade,
  method: GatewayPaymentMethod,
  provider: GatewayProviderCode,
  environment: GatewayEnvironment,
): string | null {
  if (provider === 'mercado_pago') return 'Cartão permanece bloqueado até concluir a homologação do Mercado Pago.';
  if (provider !== 'banese_card') return 'Use Banese para boleto ou Mercado Pago para cartão.';
  if (method === 'PIX') return 'Pix avulso indisponível. O QR Code do BolePix é vinculado ao próprio boleto em produção.';
  if (method !== 'BOLETO') return 'Banese não atende cartão de crédito.';
  if (modalidade === 'EAD') return null;
  if (environment === 'production' && (modalidade === 'TECNICO' || modalidade === 'OUTROS_CREDITOS')) return null;
  return 'Esta modalidade e ambiente ainda não estão liberados para ativação de boleto.';
}

export function bankingCredentialStatus(credential: GatewayCredential | undefined, ready: boolean): string {
  if (!ready) return 'Credencial pendente';
  if (credential?.lastTestStatus === 'OK') return 'OAuth validado';
  if (credential?.lastTestStatus) return 'Último teste sem sucesso';
  return 'Credencial configurada · teste pendente';
}
