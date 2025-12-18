import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AboutModal from '@/components/modals/AboutModal';
import ArtistStatementModal from '@/components/modals/ArtistStatementModal';
import EthicsModal from '@/components/modals/EthicsModal';
import ParticipateModal from '@/components/modals/ParticipateModal';
import ContactsModal from '@/components/modals/ContactsModal';

interface EyeRecord {
  cid: string;
}

type ModalType = 'about' | 'statement' | 'ethics' | 'participate' | 'contacts' | null;

const Index = () => {
  const { t } = useLanguage();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [backgroundEyes, setBackgroundEyes] = useState<EyeRecord[]>([]);

  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eyes/`;

  useEffect(() => {
    const loadEyes = async () => {
      const { data } = await supabase
        .from('eyes')
        .select('cid')
        .limit(20);
      if (data) setBackgroundEyes(data);
    };
    loadEyes();
  }, []);

  const navItems: { key: ModalType; labelKey: string }[] = [
    { key: 'about', labelKey: 'nav.about' },
    { key: 'statement', labelKey: 'nav.statement' },
    { key: 'ethics', labelKey: 'nav.ethics' },
    { key: 'participate', labelKey: 'nav.participate' },
    { key: 'contacts', labelKey: 'nav.contacts' },
  ];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden font-mono">
      
      {/* Background canvas preview - very dim */}
      {backgroundEyes.length > 0 && (
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
          <div className="flex flex-wrap w-full">
            {backgroundEyes.map((eye, i) => (
              <div key={eye.cid + i} className="flex-shrink-0" style={{ width: 512, height: 128 }}>
                <video
                  src={`${storageUrl}${eye.cid}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header with navigation */}
        <header className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-base md:text-lg font-bold tracking-[0.3em] text-white/90">
              {t('index.title')}
            </h1>
            <LanguageSwitcher />
          </div>
          
          {/* Navigation menu */}
          <nav className="flex flex-wrap gap-x-4 gap-y-2 md:gap-x-6">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setActiveModal(item.key)}
                className="text-white/40 text-xs tracking-widest hover:text-white/80 transition-colors"
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </header>

        {/* Main content - centered */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-10">
          <div className="max-w-2xl text-center">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-light tracking-wide mb-8 leading-tight">
              <span className="text-white">{t('index.subtitle1')}</span>
              <span className="text-white/40 ml-4">{t('index.subtitle2')}</span>
            </h2>
            
            <p className="text-white/40 text-sm md:text-base leading-relaxed max-w-lg mx-auto mb-12 tracking-wide">
              {t('index.description')}
            </p>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                to="/camera" 
                className="px-10 py-4 border border-white text-white text-sm tracking-[0.2em] hover:bg-white hover:text-black transition-all duration-300"
              >
                {t('index.record')}
              </Link>
              <Link 
                to="/canvas" 
                className="px-10 py-4 border border-white/30 text-white/60 text-sm tracking-[0.2em] hover:border-white hover:text-white transition-all duration-300"
              >
                {t('index.watch')}
              </Link>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-4 md:p-6 flex items-center justify-center">
          <span className="text-white/20 text-xs tracking-widest">© 2024</span>
        </footer>
      </div>

      {/* Modals */}
      <AboutModal 
        isOpen={activeModal === 'about'} 
        onClose={() => setActiveModal(null)} 
      />
      <ArtistStatementModal 
        isOpen={activeModal === 'statement'} 
        onClose={() => setActiveModal(null)} 
      />
      <EthicsModal 
        isOpen={activeModal === 'ethics'} 
        onClose={() => setActiveModal(null)} 
      />
      <ParticipateModal 
        isOpen={activeModal === 'participate'} 
        onClose={() => setActiveModal(null)} 
      />
      <ContactsModal 
        isOpen={activeModal === 'contacts'} 
        onClose={() => setActiveModal(null)} 
      />
    </div>
  );
};

export default Index;
