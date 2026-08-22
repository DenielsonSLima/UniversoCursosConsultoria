import React from 'react';
import PortalProfileSelector from '../../login/components/PortalProfileSelector';
import AccessCheckingScreen from '../../shared/components/AccessCheckingScreen';
import ArkhenSignature from '../../shared/components/ArkhenSignature';
import AlunoLoginAuthCard from './AlunoLoginAuthCard';
import { AlunoLoginHero, AlunoLoginMobileHeader } from './AlunoLoginHero';
import type { AlunoLoginPublicPageModel } from './useAlunoLoginPublicPage';

interface AlunoLoginPublicViewProps {
  model: AlunoLoginPublicPageModel;
}

const AlunoLoginPublicView: React.FC<AlunoLoginPublicViewProps> = ({ model }) => {
  if (model.checkingExternalLogin) {
    return <AccessCheckingScreen portal="Aluno" />;
  }

  const hasMultipleProfiles = model.profileSelectorProps.profiles.length > 1;

  return (
    <div className="relative min-h-screen bg-slate-50">
      <main className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <AlunoLoginHero {...model.heroProps} />
        <section className="aluno-auth-typography relative flex min-h-screen flex-col items-center justify-start bg-slate-50 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-slate-900 sm:px-8 sm:py-8 lg:justify-center">
          <AlunoLoginMobileHeader {...model.heroProps} />
          {hasMultipleProfiles ? (
            <PortalProfileSelector {...model.profileSelectorProps} />
          ) : (
            <AlunoLoginAuthCard {...model.cardProps} />
          )}

          <div className="mt-5 flex w-full max-w-[560px] justify-center pb-1 sm:justify-end sm:pr-2 lg:absolute lg:bottom-6 lg:right-6 lg:mt-0 lg:w-auto lg:max-w-none lg:pb-0 lg:pr-0">
            <ArkhenSignature tone="dark" />
          </div>
        </section>
      </main>
    </div>
  );
};

export default AlunoLoginPublicView;
