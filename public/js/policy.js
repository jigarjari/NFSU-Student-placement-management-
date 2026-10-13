const Policy = {
  studentsList: [],

  async load() {
    await this.loadStudentsForSimulator();
    await this.loadExceptions();
  },

  async loadStudentsForSimulator() {
    try {
      const data = await API.get('/api/students');
      this.studentsList = data.students || [];

      const select = document.getElementById('simulator-student-select');
      if (!select) return;

      select.innerHTML = this.studentsList.map(s => `
        <option value="${s.id}">${s.student_name} (${s.placement_id} - ${s.course} - ${s.placement_status})</option>
      `).join('');

      select.onchange = () => this.updateStudentPreview();
      this.updateStudentPreview();
    } catch (err) {
      console.error('Failed to populate simulator students:', err);
    }
  },

  updateStudentPreview() {
    const select = document.getElementById('simulator-student-select');
    const previewEl = document.getElementById('simulator-student-preview');
    if (!select || !previewEl) return;

    const studentId = parseInt(select.value, 10);
    const student = this.studentsList.find(s => s.id === studentId);

    if (!student) {
      previewEl.innerHTML = '<span style="color: var(--text-dim);">No student selected.</span>';
      return;
    }

    previewEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div><strong>Programme:</strong> ${student.course}</div>
        <div><strong>CGPA:</strong> ${student.cgpa}</div>
        <div><strong>Registration:</strong> <span class="badge ${student.registration_status === 'Registered' ? 'badge-allowed' : 'badge-blocked'}">${student.registration_status}</span></div>
        <div><strong>Eligibility:</strong> <span class="badge ${student.eligibility_status === 'Eligible' ? 'badge-allowed' : 'badge-blocked'}">${student.eligibility_status}</span></div>
        <div><strong>Placement:</strong> ${student.placement_status}</div>
        <div><strong>Current Company:</strong> ${student.current_company || 'None'}</div>
        <div><strong>Current Tier:</strong> <span class="badge badge-neutral">${student.current_category || 'N/A'}</span></div>
        <div><strong>Current Package:</strong> ${student.current_ctc ? `₹${student.current_ctc} LPA` : '-'}</div>
      </div>
      ${student.absent_drives_penalty > 0 ? `
        <div style="margin-top: 10px; padding: 6px 10px; background: rgba(239, 68, 68, 0.15); border-radius: 4px; color: var(--accent-rose); font-size: 0.8rem;">
          ⚠️ <strong>Active Absenteeism Penalty:</strong> Excluded from next ${student.absent_drives_penalty} drives under Clause 3.2.
        </div>
      ` : ''}
    `;
  },

  async runSimulation() {
    const select = document.getElementById('simulator-student-select');
    const companyInput = document.getElementById('sim-company');
    const offerTypeSelect = document.getElementById('sim-offer-type');
    const ctcInput = document.getElementById('sim-ctc');
    const verdictBox = document.getElementById('simulation-verdict-box');

    const studentId = parseInt(select.value, 10);
    const company = companyInput.value.trim() || 'Prospective Recruiter';
    const offerType = offerTypeSelect.value;
    const ctc = parseFloat(ctcInput.value) || 0;

    try {
      const res = await API.post('/api/policy/simulate', {
        studentId,
        targetOffer: {
          company_name: company,
          offer_type: offerType,
          ctc_lpa: ctc
        }
      });

      const { evaluation } = res;
      verdictBox.style.display = 'block';

      let verdictBadgeClass = 'badge-allowed';
      let cardClass = 'ALLOWED';
      let icon = '✅';

      if (evaluation.status === 'BLOCKED') {
        verdictBadgeClass = 'badge-blocked';
        cardClass = 'BLOCKED';
        icon = '🚫';
      } else if (evaluation.status === 'REFERRED_FOR_REVIEW') {
        verdictBadgeClass = 'badge-review';
        cardClass = 'REFERRED_FOR_REVIEW';
        icon = '⚠️';
      }

      verdictBox.className = `policy-result-card ${cardClass}`;
      verdictBox.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
            ${icon} Verdict: <span class="badge ${verdictBadgeClass}" style="font-size: 0.95rem;">${evaluation.status}</span>
          </h3>
          <span style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">${evaluation.code}</span>
        </div>

        <div style="font-size: 0.95rem; margin-bottom: 12px; line-height: 1.5;">
          <strong>Policy Reasoning:</strong> ${evaluation.reason}
        </div>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
          <strong>Governing Policy Clause:</strong> <em>${evaluation.policyClause}</em>
        </div>

        ${evaluation.checksPassed && evaluation.checksPassed.length > 0 ? `
          <div style="margin-top: 10px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-emerald); font-weight: 700; margin-bottom: 4px;">Verified Policy Checks:</div>
            <ul style="font-size: 0.82rem; margin-left: 20px; color: var(--text-muted);">
              ${evaluation.checksPassed.map(c => `<li>${c}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${evaluation.violations && evaluation.violations.length > 0 ? `
          <div style="margin-top: 10px;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-rose); font-weight: 700; margin-bottom: 4px;">Detected Violations:</div>
            <ul style="font-size: 0.82rem; margin-left: 20px; color: var(--accent-rose);">
              ${evaluation.violations.map(v => `<li>${v}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      `;
    } catch (err) {
      alert('Policy Simulation failed: ' + err.message);
    }
  },

  async loadExceptions() {
    try {
      const data = await API.get('/api/policy/exceptions');
      const tbody = document.getElementById('exceptions-tbody');
      if (!tbody) return;

      const exceptions = data.exceptions || [];
      if (exceptions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">No pending emergency exceptions.</td></tr>`;
        return;
      }

      tbody.innerHTML = exceptions.map(e => `
        <tr>
          <td><code>#${e.id}</code></td>
          <td><strong>${e.student_name}</strong> (${e.placement_id})</td>
          <td><span class="badge badge-neutral">${e.course}</span></td>
          <td><span class="badge badge-review">${e.exception_type}</span></td>
          <td>${e.reason}</td>
          <td>
            <span class="badge ${e.status === 'Approved' ? 'badge-allowed' : (e.status === 'Rejected' ? 'badge-blocked' : 'badge-review')}">
              ${e.status}
            </span>
          </td>
          <td>${e.reviewed_by || '<em>Pending</em>'}</td>
          <td>
            ${e.status === 'Pending' && Auth.currentUser && Auth.currentUser.role === 'admin' ? `
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-success btn-sm" onclick="Policy.reviewException(${e.id}, 'Approved')">Approve</button>
                <button class="btn btn-danger btn-sm" onclick="Policy.reviewException(${e.id}, 'Rejected')">Reject</button>
              </div>
            ` : '<span style="color: var(--text-dim); font-size: 0.78rem;">Closed</span>'}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load exceptions:', err);
    }
  },

  async reviewException(id, status) {
    const notes = prompt(`Enter review notes for marking exception as ${status}:`, 'Verified medical/emergency certificate.');
    try {
      const res = await API.post(`/api/policy/exceptions/${id}/review`, { status, review_notes: notes });
      alert(res.message);
      this.load();
      if (window.Students) window.Students.load();
    } catch (err) {
      alert('Review failed: ' + err.message);
    }
  }
};
