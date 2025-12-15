import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, X, Trash2 } from 'lucide-react';

interface EyeRecord {
  cid: string;
  created_at: string;
}

const ADMIN_SECRET_KEY = 'gorgona_admin_secret'; // localStorage key
const ITEMS_PER_PAGE = 20;

const Canvas = () => {
  const [searchParams] = useSearchParams();
  const [eyes, setEyes] = useState<EyeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [deletingCid, setDeletingCid] = useState<string | null>(null);
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/eyes/`;

  // Check admin mode
  useEffect(() => {
    const adminParam = searchParams.get('admin');
    const storedSecret = localStorage.getItem(ADMIN_SECRET_KEY);
    
    if (adminParam === '1' && storedSecret) {
      setIsAdmin(true);
    } else if (adminParam === '1') {
      const secret = prompt('Введите admin secret:');
      if (secret) {
        localStorage.setItem(ADMIN_SECRET_KEY, secret);
        setIsAdmin(true);
      }
    }
  }, [searchParams]);

  const loadEyes = useCallback(async (pageNum: number, append = false) => {
    try {
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error: queryError } = await supabase
        .from('eyes')
        .select('cid, created_at')
        .order('created_at', { ascending: true })
        .range(from, to);

      if (queryError) throw queryError;

      if (data) {
        if (append) {
          setEyes(prev => [...prev, ...data]);
        } else {
          setEyes(data);
        }
        setHasMore(data.length === ITEMS_PER_PAGE);
      }
    } catch (err: any) {
      console.error('Load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadEyes(0);

    // Subscribe to realtime updates
    const channel = supabase
      .channel('eyes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eyes'
        },
        (payload) => {
          console.log('Realtime update:', payload);
          if (payload.eventType === 'INSERT') {
            // Append to end (left-to-right, top-to-bottom flow)
            setEyes(prev => [...prev, payload.new as EyeRecord]);
          } else if (payload.eventType === 'DELETE') {
            setEyes(prev => prev.filter(e => e.cid !== (payload.old as EyeRecord).cid));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEyes]);

  // Infinite scroll observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage(prev => {
            const nextPage = prev + 1;
            loadEyes(nextPage, true);
            return nextPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, loading, loadEyes]);

  const handleAdminDelete = async (cid: string) => {
    if (!confirm('Удалить это видео навсегда?')) return;

    const adminSecret = localStorage.getItem(ADMIN_SECRET_KEY);
    if (!adminSecret) {
      alert('Admin secret не найден');
      return;
    }

    setDeletingCid(cid);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-eyes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cid, adminSecret })
        }
      );

      const result = await response.json();

      if (result.success) {
        setEyes(prev => prev.filter(e => e.cid !== cid));
      } else {
        alert('Ошибка удаления: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Ошибка сети');
    } finally {
      setDeletingCid(null);
    }
  };

  if (loading && eyes.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-gray-500 text-lg">Загрузка глаз...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-500 text-lg">Ошибка: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Link
        to="/"
        className="fixed top-5 left-5 text-gray-500 hover:text-white text-2xl z-50"
      >
        <ArrowLeft size={24} />
      </Link>

      {isAdmin && (
        <div className="fixed top-5 right-5 bg-red-900/80 text-white px-3 py-1 rounded text-sm z-50">
          ADMIN MODE
        </div>
      )}

      {eyes.length === 0 ? (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500 text-lg">Пока нет глаз</p>
        </div>
      ) : (
        <>
          {/* Dense grid layout: left-to-right, top-to-bottom */}
          <div 
            className="grid w-full"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, 512px)',
              justifyContent: 'center',
            }}
          >
            {eyes.map((eye) => (
              <div
                key={eye.cid}
                className="relative group"
                style={{ width: 512, height: 128 }}
              >
                <video
                  src={`${storageUrl}${eye.cid}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover block"
                />
                
                {/* Admin delete button */}
                {isAdmin && (
                  <button
                    onClick={() => handleAdminDelete(eye.cid)}
                    disabled={deletingCid === eye.cid}
                    className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-500 text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    {deletingCid === eye.cid ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Load more trigger */}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="h-20 flex items-center justify-center"
            >
              <p className="text-gray-600 text-sm">Загрузка...</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Canvas;
