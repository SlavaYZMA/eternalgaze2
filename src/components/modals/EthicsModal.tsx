import NavModal from './NavModal';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const EthicsModal = ({ isOpen, onClose }: Props) => {
  const { language, t } = useLanguage();

  const contentRu = (
    <div className="space-y-8 text-sm leading-relaxed">
      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">ОСНОВНЫЕ ЭТИЧЕСКИЕ ПРИНЦИПЫ</h3>
        <ul className="space-y-3 text-white/60">
          <li>• Полная анонимность участников</li>
          <li>• Добровольное и информированное согласие</li>
          <li>• Право на отзыв своего видео в любое время</li>
          <li>• Некоммерческий характер проекта</li>
          <li>• Травмо-информированный подход</li>
          <li>• Отсутствие сбора персональных данных</li>
        </ul>
      </section>

      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">РЕСУРСЫ ПОДДЕРЖКИ</h3>
        <div className="space-y-3 text-white/60">
          <p>Если вам нужна поддержка:</p>
          <div className="space-y-2">
            <a 
              href="tel:88002000122" 
              className="block text-white/80 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              🇷🇺 Россия: 8-800-2000-122 (бесплатно)
            </a>
            <a 
              href="tel:116123" 
              className="block text-white/80 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              🇬🇧 UK: 116 123 (Samaritans)
            </a>
            <a 
              href="tel:18007997233" 
              className="block text-white/80 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              🇺🇸 USA: 1-800-799-7233 (National Hotline)
            </a>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">КОНТАКТЫ ДЛЯ ОБРАТНОЙ СВЯЗИ</h3>
        <p className="text-white/60">
          По любым вопросам, связанным с проектом, обращайтесь:{' '}
          <a 
            href="mailto:eternalcanvas@proton.me" 
            className="text-white/80 hover:text-white transition-colors underline"
          >
            eternalcanvas@proton.me
          </a>
        </p>
      </section>
    </div>
  );

  const contentEn = (
    <div className="space-y-8 text-sm leading-relaxed">
      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">CORE ETHICAL PRINCIPLES</h3>
        <ul className="space-y-3 text-white/60">
          <li>• Complete anonymity of participants</li>
          <li>• Voluntary and informed consent</li>
          <li>• Right to withdraw your video at any time</li>
          <li>• Non-commercial nature of the project</li>
          <li>• Trauma-informed approach</li>
          <li>• No collection of personal data</li>
        </ul>
      </section>

      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">SUPPORT RESOURCES</h3>
        <div className="space-y-3 text-white/60">
          <p>If you need support:</p>
          <div className="space-y-2">
            <a 
              href="tel:88002000122" 
              className="block text-white/80 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              🇷🇺 Russia: 8-800-2000-122 (free)
            </a>
            <a 
              href="tel:116123" 
              className="block text-white/80 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              🇬🇧 UK: 116 123 (Samaritans)
            </a>
            <a 
              href="tel:18007997233" 
              className="block text-white/80 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              🇺🇸 USA: 1-800-799-7233 (National Hotline)
            </a>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">FEEDBACK CONTACTS</h3>
        <p className="text-white/60">
          For any questions about the project, contact:{' '}
          <a 
            href="mailto:eternalcanvas@proton.me" 
            className="text-white/80 hover:text-white transition-colors underline"
          >
            eternalcanvas@proton.me
          </a>
        </p>
      </section>
    </div>
  );

  return (
    <NavModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={t('nav.ethics')}
    >
      {language === 'ru' ? contentRu : contentEn}
    </NavModal>
  );
};

export default EthicsModal;
