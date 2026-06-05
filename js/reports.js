import { db } from './firebase-config.js';
import { loadComponents } from './components.js';
import { 
    collection, 
    getDocs, 
    query, 
    orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global array untuk menyimpan data yang sedang difilter
let currentData = [];

// HELPER UNTUK MENGURUTKAN LAPORAN BERDASARKAN KATEGORI & TANGGAL
function sortReports(data) {
    const bucketMapping = {
        "Harian Pagi": 1,
        "Harian Siang": 1,
        "Harian Sore": 1,
        "Mingguan": 2,
        "Weekend": 3,
        "Bulanan": 4
    };
    
    const harianOrder = {
        "Harian Pagi": 1,
        "Harian Siang": 2,
        "Harian Sore": 3
    };
    
    return [...data].sort((a, b) => {
        const catA = a.category || "";
        const catB = b.category || "";
        
        const bucketA = bucketMapping[catA] || 99;
        const bucketB = bucketMapping[catB] || 99;
        
        // 1. Urutkan berdasarkan Bucket terlebih dahulu
        if (bucketA !== bucketB) {
            return bucketA - bucketB;
        }
        
        // 2. Jika berada di bucket yang sama:
        if (bucketA === 1) {
            // Bucket 1: Laporan Harian (Pagi, Siang, Sore)
            // Urutkan berdasarkan tanggal terlebih dahulu (dari terlama ke terbaru)
            const dateA = a.assignedDate || "";
            const dateB = b.assignedDate || "";
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);
            }
            // Jika tanggal sama, urutkan berdasarkan sub-kategori: Pagi -> Siang -> Sore
            const orderA = harianOrder[catA] || 99;
            const orderB = harianOrder[catB] || 99;
            return orderA - orderB;
        } else {
            // Untuk bucket lainnya (Mingguan, Weekend, Bulanan, dll):
            // Urutkan secara kronologis (dari terlama ke terbaru) berdasarkan tanggal
            const dateA = a.assignedDate || "";
            const dateB = b.assignedDate || "";
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);
            }
            return catA.localeCompare(catB);
        }
    });
}

// HELPER UNTUK MENGHAPUS INISIAL PETUGAS (PK, MR, MS dll)
function cleanName(name) {
    if (!name) return "";
    let cleaned = name.trim();
    cleaned = cleaned.replace(/^(PK|MR|MS|CS|Admin)\s+/i, "");
    return cleaned;
}

// FORMAT TANGGAL INDONESIA (E.g., 05 Juni 2026)
function formatIndonesianDate(dateStr) {
    if (!dateStr) return "-";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const monthIndex = parseInt(parts[1]) - 1;
    const day = parts[2];
    
    const indonesianMonths = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    
    if (monthIndex < 0 || monthIndex > 11) return dateStr;
    return `${day} ${indonesianMonths[monthIndex]} ${year}`;
}

// Load Daftar User untuk Dropdown
async function populateUserFilter() {
    const select = document.getElementById('report-user');
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
    } catch (e) { console.error("Gagal load user filter:", e); }
}

async function loadReportData() {
    const tableBody = document.getElementById("report-table-body");
    const evidenceList = document.getElementById("print-evidence-list");
    const emptyState = document.getElementById("report-empty");
    const userIdInput = document.getElementById("report-user");
    const categoryIdInput = document.getElementById("report-category");
    const startDateInput = document.getElementById("report-start-date");
    const endDateInput = document.getElementById("report-end-date");
    const printPeriod = document.getElementById("print-period");
    const limitInput = document.getElementById("report-limit");
    const entriesShownLabel = document.getElementById("entries-shown");
    const entriesTotalLabel = document.getElementById("entries-total");

    if (!tableBody || !userIdInput || !categoryIdInput || !startDateInput || !endDateInput) return;

    const userId = userIdInput.value;
    const categoryId = categoryIdInput.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const limitVal = limitInput ? limitInput.value : "25";

    if (printPeriod) {
        printPeriod.innerText = `PERIODE: ${startDate ? formatIndonesianDate(startDate) : 'Awal'} s/d ${endDate ? formatIndonesianDate(endDate) : 'Terkini'} (${categoryId === 'all' ? 'Semua Kategori' : categoryId})`;
    }

    tableBody.innerHTML = `<tr class="no-print"><td colspan="6" class="p-10 text-center"><div class="flex justify-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div></td></tr>`;
    evidenceList.innerHTML = "";
    currentData = [];

    try {
        const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        tableBody.innerHTML = "";
        
        const filteredDocs = [];
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const jobDate = data.assignedDate; 
            if (!jobDate) return;

            const matchUser = (userId === "all" || data.cleanerId === userId);
            const matchCat = (categoryId === "all" || data.category === categoryId);
            const matchStart = (!startDate || jobDate >= startDate);
            const matchEnd = (!endDate || jobDate <= endDate);

            if (matchUser && matchCat && matchStart && matchEnd) {
                const id = docSnap.id;
                const formattedDatePreview = formatIndonesianDate(jobDate);
                
                // Mendukung foto tunggal (lama) atau multiple (baru)
                let photos = data.photoUrls || [];
                if (photos.length === 0 && (data.photoUrl || data.imageUrl)) {
                    photos = [data.photoUrl || data.imageUrl];
                }

                const cleanedCleanerName = cleanName(data.cleanerName);
                const item = { id, formattedDate: formattedDatePreview, photos, ...data, cleanerName: cleanedCleanerName };
                filteredDocs.push(item);
            }
        });

        const totalCount = filteredDocs.length;
        
        // Limit slicing
        let displayedDocs = [...filteredDocs];
        if (limitVal !== "all") {
            const limitNum = parseInt(limitVal, 10);
            if (!isNaN(limitNum)) {
                displayedDocs = filteredDocs.slice(0, limitNum);
            }
        }
        
        currentData = filteredDocs;

        if (entriesShownLabel) entriesShownLabel.innerText = displayedDocs.length;
        if (entriesTotalLabel) entriesTotalLabel.innerText = totalCount;

        displayedDocs.forEach(item => {
            const formattedDatePreview = item.formattedDate;
            const cleanedCleanerName = item.cleanerName;
            const photos = item.photos || [];
            
            const hasPhotos = photos.length > 0;
            const firstPhoto = hasPhotos ? photos[0] : null;
            const isValidPhoto = firstPhoto && firstPhoto.startsWith('http');
            
            // Gunakan proxy weserv untuk tampilan preview di tabel (CORS friendly)
            const safePhotoUrl = isValidPhoto ? `https://images.weserv.nl/?url=${encodeURIComponent(firstPhoto)}` : null;
            
            const cleanDate = formattedDatePreview.replace(/[^a-zA-Z0-9]/g, '_');
            const cleanCat = (item.category || 'Umum').replace(/[^a-z0-9]/gi, '_');
            const cleanDesc = (item.description || 'Pekerjaan').replace(/[^a-z0-9]/gi, '_');
            const cleanNameStr = cleanedCleanerName.replace(/[^a-z0-9]/gi, '_');
            // Format: TANGGAL__KATEGORI__DESKRIPSI__PETUGAS
            const downloadName = `${cleanDate}__${cleanCat}__${cleanDesc}__${cleanNameStr}`;
            
            tableBody.innerHTML += `
                <tr class="hover:bg-gray-50 transition-all font-medium text-gray-700">
                    <td class="px-8 py-4 text-xs font-mono">${formattedDatePreview}</td>
                    <td class="px-8 py-4 text-sm font-bold text-gray-900">${cleanedCleanerName}</td>
                    <td class="px-8 py-4"><span class="text-[10px] bg-green-50 text-green-600 px-3 py-1 rounded-full uppercase font-black tracking-wider">${item.category}</span></td>
                    <td class="px-8 py-4 text-xs max-w-xs truncate leading-relaxed text-gray-500">${item.description || '-'}</td>
                    <td class="px-8 py-4">
                        <span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${item.status ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-400'}">
                            ${item.status ? 'SELESAI' : 'PENDING'}
                        </span>
                    </td>
                    <td class="px-8 py-4 text-center">
                        ${hasPhotos 
                            ? `<div class="flex items-center justify-center gap-2 text-green-500">
                                 <div class="relative cursor-pointer hover:scale-110 transition-transform text-[#075E3D]" onclick="openLightbox('${firstPhoto}')" title="Lihat Foto">
                                     <i data-lucide="image" class="w-4 h-4"></i>
                                     ${photos.length > 1 ? `<span class="absolute -top-2 -right-2 bg-green-600 text-white text-[8px] px-1 rounded-full pointer-events-none">${photos.length}</span>` : ''}
                                 </div>
                                 <button onclick="downloadReportImage('${firstPhoto}', '${downloadName}')" class="p-1 hover:bg-green-100 rounded no-print text-[#075E3D]" title="Download Foto Pertama"><i data-lucide="download" class="w-3.5 h-3.5"></i></button>
                               </div>` 
                            : '<i data-lucide="x" class="w-4 h-4 mx-auto text-gray-300"></i>'}
                    </td>
                </tr>`;

            // Render Evidence Image (Bisa banyak)
            let photoHtml = '';
            if (hasPhotos) {
                photos.forEach(p => {
                    const sP = `https://images.weserv.nl/?url=${encodeURIComponent(p)}`;
                    photoHtml += `<img src="${sP}" class="w-full max-h-[400px] object-cover rounded-xl border border-gray-100 mb-2" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none';">`;
                });
            } else {
                photoHtml = '<div class="p-10 bg-gray-50 rounded-xl text-center text-xs text-gray-400 font-bold border-2 border-dashed border-gray-200">FOTO TIDAK TERLAMPIR / INVALID</div>';
            }

            evidenceList.innerHTML += `
                <div class="report-card p-6 border border-gray-200 rounded-2xl bg-white mb-6">
                    <div class="flex justify-between items-center mb-4 border-b pb-3">
                        <div><h4 class="text-sm font-black text-gray-900">${cleanedCleanerName}</h4><p class="text-[10px] font-bold text-gray-400 uppercase">${item.category} | ${formattedDatePreview}</p></div>
                    </div>
                    <p class="text-xs text-gray-600 italic mb-4">"${item.description || 'Pekerjaan selesai...'}"</p>
                    ${photoHtml}
                </div>`;
        });

        if (currentData.length === 0) emptyState.classList.remove('hidden');
        else emptyState.classList.add('hidden');

        if (window.lucide) lucide.createIcons();
    } catch (e) { console.error("Error loading report:", e); }
}

// FUNGSI CEPAT UNTUK SET RANGE TANGGAL
window.setQuickDateRange = function(days) {
    const today = new Date();
    const startDate = new Date();
    
    if (days === 1) {
        // Hari ini saja
    } else {
        startDate.setDate(today.getDate() - (days - 1));
    }
    
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    
    if (startInput) startInput.value = startDate.toISOString().split('T')[0];
    if (endInput) endInput.value = today.toISOString().split('T')[0];
    
    loadReportData();
}

// FUNGSI DOWNLOAD SEMUA FOTO JADI ZIP
window.downloadAllPhotosZip = async function() {
    const btn = document.getElementById('btn-zip');
    const originalText = btn.innerHTML;
    
    // Urutkan data berdasarkan Kategori & Tanggal terlama ke terbaru
    const sortedDocs = sortReports(currentData);
    
    // Kumpulkan SEMUA foto dari SEMUA item
    let allPhotoTasks = [];
    sortedDocs.forEach(item => {
        const photos = item.photos || [];
        photos.forEach((url, i) => {
            if (url && (url.startsWith('http') || url.startsWith('https'))) {
                allPhotoTasks.push({ url, item, photoIndex: i });
            }
        });
    });
    
    if (allPhotoTasks.length === 0) {
        alert("Tidak ada foto untuk didownload pada periode/petugas ini.");
        return;
    }

    if (!confirm(`Sistem menemukan ${allPhotoTasks.length} foto. Lanjutkan download ZIP?`)) return;

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing ${allPhotoTasks.length}...`;
    if (window.lucide) lucide.createIcons();

    // @ts-ignore
    const zip = new JSZip();
    const folder = zip.folder("Bukti_Pekerjaan_CS");

    try {
        // Gunakan batch processing atau sedikit delay untuk menghindari kegagalan fetch masal
        for (let index = 0; index < allPhotoTasks.length; index++) {
            const task = allPhotoTasks[index];
            try {
                const { url, item, photoIndex } = task;
                // Update progress text
                btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Zipping ${index + 1}/${allPhotoTasks.length}...`;

                // Gunakan proxy untuk fetch (bypass CORS)
                const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl, { cache: 'no-cache' });
                
                if (!response.ok) throw new Error("Fetch failed");
                
                const blob = await response.blob();
                
                const cleanDate = item.formattedDate.replace(/[^a-zA-Z0-9]/g, '_');
                const cleanCat = (item.category || 'Umum').replace(/[^a-z0-9]/gi, '_');
                const cleanDesc = (item.description || 'Pekerjaan').replace(/[^a-z0-9]/gi, '_');
                const cleanNameStr = (item.cleanerName || 'Staf').replace(/[^a-z0-9]/gi, '_');
                
                // Format: TANGGAL__KATEGORI__DESKRIPSI__PETUGAS__fotoX.jpg
                const fileName = `${cleanDate}__${cleanCat}__${cleanDesc}__${cleanNameStr}__foto${photoIndex + 1}.jpg`;
                
                folder.file(fileName, blob);
            } catch (err) {
                console.error(`Gagal download foto ke-${index + 1}:`, err);
            }
        }

        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Generating ZIP...`;
        
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `REKAP_FOTO_CS_${new Date().getTime()}.zip`;
        link.click();

    } catch (e) {
        alert("Terjadi kesalahan teknis saat membuat ZIP: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
    }
}

// FUNGSI DOWNLOAD SATUAN
window.downloadReportImage = async function(url, filename) {
    try {
        // Melalui proxy untuk bypass CORS fetch
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
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
        window.open(url, '_blank');
    }
}

// FUNGSI PEMBANTU UNTUK KONVERSI IMAGE KE BASE64 (BYPASS CORS)
async function getBase64FromUrl(url) {
    try {
        // Gunakan proxy weserv untuk resize dan bypass CORS
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=300&output=jpg`;
        const response = await fetch(proxyUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Gagal konversi gambar ke base64:", e);
        return null;
    }
}

// FUNGSI EKSPOR KE WORD (DOC) DENGAN GAMBAR
window.exportToWord = async function() {
    if (currentData.length === 0) {
        alert("Tidak ada data untuk diekspor. Silakan ubah filter periode atau petugas.");
        return;
    }

    const btn = document.querySelector('button[onclick="exportToWord()"]');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...`;
    if (window.lucide) lucide.createIcons();

    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const periodStr = `${formatIndonesianDate(startDate)} s/d ${formatIndonesianDate(endDate)}`;

    // Header HTML untuk memicu Microsoft Word mengenali formatnya
    const header = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Laporan CS</title>
        <style>
            body { font-family: 'Calibri', 'Arial', sans-serif; }
            table { border-collapse: collapse; width: 100%; border: 1pt solid #333333; }
            th, td { border: 1pt solid #333333; padding: 8px; text-align: left; font-size: 9pt; vertical-align: top; }
            th { background-color: #f2f2f2; font-weight: bold; text-align: center; }
            .header-info { margin-bottom: 25px; text-align: center; border-bottom: 2px solid #333333; padding-bottom: 15px; }
            .title { font-size: 14pt; font-weight: bold; margin-bottom: 5px; color: #111; text-transform: uppercase; }
            .subtitle { font-size: 12pt; font-weight: bold; margin-bottom: 10px; color: #444; }
            .period { font-size: 10pt; color: #666; font-weight: bold; text-transform: uppercase; }
            .img-box { width: 150px; max-width: 150px; border: 1px solid #dddddd; margin: 3px; display: inline-block; }
        </style>
        </head><body>`;
    
    let tableHtml = `
        <div class="header-info">
            <div class="title">LAPORAN MONITORING CLEANING SERVICE</div>
            <div class="subtitle">CS PLN ULP MANTINGAN</div>
            <div class="period">PERIODE: ${periodStr}</div>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="width: 30px; border: 1px solid #333333; padding: 10px; font-size: 9pt; text-align: center; background-color: #f2f2f2; font-weight: bold;">NO</th>
                    <th style="width: 100px; border: 1px solid #333333; padding: 10px; font-size: 9pt; text-align: left; background-color: #f2f2f2; font-weight: bold;">TANGGAL</th>
                    <th style="width: 100px; border: 1px solid #333333; padding: 10px; font-size: 9pt; text-align: left; background-color: #f2f2f2; font-weight: bold;">PETUGAS</th>
                    <th style="width: 100px; border: 1px solid #333333; padding: 10px; font-size: 9pt; text-align: left; background-color: #f2f2f2; font-weight: bold;">KATEGORI</th>
                    <th style="border: 1px solid #333333; padding: 10px; font-size: 9pt; text-align: left; background-color: #f2f2f2; font-weight: bold;">DESKRIPSI PEKERJAAN</th>
                    <th style="width: 220px; border: 1px solid #333333; padding: 10px; font-size: 9pt; text-align: center; background-color: #f2f2f2; font-weight: bold;">BUKTI FOTO</th>
                </tr>
            </thead>
            <tbody>`;

    const sortedDocsWord = sortReports(currentData);

    for (let i = 0; i < sortedDocsWord.length; i++) {
        const item = sortedDocsWord[i];
        const photos = item.photos || [];
        let imagesHtml = [];

        if (photos.length > 0) {
            for (const url of photos) {
                const base64 = await getBase64FromUrl(url);
                if (base64) {
                    imagesHtml.push(`<img src="${base64}" class="img-box" width="150" style="width: 150px; max-width: 150px; height: auto; border: 1px solid #ddd; margin: 3px; display: inline-block;" />`);
                }
            }
        }

        tableHtml += `
            <tr>
                <td style="border: 1px solid #333333; padding: 8px; font-size: 8pt; text-align: center;">${i + 1}</td>
                <td style="border: 1px solid #333333; padding: 8px; font-size: 8pt;">${item.formattedDate}</td>
                <td style="border: 1px solid #333333; padding: 8px; font-size: 8pt; font-weight: bold;">${item.cleanerName}</td>
                <td style="border: 1px solid #333333; padding: 8px; font-size: 8pt; text-transform: uppercase;">${item.category}</td>
                <td style="border: 1px solid #333333; padding: 8px; font-size: 8pt;">${item.description || '-'}</td>
                <td style="border: 1px solid #333333; padding: 8px; font-size: 8pt; text-align: center;">
                    ${imagesHtml.length > 0 ? imagesHtml.join('') : '<span style="color: #ccc;">No Photo</span>'}
                </td>
            </tr>`;
    }

    tableHtml += `</tbody></table><br><p style='text-align:right'>Dicetak pada: ${new Date().toLocaleString()}</p></body></html>`;

    const fullHtml = header + tableHtml;

    // Buat Blob dan trigger download
    const blob = new Blob(['\ufeff', fullHtml], {
        type: 'application/msword'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_CS_PLN_${startDate ? startDate.replace(/-/g, '') : 'all'}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    btn.disabled = false;
    btn.innerHTML = originalText;
    if (window.lucide) lucide.createIcons();
}

// FUNGSI EKSPOR KE PDF DENGAN TAMPILAN TABEL (MIRIP WORD)
window.exportToPDF = async function() {
    if (currentData.length === 0) {
        alert("Tidak ada data untuk diekspor. Silakan ubah filter periode atau petugas.");
        return;
    }

    const btn = document.getElementById('btn-pdf');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Preparing PDF...`;
    if (window.lucide) lucide.createIcons();

    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const periodStr = `${formatIndonesianDate(startDate)} s/d ${formatIndonesianDate(endDate)}`;

    let printHtml = `
        <div style="font-family: 'Inter', sans-serif; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px;">
                <h2 style="margin: 0; font-size: 18pt; font-weight: 900; color: #111; text-transform: uppercase;">LAPORAN MONITORING CLEANING SERVICE</h2>
                <h3 style="margin: 5px 0; font-size: 14pt; font-weight: 800; color: #444;">CS PLN ULP MANTINGAN</h3>
                <p style="margin: 0; font-size: 10pt; font-weight: 600; color: #666; text-transform: uppercase;">PERIODE: ${periodStr}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #333;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #333; padding: 10px; font-size: 9pt; text-align: center; width: 30px;">NO</th>
                        <th style="border: 1px solid #333; padding: 10px; font-size: 9pt; text-align: left; width: 120px;">TANGGAL</th>
                        <th style="border: 1px solid #333; padding: 10px; font-size: 9pt; text-align: left; width: 100px;">PETUGAS</th>
                        <th style="border: 1px solid #333; padding: 10px; font-size: 9pt; text-align: left; width: 100px;">KATEGORI</th>
                        <th style="border: 1px solid #333; padding: 10px; font-size: 9pt; text-align: left;">DESKRIPSI PEKERJAAN</th>
                        <th style="border: 1px solid #333; padding: 10px; font-size: 9pt; text-align: center; width: 220px;">BUKTI FOTO</th>
                    </tr>
                </thead>
                <tbody>
    `;

    const sortedDocsPDF = sortReports(currentData);

    for (let i = 0; i < sortedDocsPDF.length; i++) {
        const item = sortedDocsPDF[i];
        const photos = item.photos || [];
        let imagesHtml = [];

        if (photos.length > 0) {
            for (const url of photos) {
                const base64 = await getBase64FromUrl(url);
                if (base64) {
                    imagesHtml.push(`<img src="${base64}" style="width: 100%; max-width: 180px; height: auto; border: 1px solid #ddd; margin-bottom: 5px; display: block; margin-left: auto; margin-right: auto;" />`);
                }
            }
        }

        printHtml += `
            <tr style="break-inside: avoid; page-break-inside: avoid;">
                <td style="border: 1px solid #333; padding: 8px; font-size: 8pt; text-align: center;">${i + 1}</td>
                <td style="border: 1px solid #333; padding: 8px; font-size: 8pt;">${item.formattedDate}</td>
                <td style="border: 1px solid #333; padding: 8px; font-size: 8pt; font-weight: bold;">${item.cleanerName}</td>
                <td style="border: 1px solid #333; padding: 8px; font-size: 8pt; text-transform: uppercase;">${item.category}</td>
                <td style="border: 1px solid #333; padding: 8px; font-size: 8pt;">${item.description || '-'}</td>
                <td style="border: 1px solid #333; padding: 8px; font-size: 8pt; text-align: center;">
                    ${imagesHtml.length > 0 ? imagesHtml.join('') : '<span style="color: #ccc;">No Photo</span>'}
                </td>
            </tr>
        `;
    }

    printHtml += `
                </tbody>
            </table>
            <div style="text-align: right; margin-top: 20px; font-size: 8pt; color: #666; font-style: italic;">
                Dicetak pada: ${new Date().toLocaleString()}
            </div>
        </div>
    `;

    // Gunakan iframe tersembunyi untuk mencetak tanpa mengganggu tampilan UI
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <html>
            <head>
                <title>Laporan_CS_PLN</title>
                <style>
                    @page { size: auto; margin: 0mm; }
                    body { margin: 15mm; }
                    /* Optimasi untuk cetak */
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                </style>
            </head>
            <body>${printHtml}</body>
        </html>
    `);
    doc.close();

    // Beri waktu sejenak agar gambar ter-render di iframe
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
            document.body.removeChild(iframe);
            btn.disabled = false;
            btn.innerHTML = originalText;
            if (window.lucide) lucide.createIcons();
        }, 500);
    }, 1500);
}

// LIGHTBOX CONTROLS
window.openLightbox = function(url) {
    const lightbox = document.getElementById('photo-lightbox');
    const image = document.getElementById('lightbox-img');
    if (!lightbox || !image) return;

    // Use weserv proxy for instant loading and bypass provider blocking in Indonesia
    let targetUrl = url;
    if (url && (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('images.weserv.nl')) {
        targetUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
    }

    image.src = targetUrl;
    image.onerror = function() {
        if (targetUrl !== url) {
            image.src = url; // Fallback
        }
    };
    lightbox.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

window.closeLightbox = function() {
    const lightbox = document.getElementById('photo-lightbox');
    if (lightbox) lightbox.classList.add('hidden');
}

window.loadReportData = loadReportData;

document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    
    // Default: Hari ini saja (1 hari)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    
    if (startInput) startInput.value = todayStr;
    if (endInput) endInput.value = todayStr;
    
    await populateUserFilter();
    
    // Register change listeners for auto-filtering
    const filterSelectors = ["report-user", "report-category", "report-start-date", "report-end-date", "report-limit"];
    filterSelectors.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener("change", () => {
                loadReportData();
            });
        }
    });

    loadReportData();
});
