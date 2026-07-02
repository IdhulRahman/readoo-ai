// Authentication helper routines for AI Assistant Portal

function showAlert(message, type = "error") {
    const box = document.getElementById("alert-box");
    if (!box) return;
    box.className = `auth-alert ${type}`;
    box.innerText = message;
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    showAlert("Sedang memproses...", "success");

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("auth_token", data.token);
            localStorage.setItem("auth_role", data.role);
            localStorage.setItem("auth_name", data.nama_lengkap);

            if (data.role === "admin") {
                window.location.href = "/admin";
            } else {
                window.location.href = "/chat";
            }
        } else {
            showAlert(data.error || "Email atau password salah.");
        }
    } catch (err) {
        console.error("Login error:", err);
        showAlert("Koneksi gagal. Silakan coba beberapa saat lagi.");
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password !== confirmPassword) {
        showAlert("Password dan konfirmasi password tidak cocok.");
        return;
    }

    // Password strength rules validation
    if (password.length < 8) {
        showAlert("Password minimal harus terdiri dari 8 karakter.");
        return;
    }
    if (!/[A-Z]/.test(password)) {
        showAlert("Password wajib mengandung minimal satu huruf besar (kapital).");
        return;
    }
    if (!/[0-9]/.test(password)) {
        showAlert("Password wajib mengandung minimal satu angka.");
        return;
    }
    const specialChars = /[~`!@#$%^&*()_\-+={[\]|\\:;"'<,>.?/]/;
    if (!specialChars.test(password)) {
        showAlert("Password wajib mengandung minimal satu karakter simbol (!@#$...).");
        return;
    }

    showAlert("Sedang mendaftarkan...", "success");

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nama_lengkap: name, email, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("reg_success", "Pendaftaran berhasil! Silakan masuk menggunakan akun baru Anda.");
            window.location.href = "/login";
        } else {
            showAlert(data.error || "Gagal melakukan pendaftaran.");
        }
    } catch (err) {
        console.error("Register error:", err);
        showAlert("Koneksi gagal. Gagal mendaftarkan akun.");
    }
}

async function handleForgot(event) {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();

    showAlert("Kirim link sedang diproses...", "success");

    try {
        const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (res.ok) {
            showAlert(data.message, "success");
        } else {
            showAlert(data.error || "Gagal memproses pemulihan sandi.");
        }
    } catch (err) {
        console.error("Forgot error:", err);
        showAlert("Koneksi gagal. Gagal memproses.");
    }
}

async function handleLogout() {
    const token = localStorage.getItem("auth_token");
    if (token) {
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
        } catch (e) {
            console.error("Logout API failed", e);
        }
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_role");
    localStorage.removeItem("auth_name");
    window.location.href = "/login";
}

// Client Side Router Guards
function checkGuard(requiredRole = null) {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("auth_role");
    const name = localStorage.getItem("auth_name");

    if (!token || !role) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_role");
        localStorage.removeItem("auth_name");
        window.location.href = "/login";
        return;
    }

    if (requiredRole && role !== requiredRole) {
        // Mismatch role routing fallback
        if (role === "admin") {
            window.location.href = "/admin";
        } else {
            window.location.href = "/chat";
        }
        return;
    }

    // Set user display name if tag exists
    document.addEventListener("DOMContentLoaded", () => {
        const userEl = document.getElementById("user-display-name");
        if (userEl) {
            userEl.innerText = name || (role === "admin" ? "Administrator" : "User Demo");
        }
    });
}

// Display registration success messages if redirected
document.addEventListener("DOMContentLoaded", () => {
    const msg = localStorage.getItem("reg_success");
    if (msg) {
        showAlert(msg, "success");
        localStorage.removeItem("reg_success");
    }
});
