document.addEventListener("DOMContentLoaded", () => {

    let currentMode = 'text';
    let currentAudio = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let isReviewing = false;

    const statusMessages = {
        "Siap": "Halo! Ada yang bisa saya bantu?",
        "Mendengarkan...": "Saya mendengarkan...",
        "Memproses...": "Sebentar ya...",
        "Thinking": "Hmm, biarkan saya cari...",
        "Mencari Buku...": "Sedang mengecek rak perpustakaan...",
        "Menjawab...": "Ini dia...",
        "Gagal Mendengar": "Maaf, kurang jelas.",
        "Error Koneksi": "Koneksi terputus.",
        "Izin Mic Ditolak": "Mohon izinkan akses mikrofon."
    };

    const welcomeScreen = document.getElementById('welcome-screen');
    const appScreen = document.getElementById('app-screen');

    const textView = document.getElementById('view-text');
    const threeView = document.getElementById('view-3d');
    const navText = document.getElementById('nav-text');
    const nav3d = document.getElementById('nav-3d');

    const chatContainer = document.querySelector(".chat-container");
    const textInput = document.getElementById('text-input');

    const micBtn = document.getElementById("mic-btn");
    const micIcon = micBtn ? micBtn.querySelector('i') : null;

    const bubbleEl = document.getElementById("speech-bubble");
    const bubbleTextEl = document.getElementById("bubble-text");

    const bookCardContainer = document.getElementById('book-recommendations');
    const btnPrev = document.getElementById('prev-book');
    const btnNext = document.getElementById('next-book');

    const speechInputBox = document.querySelector('.speech-input-box');
    const speechInput = document.getElementById('speech-display');

    function updateBubble(text, isSystem = true) {
        const finalText = isSystem ? (statusMessages[text] || text) : text;
        if (bubbleTextEl) bubbleTextEl.innerHTML = finalText;
        if (bubbleEl) {
            bubbleEl.classList.remove('hidden');
            bubbleEl.style.transform = "scale(1.05)";
            setTimeout(() => bubbleEl.style.transform = "scale(1)", 150);
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
        bookCardContainer?.classList.add('hidden');
        btnPrev?.classList.add('hidden');
        btnNext?.classList.add('hidden');
    }

    window.enterApp = function () {
        welcomeScreen.classList.add('fade-out');
        setTimeout(() => {
            welcomeScreen.style.display = 'none';
            appScreen.classList.add('active');
        }, 500);
    };

    window.switchTab = function (tab) {
        if (window.setAppMode) window.setAppMode(tab);

        if (tab === 'text') {
            textView.classList.remove('hidden');
            threeView.classList.add('hidden');
            navText.classList.add('active');
            nav3d.classList.remove('active');
        } else {
            textView.classList.add('hidden');
            threeView.classList.remove('hidden');
            navText.classList.remove('active');
            nav3d.classList.add('active');
            window.dispatchEvent(new Event('resize'));
        }
    };

    window.sendTextChat = function () {
        const msg = textInput.value.trim();
        if (!msg) return;

        addMessage("user", msg);
        textInput.value = "";
        window.processTextChat(msg);
    };

    textInput?.addEventListener('keypress', e => {
        if (e.key === 'Enter') window.sendTextChat();
    });

    window.setAppMode = function (mode) {
        currentMode = mode;

        if (mode === 'text') {
            stopTTS();
            hideFloatingCard();
            hideBubble();
            reset3DInputUI();
        } else {
            updateBubble("Halo! Katakan sesuatu...");
            triggerAvatarAnimation('wave');
        }
    };

    window.processTextChat = async function (message) {
        if (!message) return;

        try {
            if (currentMode === '3d') {
                updateBubble("Mencari Buku...");
                triggerAvatarAnimation("thinking");
            }

            const endpoint =
                currentMode === 'text'
                    ? "/api/chat/text"
                    : "/api/chat/avatar";

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });

            const data = await res.json();
            const reply = data.speech_text || data.reply || "Maaf, saya tidak mengerti.";
            const books = data.books || [];

            if (currentMode === 'text') {
                addMessage("bot", reply);
            } else {
                updateBubble(reply, false);
                playTTS(reply);
                if (books.length) showFloatingBookList(books);
            }

        } catch {
            updateBubble("Error Koneksi");
            triggerAvatarAnimation("idle");
        }
    };

    function addMessage(sender, text) {
        if (currentMode !== 'text') return;
        const div = document.createElement("div");
        div.className = `msg ${sender}`;
        div.innerHTML = text.replace(/\n/g, '<br>');
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    micBtn?.addEventListener("click", async () => {
        if (currentMode === 'text') {
            alert("Pindah ke tab 'Assistant' dulu.");
            return;
        }

        if (isReviewing) {
            const msg = speechInput.value.trim();
            if (msg) window.processTextChat(msg);
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
            const res = await fetch("/api/transcribe", { method: "POST", body: fd });
            const data = await res.json();

            isReviewing = true;

            speechInput.value = data.text;
            speechInput.readOnly = false;

            speechInputBox.classList.add("show");

            micIcon.className = "fa-solid fa-paper-plane";
            updateBubble(`"${data.text}"`, false);

            speechInput.focus();

        } catch {
            updateBubble("Gagal Mendengar");
            reset3DInputUI();
        }
    }

    async function playTTS(text) {
        stopTTS();
        const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
    }

    function stopTTS() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
    }

    window.scrollCarousel = dir => {
        bookCardContainer?.scrollBy({ left: dir * 220, behavior: 'smooth' });
    };

    window.showFloatingBookList = books => {
        bookCardContainer.innerHTML = '';

        books.forEach(b => {
            const div = document.createElement('div');
            div.className = 'book-item';

            div.style.setProperty("--hue", b.cover_color);

            div.innerHTML = `
                <div class="book-cover">
                    ${
                        b.cover_image
                        ? `<img src="${b.cover_image}" alt="${b.title}" />`
                        : `<i class="fa-solid fa-book-open"></i>`
                    }
                </div>

                <div class="book-info">
                    <h4>${b.title}</h4>
                    <p>${b.author || 'Unknown'}</p>
                </div>
            `;
            bookCardContainer.appendChild(div);
        });

        bookCardContainer.classList.remove('hidden');
        btnNext.classList.remove('hidden');
    };

});
