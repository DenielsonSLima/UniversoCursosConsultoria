{******************************************************************************}
{ Projeto: Componentes ACBr                                                    }
{  Biblioteca multiplataforma de componentes Delphi para interação com equipa- }
{ mentos de Automação Comercial utilizados no Brasil                           }
{                                                                              }
{ Direitos Autorais Reservados (c) 2023 Daniel Simoes de Almeida               }
{ Colaboradores nesse arquivo:  Willian Delan                                  }
{ Delmar de Lima, Jhonlenon Ribeiro                                            }
{                                                                              }
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

unit ACBrBoletoRet_Banese;

interface

uses
  Classes,
  SysUtils,
  DateUtils,
  StrUtils,


  ACBrBoleto,
  ACBrBoletoWS,
  ACBrBoletoRetorno,
  ACBrBoletoWS.Rest,
  pcnConversao ;

type

{ TRetornoEnvio_Banese }

 TRetornoEnvio_Banese = class(TRetornoEnvioREST)
 private
   function DateBaneseToDateTime(Const AValue : String) : TDateTime;
 public
   constructor Create(ABoletoWS: TACBrBoleto); override;
   destructor  Destroy; Override;
   function LerRetorno(const ARetornoWS: TACBrBoletoRetornoWS): Boolean; override;
   function RetornoEnvio(const AIndex: Integer): Boolean; override;
 end;

implementation

uses
  ACBrBoletoConversao,
  ACBrUtil.Strings,
  ACBrUtil.Base,
  ACBrJSON;

resourcestring
  C_CANCELADO = 'CANCELADO';
  C_BAIXADO   = 'BAIXADO';
  C_EXPIRADO  = 'EXPIRADO';
  C_VENCIDO   = 'VENCIDO';
  C_EMABERTO  = 'EM ABERTO';
  C_PAGO      = 'Liquidado';

{ TRetornoEnvio }

constructor TRetornoEnvio_Banese.Create(ABoletoWS: TACBrBoleto);
begin
  inherited Create(ABoletoWS);
end;

function TRetornoEnvio_Banese.DateBaneseToDateTime(const AValue: String): TDateTime;
var
  LData, LAno, LMes, LDia : String;
begin
  LAno := Copy(AValue, 0, 4);
  LMes := Copy(AValue, 6, 2);
  LDia := Copy(AValue, 9, 2);
  LData := Format('%s/%s/%s', [LDia, LMes, LAno]);
  Result := StrToDateDef(LData, 0);
end;

destructor TRetornoEnvio_Banese.Destroy;
begin
  inherited Destroy;
end;

function TRetornoEnvio_Banese.LerRetorno(const ARetornoWS: TACBrBoletoRetornoWS): Boolean;
var
  LTipoOperacao: TOperacao;
  LJsonObject: TACBrJSONObject;
  LJsonPagador: TACBrJSONObject;
  LMensagemRejeicao: TACBrBoletoRejeicao;
  LJsonErros: TACBrJSONArray;
  LJsonErro:TACBrJSONObject;
  LEnderecoSplit: TSplitResult;
  LJsonPagamentos: TACBrJSONArray;
  LJsonPagamento:TACBrJSONObject;
  i: Integer;
begin
  Result := True;
  LTipoOperacao := ACBrBoleto.Configuracoes.WebService.Operacao;
  ARetornoWs.JSONEnvio      := EnvWs;
  ARetornoWS.HTTPResultCode := HTTPResultCode;
  if RetWS <> '' then
  begin
    try
      LJsonObject := TACBrJSONObject.Parse(RetWS);
      try
        ARetornoWS.JSON           := LJsonObject.ToJSON;
        if HTTPResultCode >= 300 then
        begin
          LJsonErros := LJsonObject.AsJSONArray['Erros'];
          if LJsonErros.Count > 0 then
          begin
             for i := 0 to Pred(LJsonErros.Count) do
             begin
               LJsonErro                  := LJsonErros.ItemAsJSONObject[i];
               LMensagemRejeicao          := ARetornoWS.CriarRejeicaoLista;

               LMensagemRejeicao.Codigo   := LJsonErro.AsString['CodigoErroProcessamento'];
               LMensagemRejeicao.Mensagem := LJsonErro.AsString['Descricao'];
             end;
          end
          else
          begin
             LMensagemRejeicao            := ARetornoWS.CriarRejeicaoLista;

             LMensagemRejeicao.Codigo     := LJsonObject.AsString['error'];
             LMensagemRejeicao.mensagem   := LJsonObject.AsString['error_description'];
          end;
        end;
        //retorna quando tiver sucesso
        if (ARetornoWS.ListaRejeicao.Count = 0) then
        begin
          if (LTipoOperacao = tpInclui) then
          begin
            ARetornoWS.DadosRet.TituloRet.CodBarras         := LJsonObject.AsString['NumeroCodigoBarras'];
            ARetornoWS.DadosRet.TituloRet.LinhaDig          := LJsonObject.AsString['NumeroLinhaDigitavel'];
          end
          else if (LTipoOperacao = tpConsultaDetalhe) and (ACBrBoleto.Configuracoes.WebService.Filtro.indicadorSituacao = isbBaixado) then
          begin
            ARetornoWS.DadosRet.TituloRet.NossoNumero       := LJsonObject.AsString['NossoNumero'];
            ARetornoWS.DadosRet.TituloRet.NumeroDocumento   := LJsonObject.AsString['NumeroDocumento'];
            ARetornoWS.DadosRet.TituloRet.Vencimento        := DateBaneseToDateTime(LJsonObject.AsString['DataVencimento']);
            ARetornoWS.DadosRet.TituloRet.ValorDocumento    := LJsonObject.AsCurrency['ValorNominal'];

            LJsonPagador                                    := LJsonObject.AsJSONObject['Pagador'];
            if LJsonPagador.AsString['TipoPessoa'] = 'J' then
            begin
              ARetornoWS.DadosRet.TituloRet.Sacado.Pessoa   := pJuridica;
              ARetornoWS.DadosRet.TituloRet.Sacado.CNPJCPF  := IntToStrZero(LJsonPagador.AsInteger['NumeroCPFCNPJ'], 14);
            end
            else begin
              ARetornoWS.DadosRet.TituloRet.Sacado.Pessoa   := pFisica;
              ARetornoWS.DadosRet.TituloRet.Sacado.CNPJCPF  := IntToStrZero(LJsonPagador.AsInteger['NumeroCPFCNPJ'], 11);
            end;
            ARetornoWS.DadosRet.TituloRet.Sacado.NomeSacado := LJsonPagador.AsString['NomePagador'];
            LEnderecoSplit                                  := Split(',', LJsonPagador.AsJSONObject['Endereco'].AsString['DescricaoEndereco']);
            ARetornoWS.DadosRet.TituloRet.Sacado.Logradouro := Trim(LEnderecoSplit[0]);
            if Length(LEnderecoSplit) >= 2 then
              ARetornoWS.DadosRet.TituloRet.Sacado.Numero   := Trim(LEnderecoSplit[1]);
            if Length(LEnderecoSplit) = 3 then
              ARetornoWS.DadosRet.TituloRet.Sacado.Complemento := Trim(LEnderecoSplit[2]);
            ARetornoWS.DadosRet.TituloRet.Sacado.CEP        := LJsonPagador.AsJSONObject['Endereco'].AsString['CEP'];
            ARetornoWS.DadosRet.TituloRet.Sacado.Bairro     := LJsonPagador.AsJSONObject['Endereco'].AsString['Bairro'];
            ARetornoWS.DadosRet.TituloRet.Sacado.Cidade     := LJsonPagador.AsJSONObject['Endereco'].AsString['Cidade'];
            ARetornoWS.DadosRet.TituloRet.Sacado.UF         := LJsonPagador.AsJSONObject['Endereco'].AsString['UnidadeFederativa'];

            LJsonPagamentos                                 := LJsonObject.AsJSONArray['PagamentosEfetivados'];
            if LJsonPagamentos.Count = 0 then
            begin
              ARetornoWS.DadosRet.TituloRet.CodigoEstadoTituloCobranca := '2';
              ARetornoWS.DadosRet.TituloRet.EstadoTituloCobranca       := C_EMABERTO;
            end
            else begin
              ARetornoWS.DadosRet.TituloRet.CodigoEstadoTituloCobranca := '6';
              ARetornoWS.DadosRet.TituloRet.EstadoTituloCobranca       := C_PAGO;
              for I := 0 to Pred(LJsonPagamentos.Count) do
              begin
                LJsonPagamento                                  := LJsonPagamentos.ItemAsJSONObject[I];
                ARetornoWS.DadosRet.TituloRet.DataMovimento     := DateBaneseToDateTime(LJsonPagamento.AsString['DataPagamento']);
                ARetornoWS.DadosRet.TituloRet.DataProcessamento := DateBaneseToDateTime(LJsonPagamento.AsString['DataPagamento']);
                ARetornoWS.DadosRet.TituloRet.ValorPago         := LJsonPagamento.AsCurrency['ValorPago'];
              end;
            end;
          end
          else if (LTipoOperacao = tpConsultaDetalhe) then
          begin
            // Implementar
          end;
        end;
      finally
        LJsonObject.free;
      end;
    except
      Result := False;
    end;
  end;
end;

function TRetornoEnvio_Banese.RetornoEnvio(const AIndex: Integer): Boolean;
begin
  Result:=inherited RetornoEnvio(AIndex);
end;

end.

