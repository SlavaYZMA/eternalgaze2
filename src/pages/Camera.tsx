import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft } from 'lucide-react';

type RecordingState = 'idle' | 'countdown' | 'recording' | 'preview';

const Camera = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>(0);

  const [state, setState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(3);
  const [recordTime, setRecordTime] = useState(7);
  const [statusText, setStatusText] = useState('Инициализация камеры...');
  const [eyesDetected, setEyesDetected] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [deleteUrl, setDeleteUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const FRAME_WIDTH = 512;
  const FRAME_HEIGHT = 128;

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatusText('Камера готова. Поместите глаза в рамку.');
        
        // Simple motion detection for eye positioning
        startMotionDetection();
      } catch (err) {
        console.error('Camera error:', err);
        setStatusText('Ошибка доступа к камере');
      }
    };

    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const startMotionDetection = () => {
    let stableFrames = 0;
    const requiredStable = 30;
    const detectionCanvas = document.createElement('canvas');
    detectionCanvas.width = 160;
    detectionCanvas.height = 120;
    const ctx = detectionCanvas.getContext('2d')!;
    let previousFrame: ImageData | null = null;

    const detect = () => {
      if (state === 'recording' || !videoRef.current?.videoWidth) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, 160, 120);
      const currentFrame = ctx.getImageData(0, 0, 160, 120);

      if (previousFrame) {
        let diff = 0;
        for (let i = 0; i < currentFrame.data.length; i += 4) {
          diff += Math.abs(currentFrame.data[i] - previousFrame.data[i]);
        }
        diff /= (currentFrame.data.length / 4);

        if (diff < 10) {
          stableFrames++;
          if (stableFrames >= requiredStable && !eyesDetected && state === 'idle') {
            setEyesDetected(true);
            setStatusText('Стабильное положение обнаружено. Нажмите кнопку.');
          }
        } else {
          if (diff > 30 && eyesDetected) {
            setEyesDetected(false);
            setStatusText('Держите голову неподвижно');
          }
          stableFrames = 0;
        }
      }
      previousFrame = currentFrame;
      animationRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const startCountdown = useCallback(() => {
    if (state !== 'idle') return;
    setState('countdown');
    setCountdown(3);
    setStatusText('Запись начнётся через...');

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          startRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [state]);

  const startRecording = useCallback(() => {
    setState('recording');
    setRecordTime(7);
    setStatusText('Идёт запись...');
    chunksRef.current = [];

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = FRAME_WIDTH * dpr;
    canvas.height = FRAME_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const drawFrame = () => {
      if (!videoRef.current) return;
      
      ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      ctx.save();
      ctx.translate(FRAME_WIDTH, 0);
      ctx.scale(-1, 1);
      
      const videoW = videoRef.current.videoWidth || FRAME_WIDTH;
      const videoH = videoRef.current.videoHeight || FRAME_HEIGHT;
      const scale = Math.max(FRAME_WIDTH / videoW, FRAME_HEIGHT / videoH);
      const sw = Math.round(FRAME_WIDTH / scale);
      const sh = Math.round(FRAME_HEIGHT / scale);
      const sx = Math.round((videoW - sw) / 2);
      const sy = Math.round((videoH - sh) / 2);
      
      ctx.drawImage(videoRef.current, sx, sy, sw, sh, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      ctx.restore();

      if (state === 'recording') {
        requestAnimationFrame(drawFrame);
      }
    };
    drawFrame();

    const canvasStream = canvas.captureStream(20);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: 1000000
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setState('preview');
      setStatusText('Запись завершена');
      
      if (previewRef.current) {
        previewRef.current.src = URL.createObjectURL(blob);
        previewRef.current.play().catch(() => {});
      }
    };

    recorder.start(100);

    const timer = setInterval(() => {
      setRecordTime(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, 7000);
  }, []);

  const resetRecording = () => {
    setState('idle');
    setRecordedBlob(null);
    setDeleteUrl(null);
    setEyesDetected(false);
    setStatusText('Камера готова. Поместите глаза в рамку.');
    if (previewRef.current) {
      previewRef.current.src = '';
    }
  };

  const saveForever = async () => {
    if (!recordedBlob) return;
    
    setIsSaving(true);
    setStatusText('Сохранение...');

    try {
      const formData = new FormData();
      formData.append('video', recordedBlob, 'eye-recording.webm');

      const { data, error } = await supabase.functions.invoke('save-eyes', {
        body: formData
      });

      if (error) throw error;

      if (data?.success) {
        setStatusText('Сохранено навсегда!');
        setDeleteUrl(data.deleteUrl);
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      setStatusText('Ошибка сохранения: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadVideo = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eye-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center relative">
      <Link to="/" className="absolute top-5 left-5 text-gray-500 hover:text-white text-2xl z-50">
        <ArrowLeft size={24} />
      </Link>

      <h1 className="text-2xl md:text-3xl text-center mt-16 mb-10 px-5">
        {state === 'preview' ? 'Запись завершена' : 'Поднеси глаза к рамке и держи взгляд'}
      </h1>

      {/* Video frame */}
      <div className="relative w-[512px] max-w-[90vw] h-[128px] border-2 border-white rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full object-cover scale-x-[-1] ${state === 'preview' ? 'hidden' : ''}`}
        />
        <video
          ref={previewRef}
          playsInline
          loop
          muted
          className={`w-full h-full object-cover ${state !== 'preview' ? 'hidden' : ''}`}
        />
        
        {/* Eye guides */}
        {state !== 'preview' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-1/2 -translate-y-1/2 left-[43px] w-[170px] h-[76px] border-2 border-dashed border-white/60 rounded-full">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34px] h-[34px] border-2 border-dashed border-white/40 rounded-full" />
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-[43px] w-[170px] h-[76px] border-2 border-dashed border-white/60 rounded-full">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34px] h-[34px] border-2 border-dashed border-white/40 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Timer */}
      {(state === 'countdown' || state === 'recording') && (
        <div className="text-[120px] font-light mt-10 tabular-nums tracking-tighter">
          {state === 'countdown' ? countdown : recordTime}
        </div>
      )}

      {/* Status */}
      <div className="text-gray-500 text-base mt-5 text-center">{statusText}</div>

      {/* Start button */}
      {state === 'idle' && (
        <div className="mt-10">
          <button
            onClick={startCountdown}
            disabled={!eyesDetected}
            className="bg-transparent text-white border-2 border-white px-14 py-5 text-lg font-medium rounded-lg uppercase tracking-wide transition-all hover:bg-white hover:text-black disabled:opacity-30 disabled:cursor-not-allowed disabled:border-gray-600 disabled:text-gray-600 disabled:hover:bg-transparent"
          >
            НАЧАТЬ ЗАПИСЬ
          </button>
        </div>
      )}

      {/* Preview buttons */}
      {state === 'preview' && (
        <div className="flex flex-col items-center gap-4 mt-10">
          <button
            onClick={resetRecording}
            className="bg-transparent text-white border-2 border-white px-10 py-4 text-base font-medium rounded-lg uppercase tracking-wide min-w-[280px] hover:bg-white hover:text-black transition-all"
          >
            ЗАПИСАТЬ ЗАНОВО
          </button>
          <button
            onClick={saveForever}
            disabled={isSaving || !!deleteUrl}
            className="bg-white text-black border-2 border-white px-10 py-4 text-base font-medium rounded-lg uppercase tracking-wide min-w-[280px] hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            {isSaving ? 'СОХРАНЕНИЕ...' : deleteUrl ? 'СОХРАНЕНО' : 'ОСТАВИТЬ НАВСЕГДА'}
          </button>
          <button
            onClick={downloadVideo}
            className="bg-transparent text-white border-2 border-white px-10 py-4 text-base font-medium rounded-lg uppercase tracking-wide min-w-[280px] hover:bg-white hover:text-black transition-all"
          >
            СКАЧАТЬ НА КОМПЬЮТЕР
          </button>
        </div>
      )}

      {/* Delete URL */}
      {deleteUrl && (
        <div className="mt-5 text-center max-w-md px-4">
          <p className="text-gray-500 text-sm mb-2">Ссылка для удаления (одноразовая):</p>
          <a href={deleteUrl} className="text-white text-sm break-all hover:underline">
            {deleteUrl}
          </a>
        </div>
      )}

      {/* Hidden canvas for recording */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Camera;