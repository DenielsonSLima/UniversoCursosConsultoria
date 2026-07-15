import React from 'react';
import type { TechnicalCourseLandingPageProps } from '../technicalLanding.types';
import TechnicalLandingLayout from '../shared/TechnicalLandingLayout';
import DefaultTechnicalEnrollmentForm from './DefaultTechnicalEnrollmentForm';
import { defaultTechnicalLandingConfig } from './defaultTechnical.config';

const DefaultTechnicalLandingPage: React.FC<TechnicalCourseLandingPageProps> = (props) => (
  <TechnicalLandingLayout
    {...props}
    config={defaultTechnicalLandingConfig}
    EnrollmentForm={DefaultTechnicalEnrollmentForm}
  />
);

export default DefaultTechnicalLandingPage;
