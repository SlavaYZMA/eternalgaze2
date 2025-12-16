import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Minus } from 'lucide-react';

type RecordingState = 'idle' | 'countdown' | 'recording' | 'preview';

const CONFIG = {
  FRAME_WIDTH: 512,
  FRAME_HEIGHT: 128,
  PRE_RECORD_SECONDS: 3,
  RECORD_SECONDS: 5,
  FPS: 20,
  BITRATE: 1000000,
  ZOOM_MIN: 1,
  ZOOM_MAX: 3,
  ZOOM_STEP: 0.1,
  STABLE_FRAMES_REQUIRED: 15,
  HEAD_JERK_THRESHOLD: 35,
  // Eye detection thresholds
  MIN_DARK_RATIO: 0.02, // Minimum dark pixels (pupils/iris)
  MAX_DARK_RATIO: 0.25, // Maximum dark pixels
  MIN_VARIANCE: 200, // Minimum variance (contrast)
  BRIGHTNESS_MIN: 30, // Minimum average brightness
  BRIGHTNESS_MAX: 220, // Maximum average brightness
};

const Camera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>(0);
  const stableFramesRef = useRef(0);
  const previousFrameRef = useRef<ImageData | null>(null);
  const abortedRef = useRef(false);

  const [state, setState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(CONFIG.PRE_RECORD_SECONDS);
  const [recordTime, setRecordTime] = useState(CONFIG.RECORD_SECONDS);
  const [statusText, setStatusText] = useState('Инициализация камеры...');
  const [canRecord, setCanRecord] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [deleteUrl, setDeleteUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(1.5);
  const [supportsHardwareZoom, setSupportsHardwareZoom] = useState(false);
  const [eyesInFrame, setEyesInFrame] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as Record<string, unknown>;
        if (capabilities && 'zoom' in capabilities) {
          setSupportsHardwareZoom(true);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        
        // Create detection canvas
        if (!detectionCanvasRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = CONFIG.FRAME_WIDTH;
          canvas.height = CONFIG.FRAME_HEIGHT;
          detectionCanvasRef.current = canvas;
        }
        
        setStatusText('Расположите глаза в рамке');
        startDetection();
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
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (supportsHardwareZoom && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      // @ts-expect-error - zoom is valid but not in TS types
      track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
    }
  }, [zoom, supportsHardwareZoom]);

  // Extract the exact frame region that will be recorded
  const getFrameImageData = useCallback(() => {
    if (!videoRef.current?.videoWidth || !detectionCanvasRef.current) return null;
    
    const ctx = detectionCanvasRef.current.getContext('2d')!;
    const videoW = videoRef.current.videoWidth;
    const videoH = videoRef.current.videoHeight;
    
    const effectiveZoom = supportsHardwareZoom ? 1 : zoom;
    const scaledW = videoW / effectiveZoom;
    const scaledH = videoH / effectiveZoom;
    const scale = Math.max(CONFIG.FRAME_WIDTH / scaledW, CONFIG.FRAME_HEIGHT / scaledH);
    const sw = Math.round(CONFIG.FRAME_WIDTH / scale);
    const sh = Math.round(CONFIG.FRAME_HEIGHT / scale);
    const sx = Math.round((videoW - sw) / 2);
    const sy = Math.round((videoH - sh) / 2);
    
    ctx.save();
    ctx.translate(CONFIG.FRAME_WIDTH, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, sx, sy, sw, sh, 0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
    ctx.restore();
    
    return ctx.getImageData(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
  }, [zoom, supportsHardwareZoom]);

  // Check if eyes are in the frame based on pixel analysis
  const checkEyesInFrame = useCallback((imageData: ImageData) => {
    const data = imageData.data;
    const totalPixels = data.length / 4;
    
    let sum = 0;
    let sumSq = 0;
    let darkPixels = 0;
    const darkThreshold = 60;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += gray;
      sumSq += gray * gray;
      if (gray < darkThreshold) darkPixels++;
    }
    
    const mean = sum / totalPixels;
    const variance = (sumSq / totalPixels) - (mean * mean);
    const darkRatio = darkPixels / totalPixels;
    
    // Eyes have: moderate brightness, high variance (contrast), some dark areas (pupils)
    const hasDarkAreas = darkRatio >= CONFIG.MIN_DARK_RATIO && darkRatio <= CONFIG.MAX_DARK_RATIO;
    const hasContrast = variance >= CONFIG.MIN_VARIANCE;
    const hasBrightness = mean >= CONFIG.BRIGHTNESS_MIN && mean <= CONFIG.BRIGHTNESS_MAX;
    
    const detected = hasDarkAreas && hasContrast && hasBrightness;
    
    setDebugInfo(`B:${mean.toFixed(0)} V:${variance.toFixed(0)} D:${(darkRatio*100).toFixed(1)}%`);
    
    return detected;
  }, []);

  const startDetection = () => {
    const detect = () => {
      const imageData = getFrameImageData();
      
      if (!imageData) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      const eyesDetected = checkEyesInFrame(imageData);
      setEyesInFrame(eyesDetected);

      // Calculate motion between frames
      let motion = 0;
      if (previousFrameRef.current) {
        const curr = imageData.data;
        const prev = previousFrameRef.current.data;
        let diff = 0;
        // Sample every 4th pixel for performance
        for (let i = 0; i < curr.length; i += 16) {
          diff += Math.abs(curr[i] - prev[i]);
        }
        motion = diff / (curr.length / 16);
      }

      if (state === 'idle') {
        if (eyesDetected && motion < CONFIG.HEAD_JERK_THRESHOLD) {
          stableFramesRef.current++;
          if (stableFramesRef.current >= CONFIG.STABLE_FRAMES_REQUIRED) {
            if (!canRecord) {
              setCanRecord(true);
              setStatusText('Готово к записи');
            }
          }
        } else {
          stableFramesRef.current = 0;
          if (canRecord) setCanRecord(false);
          
          if (!eyesDetected) {
            setStatusText('Расположите глаза в рамке');
          } else if (motion >= CONFIG.HEAD_JERK_THRESHOLD) {
            setStatusText('Держите голову неподвижно');
          }
        }
      }

      if (state === 'countdown') {
        if (!eyesDetected) {
          abortCountdown('Глаза вышли из рамки');
        } else if (motion > CONFIG.HEAD_JERK_THRESHOLD * 1.5) {
          abortCountdown('Слишком резкое движение');
        }
      }

      if (state === 'recording') {
        if (!eyesDetected) {
          abortRecording('Глаза вышли из рамки — запись прервана');
        } else if (motion > CONFIG.HEAD_JERK_THRESHOLD * 1.5) {
          abortRecording('Движение — запись прервана');
        }
      }

      previousFrameRef.current = imageData;
      animationRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const abortCountdown = (reason: string) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setState('idle');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    setStatusText(reason);
    stableFramesRef.current = 0;
    setCanRecord(false);
  };

  const abortRecording = (reason: string) => {
    abortedRef.current = true;
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    chunksRef.current = [];
    setState('idle');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setStatusText(reason);
    stableFramesRef.current = 0;
    setCanRecord(false);
  };

  const startCountdown = useCallback(() => {
    if (state !== 'idle' || !canRecord) return;
    setState('countdown');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    setStatusText('Приготовьтесь...');

    let count = CONFIG.PRE_RECORD_SECONDS;
    countdownIntervalRef.current = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        startRecording();
      }
    }, 1000);
  }, [state, canRecord]);

  const startRecording = useCallback(() => {
    setState('recording');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setStatusText('ИДЁТ ЗАПИСЬ');
    chunksRef.current = [];
    abortedRef.current = false;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CONFIG.FRAME_WIDTH * dpr;
    canvas.height = CONFIG.FRAME_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let isActive = true;

    const drawFrame = () => {
      if (!videoRef.current || !isActive) return;

      ctx.clearRect(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
      ctx.save();
      ctx.translate(CONFIG.FRAME_WIDTH, 0);
      ctx.scale(-1, 1);

      const videoW = videoRef.current.videoWidth || CONFIG.FRAME_WIDTH;
      const videoH = videoRef.current.videoHeight || CONFIG.FRAME_HEIGHT;

      const effectiveZoom = supportsHardwareZoom ? 1 : zoom;
      const scaledW = videoW / effectiveZoom;
      const scaledH = videoH / effectiveZoom;
      const scale = Math.max(CONFIG.FRAME_WIDTH / scaledW, CONFIG.FRAME_HEIGHT / scaledH);
      const sw = Math.round(CONFIG.FRAME_WIDTH / scale);
      const sh = Math.round(CONFIG.FRAME_HEIGHT / scale);
      const sx = Math.round((videoW - sw) / 2);
      const sy = Math.round((videoH - sh) / 2);

      ctx.drawImage(videoRef.current, sx, sy, sw, sh, 0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
      ctx.restore();

      if (isActive) {
        requestAnimationFrame(drawFrame);
      }
    };
    drawFrame();

    const canvasStream = canvas.captureStream(CONFIG.FPS);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: CONFIG.BITRATE
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      isActive = false;
      
      if (!abortedRef.current && chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setState('preview');
        setStatusText('Запись завершена');

        if (previewRef.current) {
          previewRef.current.src = URL.createObjectURL(blob);
          previewRef.current.play().catch(() => {});
        }
      }
    };

    recorder.start(100);

    let count = CONFIG.RECORD_SECONDS;
    recordIntervalRef.current = setInterval(() => {
      count--;
      setRecordTime(count);
      if (count <= 0) {
        if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    }, 1000);
  }, [zoom, supportsHardwareZoom]);

  const resetRecording = () => {
    setState('idle');
    setRecordedBlob(null);
    setDeleteUrl(null);
    setCanRecord(false);
    setStatusText('Расположите глаза в рамке');
    setRecordTime(CONFIG.RECORD_SECONDS);
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    stableFramesRef.current = 0;
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
        setStatusText('Сохранено навсегда');
        setDeleteUrl(data.deleteUrl);
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      setStatusText('Ошибка: ' + err.message);
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

  const adjustZoom = (delta: number) => {
    setZoom(prev => Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, prev + delta)));
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center relative font-mono">
      <Link to="/" className="absolute top-6 left-6 text-white/40 hover:text-white transition-colors z-50">
        <ArrowLeft size={24} />
      </Link>

      {/* Recording status */}
      {state === 'recording' && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
          <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
          <span className="text-red-600 text-sm font-bold uppercase tracking-widest">
            REC
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 w-full max-w-2xl">
        
        {/* Instruction text */}
        <p className="text-white/60 text-sm md:text-base text-center mb-8 tracking-wide">
          {state === 'preview' ? 'Предпросмотр записи' : 'РАСПОЛОЖИТЕ ГЛАЗА СТРОГО В РАМКЕ'}
        </p>

        {/* Video frame with eye guides */}
        <div className="relative mb-8">
          {/* Frame container */}
          <div 
            className={`relative overflow-hidden transition-all duration-300 ${
              state === 'recording' 
                ? 'ring-2 ring-red-600' 
                : eyesInFrame && canRecord 
                  ? 'ring-2 ring-green-500/50' 
                  : 'ring-1 ring-white/30'
            }`}
            style={{ 
              width: CONFIG.FRAME_WIDTH, 
              height: CONFIG.FRAME_HEIGHT,
              borderRadius: 12,
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute top-1/2 left-1/2 min-w-full min-h-full object-cover ${state === 'preview' ? 'hidden' : ''}`}
              style={{
                transform: `translate(-50%, -50%) scaleX(-1) scale(${supportsHardwareZoom ? 1 : zoom})`,
              }}
            />
            <video
              ref={previewRef}
              playsInline
              loop
              muted
              className={`w-full h-full object-cover ${state !== 'preview' ? 'hidden' : ''}`}
            />

            {/* Eye position guides */}
            {state !== 'preview' && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Center lines */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
                
                {/* Eye oval guides */}
                <div className="absolute top-1/2 -translate-y-1/2 left-[15%] w-[30%] h-[60%] border border-dashed border-white/30 rounded-full" />
                <div className="absolute top-1/2 -translate-y-1/2 right-[15%] w-[30%] h-[60%] border border-dashed border-white/30 rounded-full" />
                
                {/* Corner markers */}
                <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-white/40" />
                <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-white/40" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-white/40" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-white/40" />
              </div>
            )}
          </div>
        </div>

        {/* Timer display */}
        {(state === 'countdown' || state === 'recording') && (
          <div className={`text-8xl md:text-9xl font-bold mb-8 tabular-nums ${
            state === 'recording' ? 'text-red-600' : 'text-white'
          }`}>
            {state === 'countdown' ? countdown : recordTime}
          </div>
        )}

        {/* Zoom controls */}
        {state === 'idle' && !supportsHardwareZoom && (
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => adjustZoom(-CONFIG.ZOOM_STEP)}
              className="w-10 h-10 border border-white/20 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Minus size={16} />
            </button>
            <span className="text-white/40 text-sm w-24 text-center font-mono">
              {zoom.toFixed(1)}x
            </span>
            <button
              onClick={() => adjustZoom(CONFIG.ZOOM_STEP)}
              className="w-10 h-10 border border-white/20 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        )}

        {/* Status text */}
        <p className={`text-sm mb-8 text-center tracking-wide ${
          state === 'recording' ? 'text-red-500' : 
          eyesInFrame ? 'text-green-500/80' : 'text-white/50'
        }`}>
          {statusText}
        </p>

        {/* Action buttons */}
        {state === 'idle' && (
          <button
            onClick={startCountdown}
            disabled={!canRecord}
            className={`px-12 py-4 text-sm font-bold uppercase tracking-widest transition-all ${
              canRecord
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            Записать
          </button>
        )}

        {state === 'preview' && !deleteUrl && (
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button
              onClick={saveForever}
              disabled={isSaving}
              className="w-full px-8 py-4 bg-white text-black text-sm font-bold uppercase tracking-widest hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Сохранение...' : 'Оставить навсегда'}
            </button>
            <button
              onClick={resetRecording}
              disabled={isSaving}
              className="w-full px-8 py-3 border border-white/30 text-white/60 text-sm uppercase tracking-widest hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Записать заново
            </button>
            <button
              onClick={downloadVideo}
              className="w-full px-8 py-3 border border-white/20 text-white/40 text-xs uppercase tracking-widest hover:bg-white/5 transition-colors"
            >
              Скачать
            </button>
          </div>
        )}

        {deleteUrl && (
          <div className="text-center max-w-sm">
            <p className="text-green-500 mb-4 text-sm">Сохранено навсегда</p>
            <p className="text-white/40 text-xs mb-4">
              Сохраните эту ссылку — она позволяет удалить запись в любой момент:
            </p>
            <code className="block bg-white/5 p-3 text-xs break-all text-white/60 mb-6">
              {deleteUrl}
            </code>
            <Link 
              to="/canvas" 
              className="inline-block px-8 py-3 bg-white text-black text-sm font-bold uppercase tracking-widest hover:bg-white/90 transition-colors"
            >
              Смотреть все глаза
            </Link>
          </div>
        )}
      </div>

      {/* Hidden canvas for recording */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Camera;