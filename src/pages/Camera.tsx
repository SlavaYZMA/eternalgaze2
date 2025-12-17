import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera as MediaPipeCamera } from '@mediapipe/camera_utils';

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
  STABLE_FRAMES_REQUIRED: 20,
  HEAD_JERK_THRESHOLD: 0.03, // Normalized distance
  MIN_EYE_WIDTH: 0.08, // Minimum eye width relative to frame (not too far)
  MAX_EYE_WIDTH: 0.35, // Maximum eye width relative to frame (not too close)
  FRAME_MARGIN: 0.05, // Margin from frame edges
};

// FaceMesh landmark indices for eyes
const LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 157, 173, 246, 161, 163];
const RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 384, 398, 466, 388, 390];
const LEFT_EYE_CENTER = [468]; // Left iris center
const RIGHT_EYE_CENTER = [473]; // Right iris center

interface EyeData {
  leftEye: { x: number; y: number; width: number } | null;
  rightEye: { x: number; y: number; width: number } | null;
  bothInFrame: boolean;
  hasValidSize: boolean;
}

const Camera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const mediaPipeCameraRef = useRef<MediaPipeCamera | null>(null);
  const abortedRef = useRef(false);
  const previousEyeCenterRef = useRef<{ x: number; y: number } | null>(null);
  const stableFramesRef = useRef(0);

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
  const [detectionStatus, setDetectionStatus] = useState<'none' | 'partial' | 'valid'>('none');
  const [debugInfo, setDebugInfo] = useState('');

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef(state);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Calculate eye data from FaceMesh landmarks
  const calculateEyeData = useCallback((landmarks: Results['multiFaceLandmarks'][0]): EyeData => {
    if (!landmarks || landmarks.length < 478) {
      return { leftEye: null, rightEye: null, bothInFrame: false, hasValidSize: false };
    }

    // Get eye bounding boxes
    const getEyeBounds = (indices: number[]) => {
      const points = indices.map(i => landmarks[i]);
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
        centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
        width: Math.max(...xs) - Math.min(...xs),
      };
    };

    const leftBounds = getEyeBounds(LEFT_EYE_INDICES);
    const rightBounds = getEyeBounds(RIGHT_EYE_INDICES);

    // Check if both eyes are within frame bounds (with margin)
    const margin = CONFIG.FRAME_MARGIN;
    const leftInFrame = 
      leftBounds.minX > margin && 
      leftBounds.maxX < (1 - margin) && 
      leftBounds.minY > margin && 
      leftBounds.maxY < (1 - margin);
    
    const rightInFrame = 
      rightBounds.minX > margin && 
      rightBounds.maxX < (1 - margin) && 
      rightBounds.minY > margin && 
      rightBounds.maxY < (1 - margin);

    // Check eye size (not too far, not too close)
    const avgEyeWidth = (leftBounds.width + rightBounds.width) / 2;
    const hasValidSize = avgEyeWidth >= CONFIG.MIN_EYE_WIDTH && avgEyeWidth <= CONFIG.MAX_EYE_WIDTH;

    return {
      leftEye: { x: leftBounds.centerX, y: leftBounds.centerY, width: leftBounds.width },
      rightEye: { x: rightBounds.centerX, y: rightBounds.centerY, width: rightBounds.width },
      bothInFrame: leftInFrame && rightInFrame,
      hasValidSize,
    };
  }, []);

  // Process FaceMesh results
  const onFaceMeshResults = useCallback((results: Results) => {
    const currentState = stateRef.current;
    
    // Draw debug overlay
    if (overlayCanvasRef.current && currentState !== 'preview') {
      const ctx = overlayCanvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
    }

    // No face detected
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setDetectionStatus('none');
      setDebugInfo('Лицо не обнаружено');
      stableFramesRef.current = 0;
      previousEyeCenterRef.current = null;
      
      if (currentState === 'idle') {
        setCanRecord(false);
        setStatusText('Лицо не обнаружено');
      } else if (currentState === 'countdown') {
        abortCountdown('Лицо вышло из кадра');
      } else if (currentState === 'recording') {
        abortRecording('Лицо вышло из кадра — запись прервана');
      }
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const eyeData = calculateEyeData(landmarks);

    // Check all conditions
    const hasEyes = eyeData.leftEye !== null && eyeData.rightEye !== null;
    const eyesInFrame = eyeData.bothInFrame;
    const validSize = eyeData.hasValidSize;

    // Calculate motion (head jerk detection)
    let motion = 0;
    if (eyeData.leftEye && eyeData.rightEye && previousEyeCenterRef.current) {
      const currentCenter = {
        x: (eyeData.leftEye.x + eyeData.rightEye.x) / 2,
        y: (eyeData.leftEye.y + eyeData.rightEye.y) / 2,
      };
      motion = Math.sqrt(
        Math.pow(currentCenter.x - previousEyeCenterRef.current.x, 2) +
        Math.pow(currentCenter.y - previousEyeCenterRef.current.y, 2)
      );
    }

    // Update previous center
    if (eyeData.leftEye && eyeData.rightEye) {
      previousEyeCenterRef.current = {
        x: (eyeData.leftEye.x + eyeData.rightEye.x) / 2,
        y: (eyeData.leftEye.y + eyeData.rightEye.y) / 2,
      };
    }

    const isHeadStable = motion < CONFIG.HEAD_JERK_THRESHOLD;
    const allConditionsMet = hasEyes && eyesInFrame && validSize && isHeadStable;

    // Update debug info
    const avgWidth = eyeData.leftEye && eyeData.rightEye 
      ? ((eyeData.leftEye.width + eyeData.rightEye.width) / 2 * 100).toFixed(1) 
      : '0';
    setDebugInfo(`Глаза: ${hasEyes ? '✓' : '✗'} В рамке: ${eyesInFrame ? '✓' : '✗'} Размер: ${avgWidth}% Движ: ${(motion * 100).toFixed(1)}`);

    // Update detection status for visual feedback
    if (allConditionsMet) {
      setDetectionStatus('valid');
    } else if (hasEyes) {
      setDetectionStatus('partial');
    } else {
      setDetectionStatus('none');
    }

    // State-specific logic
    if (currentState === 'idle') {
      if (allConditionsMet) {
        stableFramesRef.current++;
        if (stableFramesRef.current >= CONFIG.STABLE_FRAMES_REQUIRED) {
          if (!canRecord) {
            setCanRecord(true);
            setStatusText('Готово к записи');
          }
        } else {
          setStatusText(`Стабилизация... ${Math.round((stableFramesRef.current / CONFIG.STABLE_FRAMES_REQUIRED) * 100)}%`);
        }
      } else {
        stableFramesRef.current = 0;
        setCanRecord(false);
        
        if (!hasEyes) {
          setStatusText('Глаза не обнаружены');
        } else if (!eyesInFrame) {
          setStatusText('Расположите глаза в белой рамке');
        } else if (!validSize) {
          const avgW = eyeData.leftEye && eyeData.rightEye 
            ? (eyeData.leftEye.width + eyeData.rightEye.width) / 2 : 0;
          if (avgW < CONFIG.MIN_EYE_WIDTH) {
            setStatusText('Приблизьтесь к камере');
          } else {
            setStatusText('Отодвиньтесь от камеры');
          }
        } else if (!isHeadStable) {
          setStatusText('Держите голову неподвижно');
        }
      }
    } else if (currentState === 'countdown') {
      if (!allConditionsMet) {
        if (!hasEyes || !eyesInFrame) {
          abortCountdown('Глаза вышли из рамки');
        } else if (!isHeadStable) {
          abortCountdown('Слишком резкое движение');
        } else {
          abortCountdown('Условия не соблюдены');
        }
      }
    } else if (currentState === 'recording') {
      if (!allConditionsMet) {
        if (!hasEyes || !eyesInFrame) {
          abortRecording('Глаза вышли из рамки — запись прервана');
        } else if (!isHeadStable) {
          abortRecording('Резкое движение — запись прервана');
        } else {
          abortRecording('Условия нарушены — запись прервана');
        }
      }
    }
  }, [calculateEyeData, canRecord]);

  // Store callback ref to avoid stale closures
  const onFaceMeshResultsRef = useRef(onFaceMeshResults);
  useEffect(() => {
    onFaceMeshResultsRef.current = onFaceMeshResults;
  }, [onFaceMeshResults]);

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

        // Initialize FaceMesh
        const faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true, // For iris tracking
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results) => {
          onFaceMeshResultsRef.current(results);
        });

        faceMeshRef.current = faceMesh;

        // Start MediaPipe camera
        if (videoRef.current) {
          const mpCamera = new MediaPipeCamera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && faceMeshRef.current) {
                await faceMeshRef.current.send({ image: videoRef.current });
              }
            },
            width: 1280,
            height: 720,
          });
          mpCamera.start();
          mediaPipeCameraRef.current = mpCamera;
        }

        setStatusText('Расположите глаза в рамке');
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
      if (mediaPipeCameraRef.current) {
        mediaPipeCameraRef.current.stop();
      }
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

  // Get frame border color based on detection status
  const getFrameBorderClass = () => {
    if (state === 'recording') return 'ring-4 ring-red-600';
    if (state === 'countdown') return 'ring-2 ring-yellow-500';
    if (detectionStatus === 'valid' && canRecord) return 'ring-2 ring-green-500';
    if (detectionStatus === 'partial') return 'ring-2 ring-orange-500';
    return 'ring-2 ring-red-500/50';
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
            REC • ИДЁТ ЗАПИСЬ
          </span>
        </div>
      )}

      {/* Debug info */}
      {state !== 'preview' && (
        <div className="absolute top-6 right-6 text-white/30 text-xs font-mono z-50 text-right">
          {debugInfo}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 w-full max-w-2xl">
        
        {/* Instruction text */}
        <p className="text-white/60 text-sm md:text-base text-center mb-8 tracking-wide">
          {state === 'preview' ? 'Предпросмотр записи' : 'РАСПОЛОЖИТЕ ГЛАЗА СТРОГО В РАМКЕ'}
        </p>

        {/* Detection status indicator */}
        {state !== 'preview' && (
          <div className={`mb-4 px-4 py-2 rounded text-xs font-bold uppercase tracking-wider ${
            detectionStatus === 'valid' && canRecord
              ? 'bg-green-500/20 text-green-400'
              : detectionStatus === 'partial'
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-red-500/20 text-red-400'
          }`}>
            {detectionStatus === 'valid' && canRecord
              ? '✓ Условия выполнены'
              : detectionStatus === 'partial'
                ? '⚠ Частичное обнаружение'
                : '✗ Глаза не в позиции'}
          </div>
        )}

        {/* Video frame with eye guides */}
        <div className="relative mb-8">
          {/* Frame container with dynamic border */}
          <div 
            className={`relative overflow-hidden transition-all duration-200 ${getFrameBorderClass()}`}
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
                <div className={`absolute top-1/2 -translate-y-1/2 left-[15%] w-[30%] h-[60%] border-2 border-dashed rounded-full transition-colors ${
                  detectionStatus === 'valid' ? 'border-green-500/50' : 'border-white/30'
                }`} />
                <div className={`absolute top-1/2 -translate-y-1/2 right-[15%] w-[30%] h-[60%] border-2 border-dashed rounded-full transition-colors ${
                  detectionStatus === 'valid' ? 'border-green-500/50' : 'border-white/30'
                }`} />
                
                {/* Corner markers */}
                <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-white/40" />
                <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-white/40" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-white/40" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-white/40" />
              </div>
            )}

            {/* Debug overlay canvas */}
            <canvas 
              ref={overlayCanvasRef}
              width={CONFIG.FRAME_WIDTH}
              height={CONFIG.FRAME_HEIGHT}
              className="absolute inset-0 pointer-events-none"
            />
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
          state === 'recording' ? 'text-red-500 font-bold' : 
          detectionStatus === 'valid' && canRecord ? 'text-green-500' : 
          detectionStatus === 'partial' ? 'text-orange-400' : 'text-white/50'
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
