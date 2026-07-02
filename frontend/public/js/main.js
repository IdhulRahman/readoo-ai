document.addEventListener("DOMContentLoaded", () => {

    let currentMode = 'text';
    let currentRole = 'user';
    let currentAudio = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let isReviewing = false;
    let booksData = []; // Cached book list for admin view

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
    const adminView = document.getElementById('view-admin');
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

    // ==========================================
    // ROLE MANAGEMENT & ADMIN CRUD (NEW PORTION)
    // ==========================================

    window.toggleRole = function () {
        const btnToggle = document.getElementById('btn-toggle-role');
        const modeSwitcher = document.getElementById('mode-switcher-el');

        if (currentRole === 'user') {
            currentRole = 'admin';
            btnToggle.classList.add('admin-active');
            btnToggle.innerHTML = '<i class="fa-solid fa-user"></i> Switch to User';
            modeSwitcher.classList.add('hidden');

            textView.classList.add('hidden');
            threeView.classList.add('hidden');
            adminView.classList.remove('hidden');

            stopTTS();
            reset3DInputUI();
            hideFloatingCard();
            hideBubble();

            fetchAdminBooks();
        } else {
            currentRole = 'user';
            btnToggle.classList.remove('admin-active');
            btnToggle.innerHTML = '<i class="fa-solid fa-user-gear"></i> Switch to Admin';
            modeSwitcher.classList.remove('hidden');

            adminView.classList.add('hidden');
            if (currentMode === 'text') {
                textView.classList.remove('hidden');
            } else {
                threeView.classList.remove('hidden');
                window.dispatchEvent(new Event('resize'));
            }
        }
    };

    async function fetchAdminBooks() {
        try {
            const res = await fetch('/api/admin/books');
            booksData = await res.json();
            renderAdminTable(booksData);
            updateAdminStats(booksData);
        } catch (e) {
            console.error("Failed to load admin books:", e);
        }
    }

    function renderAdminTable(books) {
        const tbody = document.getElementById('admin-books-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        books.forEach(b => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="book-td-title">${escapeHTML(b.judul)}</div>
                    <div class="book-td-author">Code: ${escapeHTML(b.kode || '-')}</div>
                </td>
                <td>${escapeHTML(b.pengarang || 'Unknown')}</td>
                <td><span class="badge-category">${escapeHTML(b.klasifikasi || 'Unclassified')}</span></td>
                <td><span class="badge-shelf">${escapeHTML(b.rak || '-')}</span></td>
                <td>${escapeHTML(b.tahun || '-')}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-action edit" onclick="openEditBookModal('${b.id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-action delete" onclick="deleteBook('${b.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateAdminStats(books) {
        const totalBooksEl = document.getElementById('stat-total-books');
        const totalCatsEl = document.getElementById('stat-total-categories');

        if (totalBooksEl) totalBooksEl.innerText = books.length;

        if (totalCatsEl) {
            const categories = new Set(books.map(b => b.klasifikasi).filter(Boolean));
            totalCatsEl.innerText = categories.size;
        }
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    window.openAddBookModal = function () {
        document.getElementById('modal-title').innerText = 'Add New Book';
        document.getElementById('book-form').reset();
        document.getElementById('form-book-id').value = '';
        document.getElementById('book-modal').classList.add('show');
    };

    window.openEditBookModal = function (id) {
        const book = booksData.find(b => b.id === String(id));
        if (!book) return;

        document.getElementById('modal-title').innerText = 'Edit Book';
        document.getElementById('form-book-id').value = book.id;
        document.getElementById('form-title').value = book.judul || '';
        document.getElementById('form-author').value = book.pengarang || '';
        document.getElementById('form-code').value = book.kode || '';
        document.getElementById('form-classification').value = book.klasifikasi || '';
        document.getElementById('form-booktype').value = book.jenis_buku || '';
        document.getElementById('form-subject').value = book.subjek || '';
        document.getElementById('form-shelf').value = book.rak || '';
        document.getElementById('form-publisher').value = book.penerbit || '';
        document.getElementById('form-city').value = book.kota_penerbit || '';
        document.getElementById('form-year').value = book.tahun || '';
        document.getElementById('form-views').value = book.dilihat || 0;
        document.getElementById('form-image').value = book.cover_image || '';
        document.getElementById('form-abstract').value = book.abstraksi || '';

        document.getElementById('book-modal').classList.add('show');
    };

    window.closeBookModal = function (event) {
        if (event && event.target !== event.currentTarget) return;
        document.getElementById('book-modal').classList.remove('show');
    };

    window.saveBook = async function (event) {
        event.preventDefault();

        const id = document.getElementById('form-book-id').value;
        const bookData = {
            judul: document.getElementById('form-title').value,
            pengarang: document.getElementById('form-author').value,
            kode: document.getElementById('form-code').value,
            klasifikasi: document.getElementById('form-classification').value,
            jenis_buku: document.getElementById('form-booktype').value,
            subjek: document.getElementById('form-subject').value,
            rak: document.getElementById('form-shelf').value,
            penerbit: document.getElementById('form-publisher').value,
            kota_penerbit: document.getElementById('form-city').value,
            tahun: document.getElementById('form-year').value,
            dilihat: parseInt(document.getElementById('form-views').value) || 0,
            image_base64: document.getElementById('form-image').value,
            abstraksi: document.getElementById('form-abstract').value
        };

        const url = id ? `/api/admin/books/${id}` : '/api/admin/books';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookData)
            });
            if (res.ok) {
                window.closeBookModal();
                fetchAdminBooks();
            } else {
                alert('Gagal menyimpan buku.');
            }
        } catch (e) {
            console.error("Failed to save book:", e);
        }
    };

    window.deleteBook = async function (id) {
        if (!confirm('Apakah Anda yakin ingin menghapus buku ini?')) return;

        try {
            const res = await fetch(`/api/admin/books/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchAdminBooks();
            } else {
                alert('Gagal menghapus buku.');
            }
        } catch (e) {
            console.error("Failed to delete book:", e);
        }
    };

});
