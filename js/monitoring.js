import { db } from './firebase-config.js';
import { loadComponents } from './components.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Load Data User untuk Filter
async function populateUsers() {
    const select = document.getElementById('filter-user');
    if (!select) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        // Sisakan "Semua Petugas"
        select.innerHTML = '<option value="all">Semua Petugas</option>';
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const isAdmin = data.role === 'admin' || (data.email && data.email.includes('admin@'));
            if (!isAdmin) {
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.textContent = data.name;
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Gagal load user filter:", error);
    }
}

async function loadMonitoringData() {
    const mainContainer = document.getElementById("monitoring-container");
    const emptyState = document.getElementById("monitoring-empty");
    const userFilter = document.getElementById("filter-user").value;
    const categoryFilter = document.getElementById("filter-category").value;
    
    if (!mainContainer) return;

    try {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        
        // 1. Ambil Master Tugas
        let qJobs = query(collection(db, "jobdesk"), orderBy("createdAt", "desc"));
        const jobSnapshot = await getDocs(qJobs);
        
        if (jobSnapshot.empty) {
            mainContainer.innerHTML = "";
            emptyState.classList.remove('hidden');
            return;
        }

        // 2. Ambil Laporan hari ini saja untuk status monitoring
        const reportsRef = collection(db, "reports");
        const qReports = query(reportsRef, where("assignedDate", "==", today));
        const reportSnapshot = await getDocs(qReports);
        
        const todayReports = {};
        reportSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Simpan laporan terbaru per jobId jika ada duplikat (asumsi 1 per hari)
            todayReports[data.jobId] = data;
        });

        // 3. Filter & Gabungkan Data
        let filteredJobs = [];
        jobSnapshot.forEach(docSnap => {
            const jobData = docSnap.data();
            const report = todayReports[docSnap.id];
            
            const matchUser = (userFilter === "all" || jobData.cleanerId === userFilter);
            const matchCat = (categoryFilter === "all" || jobData.category === categoryFilter);
            
            if (matchUser && matchCat) {
                // Gunakan data dari report jika ada (untuk foto & status hari ini)
                filteredJobs.push({
                    id: docSnap.id,
                    ...jobData,
                    status: !!report,
                    photoUrl: report ? (report.photoUrl || report.imageUrl) : null,
                    description: report ? report.description : jobData.description,
                    assignedDate: report ? report.assignedDate : today
                });
            }
        });

        mainContainer.innerHTML = "";

        if (filteredJobs.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        } else {
            emptyState.classList.add('hidden');
        }

        const categories = ["Harian Pagi", "Harian Siang", "Harian Sore", "Mingguan", "Bulanan", "Weekend"];
        const groupedData = {};
        categories.forEach(cat => groupedData[cat] = []);

        filteredJobs.forEach(job => {
            // Cek apakah kategori ada di daftar, atau mengandung kata kunci kategori
            const foundCat = categories.find(c => c === job.category || (job.category && c.toLowerCase().includes(job.category.toLowerCase())));
            if (foundCat) {
                groupedData[foundCat].push(job);
            } else if (job.category) {
                // Jika ada kategori lain yang belum terdaftar
                if (!groupedData[job.category]) groupedData[job.category] = [];
                groupedData[job.category].push(job);
                if (!categories.includes(job.category)) categories.push(job.category);
            }
        });

        categories.forEach(cat => {
            const jobs = groupedData[cat];
            if (jobs.length > 0) {
                // Tambahkan pengecekan otomatis: Jika SEMUA SELESAI
                const allDone = jobs.every(j => j.status === true);
                const completeBadge = allDone 
                    ? `<button onclick="syncToDrive('${cat}')" class="ml-auto px-3 py-1 bg-blue-600 text-[9px] font-black text-white rounded-full uppercase tracking-tighter hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-sm">
                        <i data-lucide="share-2" class="w-3 h-3"></i> Sync Drive & WA
                       </button>` 
                    : '';

                const section = document.createElement('div');
                section.className = 'category-section mb-12';
                section.id = `category-${cat.replace(/\s+/g, '-')}`;
                section.innerHTML = `
                    <div class="flex items-center gap-4 mb-6">
                        <div class="h-px flex-1 bg-gray-100"></div>
                        <h2 class="text-xs font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                             <span class="w-2 h-2 rounded-full ${allDone ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}"></span> ${cat}
                             ${allDone ? '<span class="ml-2 text-blue-500 font-bold">[ALL DONE]</span>' : ''}
                        </h2>
                        ${completeBadge}
                        <div class="h-px flex-1 bg-gray-100"></div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        ${jobs.map(job => renderJobCard(job)).join('')}
                    </div>
                `;
                mainContainer.appendChild(section);
                
                // OTOMATIS: Jika semua selesai dan belum pernah di-sync hari ini
                if (allDone) {
                    const syncKey = `sync_${cat}_${today}`;
                    if (!localStorage.getItem(syncKey)) {
                        console.log(`Automatic Sync Triggered for ${cat}`);
                        // Panggil sync secara background tanpa interupsi
                        window.syncToDrive(cat, true); 
                    }
                }
            }
        });

        if (window.lucide) lucide.createIcons();

    } catch (e) {
        console.error("Error monitoring:", e);
    }
}

// FUNGSI SYNC DRIVE & WA
window.syncToDrive = async function(category, isAuto = false) {
    const today = new Date().toLocaleDateString('en-CA');
    const syncKey = `sync_${category}_${today}`;

    // Mencegah double sync
    if (localStorage.getItem(syncKey) === "true") return;
    
    try {
        const qJobs = query(collection(db, "jobdesk"), where("category", "==", category));
        const jobSnap = await getDocs(qJobs);
        const reportsRef = collection(db, "reports");
        const qReports = query(reportsRef, where("assignedDate", "==", today), where("category", "==", category));
        const reportSnap = await getDocs(qReports);
        
        const reportsMap = {};
        reportSnap.forEach(d => reportsMap[d.data().jobId] = d.data());
        
        const jobsDone = [];
        let cleanerName = "Staff Lapangan";
        
        jobSnap.forEach(d => {
            const report = reportsMap[d.id];
            if (report) {
                jobsDone.push({
                    description: d.data().description,
                    photoUrl: report.photoUrl || report.imageUrl
                });
                cleanerName = report.cleanerName || cleanerName;
            }
        });

        if (jobsDone.length === 0) return;

        // Visual Feedback (jika manual)
        let btn;
        if (!isAuto) {
            btn = event.currentTarget;
            btn.disabled = true;
            btn.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> Syncing...';
            if (window.lucide) lucide.createIcons();
        }

        const gasWebhookUrl = "https://script.google.com/macros/s/AKfycbzDfkorxgCukFyWVMTRFtlD4rGsnOGYixXXwHgc_mdnTuLlXu3T8QCelH4TRAelEC88/exec"; 

        const response = await fetch(gasWebhookUrl, {
            method: 'POST',
            mode: 'no-cors', // Penting untuk GAS
            body: JSON.stringify({
                cleanerName,
                category,
                date: today,
                jobsDone
            })
        });

        // Karena mode no-cors, kita tidak bisa baca response body, 
        // tapi kita asumsikan berhasil jika tidak lempar error fetch.
        localStorage.setItem(syncKey, "true");
        
        if (!isAuto) {
            alert(`Selesai! Laporan ${category} telah diupload ke Drive & dikirim ke WhatsApp.`);
            location.reload(); // Refresh untuk update badge
        } else {
            console.log(`Auto-Sync Success for ${category}`);
        }

    } catch (error) {
        console.error("Sync Error:", error);
        if (!isAuto) alert("Gagal sinkron: " + error.message);
    }
}

function renderJobCard(data) {
    const today = new Date().toLocaleDateString('en-CA'); // format: YYYY-MM-DD
    const isDaily = data.category && data.category.includes("Harian");
    
    // Fallback data
    let displayStatus = data.status || false;
    let displayPhoto = data.photoUrl || data.imageUrl; 
    
    // TAHAP 1: Validasi URL Gambar
    // Jika upload dari HP salah (mengirim path lokal seperti /data/user/0/...), kita abaikan
    if (displayPhoto && !displayPhoto.includes('http')) {
        displayPhoto = null;
    }

    // TAHAP 2: Logika Reset Tampilan (Hanya untuk Dashboard Monitoring)
    // Jika ini tugas Harian, tapi 'assignedDate' di database bukan Hari Ini, 
    // kita anggap petugas BELUM mengerjakan tugas UNTUK HARI INI.
    if (isDaily && data.assignedDate && data.assignedDate !== today && !data.status) {
        displayStatus = false;
        displayPhoto = null;
    }

    // Tanggal Tampilan
    const dateStr = data.assignedDate || (data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString('id-ID') : '-');
    
    const statusLabel = displayStatus ? 'SELESAI' : 'PENDING';
    const statusColor = displayStatus ? 'text-green-600 bg-green-50 border-green-100' : 'text-orange-500 bg-orange-50 border-orange-100';
    const statusIcon = displayStatus ? 'check-circle' : 'clock';

    // Gunakan Image Proxy (weserv) untuk memastikan gambar tampil melewati blokir ISP / referer
    const safePhotoUrl = displayPhoto ? `https://images.weserv.nl/?url=${encodeURIComponent(displayPhoto)}` : null;

    return `
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 group">
            <div class="h-48 bg-gray-50 relative overflow-hidden flex items-center justify-center">
                ${displayPhoto 
                    ? `<img src="${safePhotoUrl}" 
                         class="w-full h-full object-cover cursor-pointer transition-transform duration-700 group-hover:scale-110" 
                         onclick="openPhoto('${displayPhoto}')" 
                         referrerpolicy="no-referrer"
                         onerror="this.onerror=null; this.src='https://placehold.co/400x300?text=Gambar+Gagal+Dimuat+(Cek+ISP)'">` 
                    : `<div class="flex flex-col items-center gap-3 text-gray-200">
                        <i data-lucide="camera-off" class="w-12 h-12"></i>
                        <span class="text-[9px] font-black uppercase tracking-[0.2em] text-center px-8 leading-loose">
                            ${isDaily && data.assignedDate !== today ? 'BELUM ADA<br>LAPORAN HARI INI' : 'MENUNGGU BUKTI FOTO'}
                        </span>
                       </div>`
                }
                
                <div class="absolute top-4 left-4">
                    <span class="flex items-center gap-1.5 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[9px] font-black ${statusColor} border shadow-sm tracking-widest">
                        <i data-lucide="${statusIcon}" class="w-3 h-3"></i> ${statusLabel}
                    </span>
                </div>
                
                ${isDaily ? `
                <div class="absolute bottom-4 right-4">
                    <span class="px-2 py-1 bg-black/20 backdrop-blur-sm rounded-md text-[8px] font-bold text-white uppercase tracking-tighter">
                        DAILY TASK
                    </span>
                </div>` : ''}
            </div>

            <div class="p-6">
                <div class="flex items-center gap-3 mb-5">
                    <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center text-green-700 shadow-inner">
                        <i data-lucide="user" class="w-5 h-5"></i>
                    </div>
                    <div class="min-w-0 font-bold">
                        <h4 class="text-sm font-black text-gray-900 truncate tracking-tight">${data.cleanerName || 'Staff Lapangan'}</h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">${dateStr}</span>
                            <span class="w-1 h-1 rounded-full bg-gray-200"></span>
                            <span class="text-[9px] font-bold text-green-500 uppercase tracking-widest">${data.category || 'REGULER'}</span>
                        </div>
                    </div>
                </div>

                <div class="relative mb-5">
                    <div class="absolute left-0 top-0 w-1 h-full bg-green-50 rounded-full"></div>
                    <p class="text-xs text-gray-500 leading-relaxed italic pl-4 line-clamp-2">
                        "${data.description || 'Pekerjaan rutin sesuai SOP...'}"
                    </p>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-gray-100">
                    <div class="flex gap-2">
                        <button onclick="openPhoto('${displayPhoto}')" class="${displayPhoto ? 'flex' : 'hidden'} items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full text-[9px] font-black uppercase tracking-[0.1em] hover:bg-green-600 transition-all shadow-md">
                            <i data-lucide="external-link" class="w-3 h-3"></i> Lihat
                        </button>
                        ${displayPhoto ? `
                        <a href="${displayPhoto}" target="_blank" class="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-400 rounded-full text-[9px] font-black uppercase tracking-[0.1em] hover:bg-gray-50 transition-all">
                            <i data-lucide="link" class="w-3 h-3"></i> Link
                        </a>` : ''}
                    </div>
                    
                    ${!displayPhoto ? `
                        <div class="flex items-center gap-2 text-orange-400">
                            <span class="relative flex h-2 w-2">
                              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <span class="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                            </span>
                            <span class="text-[9px] font-black uppercase tracking-widest">Waiting</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// HELPER DOWNLOAD FOTO
window.downloadImage = async function(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${filename}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
        console.error("Gagal download:", e);
        // Fallback jika fetch gagal (biasanya CORS)
        window.open(url, '_blank');
    }
}

window.openPhoto = (url) => {
    const modal = document.getElementById('photo-modal');
    const img = document.getElementById('modal-img');
    img.src = url;
    modal.classList.remove('hidden');
}

window.loadMonitoringData = loadMonitoringData;

document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    populateUsers();
    loadMonitoringData();
});
