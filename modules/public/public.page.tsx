
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import HeroSlider from './components/HeroSlider';
import CategoriesSection from './components/CategoriesSection';
import AboutContent from './about/AboutContent';
import MissionVisionValues from './mission/MissionVisionValues';
import ConsultingSection from './consulting/ConsultingSection';
import PortfolioSection from './portfolio/PortfolioSection';
import Footer from './components/Footer';
import { getPortalProfile, savePortalSession, PortalAuthProfile } from '../login/portal-session';
import { supabase } from '../../lib/supabase';
import AccessCheckingScreen from '../shared/components/AccessCheckingScreen';

const resolvePortalRoute = (profile: PortalAuthProfile) => {
  if (profile.tipo === 'Aluno') return '/aluno';
  if (profile.tipo === 'Professor') return '/professor';
  return '/gestor';
};

const navigateToLoginWithError = (searchParams: URLSearchParams, errorCode: string) => {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('mode', 'login');
  nextParams.set('oauth_error', errorCode);
  return `/login?${nextParams.toString()}`;
};

const PublicPage: React.FC = () => {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [isProcessingOAuth, setIsProcessingOAuth] = React.useState(false);

  React.useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [hash]);

  React.useEffect(() => {
    const hasOAuthReturn = window.location.search.includes('code=') || window.location.hash.includes('access_token');
    if (!hasOAuthReturn) return;

    let mounted = true;
    setIsProcessingOAuth(true);

    const finishGoogleReturn = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (mounted) {
            const search = new URLSearchParams(window.location.search);
            navigate(navigateToLoginWithError(search, 'no_session'), { replace: true });
          }
          return;
        }

        const profile = await getPortalProfile({ preferredRole: 'Aluno', allowedRoles: ['Aluno'] });
        if (!profile) {
          await supabase.auth.signOut();
          if (mounted) {
            const search = new URLSearchParams(window.location.search);
            navigate(navigateToLoginWithError(search, 'no_profile'), { replace: true });
          }
          return;
        }

        const search = new URLSearchParams(window.location.search);
        const redirect = search.get('redirect');
        const fallback = resolvePortalRoute(profile);
        const decodedRedirect = (() => {
          if (!redirect) return null;
          try {
            const value = decodeURIComponent(redirect);
            return value.startsWith('/') ? value : null;
          } catch {
            return null;
          }
        })();

        const needsAlunoInitialAccess =
          profile.tipo === 'Aluno' &&
          (Boolean(profile.requiresPasswordReset) || !profile.acceptedTermsAt);

        if (needsAlunoInitialAccess) {
          const next = decodedRedirect || fallback;
          const nextParams = new URLSearchParams();
          nextParams.set('next', next);
          if (mounted) {
            navigate(`/primeiro-acesso?${nextParams.toString()}`, { replace: true });
          }
          return;
        }

        savePortalSession(profile);
        if (mounted) {
          navigate(decodedRedirect || fallback, { replace: true });
        }
      } catch {
        if (mounted) {
          const search = new URLSearchParams(window.location.search);
          navigate(navigateToLoginWithError(search, 'google_error'), { replace: true });
        }
      } finally {
        if (mounted) {
          setIsProcessingOAuth(false);
        }
      }
    };

    finishGoogleReturn();
    return () => {
      mounted = false;
    };
  }, [navigate, hash]);

  if (isProcessingOAuth) {
    return <AccessCheckingScreen portal="Aluno" />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        <section id="inicio">
          <HeroSlider />
        </section>

        {/* Cursos Ofertados */}
        <section id="cursos" className="scroll-mt-24">
          <CategoriesSection />
        </section>

        {/* Quem Somos */}
        <AboutContent />

        {/* Missão, Visão, Valores e Propósito */}
        <MissionVisionValues />

        {/* Serviços de Consultoria Detalhada */}
        <section id="consultoria" className="scroll-mt-24">
          <ConsultingSection />
        </section>

        {/* Trabalhos Realizados / Portfólio */}
        <PortfolioSection />
      </main>

      <Footer />
    </div>
  );
};

export default PublicPage;
