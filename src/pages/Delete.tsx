import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const Delete = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleDelete = async () => {
    if (!token) return;
    
    setStatus('deleting');

    try {
      const { data, error } = await supabase.functions.invoke('delete-eyes', {
        body: null,
        headers: {},
      });

      // Use fetch directly since we need query params
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-eyes?token=${token}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      const result = await response.json();

      if (result.success) {
        setStatus('success');
        setMessage('Глаза удалены навсегда.');
      } else {
        setStatus('error');
        setMessage(result.error || 'Токен недействителен');
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      setStatus('error');
      setMessage('Ошибка сети');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center max-w-md p-5">
          <h1 className="text-2xl mb-4">Удаление глаз</h1>
          <p className="text-gray-500">Токен не найден</p>
          <Link to="/" className="text-white underline mt-4 block">
            Вернуться на главную
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center max-w-md p-5">
        <h1 className="text-2xl mb-4">Удаление глаз</h1>
        
        {status === 'idle' && (
          <>
            <p className="text-gray-400 mb-6">
              Это действие необратимо. Ваши глаза будут удалены навсегда.
            </p>
            <button
              onClick={handleDelete}
              className="bg-red-800 hover:bg-red-600 text-white px-10 py-4 text-lg rounded-lg transition-colors"
            >
              УДАЛИТЬ НАВСЕГДА
            </button>
          </>
        )}

        {status === 'deleting' && (
          <p className="text-gray-400">Удаление...</p>
        )}

        {status === 'success' && (
          <>
            <p className="text-green-400 text-lg mb-4">{message}</p>
            <Link to="/" className="text-white underline">
              Вернуться на главную
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-red-400 text-lg mb-4">{message}</p>
            <Link to="/" className="text-white underline">
              Вернуться на главную
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default Delete;