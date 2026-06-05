import { db } from './firebase-config.js';
import { loadComponents } from './components.js';
import { 
    collection, 
    getDocs, 
    addDoc, 
    query, 
    orderBy, 
    serverTimestamp,
    deleteDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Store preloaded jobs for fast edit access
let allRecentJobs = [];

function cleanName(name) {
    if (!name) return "";
    let cleaned = name.trim();
    cleaned = cleaned.replace(/^(PK|MR|MS|CS|Admin)\s+/i, "");
    return cleaned;
}

// Load Data Petugas ke Select
async function populateCleaners() {
    const select = document.getElementById('select-cleaner');
    const editSelect = document.getElementById('edit-select-cleaner');
    if (!select) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        select.innerHTML = '<option value="">-- Pilih Petugas Cleaning Service --</option>';
        if (editSelect) {
            editSelect.innerHTML = '<option value="">-- Pilih Petugas Cleaning Service --</option>';
        }
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Kecualikan admin jika ada role admin
            const isAdmin = data.role === 'admin' || (data.email && data.email.includes('admin@'));
            
            if (!isAdmin) {
                // Populate main select
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.dataset.name = cleanName(data.name);
                option.textContent = cleanName(data.name);
                select.appendChild(option);

                // Populate edit select
                if (editSelect) {
                    const editOption = document.createElement('option');
                    editOption.value = docSnap.id;
                    editOption.dataset.name = cleanName(data.name);
                    editOption.textContent = cleanName(data.name);
                    editSelect.appendChild(editOption);
                }
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
        // Ambil semua data agar tidak terpotong saat difilter per petugas di sisi Client
        const q = query(collection(db, "jobdesk"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        container.innerHTML = "";
        
        allRecentJobs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Filter di sisi Client agar aman dari error index Firestore
            if (userFilter === "all" || data.cleanerId === userFilter) {
                allRecentJobs.push({ id: docSnap.id, ...data });
            }
        });

        if (allRecentJobs.length === 0 && userFilter === "all") {
            container.innerHTML = `
                <div class="bg-white p-20 rounded-[2.5rem] border border-gray-100 text-center shadow-sm">
                    <p class="text-gray-400 italic">Tidak ada histori tugas ditemukan untuk pilihan ini.</p>
                </div>`;
            return;
        }

        if (userFilter === "all") {
            // TAMPILAN TABEL BIASA (SEMUA PETUGAS)
            renderSimpleTable(allRecentJobs, container);
        } else {
            // TAMPILAN GRUP PER KATEGORI (UNTUK 1 PETUGAS)
            renderGroupedByOwner(allRecentJobs, container);
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
                <td class="px-8 py-4 text-sm font-bold text-gray-900">${cleanName(data.cleanerName)}</td>
                <td class="px-8 py-4"><span class="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase">${data.category}</span></td>
                <td class="px-8 py-4 text-xs text-gray-500 truncate max-w-xs">${data.description}</td>
                <td class="px-8 py-4"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full ${data.status ? 'bg-green-500' : 'bg-green-400'}"></div><span class="text-[10px] font-bold text-gray-400">${data.status ? 'Selesai' : 'Aktif'}</span></div></td>
                <td class="px-8 py-4 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button onclick="editJob('${data.id}')" class="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-all" title="Edit Tugas">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button onclick="deleteJob('${data.id}')" class="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-all" title="Hapus Tugas">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    });

    container.innerHTML = `
        <div class="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-left min-w-[750px]">
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
            </div>
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
        const groupDiv = document.createElement('div');
        groupDiv.className = "bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mb-6";
        
        let items = "";
        if (jobs.length > 0) {
            items = jobs.map(j => `
                <div class="flex items-start justify-between py-4 ${jobs.indexOf(j) !== jobs.length-1 ? 'border-b border-gray-50' : ''}">
                    <div class="flex-1 pr-4">
                        <p class="text-xs text-gray-650 leading-relaxed">${j.description}</p>
                        <div class="flex items-center gap-2 mt-2">
                            <span class="text-[9px] font-bold ${j.status ? 'text-green-500' : 'text-orange-400'} uppercase tracking-tight">
                                ${j.status ? 'Selesai' : 'Sedang Berjalan'}
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="editJob('${j.id}')" class="p-1 px-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors" title="Edit Tugas">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button onclick="deleteJob('${j.id}')" class="p-1 px-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors" title="Hapus Tugas">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            items = `
                <div class="py-6 text-center">
                    <p class="text-xs text-gray-400 italic">Belum ada tugas di kategori ini.</p>
                </div>`;
        }

        groupDiv.innerHTML = `
            <div class="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                <h4 class="text-[10px] font-black text-[#075E3D] uppercase tracking-[0.2em]">${cat}</h4>
                <span class="text-[9px] font-bold text-gray-300 px-2 py-0.5 border border-gray-100 rounded-lg">${jobs.length} Tugas</span>
            </div>
            <div class="divide-y divide-gray-50">${items}</div>
        `;
        container.appendChild(groupDiv);
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

// Open Edit Modal
window.editJob = async function(id) {
    const editModal = document.getElementById('edit-job-modal');
    if (!editModal) return;

    try {
        // Find the job in our preloaded array for instant response
        const job = allRecentJobs.find(j => j.id === id);
        if (!job) {
            alert("Data tugas tidak ditemukan!");
            return;
        }

        // Set inputs
        document.getElementById('edit-job-id').value = id;
        document.getElementById('edit-select-cleaner').value = job.cleanerId;
        document.getElementById('edit-select-category').value = job.category;
        document.getElementById('edit-task-description').value = job.description;

        // Open modal
        editModal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Gagal membuka edit modal:", error);
    }
}

// Close Edit Modal
window.closeEditModal = function() {
    const editModal = document.getElementById('edit-job-modal');
    if (editModal) editModal.classList.add('hidden');
}

// Update Job
window.updateJob = async function() {
    const jobId = document.getElementById('edit-job-id').value;
    const cleanerSelect = document.getElementById('edit-select-cleaner');
    const category = document.getElementById('edit-select-category').value;
    const description = document.getElementById('edit-task-description').value;

    if (!jobId || !cleanerSelect.value || !category || !description) {
        alert("Harap lengkapi semua data pekerjaan!");
        return;
    }

    const cleanerId = cleanerSelect.value;
    const cleanerName = cleanerSelect.options[cleanerSelect.selectedIndex].dataset.name;

    try {
        const jobRef = doc(db, "jobdesk", jobId);
        await updateDoc(jobRef, {
            cleanerId: cleanerId,
            cleanerName: cleanerName,
            category: category,
            description: description
        });

        alert("Tugas berhasil diperbarui!");
        closeEditModal();
        loadRecentJobs();
    } catch (error) {
        console.error("Gagal memperbarui tugas:", error);
        alert("Gagal memperbarui tugas: " + error.message);
    }
}

// Inisialisasi
document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    populateCleaners();
    populateUserFilter();
    loadRecentJobs();
});
