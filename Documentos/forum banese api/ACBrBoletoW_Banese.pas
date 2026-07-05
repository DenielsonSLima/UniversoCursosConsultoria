{******************************************************************************}
{ Projeto: Componentes ACBr                                                    }
{  Biblioteca multiplataforma de componentes Delphi para interação com equipa- }
{ mentos de Automação Comercial utilizados no Brasil                           }
{                                                                              }
{ Direitos Autorais Reservados (c) 2023 Daniel Simoes de Almeida               }
{ Colaboradores nesse arquivo: Willian Delan, HelioNeto, Lucio Bittes,         }
{ Jhonlenon Ribeiro, rafabarzotto                                              }
{  Você pode obter a última versão desse arquivo na pagina do  Projeto ACBr    }
{ Componentes localizado em      http://www.sourceforge.net/projects/acbr      }
{                                                                              }
{  Esta biblioteca é software livre; você pode redistribuí-la e/ou modificá-la }
{ sob os termos da Licença Pública Geral Menor do GNU conforme publicada pela  }
{ Free Software Foundation; tanto a versão 2.1 da Licença, ou (a seu critério) }
{ qualquer versão posterior.                                                   }
{                                                                              }
{  Esta biblioteca é distribuída na expectativa de que seja útil, porém, SEM   }
{ NENHUMA GARANTIA; nem mesmo a garantia implícita de COMERCIABILIDADE OU      }
{ ADEQUAÇÃO A UMA FINALIDADE ESPECÍFICA. Consulte a Licença Pública Geral Menor}
{ do GNU para mais detalhes. (Arquivo LICENÇA.TXT ou LICENSE.TXT)              }
{                                                                              }
{  Você deve ter recebido uma cópia da Licença Pública Geral Menor do GNU junto}
{ com esta biblioteca; se não, escreva para a Free Software Foundation, Inc.,  }
{ no endereço 59 Temple Street, Suite 330, Boston, MA 02111-1307 USA.          }
{ Você também pode obter uma copia da licença em:                              }
{ http://www.opensource.org/licenses/lgpl-license.php                          }
{                                                                              }
{ Daniel Simões de Almeida - daniel@projetoacbr.com.br - www.projetoacbr.com.br}
{       Rua Coronel Aureliano de Camargo, 963 - Tatuí - SP - 18270-170         }
{******************************************************************************}
//incluido em COLOCAR A DATA

{$I ACBr.inc}
unit ACBrBoletoW_Banese;

interface

uses
  Classes,
  SysUtils,
  StrUtils,
  DateUtils,
  Math,

  ACBrBoletoWS,
  pcnConversao,
  ACBrBoletoConversao,
  ACBrBoleto,
  ACBrBoletoWS.Rest,
  ACBrJSON,
  ACBrBoletoWS.SOAP;

type
  TEspecieDocumento = record
    Sigla: string;
    Codigo: Integer;
  end;
const
  TabelaEspecieDocumentos: array[1..13] of TEspecieDocumento = (
    (Sigla: 'DM'; Codigo: 2),
    (Sigla: 'DS'; Codigo: 4),
    (Sigla: 'NCC'; Codigo: 8),
    (Sigla: 'NCE'; Codigo: 9),
    (Sigla: 'NCI'; Codigo: 10),
    (Sigla: 'NCR'; Codigo: 11),
    (Sigla: 'NP'; Codigo: 12),
    (Sigla: 'RC'; Codigo: 17),
    (Sigla: 'AP'; Codigo: 20),
    (Sigla: 'ME'; Codigo: 21),
    (Sigla: 'PC'; Codigo: 22),
    (Sigla: 'CC'; Codigo: 31),
    (Sigla: 'OUT'; Codigo: 99)
  );

type
  { TBoletoW_Banese}
  TBoletoW_Banese = class(TBoletoWSREST)
  private
    procedure AlterarAbatimento(AJsonObject: TACBrJSONObject);
    procedure AlterarSeuNumero(AJsonObject: TACBrJSONObject);
    procedure AlterarDesconto(AJsonObject: TACBrJSONObject);
    procedure AlterarJuros(AJsonObject: TACBrJSONObject);
    procedure AlterarMulta(AJsonObject: TACBrJSONObject);
    procedure AlterarDataVencimento(AJsonObject: TACBrJSONObject);
    procedure AlterarEspecie(AJsonObject: TACBrJSONObject);
    procedure AlterarValorNominal(AJsonObject: TACBrJSONObject);
    function EspecieDocumento: Integer;
  protected
    procedure DefinirURL; override;
    procedure DefinirContentType; override;
    procedure GerarHeader; override;
    procedure GerarDados; override;
    procedure DefinirAuthorization; override;
    function GerarTokenAutenticacao: string; override;
    procedure DefinirKeyUser;
    procedure DefinirParamOAuth; override;
    function ValidaAmbiente: Integer;

    procedure DefinirAutenticacao;
    procedure RequisicaoJson;
    procedure RequisicaoAltera;

    procedure GerarJuros(AJsonObject: TACBrJSONObject);
    procedure GerarMulta(AJsonObject: TACBrJSONObject);
    procedure GerarDesconto(AJsonObject: TACBrJSONObject);
    procedure GerarPagador(AJsonObject: TACBrJSONObject);
    procedure GerarSacadorAvalista(AJsonObject: TACBrJSONObject);

  public
    constructor Create(ABoletoWS: TBoletoWS); override;

    function GerarRemessa: string; override;
    function Enviar: boolean; override;
  end;

const
  C_URL             = 'https://webapi.banese.b.br/cobranca/v1';
  C_URL_HOM         = 'https://sandbox.banese.b.br/cobranca/v1';

  C_URL_OAUTH_PROD  = 'https://webapi.banese.b.br/autenticacao/oauth/v1/token';
  C_URL_OAUTH_HOM   = 'https://sandbox.banese.b.br/autenticacao/oauth/v1/token';


  C_ACCEPT          = '*/*';
  C_AUTHORIZATION   = 'Authorization';

  C_ACCEPT_ENCODING = 'gzip, deflate, br';

  C_CHARSET         = 'utf-8';
  C_ACCEPT_CHARSET  = 'UTF-8';

implementation

uses
  synacode,
  httpsend,

  ACBrDFeSSL,
  ACBrUtil.FilesIO,
  ACBrUtil.Strings,
  ACBrUtil.DateTime,
  ACBrUtil.Base,
  pcnAuxiliar,
  ACBrBoletoWS.Rest.OAuth,
  ACBr.Auth.JWT;

{ TBoletoW_Banese}

procedure TBoletoW_Banese.DefinirURL;
var
  LConvenio: String;
  LNossoNumero: String;
begin
  FPURL := IfThen(Boleto.Configuracoes.WebService.Ambiente = tawsProducao, C_URL, C_URL_HOM);

  LConvenio := OnlyNumber(Boleto.Cedente.Convenio);

  if ATitulo <> nil then
    LNossoNumero := ATitulo.ACBrBoleto.Banco.MontarCampoNossoNumero(ATitulo);

  case Boleto.Configuracoes.WebService.Operacao of
    tpInclui: FPURL := FPURL + '/convenios/' + LConvenio + '/boletos';
    tpAltera: FPURL := FPURL + '/convenios/' + LConvenio + '/boletos/' + LNossoNumero;
    tpBaixa: FPURL := FPURL + '/convenios/' + LConvenio + '/boletos/' + LNossoNumero + '/baixa';
    tpConsultaDetalhe:
      begin
        FPURL := FPURL + '/convenios/' + LConvenio + '/boletos/' + LNossoNumero;
        if Boleto.Configuracoes.WebService.Filtro.indicadorSituacao = isbBaixado then
          FPURL := FPURL + '/pagamentos/efetivados';
      end;
  end;
end;

procedure TBoletoW_Banese.DefinirContentType;
begin
  FPContentType := 'application/json';
end;

procedure TBoletoW_Banese.GerarHeader;
begin
  ClearHeaderParams;
  DefinirContentType;
  DefinirKeyUser;
end;

procedure TBoletoW_Banese.GerarDados;
begin
  if Assigned(Boleto) then
    DefinirURL;
  case Boleto.Configuracoes.WebService.Operacao of
    tpInclui:
    begin
      FMetodoHTTP := htPOST; //Define Método POST para Incluir.
      RequisicaoJson;
    end;
    tpAltera:
    begin
      FMetodoHTTP := htPUT; //Define Método PUT para Alteração.
      RequisicaoAltera;
    end;
    tpBaixa:
      FMetodoHTTP := htPUT; //Define Método PUT para Baixa.
    tpConsultaDetalhe:
      FMetodoHTTP := htGET; //Define Método GET Consulta Detalhe.
  else
    raise EACBrBoletoWSException.Create(ClassName + Format(S_OPERACAO_NAO_IMPLEMENTADO,
                                        [TipoOperacaoToStr(Boleto.Configuracoes.WebService.Operacao)]));
  end;
end;

procedure TBoletoW_Banese.DefinirAuthorization;
begin
  FPAuthorization := Format( '%s: Bearer %s',[C_Authorization , GerarTokenAutenticacao] );
end;

function TBoletoW_Banese.GerarTokenAutenticacao: string;
begin
  OAuth.ClearHeaderParams;
  OAuth.ContentType := 'application/x-www-form-urlencoded';
  OAuth.Payload := true;
  OAuth.AuthorizationType := atBearer;
  Result := inherited GerarTokenAutenticacao;
end;

procedure TBoletoW_Banese.DefinirKeyUser;
begin
  FPKeyUser := '';
end;

procedure TBoletoW_Banese.DefinirParamOAuth;
begin
  FParamsOAuth := Format('scope=%s&grant_type=client_credentials', [Boleto.Cedente.CedenteWS.Scope]);
end;

function TBoletoW_Banese.ValidaAmbiente: Integer;
begin
  result := StrToIntDef(IfThen(Boleto.Configuracoes.WebService.Ambiente = tawsProducao, '1','2'), 2);
end;

procedure TBoletoW_Banese.DefinirAutenticacao;
begin
  FPAuthorization := Format( '%s: %s', [C_ACCESS_TOKEN , GerarTokenAutenticacao]);
end;

procedure TBoletoW_Banese.RequisicaoJson;
var
  LJsonObject: TACBrJSONObject;
begin
  if not Assigned(aTitulo) then
    Exit;

  LJsonObject := TACBrJSONObject.Create;
  try
    LJsonObject.AddPair('NossoNumero', OnlyNumber(ATitulo.NossoNumero));
    LJsonObject.AddPair('CodigoMoeda', 9); // 9 - Real
    LJsonObject.AddPair('DataEmissao', FormatDateBr(ATitulo.DataDocumento, 'YYYY-MM-DD'));
    LJsonObject.AddPair('DataVencimento', FormatDateBr(ATitulo.Vencimento, 'YYYY-MM-DD'));
    LJsonObject.AddPair('ValorNominal', ATitulo.ValorDocumento);
    LJsonObject.AddPair('ValorAbatimento', ATitulo.ValorAbatimento);
    LJsonObject.AddPair('NumeroDocumento', ATitulo.NumeroDocumento);
    LJsonObject.AddPair('CodigoEspecie', EspecieDocumento);
    LJsonObject.AddPair('CodigoTipoBaixaDevolucao', 1); // Preencher com o valor fixo ‘1’ (BAIXAR / DEVOLVER)
    if (ATitulo.DataBaixa > 0) then
      LJsonObject.AddPair('QuantidadeDiasBaixaDevolucao', Trunc(ATitulo.DataBaixa - ATitulo.Vencimento))
    else
      LJsonObject.AddPair('QuantidadeDiasBaixaDevolucao', Trunc(ATitulo.DataLimitePagto - ATitulo.Vencimento));
    LJsonObject.AddPair('IndicadorPagamentoParcial', False);
    GerarJuros(LJsonObject);
    GerarMulta(LJsonObject);
    GerarDesconto(LJsonObject);
    LJsonObject.AddPair('TipoValorAceito', 3); // '3' = Não aceita pagamento com o valor divergente
    LJsonObject.AddPair('FlAceite', ATitulo.Aceite = atSim);
    LJsonObject.AddPair('IdTituloEmpresa', ATitulo.SeuNumero);
    GerarPagador(LJsonObject);
    if ATitulo.Sacado.SacadoAvalista.Pessoa <> pNenhum then
      GerarSacadorAvalista(LJsonObject);
    FPDadosMsg := LJsonObject.ToJSON;
  finally
    LJsonObject.Free;
  end;
end;

procedure TBoletoW_Banese.RequisicaoAltera;
var
  LJsonObject: TACBrJSONObject;
begin
  if not Assigned(aTitulo) then
    Exit;

  LJsonObject := TACBrJSONObject.Create;
  try
    case aTitulo.ACBrBoleto.ListadeBoletos.Objects[0].OcorrenciaOriginal.Tipo of
      toRemessaBaixar:
        FPURL := FPURL + '/baixa';
      toRemessaAlterarSeuNumero:
        AlterarSeuNumero(LJsonObject);
      toRemessaConcederDesconto, toRemessaAlterarDesconto:
        AlterarDesconto(LJsonObject);
      toRemessaAlterarVencimento:
        AlterarDataVencimento(LJsonObject);
      toRemessaAlterarJurosMora, toRemessaCobrarJurosMora, toRemessaDispensarJuros:
        AlterarJuros(LJsonObject);
      toRemessaAlterarMulta, toRemessaDispensarMulta:
        AlterarMulta(LJsonObject);
      toRemessaAlterarValorAbatimento, toRemessaCancelarAbatimento:
        AlterarAbatimento(LJsonObject);
      toRemessaAlterarValorTitulo:
        AlterarValorNominal(LJsonObject);
    end;
    FPDadosMsg := LJsonObject.ToJSON;
  finally
    LJsonObject.Free;
  end;
end;

procedure TBoletoW_Banese.GerarPagador(AJsonObject: TACBrJSONObject);
var
  LJsonPagador: TACBrJSONObject;
  LJsonEndereco: TACBrJSONObject;
  LDescricaoEndereco: String;
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  LJsonPagador  := TACBrJSONObject.Create;
  LJsonPagador.AddPair('TipoPessoa', IfThen(aTitulo.Sacado.Pessoa = pFisica, 'F', 'J'));
  LJsonPagador.AddPair('NumeroCPFCNPJ', Copy(OnlyNumber(aTitulo.Sacado.CNPJCPF), 1, 14));
  LJsonPagador.AddPair('NomeOuRazaoSocial', Trim(Copy(TiraAcentos(ATitulo.Sacado.NomeSacado), 1, 50)));
  LJsonPagador.AddPair('NomeFantasia', Trim(Copy(TiraAcentos(ATitulo.Sacado.NomeSacado), 1, 80)));

  LJsonEndereco := TACBrJSONObject.Create;
  LDescricaoEndereco := Copy(TiraAcentos(aTitulo.Sacado.Logradouro), 1, 64) + ', ' + Copy(aTitulo.Sacado.Numero, 1, 6);
  if TiraAcentos(aTitulo.Sacado.Complemento) <> '' then
    LDescricaoEndereco := LDescricaoEndereco + ', ' + Copy(TiraAcentos(aTitulo.Sacado.Complemento), 1, 30);
  LJsonEndereco.AddPair('DescricaoEndereco', LDescricaoEndereco);
  LJsonEndereco.AddPair('CEP', aTitulo.Sacado.CEP);
  LJsonEndereco.AddPair('Bairro', Copy(TiraAcentos(aTitulo.Sacado.Bairro), 1, 40));
  LJsonEndereco.AddPair('Cidade', Copy(TiraAcentos(aTitulo.Sacado.Cidade), 1, 40));
  LJsonEndereco.AddPair('UnidadeFederativa', Copy(TiraAcentos(aTitulo.Sacado.UF), 1, 2));

  LJsonPagador.AddPair('Endereco', LJsonEndereco);
  AJsonObject.AddPair('Pagador', LJsonPagador);
end;

procedure TBoletoW_Banese.GerarJuros(AJsonObject: TACBrJSONObject);
var
  LJsonJuros: TACBrJSONObject;
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  LJsonJuros := TACBrJSONObject.Create;
  if ATitulo.CodigoMora = '' then
  begin
    case aTitulo.CodigoMoraJuros of
      cjValorDia   : aTitulo.CodigoMora := '1';
      cjTaxaMensal : aTitulo.CodigoMora := '2';
      cjIsento     : aTitulo.CodigoMora := '3';
      else
        aTitulo.CodigoMora := '3';
    end;
  end;
  case (StrToIntDef(aTitulo.CodigoMora, 0)) of
    0,3:    // Isento
      begin
        LJsonJuros.AddPair('Data', FormatDateBr(ATitulo.DataMoraJuros, 'YYYY-MM-DD'));
        LJsonJuros.AddPair('Valor', 0);
        LJsonJuros.AddPair('TipoJuroMora', 3);
      end;
    1:     // Dia
      begin
        LJsonJuros.AddPair('Data', FormatDateBr(ATitulo.DataMoraJuros, 'YYYY-MM-DD'));
        LJsonJuros.AddPair('Valor', ATitulo.ValorMoraJuros);
        LJsonJuros.AddPair('TipoJuroMora', 1);
      end;
    2: // Mês
      begin
        LJsonJuros.AddPair('Data', FormatDateBr(ATitulo.DataMoraJuros, 'YYYY-MM-DD'));
        LJsonJuros.AddPair('Valor', ATitulo.ValorMoraJuros);
        LJsonJuros.AddPair('TipoJuroMora', 2);
      end;
  end;
  AJsonObject.AddPair('Juros', LJsonJuros);
end;

procedure TBoletoW_Banese.GerarMulta(AJsonObject: TACBrJSONObject);
var
  LJsonMulta: TACBrJSONObject;
  LCodMulta: Integer;
  LDataMulta: TDateTime;
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  LJsonMulta := TACBrJSONObject.Create;
  if aTitulo.PercentualMulta > 0 then
  begin
    if aTitulo.MultaValorFixo then
      LCodMulta := 1
    else
      LCodMulta := 2;
  end
  else
    LCodMulta := 3;
  if (aTitulo.DataMulta > 0) then
    LDataMulta :=  aTitulo.DataMulta
  else
    LDataMulta  := ATitulo.DataMoraJuros;
  case LCodMulta of
    1:
    begin
      LJsonMulta.AddPair('Data', FormatDateBr(LDataMulta, 'YYYY-MM-DD'));
      LJsonMulta.AddPair('Valor', ATitulo.ValorDocumento * ATitulo.PercentualMulta  / 100);
      LJsonMulta.AddPair('TipoMulta', 1);
    end;
    2:
    begin
      LJsonMulta.AddPair('Data', FormatDateBr(LDataMulta, 'YYYY-MM-DD'));
      LJsonMulta.AddPair('Valor', ATitulo.PercentualMulta);
      LJsonMulta.AddPair('TipoMulta', 2);
    end;
    3:
    begin
      LJsonMulta.AddPair('Data', FormatDateBr(LDataMulta, 'YYYY-MM-DD'));
      LJsonMulta.AddPair('Valor', 0);
      LJsonMulta.AddPair('TipoMulta', 3);
    end;
  end;
  AJsonObject.AddPair('Multa', LJsonMulta);
end;

constructor TBoletoW_Banese.Create(ABoletoWS: TBoletoWS);
begin
  inherited Create(ABoletoWS);

  FPAccept := C_ACCEPT;
  if Assigned(OAuth) then
  begin
    if OAuth.Ambiente = tawsProducao then
      OAuth.URL := C_URL_OAUTH_PROD
    else
      OAuth.URL := C_URL_OAUTH_HOM;
    OAuth.Payload := True;
  end;
end;

function TBoletoW_Banese.GerarRemessa: string;
begin
  result := inherited GerarRemessa;
end;

procedure TBoletoW_Banese.GerarSacadorAvalista(AJsonObject: TACBrJSONObject);
var
  LJsonSacadorAvalista: TACBrJSONObject;
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  LJsonSacadorAvalista := TACBrJSONObject.Create;
  LJsonSacadorAvalista.AddPair('TipoPessoa', IfThen(aTitulo.Sacado.SacadoAvalista.Pessoa = pFisica, 'F', 'J'));
  LJsonSacadorAvalista.AddPair('NumeroCPFCNPJ', Copy(OnlyNumber(aTitulo.Sacado.SacadoAvalista.CNPJCPF), 1, 14));
  LJsonSacadorAvalista.AddPair('NomeOuRazaoSocial', Copy(TiraAcentos(ATitulo.Sacado.SacadoAvalista.NomeAvalista), 1, 50));
  AJsonObject.AddPair('SacadorAvalista', LJsonSacadorAvalista);
end;

function TBoletoW_Banese.Enviar: boolean;
begin
  result := inherited Enviar;
end;

function TBoletoW_Banese.EspecieDocumento: Integer;
var
  I: Integer;
begin
  for I := Low(TabelaEspecieDocumentos) to High(TabelaEspecieDocumentos) do
  begin
    if SameText(TabelaEspecieDocumentos[I].Sigla, ATitulo.EspecieDoc) then
    begin
      Result := TabelaEspecieDocumentos[I].Codigo;
      Exit;
    end;
    Result := StrToIntDef(ATitulo.EspecieDoc,0);
  end;
end;

procedure TBoletoW_Banese.GerarDesconto(AJsonObject: TACBrJSONObject);
var
  LJsonArrayDesconto: TACBrJSONArray;
  LJsonObjectDesconto: TACBrJSONObject;
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  LJsonArrayDesconto := TACBrJSONArray.Create;
  if Integer(ATitulo.TipoDesconto) <> 0 then
  begin
    LJsonObjectDesconto := TACBrJSONObject.Create;
    LJsonObjectDesconto.AddPair('Data', FormatDateBr(ATitulo.DataDesconto, 'YYYY-MM-DD'));
    LJsonObjectDesconto.AddPair('Valor', ATitulo.ValorDesconto);
    if ATitulo.TipoDesconto = tdValorFixoAteDataInformada then
      LJsonObjectDesconto.AddPair('TipoDesconto', 1)
    else
      LJsonObjectDesconto.AddPair('TipoDesconto', 2);
    LJsonArrayDesconto.AddElementJSON(LJsonObjectDesconto);
  end;
  if Integer(ATitulo.TipoDesconto2) <> 0 then
  begin
    LJsonObjectDesconto := TACBrJSONObject.Create;
    LJsonObjectDesconto.AddPair('Data', FormatDateBr(ATitulo.DataDesconto2, 'YYYY-MM-DD'));
    LJsonObjectDesconto.AddPair('Valor', ATitulo.ValorDesconto2);
    if ATitulo.TipoDesconto2 = tdValorFixoAteDataInformada then
      LJsonObjectDesconto.AddPair('TipoDesconto', 1)
    else
      LJsonObjectDesconto.AddPair('TipoDesconto', 2);
    LJsonArrayDesconto.AddElementJSON(LJsonObjectDesconto);
  end;
  if Integer(ATitulo.TipoDesconto3) <> 0 then
  begin
    LJsonObjectDesconto := TACBrJSONObject.Create;
    LJsonObjectDesconto.AddPair('Data', FormatDateBr(ATitulo.DataDesconto3, 'YYYY-MM-DD'));
    LJsonObjectDesconto.AddPair('Valor', ATitulo.ValorDesconto3);
    if ATitulo.TipoDesconto3 = tdValorFixoAteDataInformada then
      LJsonObjectDesconto.AddPair('TipoDesconto', 1)
    else
      LJsonObjectDesconto.AddPair('TipoDesconto', 2);
    LJsonArrayDesconto.AddElementJSON(LJsonObjectDesconto);
  end;
  AJsonObject.AddPair('Desconto', LJsonArrayDesconto);
end;

procedure TBoletoW_Banese.AlterarDataVencimento(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  if ATitulo.Vencimento > 0 then
    AJsonObject.AddPair('DataVencimento', FormatDateBr(ATitulo.Vencimento, 'YYYY-MM-DD'));
end;

procedure TBoletoW_Banese.AlterarAbatimento(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  AJsonObject.AddPair('ValorAbatimento', ATitulo.ValorAbatimento);
end;

procedure TBoletoW_Banese.AlterarEspecie(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  AJsonObject.AddPair('CodigoEspecie', EspecieDocumento);
end;

procedure TBoletoW_Banese.AlterarJuros(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  GerarJuros(AJsonObject);
end;

procedure TBoletoW_Banese.AlterarMulta(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  GerarMulta(AJsonObject);
end;

procedure TBoletoW_Banese.AlterarDesconto(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  GerarDesconto(AJsonObject);
end;

procedure TBoletoW_Banese.AlterarSeuNumero(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  AJsonObject.AddPair('IdTituloEmpresa', ATitulo.SeuNumero);
end;

procedure TBoletoW_Banese.AlterarValorNominal(AJsonObject: TACBrJSONObject);
begin
  if (not Assigned(aTitulo)) or (not Assigned(AJsonObject)) then
    Exit;

  AJsonObject.AddPair('ValorNominal', ATitulo.ValorDocumento);
end;

end.
