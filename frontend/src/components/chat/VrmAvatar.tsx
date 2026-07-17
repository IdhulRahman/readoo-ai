import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

interface VrmAvatarProps {
  animation?: 'idle' | 'wave' | 'thinking';
  status?: string;
  onStatusChange?: (status: string) => void;
  assistantName?: string; // NEW: nama asisten dinamis, fallback 'Aiko'
  // NEW: gender avatar 3D ('female' | 'male'), menentukan file VRM mana yang
  // dimuat. Fallback 'female' supaya konsisten sama default di backend
  // (avatar_gender) dan gak mengubah perilaku lama kalau setting belum diisi.
  avatarGender?: 'female' | 'male';
}

// NEW: path model VRM per gender. Placeholder 'samplemale.vrm' isinya sementara
// sama dengan avatar perempuan sampai model VRM laki-laki asli tersedia --
// begitu file itu diganti, tidak ada kode lain yang perlu disentuh.
const MODEL_PATHS: Record<'female' | 'male', string> = {
  female: '/assets/models/sample.vrm',
  male: '/assets/models/samplemale.vrm',
};

// NEW: Global cache DIPISAH per gender (bukan 1 slot tunggal lagi), supaya:
// - Balik ke gender yang sudah pernah dimuat tetap instan (dapat manfaat cache)
// - Tapi gender yang berbeda tidak "ketiban" cache milik gender lain
let cachedVrmMap: Partial<Record<'female' | 'male', VRM>> = {};
let cachedClipsMap: Partial<Record<'female' | 'male', Record<string, THREE.AnimationClip>>> = {};

export const clearVrmCache = () => {
  Object.values(cachedVrmMap).forEach((vrm) => {
    if (!vrm) return;
    vrm.scene.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: any) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  });
  cachedVrmMap = {};
  cachedClipsMap = {};
};

export const VrmAvatar: React.FC<VrmAvatarProps> = ({
  animation = 'idle',
  onStatusChange,
  assistantName = 'Aiko', // NEW
  avatarGender = 'female', // NEW
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [localStatus, setLocalStatus] = useState('Menginisialisasi...');

  const updateStatus = (status: string) => {
    setLocalStatus(status);
    if (onStatusChange) {
      onStatusChange(status);
    }
  };

  // State refs for animation loop to avoid dependency re-triggering
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const loadedClipsRef = useRef<Record<string, THREE.AnimationClip>>({});
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const lookAtTargetRef = useRef<THREE.Object3D | null>(null);
  const lipOpenRef = useRef<number>(0);
  const blinkTimerRef = useRef<number>(0);
  const nextBlinkTimeRef = useRef<number>(3);
  const isBlinkingRef = useRef<boolean>(false);
  const modelXRef = useRef<number>(0.0);

  // Constants
  const SHIFT_X = 0.0;
  const CAMERA_Y_OFFSET = -0.07;
  const LOOK_AT_OFFSET = -0.07;
  const ZOOM_LEVEL = 1.3;
  const LIP_SENSITIVITY = 3.0;

  // NEW: MODEL_PATH sekarang ditentukan dari prop avatarGender, bukan hardcode.
  // Sesuai keputusan: cukup ikut nilai avatarGender saat komponen ini pertama
  // kali mount (mis. reload halaman) -- tidak perlu auto-update real-time
  // kalau setting diubah di tab Admin lain selagi halaman ini masih terbuka.
  const MODEL_PATH = MODEL_PATHS[avatarGender] || MODEL_PATHS.female;

  const ANIMATION_MAP = {
    idle: '/assets/animations/idle_loop.vrma',
    wave: '/assets/animations/idle_loop.vrma', // Fallback to idle if other clips fail
    thinking: '/assets/animations/idle_loop.vrma',
  };

  // Handle playing a new animation
  useEffect(() => {
    const mixer = mixerRef.current;
    const loadedClips = loadedClipsRef.current;
    if (!mixer || !loadedClips.idle) return;

    const newClip = loadedClips[animation] || loadedClips.idle;
    const newAction = mixer.clipAction(newClip);

    newAction.setEffectiveWeight(1.0);
    newAction.setLoop(THREE.LoopRepeat, Infinity);

    if (currentActionRef.current === newAction && newAction.isRunning()) return;

    if (currentActionRef.current) {
      currentActionRef.current.crossFadeTo(newAction, 0.5, true);
      newAction.reset().play();
    } else {
      newAction.play();
    }

    currentActionRef.current = newAction;
  }, [animation]);

  useEffect(() => {
    let isCurrent = true;

    const container = containerRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new THREE.Scene();

    // Lights
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 20);
    camera.position.set(0, 1.4, 1.5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    let lastTime = performance.now();
    const lookAtTarget = new THREE.Object3D();
    scene.add(lookAtTarget);
    lookAtTargetRef.current = lookAtTarget;

    // 2. Load VRM model
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    let animationFrameId: number;

    const loadVrmaAnimation = async (url: string, name: string, vrm: VRM) => {
      try {
        const gltf = await loader.loadAsync(url);
        if (!isCurrent) return null;
        const vrmAnimations = gltf.userData.vrmAnimations;
        if (vrmAnimations && vrmAnimations[0]) {
          const clip = createVRMAnimationClip(vrmAnimations[0], vrm);
          loadedClipsRef.current[name] = clip;
          return clip;
        }
      } catch (e) {
        console.warn(`Failed to load animation: ${name} from ${url}`);
      }
      return null;
    };

    const loadModel = async () => {
      // NEW: cache dicek per-gender (avatarGender), bukan 1 slot global lagi
      const cachedVrm = cachedVrmMap[avatarGender];
      const cachedClips = cachedClipsMap[avatarGender];

      // 1. If cached, load model and animation instantly from memory
      if (cachedVrm && cachedClips && cachedClips.idle) {
        vrmRef.current = cachedVrm;
        scene.add(cachedVrm.scene);

        const humanoid = cachedVrm.humanoid;
        if (humanoid) {
          const rArm = humanoid.getNormalizedBoneNode('rightUpperArm');
          const lArm = humanoid.getNormalizedBoneNode('leftUpperArm');
          if (rArm) rArm.rotation.z = -Math.PI / 3;
          if (lArm) lArm.rotation.z = Math.PI / 3;

          const head = humanoid.getNormalizedBoneNode('head');
          if (head) {
            const pos = new THREE.Vector3();
            head.getWorldPosition(pos);

            const modelX = pos.x;
            modelXRef.current = modelX;

            camera.position.x = modelX;
            camera.position.y = pos.y + CAMERA_Y_OFFSET;
            camera.position.z = ZOOM_LEVEL;

            const lookAtY = pos.y + LOOK_AT_OFFSET;
            camera.lookAt(modelX, lookAtY, 0);
            lookAtTarget.position.set(modelX, lookAtY, 1.0);
          }
        }

        if (cachedVrm.lookAt) {
          cachedVrm.lookAt.target = lookAtTarget;
        }

        const mixer = new THREE.AnimationMixer(cachedVrm.scene);
        mixerRef.current = mixer;

        loadedClipsRef.current = cachedClips;

        const action = mixer.clipAction(cachedClips.idle);
        action.setEffectiveWeight(1.0);
        action.play();
        currentActionRef.current = action;

        updateStatus('Siap');
        return;
      }

      // 2. If not cached, load from network/filesystem
      updateStatus(`Memuat ${assistantName}...`);
      try {
        const gltf = await loader.loadAsync(MODEL_PATH);
        if (!isCurrent) {
          gltf.scene.traverse((obj: any) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m: any) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          });
          return;
        }
        const vrm: VRM = gltf.userData.vrm;
        vrmRef.current = vrm;
        scene.add(vrm.scene);

        // Adjust arm poses
        const humanoid = vrm.humanoid;
        if (humanoid) {
          const rArm = humanoid.getNormalizedBoneNode('rightUpperArm');
          const lArm = humanoid.getNormalizedBoneNode('leftUpperArm');
          if (rArm) rArm.rotation.z = -Math.PI / 3;
          if (lArm) lArm.rotation.z = Math.PI / 3;

          const head = humanoid.getNormalizedBoneNode('head');
          if (head) {
            const pos = new THREE.Vector3();
            head.getWorldPosition(pos);

            const modelX = pos.x - 0.2;
            modelXRef.current = modelX;

            camera.position.x = modelX;
            camera.position.y = pos.y + CAMERA_Y_OFFSET;
            camera.position.z = ZOOM_LEVEL;

            const lookAtY = pos.y + LOOK_AT_OFFSET;
            camera.lookAt(modelX, lookAtY, 0);
            lookAtTarget.position.set(modelX, lookAtY, 1.0);
          }
        }

        if (vrm.lookAt) {
          vrm.lookAt.target = lookAtTarget;
        }

        // Initialize animation mixer
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;

        // Load animations
        updateStatus('Memuat Gerakan...');
        const idleClip = await loadVrmaAnimation(ANIMATION_MAP.idle, 'idle', vrm);
        if (!isCurrent) return;

        if (idleClip) {
          loadedClipsRef.current.idle = idleClip;
          loadedClipsRef.current.wave = idleClip;
          loadedClipsRef.current.thinking = idleClip;

          const action = mixer.clipAction(idleClip);
          action.setEffectiveWeight(1.0);
          action.play();
          currentActionRef.current = action;

          // NEW: populate cache di slot sesuai gender yang lagi aktif
          cachedVrmMap[avatarGender] = vrm;
          cachedClipsMap[avatarGender] = {
            idle: idleClip,
            wave: idleClip,
            thinking: idleClip,
          };
        }

        updateStatus('Siap');
      } catch (err) {
        if (!isCurrent) return;
        console.error('Failed to load VRM avatar', err);
        updateStatus('Error Memuat');
      }
    };

    loadModel();

    // 3. Audio & Lip-sync setup
    const setupLipSync = () => {
      const audioEl = document.getElementById('tts-audio') as HTMLAudioElement;
      if (!audioEl) return;

      if (!audioContextRef.current && !audioEl.paused) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContextClass();
          audioContextRef.current = audioContext;

          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;

          const source = audioContext.createMediaElementSource(audioEl);
          source.connect(analyser);
          analyser.connect(audioContext.destination);
          sourceNodeRef.current = source;

          dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        } catch (e) {
          console.warn('AudioContext node connection failed, likely already connected', e);
        }
      }

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    // 4. Animation loop
    const renderScene = () => {
      if (!isCurrent) return;
      animationFrameId = requestAnimationFrame(renderScene);

      const time = performance.now();
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const vrm = vrmRef.current;
      const mixer = mixerRef.current;

      if (vrm) {
        if (mixer) mixer.update(dt);

        setupLipSync();

        const audioEl = document.getElementById('tts-audio') as HTMLAudioElement;
        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;

        // Lip sync morphing
        if (audioEl && !audioEl.paused && analyser && dataArray) {
          analyser.getByteFrequencyData(dataArray as any);
          let sum = 0;
          for (let i = 5; i < 20; i++) {
            sum += dataArray[i];
          }
          const vol = sum / 15;
          const targetLip = Math.min(1.0, (vol / 255) * LIP_SENSITIVITY);
          lipOpenRef.current += (targetLip - lipOpenRef.current) * 0.4;
          if (vrm.expressionManager) {
            vrm.expressionManager.setValue('ih', 0);
            vrm.expressionManager.setValue('aa', lipOpenRef.current);
          }
        } else {
          lipOpenRef.current += (0 - lipOpenRef.current) * 0.1;
          if (vrm.expressionManager) {
            vrm.expressionManager.setValue('aa', lipOpenRef.current);
          }
        }

        // Automatic Blinking
        blinkTimerRef.current += dt;
        if (blinkTimerRef.current >= nextBlinkTimeRef.current) {
          isBlinkingRef.current = true;
          blinkTimerRef.current = 0;
          nextBlinkTimeRef.current = 2 + Math.random() * 4;
        }

        if (isBlinkingRef.current && vrm.expressionManager) {
          const blinkSpeed = 12.0;
          const blinkValue = Math.sin(blinkTimerRef.current * blinkSpeed);
          if (blinkTimerRef.current * blinkSpeed >= Math.PI) {
            vrm.expressionManager.setValue('blink', 0);
            isBlinkingRef.current = false;
            blinkTimerRef.current = 0;
          } else {
            vrm.expressionManager.setValue('blink', Math.max(0, blinkValue));
          }
        }

        vrm.update(dt);
      }

      renderer.render(scene, camera);
    };

    renderScene();

    // 5. Event listeners
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const lookAtTarget = lookAtTargetRef.current;
      if (!lookAtTarget) return;

      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
      const y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

      lookAtTarget.position.x = modelXRef.current + x * 0.5;
      lookAtTarget.position.y = camera.position.y + y * 0.2;
    };

    window.addEventListener('resize', handleResize);
    container.addEventListener('mousemove', handleMouseMove);

    // Cleanup
    return () => {
      isCurrent = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      // Close audio contexts
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => { });
      }
    };
    // NEW: avatarGender ditambahkan ke dependency array. Efeknya: kalau prop
    // ini berubah nilai (mis. karena fetch /api/settings/public di ChatPage
    // baru selesai setelah avatar sempat mount duluan dengan default 'female'),
    // avatar otomatis reload dengan model yang benar tanpa perlu refresh manual
    // dari user -- sesuai kebutuhan minimal supaya tidak nyangkut ke gender
    // yang salah karena race kondisi fetch async, tanpa perlu observer/listener
    // tambahan untuk perubahan real-time dari tab Admin yang berbeda.
  }, [avatarGender]);

  return (
    <div className="relative w-full h-full min-h-[400px] flex items-center justify-center bg-gradient-to-b from-blue-50/50 to-indigo-100/50 dark:from-gray-800/50 dark:to-gray-900/50 rounded-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
      {/* Three.js Container */}
      <div ref={containerRef} className="w-full h-full absolute inset-0 cursor-pointer" />

      {/* Loading Overlay */}
      {localStatus !== 'Siap' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 transition-all z-10">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{localStatus}</span>
        </div>
      )}

      {/* Tiny Status Indicator */}
      {localStatus === 'Siap' && (
        <div className="absolute top-4 left-4 z-10 px-2 py-1 rounded bg-black/40 text-[10px] text-white backdrop-blur font-medium">
          {assistantName} Live
        </div>
      )}
    </div>
  );
};