import { db } from './firebase-config.js';
import { loadComponents } from './components.js';
import { 
    collection, 
    getDocs, 
    addDoc, 
    query, 
    orderBy, 
    limit, 
    serverTimestamp,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Load Data Petugas ke Select
async function populateCleaners() {
    const select = document.getElementById('select-cleaner');
    if (!select) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="">-- Pilih Petugas Cleaning Service --</option>';
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Kecualikan admin jika ada role admin
            const isAdmin = data.role === 'admin' || (data.email && data.email.includes('admin@'));
            
            if (!isAdmin) {
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.dataset.name = data.name;
                option.textContent = data.name;
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Gagal load petugas:", error);
    }
}

// Tambah Pekerjaan Baru
window.submitJob = async function() {
    const cleanerSelect = document.getElementById('select-cleaner');
    const category = document.getElementById('select-category').value;
    const description = document.getElementById('task-description').value;

    if (!cleanerSelect.value || !category || !description) {
        alert("Harap lengkapi semua data pekerjaan!");
        return;
    }

    const cleanerId = cleanerSelect.value;
    const cleanerName = cleanerSelect.options[cleanerSelect.selectedIndex].dataset.name;

    try {
        await addDoc(collection(db, "jobdesk"), {
            cleanerId: cleanerId,
            cleanerName: cleanerName,
            category: category,
            description: description,
            status: false, // Default belum selesai
            photoUrl: null, // Akan diisi dari mobile nanti
            createdAt: serverTimestamp(),
            assignedDate: new Date().toISOString().split('T')[0] // Tanggal hari ini YYYY-MM-DD
        });

        alert("Tugas berhasil dikirim ke Petugas!");
        resetForm();
        loadRecentJobs();
    } catch (error) {
        console.error("Gagal mengirim tugas:", error);
        alert("Gagal mengirim tugas: " + error.message);
    }
}

// Load Data Petugas ke Filter Jobs
async function populateUserFilter() {
    const select = document.getElementById('filter-user-jobs');
    if (!select) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="all">Semua Petugas (Terbaru)</option>';
        
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
        console.error("Gagal load filter user:", error);
    }
}

// Load Tugas (Dengan Logika Grouping per Kategori jika difilter)
window.loadRecentJobs = async function() {
    const container = document.getElementById('jobs-list-container');
    const userFilter = document.getElementById('filter-user-jobs').value;
    if (!container) return;

    // Bersihkan layar dulu agar ada feedback visual
    container.innerHTML = `<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[#075E3D]"></div></div>`;

    try {
        // Ambil data terbaru (Query sederhana agar tidak butuh index rumit)
        const q = query(collection(db, "jobdesk"), orderBy("createdAt", "desc"), limit(50));
        const snapshot = await getDocs(q);
        
        container.innerHTML = "";
        
        let allDocs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Filter di sisi Client agar aman dari error index Firestore
            if (userFilter === "all" || data.cleanerId === userFilter) {
                allDocs.push({ id: docSnap.id, ...data });
            }
        });

        if (allDocs.length === 0) {
            container.innerHTML = `
                <div class="bg-white p-20 rounded-[2.5rem] border border-gray-100 text-center shadow-sm">
                    <p class="text-gray-400 italic">Tidak ada histori tugas ditemukan untuk pilihan ini.</p>
                </div>`;
            return;
        }

        if (userFilter === "all") {
            // TAMPILAN TABEL BIASA (SEMUA PETUGAS)
            renderSimpleTable(allDocs, container);
        } else {
            // TAMPILAN GRUP PER KATEGORI (UNTUK 1 PETUGAS)
            renderGroupedByOwner(allDocs, container);
        }

        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Gagal load jobs:", error);
        container.innerHTML = `<p class="text-red-500 p-10 text-center">Terjadi kesalahan saat memuat data: ${error.message}</p>`;
    }
}

// Pembantu: Render Tabel Sederhana (Menerima Array, bukan snapshot)
function renderSimpleTable(docs, container) {
    let rows = "";
    docs.forEach(data => {
        rows += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-8 py-4 text-sm font-bold text-gray-900">${data.cleanerName}</td>
                <td class="px-8 py-4"><span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase">${data.category}</span></td>
                <td class="px-8 py-4 text-xs text-gray-500 truncate max-w-xs">${data.description}</td>
                <td class="px-8 py-4"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full ${data.status ? 'bg-green-500' : 'bg-orange-400'}"></div><span class="text-[10px] font-bold text-gray-400">${data.status ? 'Selesai' : 'Pending'}</span></div></td>
                <td class="px-8 py-4 text-center"><button onclick="deleteJob('${data.id}')" class="p-2 text-gray-300 hover:text-red-500 transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            </tr>`;
    });

    container.innerHTML = `
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <table class="w-full text-left">
                <thead class="bg-gray-50 border-b border-gray-100">
                    <tr>
                        <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Petugas</th>
                        <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kategori</th>
                        <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tugas</th>
                        <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">${rows}</tbody>
            </table>
        </div>`;
}

// Pembantu: Render Grup Kategori (Menerima Array)
function renderGroupedByOwner(docs, container) {
    const categories = ["Harian Pagi", "Harian Siang", "Harian Sore", "Mingguan", "Bulanan", "Weekend"];
    const groups = {};
    categories.forEach(c => groups[c] = []);
    
    docs.forEach(data => {
        if (groups[data.category]) groups[data.category].push(data);
    });

    categories.forEach(cat => {
        const jobs = groups[cat];
        if (jobs.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = "bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mb-6";
            
            let items = jobs.map(j => `
                <div class="flex items-start justify-between py-4 ${jobs.indexOf(j) !== jobs.length-1 ? 'border-b border-gray-50' : ''}">
                    <div class="flex-1 pr-4">
                        <p class="text-xs text-gray-600 leading-relaxed">${j.description}</p>
                        <div class="flex items-center gap-2 mt-2">
                            <span class="text-[9px] font-bold ${j.status ? 'text-green-500' : 'text-orange-400'} uppercase tracking-tight">
                                ${j.status ? 'Selesai' : 'Sedang Berjalan'}
                            </span>
                        </div>
                    </div>
                    <button onclick="deleteJob('${j.id}')" class="p-2 text-gray-300 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `).join('');

            groupDiv.innerHTML = `
                <div class="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                    <h4 class="text-[10px] font-black text-[#075E3D] uppercase tracking-[0.2em]">${cat}</h4>
                    <span class="text-[9px] font-bold text-gray-300 px-2 py-0.5 border border-gray-100 rounded-lg">${jobs.length} Tugas</span>
                </div>
                <div class="divide-y divide-gray-50">${items}</div>
            `;
            container.appendChild(groupDiv);
        }
    });
}

// Hapus Job
window.deleteJob = async function(id) {
    if (!confirm("Yakin ingin menghapus tugas ini?")) return;
    try {
        await deleteDoc(doc(db, "jobdesk", id));
        loadRecentJobs();
    } catch (e) {
        alert("Gagal menghapus");
    }
}

// Reset Form
window.resetForm = function() {
    document.getElementById('select-cleaner').value = "";
    document.getElementById('task-description').value = "";
}

// Inisialisasi
document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    populateCleaners();
    populateUserFilter();
    loadRecentJobs();
});
