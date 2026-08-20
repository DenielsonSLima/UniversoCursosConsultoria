import React from 'react';
import BoletimValidationResult from './boletim/BoletimValidationResult';
import CarteirinhaValidationResult from './carteirinha/CarteirinhaValidationResult';
import CertificadoValidationResult from './certificado/CertificadoValidationResult';
import DeclaracaoValidationResult from './declaracao/DeclaracaoValidationResult';
import DiarioValidationResult from './diario/DiarioValidationResult';
import EstagioValidationResult from './estagio/EstagioValidationResult';
import FichaCadastralValidationResult from './ficha-cadastral/FichaCadastralValidationResult';
import HistoricoValidationResult from './historico/HistoricoValidationResult';
import IrpfValidationResult from './irpf/IrpfValidationResult';
import PreceptorValidationResult from './preceptor/PreceptorValidationResult';
import TransferenciaValidationResult from './transferencia/TransferenciaValidationResult';
import AssinaturaEletronicaValidationResult from './assinatura/AssinaturaEletronicaValidationResult';
import { resolveValidatorRenderer } from './validator.rendering';
import type {
  AcademicDocumentValidationResult,
  CarteirinhaPreceptorValidationResult,
  DocumentValidationResult,
  ElectronicSignatureValidationResult,
} from './validator.types';

const ValidationResultContent: React.FC<{
  result: DocumentValidationResult;
}> = ({ result }) => {
  const renderer = resolveValidatorRenderer(result.type);
  const academicResult = result as AcademicDocumentValidationResult;

  switch (renderer) {
    case 'carteirinha':
      return <CarteirinhaValidationResult result={result} />;
    case 'preceptor':
      return <PreceptorValidationResult result={result as CarteirinhaPreceptorValidationResult} />;
    case 'declaracao':
      return <DeclaracaoValidationResult result={academicResult} />;
    case 'boletim':
      return <BoletimValidationResult result={academicResult} />;
    case 'irpf':
      return <IrpfValidationResult result={academicResult} />;
    case 'historico':
      return <HistoricoValidationResult result={academicResult} />;
    case 'transferencia':
      return <TransferenciaValidationResult result={academicResult} />;
    case 'estagio':
      return <EstagioValidationResult result={academicResult} />;
    case 'certificado':
      return <CertificadoValidationResult result={academicResult} />;
    case 'ficha_cadastral':
      return <FichaCadastralValidationResult result={academicResult} />;
    case 'diario':
      return <DiarioValidationResult result={academicResult} />;
    case 'assinatura_eletronica':
      return (
        <AssinaturaEletronicaValidationResult
          result={result as ElectronicSignatureValidationResult}
        />
      );
    default:
      return null;
  }
};

export default ValidationResultContent;
