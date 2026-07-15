import React from 'react';
import type { TechnicalCourseLandingPageProps } from '../technicalLanding.types';
import TechnicalLandingLayout from '../shared/TechnicalLandingLayout';
import RadiologiaEnrollmentForm from './RadiologiaEnrollmentForm';
import { radiologiaLandingConfig } from './radiologia.config';

const RadiologiaLandingPage: React.FC<TechnicalCourseLandingPageProps> = (props) => (
  <TechnicalLandingLayout
    {...props}
    config={radiologiaLandingConfig}
    EnrollmentForm={RadiologiaEnrollmentForm}
  />
);

export default RadiologiaLandingPage;
