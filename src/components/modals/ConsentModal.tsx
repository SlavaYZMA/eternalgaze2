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
        <p>
          Ваше участие в этом проекте полностью добровольно. Вы можете отказаться от участия в любой момент без каких-либо последствий.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">АНОНИМНОСТЬ</h3>
        <p>
          Мы не собираем и не храним никаких персональных данных. Ваше видео будет идентифицироваться только уникальным кодом. IP-адреса и другие метаданные не сохраняются.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">ПРАВО НА ОТЗЫВ</h3>
        <p>
          После записи вам будет предоставлена уникальная ссылка для удаления вашего видео. Сохраните эту ссылку — она показывается только один раз. Вы можете удалить своё видео в любой момент.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">ИСПОЛЬЗОВАНИЕ МАТЕРИАЛОВ</h3>
        <p>
          Ваше видео будет отображаться как часть коллективной инсталляции. Проект является некоммерческим. Материалы не будут использоваться в коммерческих целях.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">ПРЕДУПРЕЖДЕНИЕ О ТРИГГЕРАХ</h3>
        <p>
          Участие в этом проекте может вызвать сильные эмоции. Если вам нужна поддержка, пожалуйста, обратитесь на горячую линию помощи.
        </p>
      </section>

      <section className="border-t border-white/10 pt-6">
        <p className="text-white/80 font-medium">
          Отправляя видео, вы подтверждаете, что идентифицируете себя как женщина, пережившая гендерное насилие, и добровольно предоставляете эту анонимную запись для проекта «Вечное полотно».
        </p>
      </section>
    </div>
  );

  const contentEn = (
    <div className="space-y-6 text-sm leading-relaxed text-white/60">
      <section>
        <h3 className="text-white/90 font-bold mb-3">VOLUNTARINESS</h3>
        <p>
          Your participation in this project is entirely voluntary. You can refuse to participate at any time without any consequences.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">ANONYMITY</h3>
        <p>
          We do not collect or store any personal data. Your video will be identified only by a unique code. IP addresses and other metadata are not saved.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">RIGHT TO WITHDRAW</h3>
        <p>
          After recording, you will be provided with a unique link to delete your video. Save this link — it is shown only once. You can delete your video at any time.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">USE OF MATERIALS</h3>
        <p>
          Your video will be displayed as part of a collective installation. The project is non-commercial. Materials will not be used for commercial purposes.
        </p>
      </section>

      <section>
        <h3 className="text-white/90 font-bold mb-3">TRIGGER WARNING</h3>
        <p>
          Participation in this project may evoke strong emotions. If you need support, please contact a helpline.
        </p>
      </section>

      <section className="border-t border-white/10 pt-6">
        <p className="text-white/80 font-medium">
          By submitting, you confirm that you identify as a woman who has experienced gender-based violence and voluntarily contribute this anonymous recording to the "Eternal Canvas" project.
        </p>
      </section>
    </div>
  );

  return (
    <NavModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={language === 'ru' ? 'INFORMED CONSENT' : 'INFORMED CONSENT'}
    >
      {language === 'ru' ? contentRu : contentEn}
    </NavModal>
  );
};

export default ConsentModal;
