const Auth = {
  currentUser: null,
  currentUserStudentData: null,
  otpSession: null,
  otpTimerInterval: null,
  otpRemainingSeconds: 300,
  otpAttemptsRemaining: 3,

  async init() {
    if (API.token) {
      try {
        const res = await API.get('/api/auth/me');
        this.currentUser = res.user;
        this.currentUserStudentData = res.student;
        this.showPortalScreen();
        return;
      } catch (err) {
        console.warn('Existing session token expired or invalid:', err.message);
        API.setToken(null);
      }
    }
    this.showLoginScreen();
  },

  showLoginScreen() {
    this.currentUser = null;
    this.currentUserStudentData = null;
    this.otpSession = null;
    if (this.otpTimerInterval) {
      clearInterval(this.otpTimerInterval);
      this.otpTimerInterval = null;
    }

    const loginScreen = document.getElementById('auth-portal-screen');
    const appContainer = document.getElementById('authenticated-app-container');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';

    this.backToStep1();
  },

  showPortalScreen() {
    const loginScreen = document.getElementById('auth-portal-screen');
    const appContainer = document.getElementById('authenticated-app-container');

    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    this.updateUserBadge();
    this.configureRolePermissions();

    if (window.App) {
      if (this.currentUser && this.currentUser.role === 'student') {
        window.App.switchView('student-portal');
      } else {
        window.App.switchView('dashboard');
      }
    }
  },

  // ====================================================================
  // STEP 1: Verify Username & Password -> Request Email 2FA OTP
  // ====================================================================
  async loginStep1(username, password) {
    const errBox = document.getElementById('login-error-msg');
    const submitBtn = document.getElementById('login-submit-btn');

    if (errBox) errBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Verifying Credentials...';
    }

    try {
      const res = await API.post('/api/auth/login', { username, password });

      if (res.require2FA) {
        // Store OTP Verification Session
        this.otpSession = {
          sessionId: res.sessionId,
          username: res.username,
          maskedEmail: res.maskedEmail,
          debugOtp: res.debugOtp
        };

        // Transition from Step 1 to Step 2
        const step1 = document.getElementById('auth-step-credentials');
        const step2 = document.getElementById('auth-step-otp');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';

        const emailEl = document.getElementById('otp-target-email');
        const codeDisplayEl = document.getElementById('otp-live-display');
        const otpInput = document.getElementById('login-otp-code');
        const otpErr = document.getElementById('otp-error-msg');

        if (emailEl) emailEl.textContent = res.maskedEmail || 'Institutional Email';
        if (codeDisplayEl) codeDisplayEl.textContent = res.debugOtp || '------';
        if (otpInput) {
          otpInput.value = '';
          setTimeout(() => otpInput.focus(), 100);
        }
        if (otpErr) otpErr.style.display = 'none';

        // Start 5-minute countdown timer & reset attempts
        this.otpAttemptsRemaining = 3;
        this.updateAttemptsDisplay();
        this.startOtpCountdown(300);
      } else if (res.token) {
        // Direct login fallback if 2FA disabled on specific policy
        API.setToken(res.token);
        this.currentUser = res.user;
        this.showPortalScreen();
      }
    } catch (err) {
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = err.message || 'Authentication failed. Please verify credentials.';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🔐 Verify Credentials & Send Email OTP';
      }
    }
  },

  // ====================================================================
  // STEP 2: Submit & Validate 6-Digit Email OTP
  // ====================================================================
  async submitOtp() {
    if (!this.otpSession) {
      alert('Verification session expired. Please sign in again.');
      this.backToStep1();
      return;
    }

    const otpInput = document.getElementById('login-otp-code');
    const otpErr = document.getElementById('otp-error-msg');
    const verifyBtn = document.getElementById('btn-verify-otp');
    const code = otpInput ? otpInput.value.trim() : '';

    if (!code || code.length !== 6) {
      if (otpErr) {
        otpErr.style.display = 'block';
        otpErr.textContent = 'Please enter a valid 6-digit numeric OTP code.';
      }
      return;
    }

    if (otpErr) otpErr.style.display = 'none';
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = '⏳ Verifying Code...';
    }

    try {
      const res = await API.post('/api/auth/verify-2fa-otp', {
        sessionId: this.otpSession.sessionId,
        otp: code
      });

      // OTP Successfully Verified!
      if (this.otpTimerInterval) {
        clearInterval(this.otpTimerInterval);
        this.otpTimerInterval = null;
      }

      API.setToken(res.token);
      this.currentUser = res.user;

      // Fetch student data if role is student
      if (this.currentUser && this.currentUser.studentId) {
        try {
          const me = await API.get('/api/auth/me');
          this.currentUserStudentData = me.student;
        } catch {
          // ignore
        }
      }

      this.showPortalScreen();
    } catch (err) {
      this.otpAttemptsRemaining = Math.max(0, this.otpAttemptsRemaining - 1);
      this.updateAttemptsDisplay();

      if (otpErr) {
        otpErr.style.display = 'block';
        otpErr.textContent = err.message || 'Invalid verification code.';
      }

      if (this.otpAttemptsRemaining <= 0 || (err.message && err.message.toLowerCase().includes('revoked'))) {
        setTimeout(() => {
          alert('Security Alert: Too many incorrect OTP attempts. Session has been revoked.');
          this.backToStep1();
        }, 800);
      }
    } finally {
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = '✅ Verify OTP & Enter Portal';
      }
    }
  },

  // Resend 2FA Email OTP
  async resendOtp() {
    if (!this.otpSession) return;
    const resendBtn = document.getElementById('btn-resend-otp');
    const otpErr = document.getElementById('otp-error-msg');
    const codeDisplayEl = document.getElementById('otp-live-display');

    if (resendBtn) {
      resendBtn.disabled = true;
      resendBtn.textContent = '⏳ Sending...';
    }

    try {
      const res = await API.post('/api/auth/resend-otp', {
        sessionId: this.otpSession.sessionId
      });

      this.otpSession.debugOtp = res.debugOtp;
      if (codeDisplayEl) codeDisplayEl.textContent = res.debugOtp || '------';

      this.otpAttemptsRemaining = 3;
      this.updateAttemptsDisplay();
      this.startOtpCountdown(300);

      if (otpErr) {
        otpErr.style.display = 'block';
        otpErr.style.color = 'var(--accent-emerald)';
        otpErr.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        otpErr.style.background = 'rgba(16, 185, 129, 0.12)';
        otpErr.textContent = '✅ Fresh 6-digit verification code dispatched to your institutional inbox.';
      }
    } catch (err) {
      if (otpErr) {
        otpErr.style.display = 'block';
        otpErr.style.color = 'var(--accent-rose)';
        otpErr.textContent = err.message || 'Failed to resend verification code.';
      }
    } finally {
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.textContent = '🔄 Resend Code';
      }
    }
  },

  startOtpCountdown(seconds = 300) {
    if (this.otpTimerInterval) clearInterval(this.otpTimerInterval);
    this.otpRemainingSeconds = seconds;
    const timerDisplay = document.getElementById('otp-timer-display');

    const updateTimer = () => {
      const mins = Math.floor(this.otpRemainingSeconds / 60);
      const secs = this.otpRemainingSeconds % 60;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (timerDisplay) {
        timerDisplay.textContent = formatted;
        if (this.otpRemainingSeconds <= 60) {
          timerDisplay.style.color = 'var(--accent-rose)';
        } else {
          timerDisplay.style.color = 'var(--accent-cyan)';
        }
      }

      if (this.otpRemainingSeconds <= 0) {
        clearInterval(this.otpTimerInterval);
        this.otpTimerInterval = null;
        if (timerDisplay) timerDisplay.textContent = 'Expired (00:00)';
        const otpErr = document.getElementById('otp-error-msg');
        if (otpErr) {
          otpErr.style.display = 'block';
          otpErr.textContent = 'Verification code has expired. Please click Resend Code.';
        }
      }
      this.otpRemainingSeconds -= 1;
    };

    updateTimer();
    this.otpTimerInterval = setInterval(updateTimer, 1000);
  },

  updateAttemptsDisplay() {
    const attemptsEl = document.getElementById('otp-attempts-display');
    if (attemptsEl) {
      attemptsEl.innerHTML = `Attempts remaining: <strong>${this.otpAttemptsRemaining}</strong>`;
      if (this.otpAttemptsRemaining <= 1) {
        attemptsEl.style.color = 'var(--accent-rose)';
      } else {
        attemptsEl.style.color = 'var(--text-dim)';
      }
    }
  },

  backToStep1() {
    if (this.otpTimerInterval) {
      clearInterval(this.otpTimerInterval);
      this.otpTimerInterval = null;
    }
    this.otpSession = null;

    const step1 = document.getElementById('auth-step-credentials');
    const step2 = document.getElementById('auth-step-otp');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';

    const passInput = document.getElementById('login-password');
    const otpInput = document.getElementById('login-otp-code');
    const loginErr = document.getElementById('login-error-msg');
    const otpErr = document.getElementById('otp-error-msg');

    if (passInput) passInput.value = '';
    if (otpInput) otpInput.value = '';
    if (loginErr) loginErr.style.display = 'none';
    if (otpErr) otpErr.style.display = 'none';
  },

  async logout() {
    try {
      if (API.token) {
        await API.post('/api/auth/logout', {});
      }
    } catch {
      // ignore
    } finally {
      API.setToken(null);
      this.currentUser = null;
      this.currentUserStudentData = null;
      this.showLoginScreen();
    }
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
    const idBlockBanner = document.getElementById('sp-id-block-banner');

    if (nameEl) nameEl.textContent = s.student_name;
    if (rollEl) rollEl.textContent = `Placement ID: ${s.placement_id} • Programme: ${s.course} (${s.batch || '2026-27'})`;
    if (badgeEl) {
      badgeEl.textContent = `${s.placement_status} ${s.current_category ? `(${s.current_category})` : ''}`;
      badgeEl.className = s.placement_status === 'Unplaced' ? 'tag tag-warning' : 'tag tag-a-plus';
    }

    // Prominent Student ID Block Status Banner per Policy Condition
    if (idBlockBanner) {
      if (s.id_block_status && s.id_block_status.isBlocked) {
        idBlockBanner.style.display = 'block';
        const isAplus = s.id_block_status.badge && s.id_block_status.badge.includes('APLUS');
        const isAbsent = s.id_block_status.badge && s.id_block_status.badge.includes('ABSENT');
        const bannerBg = isAplus ? 'rgba(147, 51, 234, 0.12)' : 'rgba(220, 38, 38, 0.12)';
        const bannerBorder = isAplus ? 'var(--accent-purple)' : 'var(--accent-rose)';
        const icon = isAplus ? '🔒' : '🚫';

        idBlockBanner.innerHTML = `
          <div style="padding: 16px 20px; background: ${bannerBg}; border-left: 5px solid ${bannerBorder}; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <strong style="font-size: 0.98rem; color: #ffffff;">${icon} Student ID Status: ${s.id_block_status.label}</strong>
              <span class="badge ${isAplus ? 'badge-id-locked' : 'badge-id-blocked'}">POLICY LOCKED</span>
            </div>
            <div style="font-size: 0.86rem; color: #e2e8f0; line-height: 1.5;">
              ${s.id_block_status.reason}
            </div>
            ${isAbsent ? `
              <div style="margin-top: 10px; font-size: 0.8rem; color: var(--text-dim);">
                Under Clause 3.2, unexcused absence results in immediate exclusion from campus recruitment drives.
              </div>
            ` : ''}
          </div>
        `;
      } else {
        idBlockBanner.style.display = 'block';
        idBlockBanner.innerHTML = `
          <div style="padding: 12px 18px; background: rgba(16, 185, 129, 0.08); border-left: 5px solid var(--accent-emerald); border-radius: var(--radius-sm); border: 1px solid rgba(16, 185, 129, 0.2); font-size: 0.86rem;">
            <strong style="color: var(--accent-emerald);">✅ Student ID Status: Active & Eligible</strong> — Your placement ID is verified and in good standing for matching campus recruitment drives.
          </div>
        `;
      }
    }

    if (detailsBox) {
      detailsBox.innerHTML = `
        <div><strong>Institutional Email:</strong> ${s.email_id}</div>
        <div><strong>CGPA:</strong> ${s.cgpa}</div>
        <div><strong>ID Policy Status:</strong> <span class="badge ${s.id_block_status?.isBlocked ? 'badge-id-blocked' : 'badge-id-active'}">${s.id_block_status?.label || 'Active'}</span></div>
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
