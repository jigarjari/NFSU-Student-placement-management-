const Auth = {
  currentUser: null,

  PRESET_CREDENTIALS: {
    admin: { username: 'admin', password: 'Admin@NFSU2026' },
    officer: { username: 'officer', password: 'Officer@NFSU2026' },
    coord_dfis: { username: 'coord_dfis', password: 'Coord@NFSU2026' },
    coord_cs: { username: 'coord_cs', password: 'Coord@NFSU2026' },
    student_aplus: { username: 'student_aplus', password: 'Student@NFSU2026' },
    student_b: { username: 'student_b', password: 'Student@NFSU2026' },
    student_unplaced: { username: 'student_unplaced', password: 'Student@NFSU2026' },
    student_absent: { username: 'student_absent', password: 'Student@NFSU2026' }
  },

  async init() {
    if (API.token) {
      try {
        const res = await API.get('/api/auth/me');
        this.currentUser = res.user;
        this.currentUserStudentData = res.student;
        this.showPortalScreen();
        return;
      } catch (err) {
        console.warn('Existing token expired or invalid:', err.message);
        API.setToken(null);
      }
    }
    this.showLoginScreen();
  },

  showLoginScreen() {
    this.currentUser = null;
    const loginScreen = document.getElementById('auth-portal-screen');
    const appContainer = document.getElementById('authenticated-app-container');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';

    // Clear password & error
    const passInput = document.getElementById('login-password');
    const errBox = document.getElementById('login-error-msg');
    if (passInput) passInput.value = '';
    if (errBox) errBox.style.display = 'none';
  },

  showPortalScreen() {
    const loginScreen = document.getElementById('auth-portal-screen');
    const appContainer = document.getElementById('authenticated-app-container');

    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    this.updateUserBadge();
    this.configureRolePermissions();

    if (window.App) {
      if (this.currentUser.role === 'student') {
        window.App.switchView('student-portal');
      } else {
        window.App.switchView('dashboard');
      }
    }
  },

  async login(username, password, mfaCode = null) {
    const errBox = document.getElementById('login-error-msg');
    const mfaBlock = document.getElementById('mfa-code-block');
    if (errBox) errBox.style.display = 'none';

    try {
      const res = await API.post('/api/auth/login', {
        username,
        password,
        mfaCode: mfaCode || (mfaBlock && mfaBlock.style.display !== 'none' ? document.getElementById('login-mfa')?.value : null)
      });

      if (res.requireMfa) {
        if (mfaBlock) mfaBlock.style.display = 'block';
        if (errBox) {
          errBox.style.display = 'block';
          errBox.style.color = 'var(--accent-amber)';
          errBox.textContent = res.message || 'MFA Code required. Enter 123456 to verify.';
        }
        return;
      }

      API.setToken(res.token);
      this.currentUser = res.user;

      // Fetch student data if student
      if (this.currentUser.studentId) {
        const me = await API.get('/api/auth/me');
        this.currentUserStudentData = me.student;
      }

      this.showPortalScreen();
    } catch (err) {
      if (errBox) {
        errBox.style.display = 'block';
        errBox.style.color = 'var(--accent-rose)';
        errBox.textContent = err.message || 'Authentication failed. Please verify credentials.';
      }
    }
  },

  async quickLoginPreset(presetKey) {
    const cred = this.PRESET_CREDENTIALS[presetKey];
    if (!cred) return;

    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    if (uInput) uInput.value = cred.username;
    if (pInput) pInput.value = cred.password;

    // Direct authentic login with MFA code pre-filled
    await this.login(cred.username, cred.password, '123456');
  },

  logout() {
    API.setToken(null);
    this.currentUser = null;
    this.currentUserStudentData = null;
    this.showLoginScreen();
  },

  updateUserBadge() {
    if (!this.currentUser) return;
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');
    const avatarEl = document.getElementById('user-avatar-initials');

    if (nameEl) nameEl.textContent = this.currentUser.fullName || this.currentUser.username;
    if (roleEl) {
      let roleText = this.currentUser.role.toUpperCase();
      if (this.currentUser.courseScope) {
        roleText += ` (${this.currentUser.courseScope})`;
      }
      roleEl.textContent = roleText;
    }
    if (avatarEl) {
      const name = this.currentUser.fullName || this.currentUser.username;
      const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      avatarEl.textContent = initials || 'US';
    }
  },

  configureRolePermissions() {
    if (!this.currentUser) return;
    const role = this.currentUser.role;

    const adminLinks = [
      'nav-dashboard',
      'nav-students',
      'nav-drives',
      'nav-offers',
      'nav-policy',
      'nav-audit',
      'nav-security-lab',
      'nav-backup'
    ];

    const studentLink = document.getElementById('nav-student-portal');

    if (role === 'student') {
      // Hide administrative tabs for real student privacy and security
      adminLinks.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      if (studentLink) studentLink.style.display = 'flex';
      this.renderStudentPortal();
    } else {
      // Show admin / coordinator links
      adminLinks.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
      });
      if (studentLink) studentLink.style.display = 'none';

      // If coordinator, hide system audit and backup (coordinator scoped to course)
      if (role === 'coordinator') {
        const auditEl = document.getElementById('nav-audit');
        const backupEl = document.getElementById('nav-backup');
        if (auditEl) auditEl.style.display = 'none';
        if (backupEl) backupEl.style.display = 'none';
      }
    }
  },

  async renderStudentPortal() {
    if (!this.currentUserStudentData) {
      try {
        const me = await API.get('/api/auth/me');
        this.currentUserStudentData = me.student;
      } catch (err) {
        console.error('Failed to load student portal data:', err);
      }
    }

    const s = this.currentUserStudentData;
    if (!s) return;

    const nameEl = document.getElementById('sp-student-name');
    const rollEl = document.getElementById('sp-student-course-roll');
    const badgeEl = document.getElementById('sp-placement-status-badge');
    const detailsBox = document.getElementById('sp-details-list');
    const switchingBox = document.getElementById('sp-switching-status-box');

    if (nameEl) nameEl.textContent = s.student_name;
    if (rollEl) rollEl.textContent = `Placement ID: ${s.placement_id} • Programme: ${s.course} (${s.batch})`;
    if (badgeEl) {
      badgeEl.textContent = `${s.placement_status} ${s.current_category ? `(${s.current_category})` : ''}`;
      badgeEl.className = s.placement_status === 'Unplaced' ? 'tag tag-warning' : 'tag tag-a-plus';
    }

    if (detailsBox) {
      detailsBox.innerHTML = `
        <div><strong>Institutional Email:</strong> ${s.email_id}</div>
        <div><strong>CGPA:</strong> ${s.cgpa}</div>
        <div><strong>Registration Status:</strong> <span class="tag ${s.registration_status === 'Registered' ? 'tag-success' : 'tag-danger'}">${s.registration_status}</span></div>
        <div><strong>Academic Eligibility:</strong> <span class="tag ${s.eligibility_status === 'Eligible' ? 'tag-success' : 'tag-warning'}">${s.eligibility_status}</span></div>
        <div><strong>Current Recruiting Company:</strong> ${s.current_company || 'None (Unplaced)'}</div>
        <div><strong>Current Compensation:</strong> ${s.current_ctc ? `₹${s.current_ctc} LPA (Annual FTE CTC)` : (s.current_stipend ? `₹${s.current_stipend.toLocaleString()}/mo Stipend` : 'None')}</div>
        <div><strong>NOC Status:</strong> <span class="tag tag-neutral">${s.noc_status}</span></div>
      `;
    }

    if (switchingBox) {
      let explanation = '';
      if (s.current_category === 'A+') {
        explanation = `<div style="padding: 10px; background: rgba(124, 58, 237, 0.08); border-left: 3px solid var(--accent-purple); border-radius: 4px;">
          <strong>Category A+ Tier Reached (&ge; ₹16 LPA)</strong><br>
          Under NFSU Placement Guidelines 2026–27 (Clause 3.2), you have secured an A+ category offer. You are completely out of the campus placement process.
        </div>`;
      } else if (s.current_category === 'A') {
        explanation = `<div style="padding: 10px; background: rgba(2, 132, 199, 0.08); border-left: 3px solid var(--accent-cyan); border-radius: 4px;">
          <strong>Category A Offer Holder (₹10–16 LPA)</strong><br>
          Under NFSU Clause 3.2, you are eligible to switch <strong>ONLY to Category A+ companies (&ge; ₹16 LPA)</strong>. Lateral or lower tier drives are blocked.
        </div>`;
      } else if (s.current_category === 'B') {
        const minCtc = Math.round(s.current_ctc * 1.5 * 100) / 100;
        explanation = `<div style="padding: 10px; background: rgba(5, 150, 105, 0.08); border-left: 3px solid var(--accent-emerald); border-radius: 4px;">
          <strong>Category B Offer Holder (1.5x Switching Rule)</strong><br>
          Your current offer is ₹${s.current_ctc} LPA. You may participate in upcoming drives where the package is <strong>at least ₹${minCtc} LPA (1.5x multiplier)</strong>.
        </div>`;
      } else {
        explanation = `<div style="padding: 10px; background: rgba(5, 150, 105, 0.08); border-left: 3px solid var(--accent-emerald); border-radius: 4px;">
          <strong>Eligible for Campus Recruitment Drives</strong><br>
          You are currently eligible to apply for drives matching your programme (${s.course}) with CGPA &ge; ${s.cgpa}.
        </div>`;
      }

      if (s.absent_drives_penalty > 0) {
        explanation += `<div style="margin-top: 10px; padding: 10px; background: rgba(220, 38, 38, 0.08); border-left: 3px solid var(--accent-rose); border-radius: 4px; color: var(--accent-rose);">
          ⚠️ <strong>Active Absenteeism Disciplinary Ban:</strong> Excluded from next ${s.absent_drives_penalty} drives under Clause 3.2 due to recruitment absence. Submit an emergency exception petition for relief.
        </div>`;
      }

      switchingBox.innerHTML = explanation;
    }

    // Load student's offers
    try {
      const data = await API.get('/api/offers');
      const tbody = document.getElementById('sp-offers-tbody');
      if (tbody) {
        if (!data.offers || data.offers.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 16px;">No offers currently received.</td></tr>';
        } else {
          tbody.innerHTML = data.offers.map(o => `
            <tr>
              <td><code>#${o.id}</code></td>
              <td><strong>${o.company_name}</strong></td>
              <td><span class="tag tag-neutral">${o.offer_type}</span></td>
              <td><span class="tag tag-a">${o.category}</span></td>
              <td><strong>${o.ctc_lpa ? `₹${o.ctc_lpa} LPA` : `₹${o.stipend_amount}/mo`}</strong></td>
              <td><span class="timer-chip"><span class="pulse-indicator"></span> 24h Window</span></td>
              <td><span class="tag ${o.offer_status === 'Accepted' ? 'tag-success' : 'tag-warning'}">${o.offer_status}</span></td>
              <td>
                ${o.offer_status === 'Pending' ? `
                  <button class="btn btn-success btn-sm" onclick="Offers.accept(${o.id})">Accept</button>
                  <button class="btn btn-danger btn-sm" onclick="Offers.decline(${o.id})">Decline</button>
                ` : '<span style="color: var(--text-dim); font-size: 0.78rem;">Locked</span>'}
              </td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load student portal offers:', err);
    }
  }
};
