import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import { AcademicDocumentValidationResult } from '../validator.types';

const IrpfValidationResult: React.FC<{ result: AcademicDocumentValidationResult }> = ({ result }) => (
  <AcademicDocumentValidationCard result={result} accentClass="text-amber-700" softClass="bg-amber-50" />
);

export default IrpfValidationResult;
