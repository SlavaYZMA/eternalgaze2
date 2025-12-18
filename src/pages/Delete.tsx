import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const Delete = () => {
  const { t } = useLanguage(); // если используешь переводы, иначе удали
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Токен не найден');
    }
  }, [token]);

  const handleDelete = async () => {
    if (!token) return;

    setStatus('deleting');

    try {
      // 1. Находим cid по токену
      const { data: tokenData, error: tokenError } = await supabase
        .from('delete_tokens')
        .select('cid')
        .eq('delete_token', token)
        .single();

      if (tokenError || !tokenData) {
        throw new Error('Токен недействителен или уже использован');
      }

      const cid = tokenData.cid;

      // 2. Удаляем видео из Storage
      const { error: storageError } = await supabase.storage
        .from('eyes')
        .remove([cid]);

      if (storageError) throw storageError;

      // 3. Удаляем запись из таблицы eyes (cascade удалит токен)
      const { error: dbError } = await supabase
        .from('eyes')
        .delete()
        .eq('cid', cid);

      if (dbError) throw dbError;

      setStatus('success');
      setMessage('Глаза удалены навсегда.');

    } catch (err: any) {
      console.error('Delete error:', err);
      setStatus('error');
      setMessage(err.message || 'Ошибка удаления');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center font-mono">
      <div className="text-center max-w-md p-8">
        <h1 className="text-2xl md:text-3xl mb-8">Удаление глаз</h1>

        {status === 'idle' && (
          <>
            <p className="text-white/60 mb-10 leading-relaxed">
              Это действие необратимо.<br />
              Ваш взгляд будет удалён навсегда из вечного полотна.
            </p>
            <button
              onClick={handleDelete}
              className="px-12 py-5 bg-red-900/80 hover:bg-red-800 text-white text-lg uppercase tracking-widest transition-colors"
            >
              Удалить навсегда
            </button>
          </>
        )}

        {status === 'deleting' && (
          <p className="text-white/60 text-lg">Удаление...</p>
        )}

        {status === 'success' && (
          <>
            <p className="text-green-400 text-xl mb-8">{message}</p>
            <Link to="/" className="text-white/60 hover:text-white underline transition-colors">
              ← Вернуться на главную
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-red-400 text-xl mb-8">{message}</p>
            <Link to="/" className="text-white/60 hover:text-white underline transition-colors">
              ← Вернуться на главную
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default Delete;
