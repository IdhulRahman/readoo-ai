// Admin Dashboard controller scripts

let collectionsData = [];
let uploadTempFile = "";
const token = localStorage.getItem("auth_token");

function switchAdminSection(section) {
    // Update sidebar active state
    document.querySelectorAll(".sidebar-item").forEach(item => {
        item.classList.remove("active");
    });
    const activeItem = document.getElementById(`menu-${section}`);
    if (activeItem) activeItem.classList.add("active");

    // Update main body active section
    document.querySelectorAll(".admin-section").forEach(sec => {
        sec.classList.remove("active");
    });
    const activeSec = document.getElementById(`section-${section}`);
    if (activeSec) activeSec.classList.add("active");

    // Load section data
    if (section === "dataset") {
        fetchAdminCollections();
    } else if (section === "persona") {
        loadPersonaSettings();
    } else if (section === "llm") {
        loadLLMSettings();
    } else if (section === "tts") {
        loadTTSSettings();
    }
}

// ==========================================
// DATASET & COLLECTIONS MANAGEMENT (CRUD)
// ==========================================

async function fetchAdminCollections() {
    try {
        const res = await fetch("/api/admin/collections", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        collectionsData = await res.json();
        renderCollectionsTable(collectionsData);
        updateCollectionsStats(collectionsData);
    } catch (e) {
        console.error("Failed to fetch collections:", e);
    }
}

function renderCollectionsTable(collections) {
    const tbody = document.getElementById("collections-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!collections.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Belum ada dataset terunggah. Silakan impor file CSV baru.</td></tr>`;
        return;
    }

    collections.forEach(col => {
        const tr = document.createElement("tr");
        
        const activeBadge = col.active 
            ? `<span class="badge active" style="cursor: default;"><i class="fa-solid fa-circle-check"></i> Aktif</span>`
            : `<span class="badge inactive" style="cursor: pointer;" onclick="setActiveCollection(${col.id})"><i class="fa-solid fa-circle-xmark"></i> Nonaktif (Klik untuk Aktifkan)</span>`;

        tr.innerHTML = `
            <td><strong>${escapeHTML(col.name)}</strong></td>
            <td>${col.doc_count} item</td>
            <td><small style="color: var(--text-muted);">${escapeHTML(col.embedding_cols.join(", "))}</small></td>
            <td><small style="color: var(--text-muted);">${escapeHTML(col.display_cols.join(", "))}</small></td>
            <td>${new Date(col.created_at).toLocaleString("id-ID")}</td>
            <td>${activeBadge}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-action edit" title="Rebuild Index FAISS" onclick="rebuildFAISS(${col.id})">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>
                    <button class="btn-danger" title="Hapus Dataset" onclick="deleteCollection(${col.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateCollectionsStats(collections) {
    const totalColsEl = document.getElementById("stat-total-collections");
    const totalDocsEl = document.getElementById("stat-total-documents");

    if (totalColsEl) totalColsEl.innerText = collections.length;
    if (totalDocsEl) {
        const sum = collections.reduce((acc, col) => acc + col.doc_count, 0);
        totalDocsEl.innerText = sum;
    }
}

async function setActiveCollection(id) {
    try {
        const res = await fetch(`/api/admin/collections/active/${id}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            fetchAdminCollections();
        } else {
            const data = await res.json();
            alert("Gagal mengaktifkan dataset: " + data.error);
        }
    } catch (e) {
        console.error(e);
    }
}

async function deleteCollection(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus dataset ini seutuhnya? Seluruh dokumen dan indeks pencariannya akan terhapus secara permanen.")) return;

    try {
        const res = await fetch(`/api/admin/collections/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            fetchAdminCollections();
        } else {
            const data = await res.json();
            alert("Gagal menghapus dataset: " + data.error);
        }
    } catch (e) {
        console.error(e);
    }
}

async function rebuildFAISS(id) {
    try {
        const res = await fetch(`/api/admin/collections/rebuild/${id}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            alert("Indeks FAISS berhasil dibangun ulang!");
            fetchAdminCollections();
        } else {
            const data = await res.json();
            alert("Gagal membangun ulang indeks: " + data.error);
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// CSV IMPORT & MAPPING MODAL
// ==========================================

function openImportModal() {
    document.getElementById("import-modal").classList.add("show");
    resetImportModalSteps();
}

function closeImportModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("import-modal").classList.remove("show");
    
    // Clear CSV input
    document.getElementById("csv-file-input").value = "";
}

function resetImportModalSteps() {
    document.getElementById("import-step-upload").style.display = "block";
    document.getElementById("import-step-mapping").style.display = "none";
    document.getElementById("btn-submit-import").style.display = "none";
    
    document.getElementById("upload-alert").style.display = "none";
    document.getElementById("mapping-alert").style.display = "none";
    
    uploadTempFile = "";
}

async function onCSVFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const alertBox = document.getElementById("upload-alert");
    alertBox.style.display = "none";

    const fd = new FormData();
    fd.append("file", file);

    try {
        const res = await fetch("/api/admin/dataset/upload", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
            body: fd
        });
        const data = await res.json();

        if (res.ok) {
            uploadTempFile = data.temp_file;
            showMappingStep(data.headers, data.preview, file.name.replace(".csv", ""));
        } else {
            alertBox.innerText = data.error;
            alertBox.style.display = "block";
        }
    } catch (e) {
        console.error(e);
        alertBox.innerText = "Koneksi terputus. Gagal mengunggah file CSV.";
        alertBox.style.display = "block";
    }
}

function showMappingStep(headers, preview, defaultName) {
    document.getElementById("import-step-upload").style.display = "none";
    document.getElementById("import-step-mapping").style.display = "block";
    document.getElementById("btn-submit-import").style.display = "inline-flex";

    // Set default collection name
    document.getElementById("input-dataset-name").value = defaultName;

    // Render Preview Table
    const table = document.getElementById("csv-preview-table");
    table.innerHTML = "";
    
    // Render headers
    const thead = document.createElement("tr");
    headers.forEach(h => {
        const th = document.createElement("th");
        th.innerText = h;
        thead.appendChild(th);
    });
    table.appendChild(thead);

    // Render 5 preview rows
    preview.forEach(row => {
        const tr = document.createElement("tr");
        headers.forEach(h => {
            const td = document.createElement("td");
            td.innerText = row[h] || "";
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });

    // Populate embedding and display checkbox panels
    const embedList = document.getElementById("mapping-embedding-list");
    const displayList = document.getElementById("mapping-display-list");
    embedList.innerHTML = "";
    displayList.innerHTML = "";

    headers.forEach(h => {
        // Checkbox for Embedding
        const divE = document.createElement("label");
        divE.className = "mapping-checkbox-item";
        divE.innerHTML = `<input type="checkbox" name="embed-col" value="${h}"> <span>${escapeHTML(h)}</span>`;
        embedList.appendChild(divE);

        // Checkbox for Display
        const divD = document.createElement("label");
        divD.className = "mapping-checkbox-item";
        divD.innerHTML = `<input type="checkbox" name="display-col" value="${h}"> <span>${escapeHTML(h)}</span>`;
        displayList.appendChild(divD);
    });
}

async function submitDatasetImport() {
    const alertBox = document.getElementById("mapping-alert");
    alertBox.style.display = "none";

    const name = document.getElementById("input-dataset-name").value.trim();
    if (!name) {
        alertBox.innerText = "Nama koleksi dataset wajib diisi.";
        alertBox.style.display = "block";
        return;
    }

    // Get selected embedding columns
    const embedCols = [];
    document.querySelectorAll("input[name='embed-col']:checked").forEach(cb => {
        embedCols.push(cb.value);
    });

    // Get selected display columns
    const displayCols = [];
    document.querySelectorAll("input[name='display-col']:checked").forEach(cb => {
        displayCols.push(cb.value);
    });

    if (!embedCols.length) {
        alertBox.innerText = "Anda wajib memilih minimal satu kolom untuk embedding semantik.";
        alertBox.style.display = "block";
        return;
    }

    if (!displayCols.length) {
        alertBox.innerText = "Anda wajib memilih minimal satu kolom untuk display fields.";
        alertBox.style.display = "block";
        return;
    }

    const payload = {
        name,
        embedding_cols: embedCols,
        display_cols: displayCols,
        temp_file: uploadTempFile
    };

    try {
        const res = await fetch("/api/admin/dataset/import", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            closeImportModal();
            fetchAdminCollections();
        } else {
            alertBox.innerText = data.error;
            alertBox.style.display = "block";
        }
    } catch (e) {
        console.error(e);
        alertBox.innerText = "Gagal memproses impor data.";
        alertBox.style.display = "block";
    }
}

// ==========================================
// PERSONA & PROMPT SETTINGS
// ==========================================

async function loadPersonaSettings() {
    try {
        const res = await fetch("/api/admin/settings", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        
        document.getElementById("input-assistant-name").value = data.assistant_name || "Aiko";
        document.getElementById("input-greeting-message").value = data.greeting_message || "";
        document.getElementById("input-system-prompt").value = data.system_prompt || "";
    } catch (e) {
        console.error(e);
    }
}

async function savePersonaSettings(event) {
    event.preventDefault();
    const assistant_name = document.getElementById("input-assistant-name").value.trim();
    const greeting_message = document.getElementById("input-greeting-message").value.trim();
    const system_prompt = document.getElementById("input-system-prompt").value.trim();

    // Check placeholder variables are present
    if (!system_prompt.includes("{name}") || !system_prompt.includes("{context}") || !system_prompt.includes("{query}")) {
        alert("System prompt wajib mengandung placeholder {name}, {context}, dan {query}.");
        return;
    }

    try {
        const res = await fetch("/api/admin/settings", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ assistant_name, greeting_message, system_prompt })
        });
        if (res.ok) {
            alert("Pengaturan persona berhasil disimpan!");
        } else {
            alert("Gagal menyimpan pengaturan.");
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// LLM PROVIDER CONFIGURATION
// ==========================================

async function loadLLMSettings() {
    try {
        const res = await fetch("/api/admin/settings", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();

        document.getElementById("select-llm-provider").value = data.llm_provider || "groq";
        document.getElementById("input-llm-model").value = data.llm_model || "";
        document.getElementById("input-llm-key").value = data.llm_api_key || "";
        
        onLLMProviderChange();
    } catch (e) {
        console.error(e);
    }
}

function onLLMProviderChange() {
    const provider = document.getElementById("select-llm-provider").value;
    const groupKey = document.getElementById("group-api-key");
    const tip = document.getElementById("ollama-url-tip");

    if (provider === "ollama") {
        groupKey.style.display = "none";
    } else {
        groupKey.style.display = "flex";
        tip.innerText = `* API key untuk ${provider.toUpperCase()} disimpan terenkripsi di database.`;
    }
    
    // Clear status box
    document.getElementById("connection-status-box").style.display = "none";
}

async function testLLMConnection() {
    const statusBox = document.getElementById("connection-status-box");
    statusBox.className = "status-connection-box";
    statusBox.style.display = "block";
    statusBox.innerText = "Menguji koneksi ke LLM provider...";

    const payload = {
        llm_provider: document.getElementById("select-llm-provider").value,
        llm_model: document.getElementById("input-llm-model").value.trim(),
        llm_api_key: document.getElementById("input-llm-key").value
    };

    try {
        const res = await fetch("/api/admin/llm/test-connection", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
            statusBox.className = "status-connection-box success";
            statusBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> Koneksi Berhasil! Model merespon: <em>"${data.response}"</em>`;
        } else {
            statusBox.className = "status-connection-box error";
            statusBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Koneksi Gagal: ${data.error || "Gagal menghubungi model."}`;
        }
    } catch (e) {
        console.error(e);
        statusBox.className = "status-connection-box error";
        statusBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Koneksi Gagal: Gagal terhubung ke API.`;
    }
}

async function saveLLMSettings(event) {
    event.preventDefault();
    const llm_provider = document.getElementById("select-llm-provider").value;
    const llm_model = document.getElementById("input-llm-model").value.trim();
    const llm_api_key = document.getElementById("input-llm-key").value;

    try {
        const res = await fetch("/api/admin/settings", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ llm_provider, llm_model, llm_api_key })
        });
        if (res.ok) {
            alert("Konfigurasi LLM berhasil disimpan!");
        } else {
            alert("Gagal menyimpan konfigurasi.");
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// TTS & VOICE CONFIGURATION
// ==========================================

const voiceListMap = {
    "edge-tts": {
        "id-ID": [
            { value: "id-ID-GadisNeural", name: "Gadis (Female - Indonesia)" },
            { value: "id-ID-ArdiNeural", name: "Ardi (Male - Indonesia)" }
        ],
        "en-US": [
            { value: "en-US-JennyNeural", name: "Jenny (Female - English US)" },
            { value: "en-US-GuyNeural", name: "Guy (Male - English US)" }
        ]
    },
    "supertonic": {
        "id-ID": [
            { value: "W1", name: "Style W1 (Female ONNX - Lokal)" },
            { value: "W2", name: "Style W2 (Female ONNX - Lokal)" },
            { value: "M1", name: "Style M1 (Male ONNX - Lokal)" }
        ],
        "en-US": [
            { value: "W1", name: "Style W1 (Female ONNX - Lokal)" },
            { value: "M1", name: "Style M1 (Male ONNX - Lokal)" }
        ]
    }
};

async function loadTTSSettings() {
    try {
        const res = await fetch("/api/admin/settings", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();

        document.getElementById("select-tts-provider").value = data.tts_provider || "edge-tts";
        document.getElementById("select-tts-lang").value = data.tts_language || "id-ID";

        populateTTSVoiceOptions(data.tts_provider || "edge-tts", data.tts_language || "id-ID");
        
        // Timeout to allow DOM loading options
        setTimeout(() => {
            document.getElementById("select-tts-voice").value = data.tts_voice || "id-ID-GadisNeural";
        }, 50);
    } catch (e) {
        console.error(e);
    }
}

function populateTTSVoiceOptions(provider, language) {
    const selectVoice = document.getElementById("select-tts-voice");
    selectVoice.innerHTML = "";

    const list = voiceListMap[provider]?.[language] || [];
    list.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.value;
        opt.innerText = v.name;
        selectVoice.appendChild(opt);
    });
}

function onTTSProviderChange() {
    const provider = document.getElementById("select-tts-provider").value;
    const language = document.getElementById("select-tts-lang").value;
    populateTTSVoiceOptions(provider, language);
}

function onTTSLangChange() {
    const provider = document.getElementById("select-tts-provider").value;
    const language = document.getElementById("select-tts-lang").value;
    populateTTSVoiceOptions(provider, language);
}

async function saveTTSSettings(event) {
    event.preventDefault();
    const tts_provider = document.getElementById("select-tts-provider").value;
    const tts_language = document.getElementById("select-tts-lang").value;
    const tts_voice = document.getElementById("select-tts-voice").value;

    try {
        const res = await fetch("/api/admin/settings", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ tts_provider, tts_language, tts_voice })
        });
        if (res.ok) {
            alert("Pengaturan suara TTS berhasil disimpan!");
        } else {
            alert("Gagal menyimpan pengaturan.");
        }
    } catch (e) {
        console.error(e);
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Initial fetch
document.addEventListener("DOMContentLoaded", () => {
    fetchAdminCollections();
});
