const Audit = {
  async load() {
    try {
      const data = await API.get('/api/audit');
      this.renderTable(data.logs || []);
      await this.verifyChain(false);
    } catch (err) {
      const tbody = document.getElementById('audit-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--accent-rose); padding: 20px;">${err.message}</td></tr>`;
      }
    }
  },

  renderTable(logs) {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">No audit logs recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let diffHtml = '-';
      if (l.after_state) {
        try {
          const parsed = JSON.parse(l.after_state);
          diffHtml = `<pre style="font-size: 0.72rem; color: var(--text-muted); max-height: 60px; overflow-y: auto;">${JSON.stringify(parsed, null, 2)}</pre>`;
        } catch {
          diffHtml = `<small>${l.after_state}</small>`;
        }
      }

      return `
        <tr>
          <td><code>#${l.id}</code></td>
          <td><small>${new Date(l.timestamp).toLocaleString()}</small></td>
          <td><strong>${l.actor_username}</strong></td>
          <td><span class="badge badge-neutral">${l.actor_role}</span></td>
          <td><strong>${l.action}</strong></td>
          <td><span class="badge badge-neutral">${l.entity_type}:${l.entity_id || ''}</span></td>
          <td>${diffHtml}</td>
          <td>
            <div class="hash-pill" title="Prev: ${l.prev_hash}&#10;Curr: ${l.hash}">
              ${l.hash.substring(0, 16)}...
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async verifyChain(showAlert = true) {
    try {
      const res = await API.get('/api/audit/verify-integrity');
      const banner = document.getElementById('audit-integrity-banner');
      const title = document.getElementById('audit-banner-title');
      const desc = document.getElementById('audit-banner-desc');
      const badge = document.getElementById('audit-banner-badge');

      if (res.isValid) {
        banner.className = 'policy-result-card ALLOWED';
        title.textContent = '✅ Cryptographic Hash Chain 100% Valid';
        desc.textContent = res.message;
        badge.className = 'badge badge-allowed';
        badge.textContent = 'ZERO TAMPERING';
      } else {
        banner.className = 'policy-result-card BLOCKED';
        title.textContent = '🚨 TAMPER DETECTED: Cryptographic Chain Broken!';
        desc.textContent = `${res.reason} (Compromised sequence ID: #${res.brokenAtId})`;
        badge.className = 'badge badge-blocked';
        badge.textContent = 'INTEGRITY BREACH';
      }

      if (showAlert) {
        alert(res.isValid ? 'Success: Audit log integrity verified with 100% cryptographic certainty.' : 'SECURITY WARNING: Tamper detected in audit chain! ' + res.reason);
      }
    } catch (err) {
      console.error('Audit verification error:', err);
    }
  },

  async simulateTamper() {
    if (!confirm('This will deliberately modify an audit row in the SQLite database out-of-band to demonstrate NFSU forensic tamper detection. Proceed?')) return;
    try {
      const res = await API.post('/api/audit/simulate-tamper', {});
      alert(res.message);
      await this.load();
    } catch (err) {
      alert('Tamper simulation error: ' + err.message);
    }
  },

  async repairChain() {
    try {
      const res = await API.post('/api/audit/repair-chain', {});
      alert(res.message);
      await this.load();
    } catch (err) {
      alert('Repair chain error: ' + err.message);
    }
  }
};
