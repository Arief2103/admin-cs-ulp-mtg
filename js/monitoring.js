import { db } from './firebase-config.js';
import { loadComponents } from './components.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    doc, 
    updateDoc,
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let allJobs = [];
let currentFilter = 'all'; // status filter: 'all', 'pending', 'completed'

// HELPER UNTUK MENGHAPUS INISIAL PETUGAS (PK, MR, MS dll)
function cleanName(name) {
    if (!name) return "";
    let cleaned = name.trim();
    // Hapus PK, MR, MS dll di awal string (case insensitive) diikuti spasi
    cleaned = cleaned.replace(/^(PK|MR|MS|CS|Admin)\s+/i, "");
    return cleaned;
}

// 1. POPULATE USERS FOR SELECT FILTER
async function populateUsers() {
    const select = document.getElementById('filter-user');
    if (!select) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="all">Semua Petugas</option>';
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const isAdmin = data.role === 'admin' || (data.email && data.email.includes('admin@'));
            if (!isAdmin) {
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.textContent = cleanName(data.name);
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Gagal load user filter:", error);
    }
}

// FUNGSI UNTUK MENGHITUNG TANGGAL MULAI BERDASARKAN KATEGORI (Sesuai Dashboard)
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
    // Sync dengan logika Mobile (bi-weekly Monday)
    const monday = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);

    // Hitung weekNum sesuai rumus Flutter
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    const weekNum = Math.floor((dayOfYear - weekday + 10) / 7);

    // Jika minggu ganjil, mundur 7 hari ke Senin minggu sebelumnya
    if (weekNum % 2 !== 0) {
      monday.setDate(monday.getDate() - 7);
    }
    return dFormat(monday);
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

function formatIndonesianDate(dateStr) {
    if (!dateStr) return "-";
    let cleanDate = normalizeDate(dateStr);
    if (!cleanDate) return "-";

    let dateObj;
    if (cleanDate.includes('-')) {
        const parts = cleanDate.split('-');
        if (parts[0].length === 4) {
            dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        } else {
            dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
    } else if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
        dateObj = new Date(cleanDate);
    }

    if (isNaN(dateObj.getTime())) {
        return dateStr;
    }

    const indonesianMonths = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = indonesianMonths[dateObj.getMonth()];
    const year = dateObj.getFullYear();

    return `${day} ${month} ${year}`;
}

function getEarliestThresholdDate() {
    const dates = [
        getStartDateForCategory("Harian Pagi"),
        getStartDateForCategory("Mingguan"),
        getStartDateForCategory("Bulanan"),
        getStartDateForCategory("Weekend")
    ];
    dates.sort();
    return dates[0];
}

function getCleanerPriority(name) {
    if (!name) return 99;
    const n = name.toLowerCase();
    if (n.includes("kardi")) return 1;
    if (n.includes("randy")) return 2;
    if (n.includes("saiful")) return 3;
    return 10; // For others
}

// 2. LOAD DATA FROM FIRESTORE
window.loadMonitoringJobs = async function() {
    const container = document.getElementById("monitoring-container");
    const emptyState = document.getElementById("monitoring-empty");
    if (!container) return;

    container.innerHTML = `<div class="flex justify-center p-20"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#075E3D]"></div></div>`;

    try {
        const earliestDate = getEarliestThresholdDate();
        
        // Ambil Master Tugas
        const qJobs = query(collection(db, "jobdesk"), orderBy("createdAt", "desc"));
        const jobSnapshot = await getDocs(qJobs);
        
        // Ambil Laporan yang dibuat mulai dari batas siklus terlama
        const reportsRef = collection(db, "reports");
        const qReports = query(reportsRef, where("assignedDate", ">=", earliestDate));
        const reportSnapshot = await getDocs(qReports);
        
        const reportsList = [];
        reportSnapshot.forEach(docSnap => {
            reportsList.push({ id: docSnap.id, ...docSnap.data() });
        });

        allJobs = [];
        jobSnapshot.forEach(docSnap => {
            const jobData = docSnap.data();
            const threshold = getStartDateForCategory(jobData.category);
            
            // Cari report yang sesuai untuk job ini di siklus saat ini
            const matchingReports = reportsList.filter(r => r.jobId === docSnap.id && normalizeDate(r.assignedDate) >= threshold);
            
            // Ambil report paling baru di siklus ini jika ada
            let latestReport = null;
            if (matchingReports.length > 0) {
                matchingReports.sort((a, b) => normalizeDate(b.assignedDate).localeCompare(normalizeDate(a.assignedDate)));
                latestReport = matchingReports[0];
            }
            
            allJobs.push({
                id: docSnap.id,
                ...jobData,
                status: !!latestReport, // Selesai jika sudah diisi di siklus ini
                photoUrl: latestReport ? (latestReport.photoUrl || latestReport.imageUrl) : null,
                cleanerName: cleanName(latestReport ? (latestReport.cleanerName || jobData.cleanerName) : jobData.cleanerName),
                assignedDate: latestReport ? latestReport.assignedDate : null
            });
        });

        applyFilters();
    } catch (error) {
        console.error("Gagal load monitoring jobs:", error);
        container.innerHTML = `<p class="text-red-500 p-10 text-center">Gagal memuat data: ${error.message}</p>`;
    }
}

// 3. APPLY FILTERS & RENDER TABLE-LISTS
window.applyFilters = function() {
    const container = document.getElementById("monitoring-container");
    const emptyState = document.getElementById("monitoring-empty");
    
    const userFilter = document.getElementById("filter-user") ? document.getElementById("filter-user").value : "all";
    const categoryFilter = document.getElementById("filter-category") ? document.getElementById("filter-category").value : "all";

    if (!container) return;

    // Filter global statistics counts (regardless of dropdowns to keep active tabs accurate)
    const totalCount = allJobs.length;
    const pendingCount = allJobs.filter(j => !j.status).length;
    const completedCount = allJobs.filter(j => j.status).length;

    // Update statistics numbers
    if (document.getElementById('count-all')) document.getElementById('count-all').textContent = totalCount;
    if (document.getElementById('count-pending')) document.getElementById('count-pending').textContent = pendingCount;
    if (document.getElementById('count-completed')) document.getElementById('count-completed').textContent = completedCount;

    // Filter array
    const filtered = allJobs.filter(job => {
        // Status checks
        if (currentFilter === 'pending' && job.status) return false;
        if (currentFilter === 'completed' && !job.status) return false;

        // User checks
        if (userFilter !== 'all' && job.cleanerId !== userFilter) return false;

        // Category checks
        if (categoryFilter !== 'all' && job.category !== categoryFilter) return false;

        return true;
    });

    // Urutkan pekerjaan berdasarkan prioritas petugas: Pak Kardi, Mas Randy, Mas Saiful, lalu lainnya
    filtered.sort((a, b) => {
        const pA = getCleanerPriority(a.cleanerName);
        const pB = getCleanerPriority(b.cleanerName);
        if (pA !== pB) return pA - pB;
        return (a.description || "").localeCompare(b.description || "");
    });

    if (filtered.length === 0) {
        container.innerHTML = "";
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    container.innerHTML = "";

    // Categories bucket
    const defaultCategories = ["Harian Pagi", "Harian Siang", "Harian Sore", "Mingguan", "Bulanan", "Weekend"];
    const grouped = {};
    defaultCategories.forEach(cat => grouped[cat] = []);

    filtered.forEach(job => {
        const matchingCat = defaultCategories.find(c => c === job.category) || job.category || "Lainnya";
        if (!grouped[matchingCat]) {
            grouped[matchingCat] = [];
        }
        grouped[matchingCat].push(job);
    });

    const categoriesToRender = Object.keys(grouped).filter(cat => grouped[cat].length > 0);

    categoriesToRender.forEach(cat => {
        const jobs = grouped[cat];
        const allDone = jobs.every(j => j.status === true);

        // Sync button & Auto Sync logic
        const syncButton = allDone 
            ? `<button onclick="syncToDrive('${cat}')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-wide rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                <i data-lucide="share-2" class="w-3.5 h-3.5"></i> Sync Drive & WA
               </button>`
            : `<span class="text-[9px] font-black text-orange-400 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full uppercase tracking-wider">Sedang Berjalan</span>`;

        // Generate dynamically rows
        let rowsHtml = "";
        jobs.forEach((job, index) => {
            const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
            const rawDate = job.status ? (job.assignedDate || todayStr) : todayStr;
            const dateStr = formatIndonesianDate(rawDate);
            const proofPhoto = job.photoUrl;

            // Custom proof visual
            let proofHtml = "";
            if (proofPhoto) {
                // Safeguard against bad URL
                proofHtml = `
                    <div class="flex justify-center">
                        <button onclick="openLightbox('${proofPhoto}')" class="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl transition-all inline-flex items-center gap-1 shadow-2xs border border-green-150" title="Klik untuk lihat bukti foto">
                            <i data-lucide="image" class="w-3.5 h-3.5 text-green-600"></i>
                            <span class="text-[10px] font-black uppercase px-1 tracking-tight">Foto</span>
                        </button>
                    </div>`;
            } else {
                proofHtml = `
                    <div class="flex flex-col items-center justify-center text-gray-300">
                        <i data-lucide="camera-off" class="w-4 h-4 text-gray-300"></i>
                        <span class="text-[8px] font-bold text-gray-400 mt-0.5 uppercase tracking-tighter">Belum Ada</span>
                    </div>`;
            }

            // Render status Badge
            const statusBadge = job.status
                ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 rounded-full border border-green-150 text-[9px] font-black text-green-600 uppercase tracking-widest">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Selesai
                   </span>`
                : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 rounded-full border border-orange-150 text-[9px] font-black text-orange-500 uppercase tracking-widest">
                    <span class="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping"></span> Pending
                   </span>`;

            rowsHtml += `
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-6 py-4 font-mono text-center text-xs text-gray-400 font-bold">${index + 1}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${statusBadge}</td>
                    <td class="px-6 py-4">
                        <span class="text-xs font-black text-gray-800 uppercase truncate max-w-[180px]" title="${job.cleanerName || 'Staff Lapangan'}">
                            ${job.cleanerName || 'Staff Lapangan'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-xs font-medium text-gray-700 leading-relaxed max-w-[450px] break-words" title="${job.description}">
                            ${job.description}
                        </p>
                    </td>
                    <td class="px-6 py-4 text-center">${proofHtml}</td>
                    <td class="px-6 py-4 text-xs font-semibold text-gray-400 font-mono">${dateStr}</td>
                </tr>
            `;
        });

        // HTML card structure of category section
        const categorySec = document.createElement('div');
        categorySec.className = "bg-white rounded-3xl border border-gray-100 shadow-xs overflow-hidden";
        categorySec.innerHTML = `
            <!-- HEADER -->
            <div class="px-8 py-4.5 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full ${allDone ? 'bg-green-500 animate-pulse' : 'bg-orange-400 animate-pulse'}"></div>
                    <h3 class="text-xs font-black text-[#075E3D] uppercase tracking-[0.2em]">${cat}</h3>
                    <span class="text-[9px] font-black text-gray-400 bg-white border border-gray-100 px-2.5 py-0.5 rounded-lg">${jobs.length} Tugas</span>
                    ${allDone ? `<span class="text-[9px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-tight">[ALL FINISHED]</span>` : ''}
                </div>
                <div>
                    ${syncButton}
                </div>
            </div>

            <!-- TABLE BODY -->
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                        <tr class="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-white">
                            <th class="px-6 py-3.5 w-12 text-center">No</th>
                            <th class="px-6 py-3.5 w-28">Status</th>
                            <th class="px-6 py-3.5 w-40">Petugas</th>
                            <th class="px-6 py-3.5">Deskripsi Pekerjaan</th>
                            <th class="px-6 py-3.5 w-24 text-center">Bukti Foto</th>
                            <th class="px-6 py-3.5 w-25">Tanggal</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50 bg-white">
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        `;

        container.appendChild(categorySec);

        // Auto Sync triggered once if all done
        if (allDone) {
            const todayStr = new Date().toLocaleDateString('en-CA');
            const syncKey = `sync_${cat}_${todayStr}`;
            if (!localStorage.getItem(syncKey)) {
                console.log(`Auto triggers Sync for ${cat}`);
                window.syncToDrive(cat, true);
            }
        }
    });

    if (window.lucide) lucide.createIcons();
}

// 4. SET STATUS FILTER (TABS)
window.setFilter = function(filter) {
    currentFilter = filter;
    
    const filters = ['all', 'pending', 'completed'];
    filters.forEach(f => {
        const btn = document.getElementById(`filter-${f}`);
        if (!btn) return;
        if (f === filter) {
            btn.className = "px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#075E3D] text-white shadow-sm";
        } else {
            btn.className = "px-4 py-2 rounded-xl text-xs font-bold transition-all text-gray-400 hover:text-gray-600 hover:bg-gray-50";
        }
    });

    applyFilters();
}

// 5. SYNC DRIVE & WHATSAPP WEBHOOK
window.syncToDrive = async function(category, isAuto = false) {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const syncKey = `sync_${category}_${todayStr}`;

    // Prevent double sync
    if (localStorage.getItem(syncKey) === "true") return;
    
    try {
        // Collect done tasks
        const jobsDone = [];
        let cleanerName = "Staff Lapangan";

        const categoryJobs = allJobs.filter(j => j.category === category);
        categoryJobs.forEach(job => {
            if (job.status) {
                jobsDone.push({
                    description: job.description,
                    photoUrl: job.photoUrl || null
                });
                if (job.cleanerName) {
                    cleanerName = job.cleanerName;
                }
            }
        });

        if (jobsDone.length === 0) return;

        // Visual loading trigger (if triggered manual)
        let btn;
        if (!isAuto && window.event) {
            btn = window.event.currentTarget;
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="animate-spin text-white"></i> Syncing...';
                if (window.lucide) lucide.createIcons();
            }
        }

        const gasWebhookUrl = "https://script.google.com/macros/s/AKfycbzDfkorxgCukFyWVMTRFtlD4rGsnOGYixXXwHgc_mdnTuLlXu3T8QCelH4TRAelEC88/exec"; 

        await fetch(gasWebhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                cleanerName,
                category,
                date: todayStr,
                jobsDone
            })
        });

        // Set key to local storage to persist sync status today
        localStorage.setItem(syncKey, "true");
        
        if (!isAuto) {
            alert(`Selesai! Laporan ${category} telah diupload ke Drive & dikirim ke WhatsApp.`);
            applyFilters();
        } else {
            console.log(`Auto-Sync Success for ${category}`);
        }

    } catch (error) {
        console.error("Sync Error:", error);
        if (!isAuto) alert("Gagal sinkron: " + error.message);
    }
}

// 7. LIGHTBOX CONTROLS
window.openLightbox = function(url) {
    const lightbox = document.getElementById('photo-lightbox');
    const image = document.getElementById('lightbox-img');
    if (!lightbox || !image) return;

    // Gunakan proxy weserv langsung agar bypass blokir provider internet di Indonesia dan load instan!
    let targetUrl = url;
    if (url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('images.weserv.nl')) {
        targetUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
    }

    image.src = targetUrl;
    image.onerror = function() {
        if (targetUrl !== url) {
            image.src = url; // Fallback ke link asli jika proxy bermasalah
        }
    };
    lightbox.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

window.closeLightbox = function() {
    const lightbox = document.getElementById('photo-lightbox');
    if (lightbox) lightbox.classList.add('hidden');
}

// 8. BOOTSTRAP
document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    await populateUsers();
    await loadMonitoringJobs();
});
