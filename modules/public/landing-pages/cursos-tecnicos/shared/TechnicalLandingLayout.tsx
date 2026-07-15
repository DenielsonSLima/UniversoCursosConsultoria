import React, { type ComponentType } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import type {
  TechnicalCourseLandingPageProps,
  TechnicalLandingConfig,
} from '../technicalLanding.types';
import TechnicalClassSummary from './TechnicalClassSummary';
import type { TechnicalEnrollmentFormProps } from './TechnicalEnrollmentForm';
import TechnicalLandingHero from './TechnicalLandingHero';
import TechnicalRequiredDocuments from './TechnicalRequiredDocuments';

interface TechnicalLandingLayoutProps extends TechnicalCourseLandingPageProps {
  config: TechnicalLandingConfig;
  EnrollmentForm: ComponentType<TechnicalEnrollmentFormProps>;
}

const TechnicalLandingLayout: React.FC<TechnicalLandingLayoutProps> = ({
  data,
  enrollment,
  config,
  EnrollmentForm,
}) => (
  <div className="flex min-h-screen flex-col bg-slate-50">
    <Header />
    <main className="flex-1">
      <TechnicalLandingHero data={data} config={config} />
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-12 md:py-16">
        <TechnicalClassSummary data={data} />

        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <section className="rounded-[2rem] border border-slate-100 bg-white p-7 shadow-sm md:p-9">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Conheça a formação</p>
              <h2 className="mt-2 text-2xl font-black text-[#001a33]">Sobre o curso</h2>
              <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600">
                {data.course.description || config.description}
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {config.highlights.map((highlight) => (
                  <div key={highlight} className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} />
                    <p className="text-xs font-bold leading-relaxed text-slate-600">{highlight}</p>
                  </div>
                ))}
              </div>
            </section>
            <TechnicalRequiredDocuments config={config} />
          </div>

          <div className="lg:sticky lg:top-28">
            <EnrollmentForm data={data} config={config} enrollment={enrollment} />
          </div>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default TechnicalLandingLayout;
