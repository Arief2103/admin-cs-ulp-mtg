// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
// import { 
//   getFirestore, 
//   collection, 
//   addDoc, 
//   getDocs 
// } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// import { 
//   getAuth, 
//   signInWithEmailAndPassword 
// } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// // 🔥 CONFIG
// const firebaseConfig = {
//   apiKey: "AIzaSyBp-WMVvFjD5n0Ba0ggecYa5BJY7j1ddTM",
//   authDomain: "cspln-app.firebaseapp.com",
//   projectId: "cspln-app",
//   storageBucket: "cspln-app.firebasestorage.app",
//   messagingSenderId: "58830049573",
//   appId: "1:58830049573:web:fcbf756c7a85cedc100acc",
// };

// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);
// const auth = getAuth(app);


// // 🔐 LOGIN
// window.login = async function () {
//   const email = document.getElementById("email").value.trim();
//   const password = document.getElementById("password").value.trim();

//   if (!email || !password) {
//     alert("Email & Password wajib diisi");
//     return;
//   }

//   try {
//     await signInWithEmailAndPassword(auth, email, password);

//     alert("Login berhasil");

//     document.getElementById("loginPage").style.display = "none";
//     document.getElementById("dashboard").style.display = "block";

//     await loadUsers(); // 🔥 pastikan selesai dulu

//   } catch (e) {
//     alert("Login gagal: " + e.message);
//   }
// };


// // 🔥 LOAD USER KE DROPDOWN
// async function loadUsers() {
//   try {
//     const snapshot = await getDocs(collection(db, "users"));
//     const select = document.getElementById("userSelect");

//     select.innerHTML = "";

//     snapshot.forEach(doc => {
//       const data = doc.data();

//       // ❌ skip admin
//       if (data.name.toLowerCase() === "admin") return;

//       const option = document.createElement("option");
//       option.value = data.uid;
//       option.textContent = data.name;

//       select.appendChild(option);
//     });

//   } catch (e) {
//     console.error(e);
//     alert("Gagal load user");
//   }
// }


// // ➕ TAMBAH DATA
// window.tambahData = async function () {
//   const user_id = document.getElementById("userSelect").value;
//   const title = document.getElementById("title").value.trim();
//   const type = document.getElementById("type").value;
//   const time = document.getElementById("time").value;

//   // 🔥 VALIDASI
//   if (!user_id) {
//     alert("Pilih user dulu");
//     return;
//   }

//   if (!title) {
//     alert("Judul harus diisi");
//     return;
//   }

//   try {
//     await addDoc(collection(db, "jobdesk"), {
//       user_id,
//       title,
//       type,
//       time: type === "harian" ? time : null, // 🔥 hanya harian pakai time
//       status: false,
//       created_at: new Date()
//     });

//     alert("Berhasil ditambahkan");

//     // reset form
//     document.getElementById("title").value = "";

//   } catch (e) {
//     console.error(e);
//     alert("Gagal simpan data");
//   }
// };

import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Load Statistik
window.loadStats = async function() {
    try {
        const jobSnapshot = await getDocs(collection(db, "jobdesk"));
        const userSnapshot = await getDocs(collection(db, "users"));
        
        const totalJobs = jobSnapshot.size;
        const totalUsers = userSnapshot.size;
        
        let complete = 0;
        jobSnapshot.forEach(doc => {
            if(doc.data().status === true) complete++;
        });

        document.getElementById("total-jobs").innerText = totalJobs;
        document.getElementById("total-users").innerText = totalUsers;
        document.getElementById("stat-complete").innerText = complete;
        document.getElementById("stat-pending").innerText = totalJobs - complete;

    } catch (e) {
        console.error("Gagal load data:", e);
    }
};

// Inisialisasi Chart (Chart.js)
window.initDashboardChart = function() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
            datasets: [{
                label: 'Pekerjaan Selesai',
                data: [5, 12, 8, 15, 10, 20, 4],
                borderColor: '#075E3D',
                backgroundColor: 'rgba(7, 94, 61, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
};
