import { db, auth } from './firebase-config.js';
import { loadComponents } from './components.js';

import { 
  collection, 
  getDocs, 
  addDoc,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { 
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentEditId = null;


// 🔥 LOAD USER
window.loadUsersListing = async function () {
  const snapshot = await getDocs(collection(db, "users"));
  const container = document.getElementById("userList");

  if (!container) return;
  container.innerHTML = "";

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        
        // Cek jika admin berdasarkan role atau email 'admin@'
        const isAdmin = data.role === 'admin' || (data.email && data.email.includes('admin@'));
        
        const badgeLabel = isAdmin ? 'Administrator' : 'Cleaner Team';
        const badgeClass = isAdmin ? 'text-purple-600 bg-purple-50' : 'text-green-600 bg-green-50';
        const iconName = isAdmin ? 'shield-check' : 'user';
        const iconColor = isAdmin ? 'text-purple-600' : 'text-[#075E3D]';
        const iconBg = isAdmin ? 'bg-purple-50' : 'bg-green-50';

        container.innerHTML += `
        <div class="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
            <div class="flex items-start justify-between mb-4">
                <div class="w-12 h-12 ${iconBg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <i data-lucide="${iconName}" class="${iconColor} w-6 h-6"></i>
                </div>
                <div class="flex gap-1">
                    <button onclick='editUser("${id}", ${JSON.stringify(data.name)})' class="p-2 text-yellow-500 hover:bg-yellow-50 rounded-lg transition-colors">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick='deleteUser("${id}")' class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            <h3 class="font-bold text-gray-900">${data.name}</h3>
            <p class="text-gray-400 text-xs mb-4">${data.email ?? '-'}</p>
            <div class="pt-4 border-t border-gray-50">
                <span class="text-[10px] font-bold ${badgeClass} px-3 py-1 rounded-full uppercase tracking-tighter">${badgeLabel}</span>
            </div>
        </div>
        `;  
    });

  if (window.lucide) lucide.createIcons();
};


// ➕ TAMBAH USER
window.tambahUser = async function () {
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!name || !email || !password) {
    alert("Isi semua field!");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    await addDoc(collection(db, "users"), {
      name,
      uid,
      email
    });

    alert("User berhasil ditambahkan");

    loadUsersListing();

    document.getElementById("name").value = "";
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";

    // Beritahu user bahwa admin mungkin keluar karena behavior Firebase
    console.log("Catatan: Mendaftarkan user baru via client-side Auth seringkali mengubah user yang login.");

  } catch (error) {
    console.error("Gagal tambah user:", error);
    alert("Gagal: " + error.message);
  }
};


// ✏️ OPEN MODAL
window.editUser = function (id, name) {
  currentEditId = id;
  document.getElementById("editName").value = name;

  const modal = document.getElementById("editModal");
  const modalContent = document.getElementById("modalContent");
  
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  
  setTimeout(() => {
    modalContent.classList.remove("scale-95", "opacity-0");
  }, 10);
};


// 💾 SAVE EDIT
window.saveEdit = async function () {
  const newName = document.getElementById("editName").value;

  try {
    await updateDoc(doc(db, "users", currentEditId), {
      name: newName
    });

    alert("Berhasil update");
    closeModal();
    loadUsersListing();
  } catch (error) {
    alert("Gagal update");
  }
};


// ❌ CLOSE MODAL
window.closeModal = function () {
  const modal = document.getElementById("editModal");
  const modalContent = document.getElementById("modalContent");

  modalContent.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }, 300);
};


// 🗑️ DELETE
window.deleteUser = async function (id) {
  if (!confirm("Yakin hapus?")) return;

  try {
    await deleteDoc(doc(db, "users", id));
    alert("Berhasil dihapus");
    loadUsersListing();
  } catch (error) {
    alert("Gagal menghapus");
  }
};

// JALANKAN SAAT LOAD
document.addEventListener("DOMContentLoaded", async () => {
    await loadComponents();
    loadUsersListing();
});
