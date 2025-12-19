import NavModal from './NavModal';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ConsentModal = ({ isOpen, onClose }: Props) => {
  const { language } = useLanguage();

  const contentRu = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
      <section>
        <h3 className="text-white/90 font-bold mb-3">ДОБРОВОЛЬНОСТЬ</h3>
        <p>Ваше участие в проекте полностью добровольно. Вы можете отказаться в любой момент.</p>
      </section>
      <section>
        <h3 className="text-white/90 font-bold mb-3">АНОНИМНОСТЬ</h3>
        <p>Мы не собираем персональные данные. Видео идентифицируется уникальным кодом.</p>
      </section>
      <section>
        <h3 className="text-white/90 font-bold mb-3">ПРАВО НА ОТЗЫВ</h3>
        <p>Вы получите уникальную ссылку для удаления видео, показывается один раз.</p>
      </section>
      <section className="border-t border-white/10 pt-6">
        <p className="text-white/80 font-medium">
          Отправляя видео, вы подтверждаете, что добровольно предоставляете анонимную запись.
        </p>
      </section>
    </div>
  );

  const contentEn = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
      <section>
        <h3 className="text-white/90 font-bold mb-3">VOLUNTARINESS</h3>
        <p>Your participation is completely voluntary. You may withdraw at any time.</p>
      </section>
      <section>
        <h3 className="text-white/90 font-bold mb-3">ANONYMITY</h3>
        <p>We do not collect personal data. Videos are identified by a unique code.</p>
      </section>
      <section>
        <h3 className="text-white/90 font-bold mb-3">RIGHT TO WITHDRAW</h3>
        <p>You will receive a unique link to delete your video, shown only once.</p>
      </section>
      <section className="border-t border-white/10 pt-6">
        <p className="text-white/80 font-medium">
          By submitting, you confirm that you voluntarily contribute an anonymous recording.
        </p>
      </section>
    </div>
  );

  return (
    <NavModal
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'ru' ? 'СОГЛАСИЕ НА УЧАСТИЕ' : 'INFORMED CONSENT'}
    >
      {language === 'ru' ? contentRu : contentEn}
    </NavModal>
  );
};

export default ConsentModal;
