const App = {
  activeView: 'dashboard',

  async init() {
    this.setupNavigation();
    this.setupModals();
    this.setupForms();
    this.setupEventListeners();
    await Auth.init();
  },

  setupNavigation() {
    document.querySelectorAll('.sidebar-link').forEach(item => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        if (targetView) this.switchView(targetView);
      });
    });
  },

  switchView(viewName) {
    this.activeView = viewName;

    // Update sidebar active link
    document.querySelectorAll('.sidebar-link').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });

    // Update content section active state
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.toggle('active', section.id === `view-${viewName}`);
    });

    this.refreshCurrentView();
  },

  refreshCurrentView() {
    switch (this.activeView) {
      case 'dashboard':
        if (window.Dashboard) Dashboard.load();
        break;
      case 'students':
        if (window.Students) Students.load();
        break;
      case 'drives':
        if (window.Drives) Drives.load();
        break;
      case 'offers':
        if (window.Offers) Offers.load();
        break;
      case 'policy':
        if (window.Policy) Policy.load();
        break;
      case 'audit':
        if (window.Audit) Audit.load();
        break;
      case 'security-lab':
        if (window.SecurityLab) SecurityLab.runAllTests();
        break;
      case 'student-portal':
        if (window.Auth) Auth.renderStudentPortal();
        break;
      case 'backup':
        break;
    }
  },

  setupModals() {
    // Modal open buttons
    document.getElementById('open-add-student-modal-btn')?.addEventListener('click', () => {
      this.openModal('modal-add-student');
    });

    document.getElementById('open-post-drive-modal-btn')?.addEventListener('click', () => {
      this.openModal('modal-post-drive');
    });

    document.getElementById('open-import-csv-modal-btn')?.addEventListener('click', () => {
      this.openModal('modal-import-csv');
    });

    document.getElementById('open-issue-offer-modal-btn')?.addEventListener('click', async () => {
      const sel = document.getElementById('offer-student-select');
      if (sel) {
        sel.innerHTML = '<option value="">Loading candidates...</option>';
        try {
          const data = await API.get('/api/students');
          sel.innerHTML = (data.students || []).map(s => `
            <option value="${s.id}">${s.student_name} (${s.placement_id} - ${s.course})</option>
          `).join('');
        } catch {
          sel.innerHTML = '<option value="">Failed to load candidates</option>';
        }
      }
      this.openModal('modal-issue-offer');
    });

    document.getElementById('open-request-noc-modal-btn')?.addEventListener('click', async () => {
      if (!confirm('Submit request for Institutional Placement No Objection Certificate (NOC)?')) return;
      try {
        const res = await API.post('/api/offers/request-noc', {});
        alert(res.message);
        if (window.Students) window.Students.load();
      } catch (err) {
        alert('NOC request failed: ' + err.message);
      }
    });

    // Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Close on backdrop overlay click
    document.querySelectorAll('.modal-backdrop').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  },

  setupForms() {
    // Institutional Login Form (Step 1: Credentials -> Request 2FA OTP)
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        await Auth.loginStep1(username, password);
      });
    }

    // Toggle Evaluation Credentials Guide Drawer
    const toggleCredsBtn = document.getElementById('toggle-eval-creds-btn');
    const credsDrawer = document.getElementById('eval-creds-drawer');
    if (toggleCredsBtn && credsDrawer) {
      toggleCredsBtn.addEventListener('click', () => {
        credsDrawer.style.display = (credsDrawer.style.display === 'none') ? 'block' : 'none';
      });
    }

    // Add Student Form
    const addStudentForm = document.getElementById('form-add-student');
    if (addStudentForm) {
      addStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(addStudentForm);
        const payload = Object.fromEntries(fd.entries());

        try {
          await API.post('/api/students', payload);
          alert('Student profile successfully registered in NFSU database.');
          addStudentForm.reset();
          this.closeModal('modal-add-student');
          if (window.Students) Students.load();
          if (window.Dashboard) Dashboard.load();
        } catch (err) {
          alert('Error adding student: ' + err.message);
        }
      });
    }

    // Post Drive Form
    const postDriveForm = document.getElementById('form-post-drive');
    if (postDriveForm) {
      postDriveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(postDriveForm);
        const payload = Object.fromEntries(fd.entries());

        const selectedCourses = Array.from(postDriveForm.querySelectorAll('input[name="eligible_courses"]:checked')).map(cb => cb.value);
        payload.eligible_courses = selectedCourses;

        try {
          await API.post('/api/drives', payload);
          alert('Recruitment drive announced successfully.');
          postDriveForm.reset();
          this.closeModal('modal-post-drive');
          if (window.Drives) Drives.load();
        } catch (err) {
          alert('Error posting drive: ' + err.message);
        }
      });
    }

    // Record Attendance Form
    const attendanceForm = document.getElementById('form-record-attendance');
    if (attendanceForm) {
      attendanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(attendanceForm);
        const driveId = fd.get('drive_id');
        const payload = Object.fromEntries(fd.entries());

        try {
          const res = await API.post(`/api/drives/${driveId}/record-attendance`, payload);
          alert(res.message);
          attendanceForm.reset();
          this.closeModal('modal-record-attendance');
          if (window.Drives) Drives.load();
          if (window.Students) Students.load();
        } catch (err) {
          alert('Error recording attendance: ' + err.message);
        }
      });
    }

    // Record Offer Form
    const offerForm = document.getElementById('form-issue-offer');
    if (offerForm) {
      offerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(offerForm);
        const payload = Object.fromEntries(fd.entries());

        try {
          const res = await API.post('/api/offers', payload);
          alert(res.message);
          offerForm.reset();
          this.closeModal('modal-issue-offer');
          if (window.Offers) Offers.load();
          if (window.Dashboard) Dashboard.load();
          if (window.Students) Students.load();
        } catch (err) {
          alert('Policy Violation / Offer Error: ' + err.message);
        }
      });
    }

    // CSV Bulk Import Form
    const csvForm = document.getElementById('form-import-csv');
    if (csvForm) {
      csvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const csvText = document.getElementById('import-csv-textarea').value;
        if (!csvText.trim()) return alert('Please enter CSV data.');

        try {
          const res = await API.post('/api/students/import-csv', { csvText });
          alert(res.message + (res.errors.length ? `\nErrors:\n${res.errors.join('\n')}` : ''));
          this.closeModal('modal-import-csv');
          if (window.Students) Students.load();
          if (window.Dashboard) Dashboard.load();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      });
    }
  },

  setupEventListeners() {
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to sign out from the placement portal?')) {
        Auth.logout();
      }
    });

    // Switch Persona button
    document.getElementById('switch-persona-btn')?.addEventListener('click', () => {
      Auth.logout();
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.body.removeAttribute('data-theme');
          themeBtn.textContent = '🌙';
        } else {
          document.body.setAttribute('data-theme', 'dark');
          themeBtn.textContent = '☀️';
        }
      });
    }

    // Dashboard filters
    document.getElementById('dashboard-course-filter')?.addEventListener('change', () => Dashboard.load());
    document.getElementById('refresh-dashboard-btn')?.addEventListener('click', () => Dashboard.load());

    // Student filters
    document.getElementById('student-search-input')?.addEventListener('input', () => Students.load());
    document.getElementById('student-course-select')?.addEventListener('change', () => Students.load());
    document.getElementById('student-status-select')?.addEventListener('change', () => Students.load());
    document.getElementById('student-block-select')?.addEventListener('change', () => Students.load());
    document.getElementById('show-archived-checkbox')?.addEventListener('change', () => Students.load());
    document.getElementById('export-students-csv-btn')?.addEventListener('click', () => Students.exportCsv());

    // Policy Simulator
    document.getElementById('run-simulation-btn')?.addEventListener('click', () => Policy.runSimulation());

    // Audit buttons
    document.getElementById('verify-audit-chain-btn')?.addEventListener('click', () => Audit.verifyChain(true));
    document.getElementById('simulate-tamper-btn')?.addEventListener('click', () => Audit.simulateTamper());
    document.getElementById('repair-chain-btn')?.addEventListener('click', () => Audit.repairChain());

    // Security Lab button
    document.getElementById('run-all-tests-btn')?.addEventListener('click', () => SecurityLab.runAllTests());

    // Backup buttons
    document.getElementById('download-encrypted-backup-btn')?.addEventListener('click', async () => {
      try {
        const blob = await API.request('/api/backup/download');
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFSU_Encrypted_Backup_${new Date().toISOString().slice(0, 10)}.enc.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        alert('Backup download failed: ' + err.message);
      }
    });

    document.getElementById('trigger-test-restore-btn')?.addEventListener('click', async () => {
      const box = document.getElementById('restore-result-box');
      if (box) box.innerHTML = '<span style="color: var(--accent-cyan);">Testing AES-256 decryption & table schema validation...</span>';
      try {
        const resDownload = await API.get('/api/backup/download');
        const restoreRes = await API.post('/api/backup/test-restore', { encryptedPayload: resDownload });
        if (box) {
          box.innerHTML = `
            <div style="padding: 12px; background: rgba(5, 150, 105, 0.1); border: 1px solid rgba(5, 150, 105, 0.3); border-radius: 6px; color: var(--accent-emerald);">
              <strong>✅ ${restoreRes.message}</strong><br>
              <small>Snapshot Timestamp: ${restoreRes.exportedAt}<br>
              Verified Records: Students (${restoreRes.tableCounts.students}), Drives (${restoreRes.tableCounts.drives}), Offers (${restoreRes.tableCounts.offers}), Audits (${restoreRes.tableCounts.audit_logs})</small>
            </div>
          `;
        }
      } catch (err) {
        if (box) {
          box.innerHTML = `<span style="color: var(--accent-rose);">Restore Test Error: ${err.message}</span>`;
        }
      }
    });
  }
};

window.App = App;
window.Auth = Auth;
window.Dashboard = Dashboard;
window.Students = Students;
window.Drives = Drives;
window.Offers = Offers;
window.Policy = Policy;
window.Audit = Audit;
window.SecurityLab = SecurityLab;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
