import React from 'react';
import TechnicalEnrollmentForm, {
  type TechnicalEnrollmentFormProps,
} from '../shared/TechnicalEnrollmentForm';

const DefaultTechnicalEnrollmentForm: React.FC<TechnicalEnrollmentFormProps> = (props) => (
  <TechnicalEnrollmentForm {...props} />
);

export default DefaultTechnicalEnrollmentForm;
