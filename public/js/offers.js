const Offers = {
  allOffers: [],
  timerInterval: null,

  async load() {
    try {
      const data = await API.get('/api/offers');
      this.allOffers = data.offers || [];
      this.renderTable(this.allOffers);
      this.startCountdownTicker();
    } catch (err) {
      console.error('Failed to load offers:', err);
    }
  },

  renderTable(offers) {
    const tbody = document.getElementById('offers-tbody');
    if (!tbody) return;

    if (offers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-dim); padding: 24px;">No active or recorded offers found.</td></tr>`;
      return;
    }

    const now = Date.now();

    tbody.innerHTML = offers.map(o => {
      const expiresAt = new Date(o.expires_at).getTime();
      const remainingMs = expiresAt - now;
      const isPending = o.offer_status === 'Pending';
      const isExpired = remainingMs <= 0 && isPending;

      let statusBadge = '<span class="badge badge-review">Pending</span>';
      if (o.offer_status === 'Accepted') statusBadge = '<span class="badge badge-allowed">Accepted</span>';
      else if (o.offer_status === 'Declined') statusBadge = '<span class="badge badge-neutral">Declined</span>';
      else if (o.offer_status === 'Expired' || isExpired) statusBadge = '<span class="badge badge-blocked">Expired (24h Window)</span>';

      let deadlineDisplay = '<span style="color: var(--text-dim);">Concluded</span>';
      if (isPending && !isExpired) {
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
        deadlineDisplay = `
          <div class="countdown-box" title="Institutional 24-Hour Acceptance Deadline">
            <span class="pulse-dot"></span>
            <span>${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}</span>
          </div>
        `;
      } else if (isExpired) {
        deadlineDisplay = `<span style="color: var(--accent-rose); font-size: 0.78rem; font-weight: 700;">Window Elapsed</span>`;
      }

      // Can accept if pending and user is officer, admin, or target student
      const canAct = isPending && !isExpired && (
        ['admin', 'officer'].includes(Auth.currentUser.role) ||
        (Auth.currentUser.role === 'student' && Auth.currentUser.studentId === o.student_id)
      );

      return `
        <tr>
          <td><code>#${o.id}</code></td>
          <td>
            <strong>${o.student_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${o.placement_id}</div>
          </td>
          <td><span class="badge badge-neutral">${o.course}</span></td>
          <td>
            <strong>${o.company_name}</strong>
            ${o.is_off_campus ? '<span class="badge badge-review" style="font-size:0.65rem;">Off-Campus</span>' : ''}
          </td>
          <td><span class="badge badge-neutral">${o.offer_type}</span></td>
          <td><span class="badge badge-a">${o.category}</span></td>
          <td><strong>${o.ctc_lpa ? `₹${o.ctc_lpa} LPA` : '-'}</strong></td>
          <td>${o.stipend_amount ? `₹${o.stipend_amount.toLocaleString()}/mo` : '-'}</td>
          <td>${deadlineDisplay}</td>
          <td>${statusBadge}</td>
          <td>
            ${canAct ? `
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-success btn-sm" onclick="Offers.accept(${o.id})">Accept</button>
                <button class="btn btn-danger btn-sm" onclick="Offers.decline(${o.id})">Decline</button>
              </div>
            ` : '<span style="color: var(--text-dim); font-size: 0.78rem;">Locked</span>'}
          </td>
        </tr>
      `;
    }).join('');
  },

  startCountdownTicker() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      // Re-render countdown values every second
      const activeSection = document.querySelector('.view-section.active');
      if (activeSection && activeSection.id === 'view-offers') {
        this.renderTable(this.allOffers);
      }
    }, 1000);
  },

  async accept(offerId) {
    if (!confirm('Confirm acceptance of this recruitment offer? This updates your placement status and policy tier.')) return;
    try {
      const res = await API.post(`/api/offers/${offerId}/accept`, {});
      alert(res.message);
      this.load();
      if (window.Dashboard) window.Dashboard.load();
      if (window.Students) window.Students.load();
    } catch (err) {
      alert('Acceptance failed: ' + err.message);
    }
  },

  async decline(offerId) {
    if (!confirm('Are you sure you want to decline this offer?')) return;
    try {
      const res = await API.post(`/api/offers/${offerId}/decline`, {});
      alert(res.message);
      this.load();
    } catch (err) {
      alert('Decline failed: ' + err.message);
    }
  }
};
