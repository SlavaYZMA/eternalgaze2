import { useState } from 'react';
import { Link } from 'react-router-dom';
import NavModal from './NavModal';
import { useLanguage } from '@/contexts/LanguageContext';
import ConsentModal from './ConsentModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ParticipateModal = ({ isOpen, onClose }: Props) => {
  const { language, t } = useLanguage();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  const contentRu = (
    <div className="space-y-6 text-sm leading-relaxed">
      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">КАК УЧАСТВОВАТЬ</h3>
        <ol className="space-y-3 text-white/60 list-decimal list-inside">
          <li>Ознакомьтесь с условиями участия (Informed Consent)</li>
          <li>Подтвердите своё согласие ниже</li>
          <li>Перейдите на страницу записи</li>
          <li>Запишите 5-секундное видео своих глаз</li>
          <li>Сохраните ссылку для удаления (она будет показана один раз)</li>
        </ol>
      </section>

      <section className="border border-white/10 p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="consent-check"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-1 w-4 h-4 accent-white"
          />
          <label htmlFor="consent-check" className="text-white/60 cursor-pointer">
            Я согласна с{' '}
            <button 
              onClick={() => setShowConsent(true)}
              className="text-white/80 underline hover:text-white transition-colors"
            >
              условиями участия (Informed Consent)
            </button>
          </label>
        </div>
      </section>

      <section className="bg-yellow-500/10 border border-yellow-500/20 p-4">
        <p className="text-yellow-500/80 text-xs font-bold mb-2">⚠️ ПРЕДУПРЕЖДЕНИЕ О ТРИГГЕРАХ</p>
        <p className="text-white/50 text-xs">
          Этот проект затрагивает темы гендерного насилия. Если вам нужна поддержка, обратитесь на горячую линию.
        </p>
      </section>

      <section>
        <h4 className="text-white/60 text-xs mb-2">Горячие линии:</h4>
        <div className="space-y-1 text-xs text-white/40">
          <p>🇷🇺 8-800-2000-122</p>
          <p>🇬🇧 116 123</p>
          <p>🇺🇸 1-800-799-7233</p>
        </div>
      </section>

      {consentAccepted && (
        <Link
          to="/camera"
          onClick={onClose}
          className="block w-full text-center py-4 bg-white text-black font-bold tracking-widest hover:bg-white/90 transition-colors"
        >
          ПЕРЕЙТИ К ЗАПИСИ
        </Link>
      )}
    </div>
  );

  const contentEn = (
    <div className="space-y-6 text-sm leading-relaxed">
      <section>
        <h3 className="text-white/90 font-bold tracking-wider mb-4">HOW TO PARTICIPATE</h3>
        <ol className="space-y-3 text-white/60 list-decimal list-inside">
          <li>Read the terms of participation (Informed Consent)</li>
          <li>Confirm your agreement below</li>
          <li>Go to the recording page</li>
          <li>Record a 5-second video of your eyes</li>
          <li>Save the delete link (it will be shown once)</li>
        </ol>
      </section>

      <section className="border border-white/10 p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="consent-check-en"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-1 w-4 h-4 accent-white"
          />
          <label htmlFor="consent-check-en" className="text-white/60 cursor-pointer">
            I agree to the{' '}
            <button 
              onClick={() => setShowConsent(true)}
              className="text-white/80 underline hover:text-white transition-colors"
            >
              terms of participation (Informed Consent)
            </button>
          </label>
        </div>
      </section>

      <section className="bg-yellow-500/10 border border-yellow-500/20 p-4">
        <p className="text-yellow-500/80 text-xs font-bold mb-2">⚠️ TRIGGER WARNING</p>
        <p className="text-white/50 text-xs">
          This project addresses themes of gender-based violence. If you need support, please contact a hotline.
        </p>
      </section>

      <section>
        <h4 className="text-white/60 text-xs mb-2">Hotlines:</h4>
        <div className="space-y-1 text-xs text-white/40">
          <p>🇷🇺 8-800-2000-122</p>
          <p>🇬🇧 116 123</p>
          <p>🇺🇸 1-800-799-7233</p>
        </div>
      </section>

      {consentAccepted && (
        <Link
          to="/camera"
          onClick={onClose}
          className="block w-full text-center py-4 bg-white text-black font-bold tracking-widest hover:bg-white/90 transition-colors"
        >
          GO TO RECORDING
        </Link>
      )}
    </div>
  );

  return (
    <>
      <NavModal 
        isOpen={isOpen} 
        onClose={onClose} 
        title={t('nav.participate')}
      >
        {language === 'ru' ? contentRu : contentEn}
      </NavModal>
      
      <ConsentModal 
        isOpen={showConsent} 
        onClose={() => setShowConsent(false)} 
      />
    </>
  );
};

export default ParticipateModal;
