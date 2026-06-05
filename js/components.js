// Sidebar and Navbar Loader for CS ULP Mantingan Admin Panel

export async function loadComponents() {
    const sidebar = document.getElementById('sidebar');
    const navbar = document.getElementById('navbar');
    
    const currentPath = window.location.pathname;

    // Define globally accessible logout function
    if (!window.logout) {
        window.logout = function() {
            import('./firebase-config.js').then(({ auth }) => {
                import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js").then(({ signOut }) => {
                    signOut(auth).then(() => {
                        window.location.href = "index.html";
                    }).catch(() => {
                        window.location.href = "index.html";
                    });
                });
            }).catch(() => {
                window.location.href = "index.html";
            });
        };
    }

    if (sidebar) {
        sidebar.innerHTML = `
            <!-- Mobile Sidebar Backdrop -->
            <div id="sidebar-backdrop" class="fixed inset-0 bg-gray-950/45 backdrop-blur-xs z-40 hidden transition-opacity duration-300"></div>
            
            <aside id="sidebar-aside" class="fixed inset-y-0 left-0 w-64 h-full bg-white border-r border-gray-200 flex flex-col justify-between non-printable z-50 transform -translate-x-full md:translate-x-0 md:static md:h-screen transition-transform duration-300 ease-in-out">
                <div class="flex flex-col h-full">
                    <!-- LOGO & CLOSE BUTTON -->
                    <div class="p-6 flex items-center justify-between text-[#075E3D]">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-green-50">
                                <img src="assets/logo.png" alt="Logo" class="w-full h-full object-contain" onerror="this.outerHTML='<span class=\\'font-black text-xl\\'>M</span>'">
                            </div>
                            <span class="text-xl font-bold tracking-tight">Admin CS</span>
                        </div>
                        <!-- Close button on mobile -->
                        <button id="sidebar-close" class="md:hidden p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 transition-all">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>

                    <!-- NAVIGATION LINKS -->
                    <nav class="flex-1 px-4 space-y-1 mt-4">
                        <a href="dashboard.html" id="menu-dashboard" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath.includes('dashboard.html') || currentPath.endsWith('/') || currentPath.includes('index.html') ? 'sidebar-active text-white' : 'text-gray-400 hover:bg-green-50'}">
                            <i data-lucide="layout-dashboard" class="w-5 h-5"></i>
                            <span class="font-medium">Dashboard</span>
                        </a>
                        <a href="users.html" id="menu-users" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-display ${currentPath.includes('users.html') ? 'sidebar-active text-white' : 'text-gray-400 hover:bg-green-50'}">
                            <i data-lucide="users" class="w-5 h-5"></i>
                            <span class="font-medium">Lihat User</span>
                        </a>
                        <a href="jobs.html" id="menu-jobs" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath.includes('jobs.html') ? 'sidebar-active text-white' : 'text-gray-400 hover:bg-green-50'}">
                            <i data-lucide="plus-circle" class="w-5 h-5"></i>
                            <span class="font-medium">Tambah Pekerjaan</span>
                        </a>
                        <a href="monitoring.html" id="menu-monitoring" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath.includes('monitoring.html') ? 'sidebar-active text-white' : 'text-gray-400 hover:bg-green-50'}">
                            <i data-lucide="monitor" class="w-5 h-5"></i>
                            <span class="font-medium">Monitoring Kerja</span>
                        </a>
                        <a href="reports.html" id="menu-reports" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentPath.includes('reports.html') ? 'sidebar-active text-white' : 'text-gray-400 hover:bg-green-50'}">
                            <i data-lucide="file-text" class="w-5 h-5"></i>
                            <span class="font-medium">Rekap Laporan</span>
                        </a>
                    </nav>

                    <!-- LOGOUT BUTTON -->
                    <div class="p-4 border-t border-gray-100">
                        <button onclick="logout()" class="flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 w-full transition-all text-left">
                            <i data-lucide="log-out" class="w-5 h-5"></i>
                            <span class="font-medium">Logout Admin</span>
                        </button>
                    </div>
                </div>
            </aside>
        `;
    }

    if (navbar) {
        let pageTitle = "PLN ULP Mantingan";
        if (currentPath.includes("dashboard.html")) pageTitle = "Dashboard";
        if (currentPath.includes("users.html")) pageTitle = "Master User";
        if (currentPath.includes("jobs.html")) pageTitle = "Tambah Pekerjaan";
        if (currentPath.includes("monitoring.html")) pageTitle = "Monitoring Pekerjaan";
        if (currentPath.includes("reports.html")) pageTitle = "Rekap Laporan";

        navbar.innerHTML = `
            <header class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 md:px-8 z-30 non-printable w-full">
                <div class="flex items-center gap-3">
                    <!-- Hamburger Button on Mobile -->
                    <button id="sidebar-toggle" class="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all">
                        <i data-lucide="menu" class="w-6 h-6"></i>
                    </button>
                    <h2 id="page-title" class="text-base md:text-lg font-bold text-gray-800 tracking-tight">
                        ${pageTitle}
                    </h2>
                </div>

                <div class="flex items-center gap-4 md:gap-6">
                    <!-- Tanggal dan Jam -->
                    <div class="hidden md:flex items-center gap-2 text-gray-700">
                        <!-- Icon Kalender -->
                        <svg xmlns="http://www.w3.org/2000/svg"
                             class="w-5 h-5 text-[#075E3D]"
                             fill="none"
                             viewBox="0 0 24 24"
                             stroke="currentColor">
                            <path stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M8 7V3m8 4V3m-9 8h10m-13 9h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v11a2 2 0 002 2z"/>
                        </svg>

                        <div class="text-xs md:text-sm">
                            <p id="tanggal" class="font-semibold">
                                Jumat, 05 Juni 2026
                            </p>
                            <p id="jam" class="text-[10px] md:text-xs text-gray-500">
                                10:03 WIB
                            </p>
                        </div>
                    </div>

                    <!-- Administrator Status -->
                    <div class="text-right hidden sm:block">
                        <p class="text-xs md:text-sm font-bold text-gray-900 leading-tight">
                            Administrator
                        </p>
                        <p class="text-[10px] text-green-600 font-bold uppercase tracking-widest">
                            ● Online
                        </p>
                    </div>

                    <!-- Avatar -->
                    <div class="w-9 h-9 md:w-10 md:h-10 bg-[#075E3D] rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-green-900/20 text-sm md:text-base">
                        A
                    </div>
                </div>
            </header>
        `;
        
        // Start live date/time update
        updateDateTime();
        setInterval(updateDateTime, 1000);
    }

    // Interactive Toggle Logic
    const toggleBtn = document.getElementById('sidebar-toggle');
    const closeBtn = document.getElementById('sidebar-close');
    const backdrop = document.getElementById('sidebar-backdrop');
    const aside = document.getElementById('sidebar-aside');

    function openSidebar() {
        if (aside) aside.classList.remove('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('hidden');
            setTimeout(() => {
                backdrop.classList.add('opacity-100');
            }, 10);
        }
    }

    function closeSidebar() {
        if (aside) aside.classList.add('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('hidden');
        }
    }

    if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // Refresh lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

function updateDateTime() {
    const now = new Date();

    const tanggal = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const jam = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const tanggalEl = document.getElementById('tanggal');
    const jamEl = document.getElementById('jam');

    if (tanggalEl) {
        tanggalEl.textContent = tanggal;
    }

    if (jamEl) {
        jamEl.textContent = jam + ' WIB';
    }
}
