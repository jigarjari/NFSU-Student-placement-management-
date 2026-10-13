const SecurityLab = {
  async runAllTests() {
    const container = document.getElementById('test-cases-container');
    const statusEl = document.getElementById('test-suite-status');
    const countsEl = document.getElementById('test-suite-counts');
    const passBadge = document.getElementById('test-pass-badge');
    const rateBadge = document.getElementById('test-rate-badge');

    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--accent-cyan);">⚡ Executing Automated Policy & Cybersecurity Test Suite...</div>';
    }

    try {
      const data = await API.get('/api/tests/run');
      const { summary, tests } = data;

      if (statusEl) {
        statusEl.innerHTML = summary.status === 'ALL_TESTS_PASSED'
          ? '<span style="color: var(--accent-emerald);">✅ All Security & Policy Test Cases Passed!</span>'
          : '<span style="color: var(--accent-rose);">⚠️ Some Tests Failed</span>';
      }

      if (countsEl) countsEl.textContent = `Executed ${summary.totalTests} tests across Policy Automation, RBAC, and Attack Defenses.`;
      if (passBadge) {
        passBadge.className = summary.passedTests === summary.totalTests ? 'badge badge-allowed' : 'badge badge-blocked';
        passBadge.textContent = `Passed: ${summary.passedTests}/${summary.totalTests}`;
      }
      if (rateBadge) {
        rateBadge.className = summary.passRate === 100 ? 'badge badge-allowed' : 'badge badge-review';
        rateBadge.textContent = `Pass Rate: ${summary.passRate}%`;
      }

      if (container) {
        container.innerHTML = tests.map(t => `
          <div class="test-suite-card ${t.passed ? 'pass' : 'fail'}">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span class="badge ${t.passed ? 'badge-allowed' : 'badge-blocked'}">
                  ${t.passed ? 'PASS' : 'FAIL'}
                </span>
                <span class="badge badge-neutral" style="font-size: 0.7rem;">${t.suite}</span>
                <span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 600;">${t.category}</span>
              </div>
              <h4 style="font-size: 0.98rem; color: var(--text-main); margin-bottom: 6px;">
                #${t.id}: ${t.name}
              </h4>
              <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 8px;">
                ${t.details}
              </div>
              <div style="display: flex; gap: 16px; font-size: 0.78rem; font-family: var(--font-mono);">
                <div><strong>Expected:</strong> <span style="color: var(--text-dim);">${t.expected}</span></div>
                <div><strong>Actual:</strong> <span style="color: ${t.passed ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${t.actual}</span></div>
              </div>
            </div>
            <div style="font-size: 1.5rem;">
              ${t.passed ? '🛡️' : '❌'}
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      if (container) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--accent-rose);">Test execution error: ${err.message}</div>`;
      }
    }
  }
};
