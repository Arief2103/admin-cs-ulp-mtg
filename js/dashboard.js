import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { loadComponents } from './components.js';

// FUNGSI UNTUK MENGHITUNG TANGGAL MULAI BERDASARKAN KATEGORI
function getStartDateForCategory(category) {
  const now = new Date();
  const dFormat = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const cat = (category || "").toLowerCase();
  
  if (cat.includes("pagi") || cat.includes("siang") || cat.includes("sore") || cat === "harian" || cat.includes("harian")) {
    return dFormat(now);
  } else if (cat.includes("mingguan")) {
    const monday = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    return dFormat(monday);
  } else if (cat.includes("bulanan")) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (cat.includes("weekend")) {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    const weekNum = Math.floor((dayOfYear - weekday + 10) / 7);
    const biWeekGroup = Math.floor(weekNum / 2);
    const startDate = new Date(now.getFullYear(), 0, 1 + (biWeekGroup * 14));
    return dFormat(startDate);
  }
  return dFormat(now);
}

function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts[0].length === 4) return dateStr.replace(/\//g, '-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts[0].length === 4) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

// DEFINISI KATEGORI UNTUK UI
const MONITOR_CATEGORIES = [
  { id: "pagi", label: "Pagi", match: "Harian Pagi", color: "#065F46" },
  { id: "siang", label: "Siang", match: "Harian Siang", color: "#059669" },
  { id: "sore", label: "Sore", match: "Harian Sore", color: "#10B981" },
  { id: "mingguan", label: "Minggu", match: "Mingguan", color: "#D97706" },
  { id: "bulanan", label: "Bulan", match: "Bulanan", color: "#2563EB" },
  { id: "weekend", label: "Weekend", match: "Weekend", color: "#7C3AED" }
];

// LOAD DATA STATISTIK DARI FIREBASE
async function loadStats() {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const jobSnapshot = await getDocs(collection(db, "jobdesk"));
    const userSnapshot = await getDocs(collection(db, "users"));
    const reportSnapshot = await getDocs(collection(db, "reports"));
    
    const reports = reportSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const jobs = jobSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const dailyJobs = jobs.filter(job => {
      const cat = (job.category || "").toLowerCase();
      return cat.includes("pagi") || cat.includes("siang") || cat.includes("sore") || cat === "harian" || cat.includes("harian");
    });

    const completedTodayCount = reports.filter(doc => {
      const isDaily = dailyJobs.some(j => j.id === doc.jobId);
      return isDaily && normalizeDate(doc.assignedDate) === today;
    }).length;

    const totalMasterJobs = jobSnapshot.size;
    const totalCleaners = userSnapshot.docs.filter(d => {
      const data = d.data();
      return data.role !== 'admin' && !data.email?.includes('admin');
    }).length;

    const incompleteTodayCount = Math.max(0, dailyJobs.length - completedTodayCount);

    // Update UI Cards
    const elJobs = document.getElementById("stat-total-jobs");
    const elUsers = document.getElementById("stat-total-users");
    const elComplete = document.getElementById("stat-complete");
    const elIncomplete = document.getElementById("stat-incomplete");

    if (elJobs) elJobs.textContent = totalMasterJobs;
    if (elUsers) elUsers.textContent = totalCleaners;
    if (elComplete) elComplete.textContent = completedTodayCount;
    if (elIncomplete) elIncomplete.textContent = incompleteTodayCount;

  } catch (e) {
    console.warn("Gagal load stats:", e);
  }
}

// LOAD MONITORING PER PETUGAS
async function loadMonitoring() {
  const grid = document.getElementById("monitoring-grid");
  const overviewGrid = document.getElementById("global-overview-grid");
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

    // 1. GLOBAL OVERVIEW
    if (overviewGrid) {
      overviewGrid.innerHTML = "";
      const globalChartConfigs = [];
      MONITOR_CATEGORIES.forEach(cat => {
        const catJobs = jobs.filter(j => (j.category || "").toLowerCase().includes(cat.id.toLowerCase()));
        const total = catJobs.length;
        let done = 0;
        catJobs.forEach(job => {
          const threshold = getStartDateForCategory(job.category);
          if (reports.some(r => r.jobId === job.id && normalizeDate(r.assignedDate) >= threshold)) {
            done++;
          }
        });
        const percent = total > 0 ? Math.round((done/total)*100) : 0;
        const chartId = `global-chart-${cat.id}`;
        overviewGrid.innerHTML += `
          <div class="flex flex-col items-center p-4 bg-white border border-gray-100 rounded-3xl shadow-sm">
            <div class="relative w-16 h-16 md:w-20 md:h-20 mb-3">
              <canvas id="${chartId}"></canvas>
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span class="text-[12px] font-black text-gray-900">${percent}%</span>
              </div>
            </div>
            <div class="text-center">
              <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">${cat.label}</p>
              <p class="text-[10px] font-bold text-gray-900">${done}/${total}</p>
            </div>
          </div>
        `;
        globalChartConfigs.push({ id: chartId, done, total, color: cat.color });
      });
      setTimeout(() => {
        globalChartConfigs.forEach(conf => renderDoughnut(conf));
      }, 0);
    }

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
        const catJobs = personJobs.filter(j => (j.category || "").toLowerCase().includes(cat.id.toLowerCase()));
        const total = catJobs.length;
        let done = 0;

        catJobs.forEach(job => {
          const threshold = getStartDateForCategory(job.category);
          if (reports.some(r => r.jobId === job.id && normalizeDate(r.assignedDate) >= threshold)) {
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
          renderDoughnut(conf);
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
  try {
    await loadComponents();
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    loadStats();
    loadMonitoring();
  } catch (e) {
    console.error("Initialization error:", e);
  }
});

// FUNGSI RENDER CHART DOUGHNUT
function renderDoughnut(conf) {
  const canvas = document.getElementById(conf.id);
  if (!canvas) return;
  
  // Hancurkan chart lama jika ada
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [conf.done, Math.max(0, conf.total - conf.done)],
        backgroundColor: [conf.color, '#f1f5f9'],
        borderWidth: 0,
        hoverOffset: 0
      }]
    },
    options: {
      cutout: '75%',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1000 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}
