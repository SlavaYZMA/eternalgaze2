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
      {/* Остальные секции, как в старом коде */}
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
      {/* Остальные секции, как в старом коде */}
    </div>
  );

  return (
    <NavModal isOpen={isOpen} onClose={onClose} title={t('nav.ethics')}>
      {language === 'ru' ? contentRu : contentEn}
    </NavModal>
  );
};

export default EthicsModal;
