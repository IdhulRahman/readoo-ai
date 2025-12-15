import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

const MODEL_PATH = '/assets/models/sample.vrm';

const SHIFT_X = -0.22;
const CAMERA_Y_OFFSET = -0.07;
const LOOK_AT_OFFSET = -0.07;
const ZOOM_LEVEL = 1.3;

const ANIMATION_MAP = {
    idle: '/assets/animations/idle_loop.vrma'
};

let scene, camera, renderer, clock;
let currentVrm = null;
let mixer = null;
let lookAtTarget = new THREE.Object3D();
let currentAction = null;
const loadedClips = {};

let audioContext, analyser, dataArray;
let lipOpen = 0;
const LIP_SENSITIVITY = 3.0;
let blinkTimer = 0;
let nextBlinkTime = 3;
let isBlinking = false;

init();

function init() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    scene = new THREE.Scene();

    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 20);
    camera.position.set(0, 1.4, 1.5);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();
    scene.add(lookAtTarget);

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);

    loadAvatar();
    animate();
}

async function loadAvatar() {
    updateUiStatus("Memuat...");
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    try {
        const gltf = await loader.loadAsync(MODEL_PATH);
        const vrm = gltf.userData.vrm;

        vrm.scene.rotation.y = 0;

        currentVrm = vrm;
        scene.add(vrm.scene);

        mixer = new THREE.AnimationMixer(currentVrm.scene);

        const humanoid = vrm.humanoid;
        const rArm = humanoid.getNormalizedBoneNode('rightUpperArm');
        const lArm = humanoid.getNormalizedBoneNode('leftUpperArm');
        if (rArm) rArm.rotation.z = -Math.PI / 3;
        if (lArm) lArm.rotation.z = Math.PI / 3;

        const head = humanoid.getNormalizedBoneNode('head');
        if (head) {
            const pos = new THREE.Vector3();
            head.getWorldPosition(pos);

            camera.position.x = SHIFT_X;
            camera.position.y = pos.y + CAMERA_Y_OFFSET;
            camera.position.z = ZOOM_LEVEL;

            const lookAtY = pos.y + LOOK_AT_OFFSET;
            camera.lookAt(SHIFT_X, lookAtY, 0);
            lookAtTarget.position.set(SHIFT_X, lookAtY, 1.0);
        }

        if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

        await loadAllVrmaAnimations();

    } catch {
        updateUiStatus("Error");
    }
}

async function loadAllVrmaAnimations() {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMAnimationLoaderPlugin(parser));

    try {
        const gltf = await loader.loadAsync(ANIMATION_MAP.idle);
        const clip = createVRMAnimationClip(
            gltf.userData.vrmAnimations[0],
            currentVrm
        );
        loadedClips.idle = clip;
        playAnimation('idle');
        updateUiStatus("Siap");
    } catch {}
}

function playAnimation(name) {
    if (!mixer || !loadedClips.idle) return;

    const newClip = loadedClips.idle;
    const newAction = mixer.clipAction(newClip);

    newAction.setEffectiveWeight(1.0);
    newAction.setLoop(THREE.LoopRepeat);

    if (currentAction === newAction && newAction.isRunning()) return;

    if (currentAction) {
        currentAction.crossFadeTo(newAction, 0.5, true);
        newAction.reset().play();
    } else {
        newAction.play();
    }

    currentAction = newAction;
}

function setupLipSync() {
    const audioEl = document.getElementById('tts-audio');
    if (!audioEl) return;

    if (!audioContext && !audioEl.paused) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        try {
            const source = audioContext.createMediaElementSource(audioEl);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        } catch {}
    }

    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function animate() {
    requestAnimationFrame(animate);

    const container = document.getElementById('view-3d');
    if (container && container.classList.contains('hidden')) return;

    const dt = clock.getDelta();

    if (currentVrm) {
        if (mixer) mixer.update(dt);

        setupLipSync();
        const audioEl = document.getElementById('tts-audio');

        if (audioEl && !audioEl.paused && analyser && dataArray) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 5; i < 20; i++) sum += dataArray[i];
            const vol = sum / 15;
            const targetLip = Math.min(1.0, (vol / 255) * LIP_SENSITIVITY);
            lipOpen += (targetLip - lipOpen) * 0.4;
            currentVrm.expressionManager.setValue('aa', lipOpen);
        } else {
            lipOpen += (0 - lipOpen) * 0.1;
            currentVrm.expressionManager.setValue('aa', lipOpen);
        }

        blinkTimer += dt;
        if (blinkTimer >= nextBlinkTime) {
            isBlinking = true;
            blinkTimer = 0;
            nextBlinkTime = 2 + Math.random() * 4;
        }

        if (isBlinking) {
            const blinkSpeed = 12.0;
            const blinkValue = Math.sin(blinkTimer * blinkSpeed);
            if (blinkTimer * blinkSpeed >= Math.PI) {
                currentVrm.expressionManager.setValue('blink', 0);
                isBlinking = false;
                blinkTimer = 0;
            } else {
                currentVrm.expressionManager.setValue('blink', Math.max(0, blinkValue));
            }
        }

        currentVrm.update(dt);
    }

    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    if (!lookAtTarget) return;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    lookAtTarget.position.x = SHIFT_X + (x * 0.5);
    lookAtTarget.position.y = camera.position.y + (y * 0.2);
}

function updateUiStatus(txt) {
    const el = document.getElementById('avatar-status');
    if (el) el.innerText = txt;
}

window.avatarApp = {
    playAnimation
};