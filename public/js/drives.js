const Drives = {
  allDrives: [],

  async load() {
    try {
      const data = await API.get('/api/drives');
      this.allDrives = data.drives || [];
      this.renderGrid(this.allDrives);
    } catch (err) {
      console.error('Failed to load drives:', err);
    }
  },

  renderGrid(drives) {
    const grid = document.getElementById('drives-grid');
    if (!grid) return;

    if (drives.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 40px;">No recruitment drives currently scheduled.</div>`;
      return;
    }

    grid.innerHTML = drives.map(d => {
      let catBadge = `<span class="badge badge-neutral">${d.category}</span>`;
      if (d.category === 'A+') catBadge = `<span class="badge badge-a-plus">A+ (&ge;16 LPA)</span>`;
      else if (d.category === 'A') catBadge = `<span class="badge badge-a">A (10-16 LPA)</span>`;
      else if (d.category === 'B') catBadge = `<span class="badge badge-b">B (6-10 LPA)</span>`;
      else if (d.category === 'C') catBadge = `<span class="badge badge-c">C (&lt;6 LPA)</span>`;

      let coursesHtml = d.eligible_courses.map(c => `<span class="badge badge-neutral" style="font-size: 0.7rem;">${c}</span>`).join(' ');

      return `
        <div class="panel-card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <h3 style="font-size: 1.15rem; color: var(--text-main);">${d.company_name}</h3>
                <div style="font-size: 0.85rem; color: var(--accent-cyan); font-weight: 600;">${d.job_title}</div>
              </div>
              ${catBadge}
            </div>

            <div style="margin: 12px 0; display: flex; gap: 12px; font-size: 0.85rem;">
              <div><strong>Offer:</strong> <span class="badge badge-neutral">${d.offer_type}</span></div>
              ${d.ctc_lpa > 0 ? `<div><strong>CTC:</strong> ₹${d.ctc_lpa} LPA</div>` : ''}
              ${d.stipend_amount > 0 ? `<div><strong>Stipend:</strong> ₹${d.stipend_amount.toLocaleString()}/mo</div>` : ''}
            </div>

            <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">
              <div>📅 <strong>Drive Date:</strong> ${d.drive_date} (${d.status})</div>
              <div>📍 <strong>Location:</strong> ${d.location || 'NFSU Campus'}</div>
              <div>🎯 <strong>Min CGPA:</strong> ${d.min_cgpa}</div>
            </div>

            <div style="margin-bottom: 14px;">
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Eligible Courses:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">${coursesHtml}</div>
            </div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; gap: 8px; justify-content: flex-end;">
            ${Auth.currentUser && ['admin', 'officer'].includes(Auth.currentUser.role) ? `
              <button class="btn btn-outline btn-sm" onclick="Drives.openAttendanceModal(${d.id}, '${d.company_name}')">
                📋 Attendance Check
              </button>
            ` : ''}
            <button class="btn btn-primary btn-sm" onclick="Drives.checkEligibility(${d.id})">
              🔍 Test Candidate
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  async openAttendanceModal(driveId, companyName) {
    document.getElementById('attendance-drive-id').value = driveId;
    document.getElementById('attendance-drive-name').value = companyName;

    // Populate students select
    const select = document.getElementById('attendance-student-select');
    if (select) {
      select.innerHTML = '<option value="">Loading students...</option>';
      try {
        const data = await API.get('/api/students');
        select.innerHTML = (data.students || []).map(s => `
          <option value="${s.id}">${s.student_name} (${s.placement_id} - ${s.course})</option>
        `).join('');
      } catch (err) {
        select.innerHTML = `<option value="">Error: ${err.message}</option>`;
      }
    }

    // Toggle excuse checkbox when status changes
    const statusSelect = document.getElementById('attendance-status-select');
    const excuseGroup = document.getElementById('excuse-group');
    if (statusSelect && excuseGroup) {
      statusSelect.onchange = () => {
        excuseGroup.style.display = statusSelect.value === '0' ? 'block' : 'none';
      };
      excuseGroup.style.display = statusSelect.value === '0' ? 'block' : 'none';
    }

    window.App.openModal('modal-record-attendance');
  },

  async checkEligibility(driveId) {
    // Switch to policy simulator and pre-select this drive
    const drive = this.allDrives.find(d => d.id === driveId);
    if (!drive) return;

    window.App.switchView('policy');

    document.getElementById('sim-company').value = drive.company_name;
    document.getElementById('sim-offer-type').value = drive.offer_type;
    document.getElementById('sim-ctc').value = drive.ctc_lpa || 15.0;

    // Trigger simulator run
    const runBtn = document.getElementById('run-simulation-btn');
    if (runBtn) runBtn.click();
  }
};
