import {
  mapBaneseFinancialTermsToPayload,
  normalizeBaneseFinancialTerms,
} from "../../internal/financial-terms.ts";
import {
  type AdapterCreateChargeInput,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
} from "./types.ts";
import {
  assertAmount,
  assertIsoDate,
  boletoSpecies,
  boundedInteger,
  calculateBaneseNossoNumero,
  firstString,
  mergeDefined,
  metadataFrom,
  onlyDigits,
  todayIsoDate,
} from "./utils.ts";

export const validateBaneseBoletoPayloadInput = (
  input: AdapterCreateChargeInput,
) => {
  assertAmount(input.amount);
  const dueDate = assertIsoDate(
    input.dueDate,
    "Vencimento do boleto Banese Card",
  );
  const metadata = metadataFrom(input.receivable || {});
  const payer = input.payer || {};

  const payerDocument = onlyDigits(
    payer.cpfCnpj ?? payer.cpf_cnpj ?? payer.cpf ?? payer.cnpj ??
      payer.document,
  );
  const payerName = firstString(payer.name, payer.nome);
  if (![11, 14].includes(payerDocument.length) || !payerName) {
    throw new BaneseAdapterError(
      "Pagador do boleto Banese deve ter nome e CPF/CNPJ com 11 ou 14 digitos.",
    );
  }

  const externalReference = firstString(
    input.receivable?.id,
    metadata.externalReference,
    metadata.external_reference,
  );
  if (!externalReference) {
    throw new BaneseAdapterError(
      "Boleto Banese Card requer identificador do recebivel.",
    );
  }
  const street = firstString(
    payer.endereco,
    payer.address,
    metadata.pagadorEndereco,
    metadata.payerAddress,
  );
  const addressNumber = firstString(
    payer.numero,
    payer.number,
    metadata.pagadorNumero,
    metadata.payerAddressNumber,
  );
  const addressComplement = firstString(
    payer.complemento,
    payer.complement,
    metadata.pagadorComplemento,
    metadata.payerAddressComplement,
  );
  const fullStreet = [street, addressNumber].filter(Boolean).join(", ") +
    (addressComplement ? ` - ${addressComplement}` : "");
  const address = mergeDefined({}, {
    DescricaoEndereco: fullStreet.slice(0, 100) || undefined,
    CEP: onlyDigits(payer.cep ?? payer.postalCode ?? metadata.pagadorCep) ||
      undefined,
    Bairro: firstString(
      payer.bairro,
      payer.district,
      payer.province,
      metadata.pagadorBairro,
    ).slice(0, 40) ||
      undefined,
    Cidade: firstString(payer.cidade, payer.city, metadata.pagadorCidade).slice(
      0,
      40,
    ) ||
      undefined,
    UnidadeFederativa: firstString(payer.uf, payer.state, metadata.pagadorUf)
      .toUpperCase().slice(0, 2) ||
      undefined,
  });

  if (
    !address.DescricaoEndereco ||
    onlyDigits(address.CEP).length !== 8 ||
    !address.Bairro ||
    !address.Cidade ||
    firstString(address.UnidadeFederativa).length !== 2
  ) {
    throw new BaneseAdapterError(
      "Boleto Banese requer endereco, CEP, bairro, cidade e UF completos do pagador.",
    );
  }

  const pagador = mergeDefined({
    TipoPessoa: payerDocument.length > 11 ? "J" : "F",
    NumeroCPFCNPJ: Number(payerDocument),
    NomeOuRazaoSocial: payerName.slice(0, 50),
  }, {
    NomeFantasia: payerDocument.length > 11
      ? payerName.slice(0, 80)
      : undefined,
    Endereco: address,
  });

  const codigoEspecie = boletoSpecies(metadata.baneseCodigoEspecie);
  const quantidadeDiasBaixaDevolucao = boundedInteger(
    metadata.quantidadeDiasBaixaDevolucao,
    30,
    1,
    180,
  );
  const financialTerms = input.financialTerms
    ? normalizeBaneseFinancialTerms({
      ...input.financialTerms,
      nominalAmount: Number(input.amount.toFixed(2)),
      dueDate,
    })
    : null;
  const financialTermsPayload = financialTerms
    ? mapBaneseFinancialTermsToPayload(financialTerms)
    : {};

  return {
    dueDate,
    metadata,
    externalReference,
    pagador,
    codigoEspecie,
    quantidadeDiasBaixaDevolucao,
    financialTermsPayload,
  };
};

export const buildBaneseBoletoPayload = (input: AdapterCreateChargeInput) => {
  const validated = validateBaneseBoletoPayloadInput(input);
  const metadata = validated.metadata;

  const nossoNumero = onlyDigits(
    metadata.baneseNossoNumero ?? metadata.nossoNumero ?? metadata.NossoNumero,
  );
  if (!/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese Card requer NossoNumero com 8 digitos + DV, unico por convenio.",
    );
  }
  const agencia = onlyDigits(metadata.baneseAgencia).padStart(3, "0").slice(-3);
  if (
    calculateBaneseNossoNumero(agencia, nossoNumero.slice(0, 8)) !== nossoNumero
  ) {
    throw new BaneseAdapterConfigurationError(
      "Digito verificador do Nosso Numero Banese nao confere com a agencia beneficiaria.",
    );
  }

  return {
    NossoNumero: nossoNumero,
    CodigoMoeda: 9,
    DataEmissao: todayIsoDate(),
    DataVencimento: validated.dueDate,
    ValorNominal: Number(input.amount.toFixed(2)),
    NumeroDocumento: validated.externalReference.slice(0, 15),
    CodigoEspecie: validated.codigoEspecie,
    CodigoTipoBaixaDevolucao: 1,
    QuantidadeDiasBaixaDevolucao: validated.quantidadeDiasBaixaDevolucao,
    IndicadorPagamentoParcial: false,
    TipoValorAceito: 3,
    FlAceite: true,
    IdTituloEmpresa: validated.externalReference.slice(0, 25),
    Pagador: validated.pagador,
    ...validated.financialTermsPayload,
  };
};

export type BaneseBoletoPayload = ReturnType<typeof buildBaneseBoletoPayload>;
