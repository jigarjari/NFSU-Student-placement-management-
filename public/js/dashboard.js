const Dashboard = {
  async load() {
    const filterSelect = document.getElementById('dashboard-course-filter');
    const course = filterSelect ? filterSelect.value : 'All';

    try {
      const url = course === 'All' ? '/api/analytics' : `/api/analytics?course=${encodeURIComponent(course)}`;
      const data = await API.get(url);
      const stats = data.stats;

      this.renderKPIs(stats);
      this.renderCourseTable(stats.courseBreakdown);
      this.renderCategoryMetrics(stats.categories, stats.offerTypes);
      this.renderSwitchingEligible(stats.switchingEligibleStudents, stats.switchingEligibleCount);
    } catch (err) {
      console.error('Failed to load analytics dashboard:', err);
    }
  },

  renderKPIs(stats) {
    const { overview, compensation } = stats;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('kpi-total-registered', overview.totalRegistered);
    set('kpi-reg-sub', `${overview.totalEligible} Verified Eligible • ${overview.totalIneligible} Ineligible`);

    set('kpi-unique-placed', overview.uniquePlacedCount);
    set('kpi-placed-rate', `${overview.placementRate}% Placement Rate (${overview.uniquePlacedCount}/${overview.totalRegistered} Placed)`);

    set('kpi-highest-ctc', `₹${compensation.highestFteCtc || 0} LPA`);
    set('kpi-median-ctc', `₹${compensation.medianFteCtc || 0} LPA`);
    set('kpi-average-stipend-sub', `Avg Stipend: ₹${(compensation.averageStipend || 0).toLocaleString()} /mo (Avg CTC: ₹${compensation.averageFteCtc || 0} LPA)`);
  },

  renderCourseTable(courseList = []) {
    const tbody = document.getElementById('course-breakdown-tbody');
    if (!tbody) return;

    if (courseList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color: var(--text-dim); padding: 16px;">No course statistics recorded.</td></tr>`;
      return;
    }

    tbody.innerHTML = courseList.map(c => `
      <tr>
        <td><strong>${c.course}</strong></td>
        <td>${c.totalStudents}</td>
        <td><span class="tag tag-success">${c.placedCount}</span></td>
        <td>${c.unplacedCount}</td>
        <td><strong>${c.placementRate}%</strong></td>
        <td>${c.internshipOnly}</td>
        <td>${c.fteOnly}</td>
        <td>${c.internshipPlusPpo}</td>
        <td><strong>₹${c.highestCtc} LPA</strong></td>
        <td>₹${c.medianCtc} LPA</td>
        <td>₹${c.averageStipend.toLocaleString()} /mo</td>
      </tr>
    `).join('');
  },

  renderCategoryMetrics(categories, offerTypes) {
    const container = document.getElementById('category-metrics-list');
    if (!container) return;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-input); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-purple);">
        <div>
          <strong>Category A+ (&ge; ₹16.0 LPA)</strong>
          <div style="font-size: 0.75rem; color: var(--text-dim);">No switching permitted. Placements completed.</div>
        </div>
        <span class="tag tag-a-plus">${categories.categoryAPlusCount} Placed</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-input); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-cyan);">
        <div>
          <strong>Category A (₹10.0–16.0 LPA)</strong>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Switching allowed ONLY to Category A+ companies.</div>
        </div>
        <span class="tag tag-a">${categories.categoryACount} Placed</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-input); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-emerald);">
        <div>
          <strong>Category B (₹6.0–10.0 LPA)</strong>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Switching allowed where new CTC &ge; 1.5x current package.</div>
        </div>
        <span class="tag tag-b">${categories.categoryBCount} Placed</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-input); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-amber);">
        <div>
          <strong>Category C (Below ₹6.0 LPA)</strong>
          <div style="font-size: 0.75rem; color: var(--text-dim);">Eligible for higher-category upgrades (B, A, A+).</div>
        </div>
        <span class="tag tag-c">${categories.categoryCCount} Placed</span>
      </div>

      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between;">
        <span>Internship: <strong>${offerTypes.internshipOnlyCount}</strong></span>
        <span>FTE: <strong>${offerTypes.fteOnlyCount}</strong></span>
        <span>Internship+FTE: <strong>${offerTypes.internshipPlusPpoCount}</strong></span>
      </div>
    `;
  },

  renderSwitchingEligible(students = [], count = 0) {
    const badgeEl = document.getElementById('switching-eligible-count-badge');
    const tbody = document.getElementById('switching-eligible-tbody');
    if (badgeEl) badgeEl.textContent = `${count} Eligible Candidates`;
    if (!tbody) return;

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 16px;">No candidates currently eligible for switching.</td></tr>`;
      return;
    }

    tbody.innerHTML = students.map(s => `
      <tr>
        <td><code>${s.placementId}</code></td>
        <td><strong>${s.name}</strong></td>
        <td><span class="tag tag-neutral">${s.currentPlacement} (${s.currentCategory})</span></td>
        <td><small style="color: var(--accent-emerald); font-weight: 600;">${s.switchingRuleAllowed}</small></td>
      </tr>
    `).join('');
  }
};
