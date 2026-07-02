document.addEventListener("DOMContentLoaded", () => {

    let currentAudio = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let isReviewing = false;

    const token = localStorage.getItem("auth_token");

    const statusMessages = {
        "Siap": "Halo! Ada yang bisa saya bantu?",
        "Mendengarkan...": "Saya mendengarkan...",
        "Memproses...": "Sebentar ya...",
        "Thinking": "Hmm, biarkan saya cari...",
        "Mencari...": "Sedang mencari data relevan...",
        "Menjawab...": "Ini dia...",
        "Gagal Mendengar": "Maaf, kurang jelas.",
        "Error Koneksi": "Koneksi terputus.",
        "Izin Mic Ditolak": "Mohon izinkan akses mikrofon."
    };

    const micBtn = document.getElementById("mic-btn");
    const micIcon = micBtn ? micBtn.querySelector('i') : null;

    const bubbleEl = document.getElementById("speech-bubble");
    const bubbleTextEl = document.getElementById("bubble-text");

    const itemCardContainer = document.getElementById('item-recommendations');
    const btnPrev = document.getElementById('prev-item');
    const btnNext = document.getElementById('next-item');

    const speechInputBox = document.querySelector('.speech-input-box');
    const speechInput = document.getElementById('speech-display');

    function updateBubble(text, isSystem = true) {
        const finalText = isSystem ? (statusMessages[text] || text) : text;
        if (bubbleTextEl) bubbleTextEl.innerHTML = finalText;
        if (bubbleEl) {
            bubbleEl.classList.remove('hidden');
            bubbleEl.style.transform = "scale(1.05) translateX(-50%)";
            setTimeout(() => bubbleEl.style.transform = "scale(1) translateX(-50%)", 150);
        }
    }

    function hideBubble() {
        bubbleEl?.classList.add('hidden');
    }

    function triggerAvatarAnimation(name) {
        window.avatarApp?.playAnimation?.(name);
    }

    function reset3DInputUI() {
        isReviewing = false;
        speechInputBox?.classList.remove('show');

        if (speechInput) {
            speechInput.value = "";
            speechInput.placeholder = "Tekan mic untuk bicara...";
            speechInput.readOnly = true;
        }

        micBtn?.classList.remove("recording", "sending");
        if (micIcon) micIcon.className = "fa-solid fa-microphone";
    }

    function hideFloatingCard() {
        itemCardContainer?.classList.add('hidden');
        btnPrev?.classList.add('hidden');
        btnNext?.classList.add('hidden');
    }

    window.scrollCarousel = dir => {
        itemCardContainer?.scrollBy({ left: dir * 240, behavior: 'smooth' });
    };

    async function processTextChat(message) {
        if (!message) return;

        updateBubble("Mencari...");
        triggerAvatarAnimation("thinking");

        try {
            const res = await fetch("/api/chat/avatar", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ message })
            });

            if (res.status === 429) {
                updateBubble("Terlalu banyak permintaan. Batas 10x per menit.");
                triggerAvatarAnimation("idle");
                return;
            }

            const data = await res.json();
            
            if (res.ok) {
                const reply = data.speech_text || "Maaf, data tidak ditemukan.";
                const items = data.items || [];

                updateBubble(reply, false);
                playTTS(reply);
                if (items.length) showFloatingItemList(items);
            } else {
                updateBubble(data.error || "Gagal menghubungi AI.");
                triggerAvatarAnimation("idle");
            }

        } catch (e) {
            console.error(e);
            updateBubble("Error Koneksi");
            triggerAvatarAnimation("idle");
        }
    }

    micBtn?.addEventListener("click", async () => {
        if (isReviewing) {
            const msg = speechInput.value.trim();
            if (msg) processTextChat(msg);
            reset3DInputUI();
            return;
        }

        isRecording ? stopRecording() : startRecording();
    });

    async function startRecording() {
        hideFloatingCard();
        stopTTS();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.start();
            isRecording = true;

            micBtn.classList.add("recording");
            micIcon.className = "fa-solid fa-stop";
            updateBubble("Mendengarkan...");

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                processAudio(new Blob(audioChunks, { type: "audio/webm" }));
            };

        } catch {
            updateBubble("Izin Mic Ditolak");
            reset3DInputUI();
        }
    }

    function stopRecording() {
        if (!mediaRecorder) return;
        mediaRecorder.stop();
        isRecording = false;
        micIcon.className = "fa-solid fa-spinner fa-spin";
        updateBubble("Memproses...");
    }

    async function processAudio(blob) {
        const fd = new FormData();
        fd.append("audio_data", blob);

        try {
            const res = await fetch("/api/transcribe", { 
                method: "POST", 
                headers: { "Authorization": `Bearer ${token}` },
                body: fd 
            });

            if (res.status === 429) {
                updateBubble("Terlalu banyak permintaan. Batas 10x per menit.");
                reset3DInputUI();
                return;
            }

            const data = await res.json();

            if (res.ok) {
                isReviewing = true;
                speechInput.value = data.text;
                speechInput.readOnly = false;
                speechInputBox.classList.add("show");
                micIcon.className = "fa-solid fa-paper-plane";
                updateBubble(`"${data.text}"`, false);
                speechInput.focus();
            } else {
                updateBubble(data.error || "Gagal memproses suara.");
                reset3DInputUI();
            }

        } catch {
            updateBubble("Gagal Mendengar");
            reset3DInputUI();
        }
    }

    async function playTTS(text) {
        stopTTS();
        try {
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ text })
            });
            const data = await res.json();

            let audio = document.getElementById('tts-audio');
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = 'tts-audio';
                audio.style.display = 'none';
                document.body.appendChild(audio);
            }

            audio.src = data.audio_url;
            currentAudio = audio;
            audio.play();

            // Notify Lip-sync analyzer in avatar-core
            if (window.avatarApp?.lipSync) {
                window.avatarApp.lipSync(audio);
            }
        } catch (e) {
            console.error("TTS play error", e);
        }
    }

    function stopTTS() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
    }

    function showFloatingItemList(items) {
        itemCardContainer.innerHTML = '';

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item-card';
            div.style.setProperty("--hue", item.cover_color);

            // Get first two fields dynamically to display
            const keys = Object.keys(item).filter(k => k !== 'id' && k !== 'cover_image' && k !== 'cover_color');
            const primaryVal = item[keys[0]] || 'Data Item';
            const secondaryVal = item[keys[1]] || '';

            div.innerHTML = `
                <div class="item-icon">
                    <i class="fa-solid fa-file-invoice"></i>
                </div>
                <div class="item-info">
                    <h4>${escapeHTML(primaryVal)}</h4>
                    <p>${escapeHTML(secondaryVal)}</p>
                </div>
            `;
            itemCardContainer.appendChild(div);
        });

        itemCardContainer.classList.remove('hidden');
        btnNext.classList.remove('hidden');
        btnPrev.classList.remove('hidden');
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    // Trigger initial avatar wave
    setTimeout(() => {
        triggerAvatarAnimation('wave');
    }, 1500);

});
