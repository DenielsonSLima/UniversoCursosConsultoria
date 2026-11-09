import type { DanfseLayout } from './danfse.pdf-layout';
import { type DanfseDocument, DPS, xmlValue, dpsValue } from './danfse.types';
import { codeLabel, danfseCep, danfseDocumentNumber, danfsePhone, joined, municipalityName, stateFromMunicipality } from './danfse.presentation';

function party(layout: DanfseLayout, document: DanfseDocument, base: string, title: string, provider = false) {
  const value = (path: string) => xmlValue(document, `${base}/${path}`);
  const addressBase = provider ? 'enderNac/' : 'end/';
  const address = (path: string) => value(addressBase + path);
  const cityCode = provider ? address('cMun') : address('endNac/cMun');
  const city = value('end/endExt/xCidade') || municipalityName(document, cityCode);
  const uf = provider ? address('UF') : value('end/endExt/xEstProvReg') || stateFromMunicipality(cityCode);
  const cep = provider ? address('CEP') : address('endNac/CEP');
  const phone = provider ? dpsValue(document, 'prest/fone') || value('fone') : value('fone');
  const email = provider ? dpsValue(document, 'prest/email') || value('email') : value('email');
  layout.line();
  layout.row([
    { label: title, title: true },
    { label: 'CNPJ / CPF / NIF', value: danfseDocumentNumber(value('CNPJ') || value('CPF') || value('NIF')) },
    { label: 'Indicador Municipal (Inscrição)', value: value('IM') || (provider ? dpsValue(document, 'prest/IM') : '') },
    { label: 'Telefone', value: danfsePhone(phone) },
  ]);
  layout.row([
    { label: 'Nome / Nome Empresarial', value: value('xNome'), span: 2 },
    { label: 'Município / Sigla UF', value: joined([city, uf]) },
    { label: 'Código IBGE / CEP', value: joined([cityCode ? `${cityCode.slice(0, 2)}.${cityCode.slice(2)}` : '', danfseCep(cep)]) },
  ]);
  layout.row([
    { label: 'Endereço', value: ['xLgr', 'nro', 'xCpl', 'xBairro'].map(address).filter(Boolean).join(', '), span: 2 },
    { label: 'E-mail', value: email, span: 2 },
  ]);
  if (provider) layout.row([
    { label: 'Simples Nacional na Data de Competência', value: codeLabel(dpsValue(document, 'prest/regTrib/opSimpNac'), {
      1: 'Não optante', 2: 'Optante - Microempreendedor Individual', 3: 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
    }) },
    { label: 'Regime de Apuração Tributária pelo SN', value: codeLabel(dpsValue(document, 'prest/regTrib/regApTribSN'), {
      1: 'Regime de apuração dos tributos federais e municipal pelo SN',
      2: 'Regime de apuração dos tributos federais pelo SN e ISSQN por fora do SN conforme respectiva legislação municipal do tributo',
      3: 'Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legislações federal e municipal de cada tributo',
    }), span: 3 },
  ]);
}

export function drawDanfseParties(layout: DanfseLayout, document: DanfseDocument) {
  party(layout, document, 'emit', 'PRESTADOR / FORNECEDOR', true);
  const taker = Object.keys(document.fields).some(path => path.startsWith(`${DPS}toma/`));
  if (taker) party(layout, document, `${DPS}toma`, 'TOMADOR / ADQUIRENTE');
  else layout.absent('TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
  const recipient = Object.keys(document.fields).some(path => path.startsWith(`${DPS}IBSCBS/dest/`));
  if (recipient) party(layout, document, `${DPS}IBSCBS/dest`, 'DESTINATÁRIO DA OPERAÇÃO');
  else if (dpsValue(document, 'IBSCBS/indDest') === '0') layout.absent('O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO');
  else layout.absent('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
  const intermediary = Object.keys(document.fields).some(path => path.startsWith(`${DPS}interm/`));
  if (intermediary) party(layout, document, `${DPS}interm`, 'INTERMEDIÁRIO DA OPERAÇÃO');
  else layout.absent('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
}
