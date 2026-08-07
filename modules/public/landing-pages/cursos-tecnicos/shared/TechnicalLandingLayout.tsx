import React from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import type {
  TechnicalCourseLandingPageProps,
  TechnicalLandingConfig,
} from '../technicalLanding.types';
import TechnicalClassSummary from './TechnicalClassSummary';
import TechnicalLandingHero from './TechnicalLandingHero';
import TechnicalRequiredDocuments from './TechnicalRequiredDocuments';
import TechnicalEnrollmentForm from './TechnicalEnrollmentForm';

interface TechnicalLandingLayoutProps extends TechnicalCourseLandingPageProps {
  config: TechnicalLandingConfig;
}

const TechnicalLandingLayout: React.FC<TechnicalLandingLayoutProps> = ({
  data,
  enrollment,
  config,
}) => (
  <div className="flex min-h-screen flex-col bg-[#f4f7fb] antialiased">
    <Header />
    <main className="flex-1">
      <TechnicalLandingHero data={data} config={config} />

      <div className="relative mx-auto max-w-7xl space-y-12 px-6 py-12 md:py-16">
        <div className="pointer-events-none absolute -left-28 top-36 -z-0 h-80 w-80 rounded-full bg-blue-100/50 blur-3xl" />
        <TechnicalClassSummary data={data} config={config} />

        <div className="relative grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-10">
            {/* About Course Card */}
            <section className="rounded-[2.5rem] border border-slate-200/80 bg-white p-7 shadow-sm md:p-9 space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
                  <Sparkles size={14} />
                  <span>Conheça a Formação</span>
                </div>
                <h2 className="mt-1.5 text-2xl font-black text-[#001a33]">Sobre o Curso</h2>
              </div>

              <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-600">
                {data.course.description || config.description}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                {config.highlights.map((highlight) => (
                  <div
                    key={highlight}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 transition-all duration-200 hover:border-blue-200 hover:bg-white hover:shadow-sm"
                  >
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                    <p className="text-xs font-bold leading-relaxed text-slate-700">{highlight}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Checklist Transparente */}
            <TechnicalRequiredDocuments config={config} />
          </div>

          {/* Sticky Side Enrollment / Concierge Card */}
          <div className="lg:sticky lg:top-28">
            <TechnicalEnrollmentForm data={data} config={config} enrollment={enrollment} />
          </div>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default TechnicalLandingLayout;
