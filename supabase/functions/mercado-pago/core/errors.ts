export class MercadoPagoAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoAdapterError";
  }
}

export class MercadoPagoAdapterNotImplementedError extends Error {
  constructor(feature: string) {
    super(`Adapter Mercado Pago ainda nao implementado para ${feature}.`);
    this.name = "MercadoPagoAdapterNotImplementedError";
  }
}
