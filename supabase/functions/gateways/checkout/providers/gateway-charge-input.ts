import type { EadCheckoutContext } from "../types.ts";
import { documentForGateway, publicBaseUrl } from "../utils.ts";
import type { GatewayChargeInput } from "../../router.ts";

export const buildGatewayChargeInput = (
  context: EadCheckoutContext,
  receivable: any,
  financialTerms: GatewayChargeInput["financialTerms"] = null,
): GatewayChargeInput => {
  const baseUrl = publicBaseUrl();
  return {
    admin: context.admin,
    supabaseUrl: context.supabaseUrl,
    providerCode: context.route.providerCode,
    credentialId: context.route.credentialId,
    environment: context.environment,
    paymentMethod: context.charge.method,
    receivable,
    payer: {
      id: context.aluno.id,
      name: context.aluno.nome,
      email: context.aluno.email,
      cpfCnpj: documentForGateway(context.aluno.cpf_cnpj),
      phone: context.aluno.telefone,
      address: context.aluno.endereco,
      number: context.aluno.numero,
      complement: context.aluno.complemento,
      postalCode: context.aluno.cep,
      district: context.aluno.bairro,
      city: context.aluno.cidade,
      state: context.aluno.uf ?? context.aluno.estado,
    },
    amount: context.charge.value,
    description: context.charge.description,
    dueDate: context.charge.dueDate,
    installments: context.charge.installmentCount,
    successUrl: `${baseUrl}/aluno?gateway=success`,
    failureUrl: `${baseUrl}/aluno?gateway=failure`,
    pendingUrl: `${baseUrl}/aluno?gateway=pending`,
    financialTerms,
  };
};
