import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import { AcademicDocumentValidationResult } from '../validator.types';

const DeclaracaoValidationResult: React.FC<{ result: AcademicDocumentValidationResult }> = ({ result }) => (
  <AcademicDocumentValidationCard result={result} accentClass="text-emerald-700" softClass="bg-emerald-50" />
);

export default DeclaracaoValidationResult;
