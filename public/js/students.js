const Students = {
  allStudents: [],

  async load() {
    const courseSelect = document.getElementById('student-course-select');
    const statusSelect = document.getElementById('student-status-select');
    const searchInput = document.getElementById('student-search-input');
    const archivedCheck = document.getElementById('show-archived-checkbox');

    const course = courseSelect ? courseSelect.value : 'All';
    const status = statusSelect ? statusSelect.value : 'All';
    const search = searchInput ? searchInput.value.trim() : '';
    const showArchived = archivedCheck ? archivedCheck.checked : false;

    let url = `/api/students?course=${encodeURIComponent(course)}&status=${encodeURIComponent(status)}&showArchived=${showArchived}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    try {
      const data = await API.get(url);
      this.allStudents = data.students || [];
      this.renderTable(this.allStudents);
    } catch (err) {
      const tbody = document.getElementById('students-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--accent-rose); padding: 24px;">${err.message}</td></tr>`;
      }
    }
  },

  renderTable(students) {
    const tbody = document.getElementById('students-tbody');
    if (!tbody) return;

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--text-dim); padding: 24px;">No student records match the selected filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = students.map(s => {
      let tierBadge = '<span class="badge badge-neutral">None</span>';
      if (s.current_category === 'A+') tierBadge = '<span class="badge badge-a-plus">A+ (&ge;16L)</span>';
      else if (s.current_category === 'A') tierBadge = '<span class="badge badge-a">A (10-16L)</span>';
      else if (s.current_category === 'B') tierBadge = '<span class="badge badge-b">B (6-10L)</span>';
      else if (s.current_category === 'C') tierBadge = '<span class="badge badge-c">C (&lt;6L)</span>';

      let penaltyBadge = '<span style="color: var(--text-dim);">0</span>';
      if (s.absent_drives_penalty > 0) {
        penaltyBadge = `<span class="badge badge-blocked" title="Excluded from drives">⚠️ ${s.absent_drives_penalty} Drives Ban</span>`;
      }

      return `
        <tr>
          <td><code>${s.placement_id}</code></td>
          <td>
            <strong>${s.student_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${s.email_id}</div>
          </td>
          <td><span class="badge badge-neutral">${s.course}</span></td>
          <td><strong>${s.cgpa}</strong></td>
          <td><code style="color: var(--text-muted);">${s.mobile_number}</code></td>
          <td>
            <span class="badge ${s.registration_status === 'Registered' ? 'badge-allowed' : 'badge-blocked'}">
              ${s.registration_status}
            </span>
          </td>
          <td>
            <span class="badge ${s.eligibility_status === 'Eligible' ? 'badge-allowed' : (s.eligibility_status === 'Pending verification' ? 'badge-review' : 'badge-blocked')}">
              ${s.eligibility_status}
            </span>
          </td>
          <td>
            <span class="badge ${s.placement_status === 'Unplaced' ? 'badge-neutral' : 'badge-allowed'}">
              ${s.placement_status}
            </span>
          </td>
          <td>${s.current_company || '<em>Unplaced</em>'}</td>
          <td>${tierBadge}</td>
          <td>${s.current_ctc ? `₹${s.current_ctc} LPA` : '-'}</td>
          <td>
            <small>PPO: ${s.ppo_status}</small><br>
            <small>NOC: ${s.noc_status}</small>
          </td>
          <td>${penaltyBadge}</td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-outline btn-sm" onclick="Students.viewHistory(${s.id})" title="View Placement History">📜</button>
              ${Auth.currentUser && ['admin', 'officer'].includes(Auth.currentUser.role) ? `
                <button class="btn btn-outline btn-sm" onclick="Students.toggleArchive(${s.id}, ${s.is_archived})" title="${s.is_archived ? 'Restore' : 'Archive'}">
                  ${s.is_archived ? '🔄' : '📦'}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async viewHistory(studentId) {
    try {
      const data = await API.get(`/api/students/${studentId}/history`);
      const student = this.allStudents.find(s => s.id === studentId);
      const titleEl = document.getElementById('history-modal-title');
      const bodyEl = document.getElementById('history-modal-body');

      if (titleEl) titleEl.textContent = `📜 Placement History: ${student ? student.student_name : `Student #${studentId}`}`;
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div style="margin-bottom: 16px;">
            <h4>Recorded Placement & Policy Events</h4>
            ${data.history.length === 0 ? '<p style="color: var(--text-dim);">No placement history events recorded yet.</p>' : `
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                ${data.history.map(h => `
                  <div style="padding: 10px; background: var(--bg-input); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-cyan);">
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-dim);">
                      <span><strong>${h.event_type}</strong> (Actor: ${h.actor_username})</span>
                      <span>${new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    <div style="font-size: 0.88rem; margin-top: 4px;">${h.event_details}</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div style="margin-top: 20px;">
            <h4>Issued Offers</h4>
            ${data.offers.length === 0 ? '<p style="color: var(--text-dim);">No offers on record.</p>' : `
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                ${data.offers.map(o => `
                  <div style="padding: 10px; background: var(--bg-input); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong>${o.company_name}</strong> (Category ${o.category}, ${o.offer_type})
                      <div style="font-size: 0.8rem; color: var(--text-dim);">CTC: ₹${o.ctc_lpa} LPA • Stipend: ₹${o.stipend_amount || 0} • Issued: ${new Date(o.issued_at).toLocaleDateString()}</div>
                    </div>
                    <span class="badge ${o.offer_status === 'Accepted' ? 'badge-allowed' : (o.offer_status === 'Expired' ? 'badge-blocked' : 'badge-review')}">
                      ${o.offer_status}
                    </span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div style="margin-top: 20px;">
            <h4>Recruitment Activity Attendance</h4>
            ${data.attendance.length === 0 ? '<p style="color: var(--text-dim);">No recruitment attendance logged.</p>' : `
              <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
                ${data.attendance.map(a => `
                  <div style="padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm); font-size: 0.85rem; display: flex; justify-content: space-between;">
                    <span>${a.company_name} &bull; ${a.activity_type}</span>
                    <span class="badge ${a.attended ? 'badge-allowed' : 'badge-blocked'}">${a.attended ? 'Present' : 'Absent'}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        `;
      }

      window.App.openModal('modal-student-history');
    } catch (err) {
      alert('Error fetching student history: ' + err.message);
    }
  },

  async toggleArchive(studentId, isArchived) {
    const action = isArchived ? 'restore' : 'archive';
    if (!confirm(`Are you sure you want to ${action} this student record?`)) return;

    try {
      await API.post(`/api/students/${studentId}/archive`, { archive: !isArchived });
      this.load();
    } catch (err) {
      alert('Archive operation failed: ' + err.message);
    }
  },

  async exportCsv() {
    const courseSelect = document.getElementById('student-course-select');
    const course = courseSelect ? courseSelect.value : 'All';

    try {
      const blob = await API.request(`/api/students/export-csv?course=${encodeURIComponent(course)}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NFSU_Placement_Records_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('CSV Export failed: ' + err.message);
    }
  }
};
