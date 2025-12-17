import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { Camera as MediaPipeCamera } from '@mediapipe/camera_utils';

type RecordingState = 'idle' | 'countdown' | 'recording' | 'paused' | 'preview';

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
  HEAD_JERK_THRESHOLD: 0.03,
  MIN_EYE_WIDTH: 0.08,
  MAX_EYE_WIDTH: 0.35,
  FRAME_MARGIN: 0.05,
  // Gaze thresholds
  GAZE_THRESHOLD_X: 0.15, // 15% of eye width
  GAZE_THRESHOLD_Y: 0.15, // 15% of eye height
  GAZE_WINDOW_SIZE: 5, // sliding window frames
  GAZE_MIN_VALID: 4, // minimum valid frames in window
};

// FaceMesh landmark indices
const LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 157, 173, 246, 161, 163];
const RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 384, 398, 466, 388, 390];
// Iris landmarks (refineLandmarks must be true)
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
// Eye corners for gaze calculation
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
// Eye top/bottom for vertical gaze
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

interface EyeData {
  leftEye: { x: number; y: number; width: number; height: number } | null;
  rightEye: { x: number; y: number; width: number; height: number } | null;
  leftIris: { x: number; y: number } | null;
  rightIris: { x: number; y: number } | null;
  bothInFrame: boolean;
  hasValidSize: boolean;
}

interface GazeResult {
  leftGazeX: number; // -1 to 1, 0 is center
  leftGazeY: number;
  rightGazeX: number;
  rightGazeY: number;
  isValid: boolean;
}

type FrameStatus = 'valid' | 'invalid';

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
  
  // Gaze sliding window
  const gazeWindowRef = useRef<FrameStatus[]>([]);
  const frameColorRef = useRef({ r: 255, g: 255, b: 255 }); // Current interpolated color

  const [state, setState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(CONFIG.PRE_RECORD_SECONDS);
  const [recordTime, setRecordTime] = useState(CONFIG.RECORD_SECONDS);
  const [canRecord, setCanRecord] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [deleteUrl, setDeleteUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(1.5);
  const [supportsHardwareZoom, setSupportsHardwareZoom] = useState(false);
  const [frameColor, setFrameColor] = useState<'neutral' | 'valid' | 'invalid'>('neutral');
  const [gazeValid, setGazeValid] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef(state);
  const recordingStartTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Calculate gaze deviation
  const calculateGaze = useCallback((landmarks: Results['multiFaceLandmarks'][0]): GazeResult => {
    if (!landmarks || landmarks.length < 478) {
      return { leftGazeX: 0, leftGazeY: 0, rightGazeX: 0, rightGazeY: 0, isValid: false };
    }

    // Left eye gaze
    const leftIris = landmarks[LEFT_IRIS_CENTER];
    const leftInner = landmarks[LEFT_EYE_INNER];
    const leftOuter = landmarks[LEFT_EYE_OUTER];
    const leftTop = landmarks[LEFT_EYE_TOP];
    const leftBottom = landmarks[LEFT_EYE_BOTTOM];
    
    const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x);
    const leftEyeHeight = Math.abs(leftTop.y - leftBottom.y);
    const leftCenterX = (leftInner.x + leftOuter.x) / 2;
    const leftCenterY = (leftTop.y + leftBottom.y) / 2;
    
    const leftGazeX = (leftIris.x - leftCenterX) / leftEyeWidth;
    const leftGazeY = (leftIris.y - leftCenterY) / leftEyeHeight;

    // Right eye gaze
    const rightIris = landmarks[RIGHT_IRIS_CENTER];
    const rightInner = landmarks[RIGHT_EYE_INNER];
    const rightOuter = landmarks[RIGHT_EYE_OUTER];
    const rightTop = landmarks[RIGHT_EYE_TOP];
    const rightBottom = landmarks[RIGHT_EYE_BOTTOM];
    
    const rightEyeWidth = Math.abs(rightOuter.x - rightInner.x);
    const rightEyeHeight = Math.abs(rightTop.y - rightBottom.y);
    const rightCenterX = (rightInner.x + rightOuter.x) / 2;
    const rightCenterY = (rightTop.y + rightBottom.y) / 2;
    
    const rightGazeX = (rightIris.x - rightCenterX) / rightEyeWidth;
    const rightGazeY = (rightIris.y - rightCenterY) / rightEyeHeight;

    // Check if gaze is within threshold
    const leftValid = 
      Math.abs(leftGazeX) <= CONFIG.GAZE_THRESHOLD_X && 
      Math.abs(leftGazeY) <= CONFIG.GAZE_THRESHOLD_Y;
    const rightValid = 
      Math.abs(rightGazeX) <= CONFIG.GAZE_THRESHOLD_X && 
      Math.abs(rightGazeY) <= CONFIG.GAZE_THRESHOLD_Y;

    return {
      leftGazeX,
      leftGazeY,
      rightGazeX,
      rightGazeY,
      isValid: leftValid && rightValid,
    };
  }, []);

  // Update gaze sliding window and determine stability
  const updateGazeWindow = useCallback((isCurrentFrameValid: boolean): boolean => {
    const status: FrameStatus = isCurrentFrameValid ? 'valid' : 'invalid';
    gazeWindowRef.current.push(status);
    
    // Keep only last N frames
    if (gazeWindowRef.current.length > CONFIG.GAZE_WINDOW_SIZE) {
      gazeWindowRef.current.shift();
    }
    
    // Count valid frames
    const validCount = gazeWindowRef.current.filter(s => s === 'valid').length;
    return validCount >= CONFIG.GAZE_MIN_VALID;
  }, []);

  // Calculate eye data from FaceMesh landmarks
  const calculateEyeData = useCallback((landmarks: Results['multiFaceLandmarks'][0]): EyeData => {
    if (!landmarks || landmarks.length < 478) {
      return { leftEye: null, rightEye: null, leftIris: null, rightIris: null, bothInFrame: false, hasValidSize: false };
    }

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
        height: Math.max(...ys) - Math.min(...ys),
      };
    };

    const leftBounds = getEyeBounds(LEFT_EYE_INDICES);
    const rightBounds = getEyeBounds(RIGHT_EYE_INDICES);

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

    const avgEyeWidth = (leftBounds.width + rightBounds.width) / 2;
    const hasValidSize = avgEyeWidth >= CONFIG.MIN_EYE_WIDTH && avgEyeWidth <= CONFIG.MAX_EYE_WIDTH;

    return {
      leftEye: { x: leftBounds.centerX, y: leftBounds.centerY, width: leftBounds.width, height: leftBounds.height },
      rightEye: { x: rightBounds.centerX, y: rightBounds.centerY, width: rightBounds.width, height: rightBounds.height },
      leftIris: landmarks[LEFT_IRIS_CENTER] ? { x: landmarks[LEFT_IRIS_CENTER].x, y: landmarks[LEFT_IRIS_CENTER].y } : null,
      rightIris: landmarks[RIGHT_IRIS_CENTER] ? { x: landmarks[RIGHT_IRIS_CENTER].x, y: landmarks[RIGHT_IRIS_CENTER].y } : null,
      bothInFrame: leftInFrame && rightInFrame,
      hasValidSize,
    };
  }, []);

  // Process FaceMesh results
  const onFaceMeshResults = useCallback((results: Results) => {
    const currentState = stateRef.current;
    
    if (overlayCanvasRef.current && currentState !== 'preview') {
      const ctx = overlayCanvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, CONFIG.FRAME_WIDTH, CONFIG.FRAME_HEIGHT);
    }

    // No face detected
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setFrameColor('invalid');
      setGazeValid(false);
      stableFramesRef.current = 0;
      previousEyeCenterRef.current = null;
      gazeWindowRef.current = [];
      
      if (currentState === 'idle') {
        setCanRecord(false);
      } else if (currentState === 'countdown') {
        abortCountdown();
      } else if (currentState === 'recording') {
        pauseRecording();
      }
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const eyeData = calculateEyeData(landmarks);
    const gazeResult = calculateGaze(landmarks);

    const hasEyes = eyeData.leftEye !== null && eyeData.rightEye !== null;
    const eyesInFrame = eyeData.bothInFrame;
    const validSize = eyeData.hasValidSize;

    // Calculate motion
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

    if (eyeData.leftEye && eyeData.rightEye) {
      previousEyeCenterRef.current = {
        x: (eyeData.leftEye.x + eyeData.rightEye.x) / 2,
        y: (eyeData.leftEye.y + eyeData.rightEye.y) / 2,
      };
    }

    const isHeadStable = motion < CONFIG.HEAD_JERK_THRESHOLD;
    const baseConditionsMet = hasEyes && eyesInFrame && validSize && isHeadStable;
    
    // Update gaze window and get temporal stability
    const gazeTemporallyValid = updateGazeWindow(gazeResult.isValid && baseConditionsMet);
    setGazeValid(gazeTemporallyValid);

    // Update frame color based on conditions
    if (baseConditionsMet && gazeTemporallyValid) {
      setFrameColor('valid');
    } else if (hasEyes) {
      setFrameColor('invalid');
    } else {
      setFrameColor('invalid');
    }

    // State-specific logic
    if (currentState === 'idle') {
      if (baseConditionsMet && gazeTemporallyValid) {
        stableFramesRef.current++;
        if (stableFramesRef.current >= CONFIG.STABLE_FRAMES_REQUIRED) {
          if (!canRecord) {
            setCanRecord(true);
          }
        }
      } else {
        stableFramesRef.current = 0;
        setCanRecord(false);
      }
    } else if (currentState === 'countdown') {
      if (!baseConditionsMet || !gazeTemporallyValid) {
        abortCountdown();
      }
    } else if (currentState === 'recording') {
      if (!baseConditionsMet || !gazeTemporallyValid) {
        pauseRecording();
      }
    } else if (currentState === 'paused') {
      if (baseConditionsMet && gazeTemporallyValid) {
        resumeRecording();
      }
    }
  }, [calculateEyeData, calculateGaze, updateGazeWindow, canRecord]);

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

        const faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results) => {
          onFaceMeshResultsRef.current(results);
        });

        faceMeshRef.current = faceMesh;

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
      } catch (err) {
        console.error('Camera error:', err);
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
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (supportsHardwareZoom && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      // @ts-expect-error - zoom is valid but not in TS types
      track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
    }
  }, [zoom, supportsHardwareZoom]);

  const abortCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setState('idle');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    stableFramesRef.current = 0;
    setCanRecord(false);
  };

  const pauseRecording = () => {
    if (stateRef.current !== 'recording') return;
    setState('paused');
    pausedDurationRef.current = Date.now();
  };

  const resumeRecording = () => {
    if (stateRef.current !== 'paused') return;
    setState('recording');
  };

  const abortRecording = () => {
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
    stableFramesRef.current = 0;
    setCanRecord(false);
  };

  const startCountdown = useCallback(() => {
    if (state !== 'idle' || !canRecord) return;
    setState('countdown');
    setCountdown(CONFIG.PRE_RECORD_SECONDS);

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
    chunksRef.current = [];
    abortedRef.current = false;
    recordingStartTimeRef.current = Date.now();

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

        if (previewRef.current) {
          previewRef.current.src = URL.createObjectURL(blob);
          previewRef.current.play().catch(() => {});
        }
      }
    };

    recorder.start(100);

    let count = CONFIG.RECORD_SECONDS;
    recordIntervalRef.current = setInterval(() => {
      // Only decrement when actively recording
      if (stateRef.current === 'recording') {
        count--;
        setRecordTime(count);
        if (count <= 0) {
          if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
          recordIntervalRef.current = null;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }
    }, 1000);
  }, [zoom, supportsHardwareZoom]);

  const resetRecording = () => {
    setState('idle');
    setRecordedBlob(null);
    setDeleteUrl(null);
    setCanRecord(false);
    setRecordTime(CONFIG.RECORD_SECONDS);
    setCountdown(CONFIG.PRE_RECORD_SECONDS);
    stableFramesRef.current = 0;
    gazeWindowRef.current = [];
    if (previewRef.current) {
      previewRef.current.src = '';
    }
  };

  const saveForever = async () => {
    if (!recordedBlob) return;

    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append('video', recordedBlob, 'eye-recording.webm');

      const { data, error } = await supabase.functions.invoke('save-eyes', {
        body: formData
      });

      if (error) throw error;

      if (data?.success) {
        setDeleteUrl(data.deleteUrl);
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Save error:', err);
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

  // Get frame border style with smooth color transition
  const getFrameStyle = () => {
    const baseStyle = {
      width: CONFIG.FRAME_WIDTH,
      height: CONFIG.FRAME_HEIGHT,
      borderRadius: 12,
      transition: 'box-shadow 250ms ease-out',
    };

    if (state === 'preview') {
      return { ...baseStyle, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.3)' };
    }

    if (frameColor === 'valid') {
      return { ...baseStyle, boxShadow: 'inset 0 0 0 3px rgba(34, 197, 94, 0.6)' }; // green
    } else if (frameColor === 'invalid') {
      return { ...baseStyle, boxShadow: 'inset 0 0 0 3px rgba(239, 68, 68, 0.6)' }; // red
    }
    
    return { ...baseStyle, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.4)' }; // neutral white
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center relative font-mono">
      <Link to="/" className="absolute top-6 left-6 text-white/40 hover:text-white transition-colors z-50">
        <ArrowLeft size={24} />
      </Link>

      {/* Recording indicator - just the red dot, no text */}
      {(state === 'recording' || state === 'paused') && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
          <div className={`w-4 h-4 rounded-full ${
            state === 'recording' ? 'bg-red-600 animate-pulse' : 'bg-yellow-500'
          }`} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 w-full max-w-2xl">
        
        {/* Video frame with dynamic border color */}
        <div className="relative mb-8">
          <div 
            className="relative overflow-hidden"
            style={getFrameStyle()}
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

            {/* Minimal eye position guides - no text */}
            {state !== 'preview' && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Center crosshair */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
                
                {/* Eye oval guides with color transition */}
                <div 
                  className="absolute top-1/2 -translate-y-1/2 left-[15%] w-[30%] h-[60%] border border-dashed rounded-full transition-colors duration-250"
                  style={{ 
                    borderColor: frameColor === 'valid' 
                      ? 'rgba(34, 197, 94, 0.4)' 
                      : frameColor === 'invalid' 
                        ? 'rgba(239, 68, 68, 0.3)' 
                        : 'rgba(255,255,255,0.2)' 
                  }}
                />
                <div 
                  className="absolute top-1/2 -translate-y-1/2 right-[15%] w-[30%] h-[60%] border border-dashed rounded-full transition-colors duration-250"
                  style={{ 
                    borderColor: frameColor === 'valid' 
                      ? 'rgba(34, 197, 94, 0.4)' 
                      : frameColor === 'invalid' 
                        ? 'rgba(239, 68, 68, 0.3)' 
                        : 'rgba(255,255,255,0.2)' 
                  }}
                />
                
                {/* Corner markers */}
                <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-white/30" />
                <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-white/30" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-white/30" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-white/30" />
              </div>
            )}

            <canvas 
              ref={overlayCanvasRef}
              width={CONFIG.FRAME_WIDTH}
              height={CONFIG.FRAME_HEIGHT}
              className="absolute inset-0 pointer-events-none"
            />
          </div>
        </div>

        {/* Timer display - numbers only, no text */}
        {(state === 'countdown' || state === 'recording' || state === 'paused') && (
          <div className={`text-8xl md:text-9xl font-bold mb-8 tabular-nums transition-colors duration-200 ${
            state === 'recording' ? 'text-red-600' : 
            state === 'paused' ? 'text-yellow-500' : 'text-white'
          }`}>
            {state === 'countdown' ? countdown : recordTime}
          </div>
        )}

        {/* Zoom controls - no text labels */}
        {state === 'idle' && !supportsHardwareZoom && (
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => adjustZoom(-CONFIG.ZOOM_STEP)}
              className="w-10 h-10 border border-white/20 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Minus size={16} />
            </button>
            <span className="text-white/40 text-sm w-16 text-center font-mono tabular-nums">
              {zoom.toFixed(1)}×
            </span>
            <button
              onClick={() => adjustZoom(CONFIG.ZOOM_STEP)}
              className="w-10 h-10 border border-white/20 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        )}

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
            ●
          </button>
        )}

        {state === 'preview' && !deleteUrl && (
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button
              onClick={saveForever}
              disabled={isSaving}
              className="w-full px-8 py-4 bg-white text-black text-sm font-bold uppercase tracking-widest hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              ✓
            </button>
            <button
              onClick={resetRecording}
              disabled={isSaving}
              className="w-full px-8 py-3 border border-white/30 text-white/60 text-sm uppercase tracking-widest hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              ↺
            </button>
            <button
              onClick={downloadVideo}
              className="w-full px-8 py-3 border border-white/20 text-white/40 text-xs uppercase tracking-widest hover:bg-white/5 transition-colors"
            >
              ↓
            </button>
          </div>
        )}

        {deleteUrl && (
          <div className="text-center max-w-sm">
            <div className="text-green-500 mb-4 text-2xl">✓</div>
            <code className="block bg-white/5 p-3 text-xs break-all text-white/60 mb-6">
              {deleteUrl}
            </code>
            <Link 
              to="/canvas" 
              className="inline-block px-8 py-3 bg-white text-black text-sm font-bold uppercase tracking-widest hover:bg-white/90 transition-colors"
            >
              →
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
