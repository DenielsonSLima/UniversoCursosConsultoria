import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import { AcademicDocumentValidationResult } from '../validator.types';

const EstagioValidationResult: React.FC<{ result: AcademicDocumentValidationResult }> = ({ result }) => (
  <AcademicDocumentValidationCard result={result} accentClass="text-teal-700" softClass="bg-teal-50" />
);

export default EstagioValidationResult;
