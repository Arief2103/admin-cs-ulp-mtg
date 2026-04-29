import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { loadComponents } from './components.js';

// LOAD DATA STATISTIK DARI FIREBASE
async function loadStats() {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const jobSnapshot = await getDocs(collection(db, "jobdesk"));
    const userSnapshot = await getDocs(collection(db, "users"));
    const reportsRef = collection(db, "reports");
    const qReports = query(reportsRef, where("assignedDate", "==", today));
    const reportSnapshot = await getDocs(qReports);
    
    // Hitung total job yang masuk kategori "Harian" (Pagi, Siang, Sore)
    const dailyJobs = jobSnapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(job => {
      const cat = (job.category || "").toLowerCase();
      return cat.includes("pagi") || cat.includes("siang") || cat.includes("sore") || cat === "harian";
    });

    const dailyJobIds = new Set(dailyJobs.map(j => j.id));
    
    // Hitung laporan hari ini yang HANYA untuk kategori daily
    const completedTodayCount = reportSnapshot.docs.filter(doc => {
      return dailyJobIds.has(doc.data().jobId);
    }).length;

    const totalMasterJobs = jobSnapshot.size;
    const totalCleaners = userSnapshot.docs.filter(d => {
      const data = d.data();
      return data.role !== 'admin' && !data.email?.includes('admin');
    }).length;

    const incompleteTodayCount = Math.max(0, dailyJobs.length - completedTodayCount);

    // Update UI Cards
    document.getElementById("stat-total-jobs").textContent = totalMasterJobs;
    document.getElementById("stat-total-users").textContent = totalCleaners;
    document.getElementById("stat-complete").textContent = completedTodayCount;
    document.getElementById("stat-incomplete").textContent = incompleteTodayCount;

  } catch (e) {
    console.warn("Gagal load stats:", e);
  }
}

// FUNGSI UNTUK MENGHITUNG TANGGAL MULAI BERDASARKAN KATEGORI
function getStartDateForCategory(category) {
  const now = new Date();
  const dFormat = (d) => d.toLocaleDateString('en-CA');
  
  const cat = category.toLowerCase();
  
  if (cat.includes("pagi") || cat.includes("siang") || cat.includes("sore") || cat === "harian") {
    // Reset harian
    return dFormat(now);
  } else if (cat.includes("mingguan")) {
    // Reset mingguan (Senin)
    const monday = new Date(now);
    monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    monday.setHours(0,0,0,0);
    return dFormat(monday);
  } else if (cat.includes("bulanan")) {
    // Reset bulanan (Tgl 1)
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (cat.includes("weekend")) {
    // Reset per 2 minggu (Gunakan Senin minggu genap sebagai referensi)
    // Jan 1 2024 adalah Senin (Minggu 1)
    const refDate = new Date(2024, 0, 1);
    const msDiff = now.getTime() - refDate.getTime();
    const daysDiff = Math.floor(msDiff / (1000 * 60 * 60 * 24));
    const fortnights = Math.floor(daysDiff / 14);
    const startDate = new Date(refDate);
    startDate.setDate(refDate.getDate() + (fortnights * 14));
    return dFormat(startDate);
  }
  return dFormat(now);
}

// DEFINISI KATEGORI UNTUK UI
const MONITOR_CATEGORIES = [
  { id: "pagi", label: "Pagi", match: "Harian Pagi", color: "#075E3D" },
  { id: "siang", label: "Siang", match: "Harian Siang", color: "#075E3D" },
  { id: "sore", label: "Sore", match: "Harian Sore", color: "#075E3D" },
  { id: "mingguan", label: "Minggu", match: "Mingguan", color: "#F59E0B" },
  { id: "bulanan", label: "Bulan", match: "Bulanan", color: "#3B82F6" },
  { id: "weekend", label: "Weekend", match: "Weekend", color: "#8B5CF6" }
];

// LOAD MONITORING PER PETUGAS
async function loadMonitoring() {
  const grid = document.getElementById("monitoring-grid");
  if (!grid) return;

  try {
    const [usersSnap, jobsSnap, reportsSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "jobdesk")),
      getDocs(collection(db, "reports"))
    ]);

    const jobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const reports = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleaners = usersSnap.docs.filter(d => {
      const data = d.data();
      return data.role !== 'admin' && !(data.email && data.email.includes('admin@'));
    });

    grid.innerHTML = "";

    cleaners.forEach(userDoc => {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      // Filter semua job milik petugas ini
      const personJobs = jobs.filter(j => j.cleanerId === userId);

      const personCard = document.createElement("div");
      personCard.className = "bg-white p-8 border border-gray-100 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all";
      
      let categoriesHtml = "";
      const chartConfigs = [];

      MONITOR_CATEGORIES.forEach(cat => {
        const catJobs = personJobs.filter(j => j.category === cat.match);
        const total = catJobs.length;
        let done = 0;

        catJobs.forEach(job => {
          const threshold = getStartDateForCategory(job.category);
          if (reports.some(r => r.jobId === job.id && r.assignedDate >= threshold)) {
            done++;
          }
        });

        const percent = total > 0 ? Math.round((done/total)*100) : 0;
        const chartId = `chart-${userId}-${cat.id}`;
        
        categoriesHtml += `
          <div class="flex flex-col items-center p-4 bg-gray-50 rounded-3xl group hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all">
            <div class="relative w-full aspect-square max-w-[100px] mb-3">
              <canvas id="${chartId}"></canvas>
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span class="text-[14px] font-black text-gray-900">${percent}%</span>
              </div>
            </div>
            <div class="text-center">
              <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">${cat.label}</p>
              <p class="text-xs font-bold text-gray-900">${done}/${total}</p>
            </div>
          </div>
        `;

        chartConfigs.push({ id: chartId, done, total, color: cat.color });
      });

      personCard.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 px-2">
          <div class="flex items-center gap-4">
             <div class="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-[#075E3D]">
                <i data-lucide="user-check" class="w-7 h-7"></i>
             </div>
             <div>
                <h4 class="text-2xl font-black text-gray-900 uppercase tracking-tight">${userData.name}</h4>
                <p class="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mt-0.5">Personil Cleaning Service</p>
             </div>
          </div>
          <div class="flex gap-4">
            <div class="px-6 py-3 bg-gray-50 rounded-2xl border border-gray-100">
               <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Tugas</p>
               <p class="text-xl font-black text-gray-900">${personJobs.length}</p>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          ${categoriesHtml}
        </div>
      `;
      
      grid.appendChild(personCard);

      // Render chart untuk setiap kategori
      setTimeout(() => {
        if (window.lucide) lucide.createIcons();
        chartConfigs.forEach(conf => {
          const el = document.getElementById(conf.id);
          if (!el) return;
          const ctx = el.getContext('2d');
          new Chart(ctx, {
            type: 'doughnut',
            data: {
              datasets: [{
                data: [conf.done, conf.total === 0 ? 1 : Math.max(0, conf.total - conf.done)],
                backgroundColor: [conf.color, '#E2E8F0'],
                borderWidth: 0,
                cutout: '80%'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              animation: { duration: 1000 }
            }
          });
        });
      }, 0);
    });

    if (cleaners.length === 0) {
      grid.innerHTML = `<div class="col-span-full py-12 text-center text-gray-400 italic">Belum ada petugas terdaftar.</div>`;
    }

  } catch (e) {
    console.error("Gagal load monitoring:", e);
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-red-400">Gagal memuat monitoring: ${e.message}</div>`;
  }
}

// JALANKAN SAAT LOAD
document.addEventListener("DOMContentLoaded", async () => {
  await loadComponents();
  loadStats();
  loadMonitoring();
});
