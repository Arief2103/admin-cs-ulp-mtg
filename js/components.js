export async function loadComponents() {
    const sidebarContainer = document.getElementById('sidebar');
    const navbarContainer = document.getElementById('navbar');

    // Load Sidebar
    if (sidebarContainer) {
        try {
            const response = await fetch('components/sidebar.html');
            const html = await response.text();
            sidebarContainer.innerHTML = html;
            setActiveMenu();
        } catch (error) {
            console.error("Error loading sidebar:", error);
        }
    }

    // Load Navbar
    if (navbarContainer) {
        try {
            const response = await fetch('components/navbar.html');
            const html = await response.text();
            navbarContainer.innerHTML = html;
            setPageTitle();
        } catch (error) {
            console.error("Error loading navbar:", error);
        }
    }

    // Re-initialize Lucide Icons after injection
    if (window.lucide) {
        lucide.createIcons();
    }
}

function setActiveMenu() {
    const path = window.location.pathname;
    let activeId = '';

    if (path.includes('dashboard.html')) activeId = 'menu-dashboard';
    else if (path.includes('users.html')) activeId = 'menu-users';
    else if (path.includes('jobs.html')) activeId = 'menu-jobs';
    else if (path.includes('monitoring.html')) activeId = 'menu-monitoring';
    else if (path.includes('reports.html')) activeId = 'menu-reports';

    if (activeId) {
        const activeMenu = document.getElementById(activeId);
        if (activeMenu) {
            activeMenu.classList.add('sidebar-active');
            activeMenu.classList.remove('text-gray-400', 'hover:bg-green-50');
        }
    }
}

function setPageTitle() {
    const path = window.location.pathname;
    const titleEl = document.getElementById('page-title');
    if (!titleEl) return;

    if (path.includes('dashboard.html')) titleEl.innerText = 'Dashboard';
    else if (path.includes('users.html')) titleEl.innerText = 'Master User';
    else if (path.includes('jobs.html')) titleEl.innerText = 'Tambah Pekerjaan';
    else if (path.includes('monitoring.html')) titleEl.innerText = 'Monitoring Pekerjaan';
    else if (path.includes('reports.html')) titleEl.innerText = 'Rekap Laporan';
}
