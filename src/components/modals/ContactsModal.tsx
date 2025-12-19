import NavModal from './NavModal';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ContactsModal = ({ isOpen, onClose }: Props) => {
  const { language, t } = useLanguage();

  const content = (
    <div className="space-y-6 text-sm leading-relaxed">
      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">
          {language === 'ru' ? 'ЭЛЕКТРОННАЯ ПОЧТА' : 'EMAIL'}
        </h3>
        <a 
          href="mailto:eternalcanvas@proton.me"
          className="text-white/80 hover:text-white transition-colors text-lg"
        >
          eternalcanvas@proton.me
        </a>
      </section>

      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">
          INSTAGRAM
        </h3>
        <a 
          href="https://instagram.com/eternalcanvas_art"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/80 hover:text-white transition-colors text-lg"
        >
          @eternalcanvas_art
        </a>
      </section>

      <section className="pt-6 border-t border-white/10">
        <p className="text-white/40 text-xs">
          {language === 'ru' 
            ? 'По любым вопросам, включая запросы на удаление видео, обращайтесь по электронной почте.'
            : 'For any questions, including video deletion requests, please contact us by email.'
          }
        </p>
      </section>
    </div>
  );

  return (
    <NavModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t('nav.contacts')}
    >
      {content}
    </NavModal>
  );
};

export default ContactsModal;
