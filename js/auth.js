import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Fungsi Login
window.login = async function() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        alert("Wajib isi email dan password!");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Login Gagal: " + error.message);
    }
};

// Fungsi Logout
window.logout = async function() {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error(error);
    }
};

// Proteksi Halaman
onAuthStateChanged(auth, (user) => {
    const path = window.location.pathname;
    if (user) {
        if (path.includes("index.html") || path === "/") {
            window.location.href = "dashboard.html";
        }
    } else {
        if (path.includes("dashboard.html")) {
            window.location.href = "index.html";
        }
    }
});
