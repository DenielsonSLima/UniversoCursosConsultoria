import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import { AcademicDocumentValidationResult } from '../validator.types';

const HistoricoValidationResult: React.FC<{ result: AcademicDocumentValidationResult }> = ({ result }) => (
  <AcademicDocumentValidationCard result={result} accentClass="text-slate-700" softClass="bg-slate-100" />
);

export default HistoricoValidationResult;
