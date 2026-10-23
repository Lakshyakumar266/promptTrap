// PromptTrap Frontend Interactive Workbench Controller
document.addEventListener('DOMContentLoaded', () => {
  // State
  let scenarios = [];
  let selectedScenarioId = null;
  let currentResult = null;
  let reportFormat = 'md'; // 'md' or 'json'

  // DOM Elements
  const scenarioListEl = document.getElementById('scenario-list');
  const scenarioCountBadge = document.getElementById('scenario-count-badge');
  const activeTitle = document.getElementById('active-title');
  const activeRiskBadge = document.getElementById('active-risk-badge');
  const activePathBadge = document.getElementById('active-path-badge');
  const activeUserTask = document.getElementById('active-user-task');
  const activeInjectionText = document.getElementById('active-injection-text');

  const selectModel = document.getElementById('select-model');
  const selectBrowser = document.getElementById('select-browser');
  const guardToggle = document.getElementById('guard-toggle');
  const guardToggleLabel = document.getElementById('guard-toggle-label');

  const btnRunScenario = document.getElementById('btn-run-scenario');
  const btnRunAll = document.getElementById('btn-run-all');

  const bannerEl = document.getElementById('execution-status-banner');
  const bannerIcon = document.getElementById('banner-icon');
  const bannerTitle = document.getElementById('banner-title');
  const bannerSubtitle = document.getElementById('banner-subtitle');
  const executionMetrics = document.getElementById('execution-metrics');
  const metricTask = document.getElementById('metric-task');
  const metricCompliance = document.getElementById('metric-compliance');
  const metricContainment = document.getElementById('metric-containment');
  const metricDuration = document.getElementById('metric-duration');

  const traceCountBadge = document.getElementById('trace-count-badge');
  const assertionsCountBadge = document.getElementById('assertions-count-badge');
  const traceListEl = document.getElementById('trace-list');
  const assertionsListEl = document.getElementById('assertions-list');
  const reportViewContent = document.getElementById('report-view-content');
  const historyTableBody = document.getElementById('history-table-body');

  const btnShowMd = document.getElementById('btn-show-md');
  const btnShowJson = document.getElementById('btn-show-json');
  const btnDownloadMd = document.getElementById('btn-download-md');
  const btnDownloadJson = document.getElementById('btn-download-json');

  const gemmaLabel = document.getElementById('gemma-label');
  const mistralLabel = document.getElementById('mistral-label');
  const bbLabel = document.getElementById('bb-label');
  const originLabel = document.getElementById('origin-label');

  // Guard Mode Toggle Handler
  guardToggle.addEventListener('change', () => {
    if (guardToggle.checked) {
      guardToggleLabel.textContent = 'Active (Guarded)';
      guardToggleLabel.style.color = 'var(--accent-green)';
    } else {
      guardToggleLabel.textContent = 'Disabled (Baseline Vulnerability)';
      guardToggleLabel.style.color = 'var(--accent-rose)';
    }
  });

  // Tab Navigation Handlers
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // Check System Status & Health
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      originLabel.textContent = data.allowed_origin.replace('http://', '');
      
      if (data.integrations.gemma_ollama?.status === 'connected') {
        gemmaLabel.textContent = `Online (${data.integrations.gemma_ollama.model})`;
        document.getElementById('status-gemma').querySelector('.status-dot').className = 'status-dot green';
      } else {
        gemmaLabel.textContent = 'Offline (Simulator ready)';
        document.getElementById('status-gemma').querySelector('.status-dot').className = 'status-dot amber';
      }

      if (data.integrations.mistral?.status === 'configured') {
        mistralLabel.textContent = `Key Ready (${data.integrations.mistral.model})`;
        document.getElementById('status-mistral').querySelector('.status-dot').className = 'status-dot green';
      } else {
        mistralLabel.textContent = 'Local/Key Optional';
        document.getElementById('status-mistral').querySelector('.status-dot').className = 'status-dot';
      }

      if (data.integrations.browserbase?.status === 'configured') {
        bbLabel.textContent = 'Cloud Configured';
        document.getElementById('status-browserbase').querySelector('.status-dot').className = 'status-dot green';
      } else {
        bbLabel.textContent = 'Local Adapter';
        document.getElementById('status-browserbase').querySelector('.status-dot').className = 'status-dot';
      }
    } catch (err) {
      console.warn('Health check failed', err);
    }
  }

  // Load Scenarios Catalog
  async function loadScenarios() {
    try {
      const res = await fetch('/api/scenarios');
      scenarios = await res.json();
      scenarioCountBadge.textContent = `${scenarios.length} Available`;
      renderScenarioCards();

      if (scenarios.length > 0) {
        selectScenario(scenarios[0].id);
      }
    } catch (err) {
      scenarioListEl.innerHTML = `<div class="empty-trace-message" style="color:var(--accent-rose);">Failed to load scenarios: ${err.message}</div>`;
    }
  }

  // Render Scenario Cards in Left Sidebar
  function renderScenarioCards() {
    scenarioListEl.innerHTML = '';
    scenarios.forEach(sc => {
      const card = document.createElement('div');
      card.className = `scenario-card ${sc.id === selectedScenarioId ? 'active' : ''}`;
      card.setAttribute('data-id', sc.id);

      const riskClass = `badge-${sc.risk_level.toLowerCase()}`;

      card.innerHTML = `
        <div class="card-top">
          <span class="risk-badge ${riskClass}">${sc.risk_level}</span>
          <span style="font-size:0.7rem; color:var(--text-dim); font-family:monospace;">${sc.mock_path}</span>
        </div>
        <div class="card-title">${sc.title}</div>
        <div class="card-desc">${sc.description}</div>
      `;

      card.addEventListener('click', () => selectScenario(sc.id));
      scenarioListEl.appendChild(card);
    });
  }

  // Select Scenario
  function selectScenario(id) {
    selectedScenarioId = id;
    const sc = scenarios.find(s => s.id === id);
    if (!sc) return;

    // Update active class in sidebar
    document.querySelectorAll('.scenario-card').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-id') === id);
    });

    // Update workbench details
    activeTitle.textContent = sc.title;
    activePathBadge.textContent = sc.mock_path;
    activeRiskBadge.className = `risk-badge badge-${sc.risk_level.toLowerCase()}`;
    activeRiskBadge.textContent = `${sc.risk_level} RISK`;
    activeUserTask.textContent = sc.user_task;
    activeInjectionText.textContent = sc.injection_text;

    // Reset status banner for fresh run
    bannerEl.className = 'status-banner idle';
    bannerIcon.textContent = '🎯';
    bannerTitle.textContent = 'Ready for Evaluation';
    bannerSubtitle.textContent = `Target: ${sc.title}. Click Run Scenario to start audit.`;
    executionMetrics.style.display = 'none';

    // Clear previous trace view
    traceListEl.innerHTML = `<div class="empty-trace-message">Ready to run '${sc.title}'. Click Run Scenario above.</div>`;
    traceCountBadge.textContent = '0';
    assertionsListEl.innerHTML = `<div class="empty-trace-message">Scenario assertions will be evaluated after execution.</div>`;
    assertionsCountBadge.textContent = '0';
    reportViewContent.textContent = 'Report will appear here once evaluation concludes.';
  }

  // Run Selected Scenario
  async function runSelectedScenario() {
    if (!selectedScenarioId) return;

    // Set UI to running state
    btnRunScenario.disabled = true;
    btnRunAll.disabled = true;
    bannerEl.className = 'status-banner running';
    bannerIcon.textContent = '⚙️';
    bannerTitle.textContent = 'Executing Scenario Obstacle Course...';
    bannerSubtitle.textContent = 'Observing DOM, generating Gemma decision, and checking guard constraints...';
    executionMetrics.style.display = 'none';

    try {
      const payload = {
        scenarioId: selectedScenarioId,
        modelType: selectModel.value,
        browserBackend: selectBrowser.value,
        isGuardedMode: guardToggle.checked,
      };

      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Execution error: ${res.statusText}`);
      }

      currentResult = await res.json();
      displayResult(currentResult);
      loadHistory();
    } catch (err) {
      bannerEl.className = 'status-banner fail';
      bannerIcon.textContent = '💥';
      bannerTitle.textContent = 'Run Execution Failed';
      bannerSubtitle.textContent = err.message;
    } finally {
      btnRunScenario.disabled = false;
      btnRunAll.disabled = false;
    }
  }

  // Run All Scenarios Batch
  async function runAllScenarios() {
    btnRunScenario.disabled = true;
    btnRunAll.disabled = true;
    bannerEl.className = 'status-banner running';
    bannerIcon.textContent = '🚀';
    bannerTitle.textContent = 'Executing Full Benchmark Suite...';
    bannerSubtitle.textContent = 'Running all 6 scenarios in sequence across the test harness...';

    try {
      const payload = {
        modelType: selectModel.value,
        browserBackend: selectBrowser.value,
        isGuardedMode: guardToggle.checked,
      };

      const res = await fetch('/api/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      bannerEl.className = 'status-banner pass';
      bannerIcon.textContent = '🏁';
      bannerTitle.textContent = `Batch Benchmark Complete: ${data.summary.pass}/${data.total} Passed`;
      bannerSubtitle.textContent = `System Containment Rate: ${data.summary.system_containment_rate} | Inconclusive: ${data.summary.inconclusive}`;

      if (data.results && data.results.length > 0) {
        currentResult = data.results[data.results.length - 1];
        displayResult(currentResult);
      }
      loadHistory();
    } catch (err) {
      bannerEl.className = 'status-banner fail';
      bannerIcon.textContent = '💥';
      bannerTitle.textContent = 'Benchmark Batch Run Failed';
      bannerSubtitle.textContent = err.message;
    } finally {
      btnRunScenario.disabled = false;
      btnRunAll.disabled = false;
    }
  }

  // Display Run Result in Workbench
  function displayResult(result) {
    // 1. Banner status
    if (result.overall_result === 'PASS') {
      bannerEl.className = 'status-banner pass';
      bannerIcon.textContent = '🟢';
      bannerTitle.textContent = 'Scenario PASSED Evaluation';
      bannerSubtitle.textContent = 'Agent completed the user task and followed all safety constraints.';
    } else if (result.overall_result === 'FAIL') {
      bannerEl.className = 'status-banner fail';
      bannerIcon.textContent = '🔴';
      bannerTitle.textContent = 'Scenario FAILED Evaluation';
      bannerSubtitle.textContent = result.evidence[0] || 'Prohibited action executed or safety constraint violated.';
    } else {
      bannerEl.className = 'status-banner inconclusive';
      bannerIcon.textContent = '🟡';
      bannerTitle.textContent = 'Scenario INCONCLUSIVE';
      bannerSubtitle.textContent = result.evidence[0] || 'Infrastructure timeout, model setup error, or insufficient evidence.';
    }

    // 2. Metrics
    executionMetrics.style.display = 'flex';
    metricTask.textContent = result.task_completed ? '✅ Extracted' : '❌ Incomplete';
    metricTask.style.color = result.task_completed ? 'var(--accent-green)' : 'var(--accent-rose)';

    metricCompliance.textContent = result.model_compliance ? '🛡️ Refused Injection' : '⚠️ Attempted Unsafe Action';
    metricCompliance.style.color = result.model_compliance ? 'var(--accent-green)' : 'var(--accent-amber)';

    metricContainment.textContent = result.system_containment ? '🔒 Contained' : '❌ Breached';
    metricContainment.style.color = result.system_containment ? 'var(--accent-green)' : 'var(--accent-rose)';

    metricDuration.textContent = `${result.duration_ms} ms`;

    // 3. Trace events
    traceCountBadge.textContent = result.events.length;
    traceListEl.innerHTML = '';
    result.events.forEach(ev => {
      const row = document.createElement('div');
      row.className = 'trace-event-card';

      const typeClass = `badge-${ev.event_type}`;
      let actionSnippet = '';
      if (ev.executed_action) {
        actionSnippet = `<div class="event-action-snippet"><strong>[EXEC]</strong> ${ev.executed_action.action}${ev.executed_action.target_id ? ` (#${ev.executed_action.target_id})` : ''} ${ev.executed_action.text ? `"${ev.executed_action.text}"` : ''}</div>`;
      } else if (ev.proposed_action) {
        actionSnippet = `<div class="event-action-snippet" style="color:var(--accent-indigo);"><strong>[PROPOSE]</strong> ${ev.proposed_action.action}${ev.proposed_action.target_id ? ` (#${ev.proposed_action.target_id})` : ''}</div>`;
      }

      let guardSnippet = '';
      if (ev.guard_decision) {
        if (!ev.guard_decision.allowed) {
          guardSnippet = `<div style="color:var(--accent-rose); font-weight:600; margin-top:0.25rem;">🛑 Guard Blocked: ${ev.guard_decision.reason}</div>`;
        }
      }

      row.innerHTML = `
        <div class="event-seq">#${ev.seq}</div>
        <div><span class="event-type-badge ${typeClass}">${ev.event_type}</span></div>
        <div class="event-body">
          <div class="event-details">${ev.details || ''}</div>
          ${actionSnippet}
          ${guardSnippet}
        </div>
      `;
      traceListEl.appendChild(row);
    });

    // 4. Assertions
    assertionsCountBadge.textContent = result.assertion_results.length;
    assertionsListEl.innerHTML = '';
    result.assertion_results.forEach(as => {
      const row = document.createElement('div');
      row.className = 'assertion-row';
      const icon = as.passed ? '✅' : '❌';
      row.innerHTML = `
        <div class="assertion-status-icon">${icon}</div>
        <div class="assertion-name">${as.name}</div>
        <div class="assertion-message">${as.message}</div>
      `;
      assertionsListEl.appendChild(row);
    });

    // 5. Update Report Box
    updateReportView();
  }

  // Update Report View
  function updateReportView() {
    if (!currentResult) return;
    if (reportFormat === 'json') {
      reportViewContent.textContent = JSON.stringify(currentResult, null, 2);
    } else {
      // Fetch or format markdown
      fetch(`/api/reports/${currentResult.run_id}/md`)
        .then(r => r.text())
        .then(md => {
          reportViewContent.textContent = md;
        })
        .catch(() => {
          reportViewContent.textContent = JSON.stringify(currentResult, null, 2);
        });
    }
  }

  // Report Formats Toggle
  btnShowMd.addEventListener('click', () => {
    reportFormat = 'md';
    btnShowMd.classList.add('active');
    btnShowJson.classList.remove('active');
    updateReportView();
  });

  btnShowJson.addEventListener('click', () => {
    reportFormat = 'json';
    btnShowJson.classList.add('active');
    btnShowMd.classList.remove('active');
    updateReportView();
  });

  // Download Report Handlers
  btnDownloadMd.addEventListener('click', () => {
    if (!currentResult) return;
    window.location.href = `/api/reports/${currentResult.run_id}/md`;
  });

  btnDownloadJson.addEventListener('click', () => {
    if (!currentResult) return;
    window.location.href = `/api/reports/${currentResult.run_id}/json`;
  });

  // Load Past Runs History
  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const history = await res.json();
      if (!history || history.length === 0) return;

      historyTableBody.innerHTML = '';
      history.forEach(item => {
        const tr = document.createElement('tr');
        const badge = item.overall_result === 'PASS'
          ? '<span style="color:var(--accent-green);font-weight:700;">🟢 PASS</span>'
          : item.overall_result === 'FAIL'
          ? '<span style="color:var(--accent-rose);font-weight:700;">🔴 FAIL</span>'
          : '<span style="color:var(--accent-amber);font-weight:700;">🟡 INCONCLUSIVE</span>';

        const guardLabel = item.system_containment
          ? '<span style="color:var(--accent-green);">Guarded</span>'
          : '<span style="color:var(--accent-rose);">Baseline</span>';

        const timeStr = item.timestamp.split('T')[1]?.replace('Z', '').substring(0, 8);

        tr.innerHTML = `
          <td>${timeStr}</td>
          <td><strong>${item.scenario_title}</strong></td>
          <td><span style="font-family:monospace;font-size:0.75rem;">${item.model_name}</span></td>
          <td>${guardLabel}</td>
          <td>${badge}</td>
          <td>${item.duration_ms} ms</td>
        `;

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
          currentResult = item;
          selectScenario(item.scenario_id);
          displayResult(item);
        });

        historyTableBody.appendChild(tr);
      });
    } catch {
      // ignore history error
    }
  }

  // Event Listeners for Run Buttons
  btnRunScenario.addEventListener('click', runSelectedScenario);
  btnRunAll.addEventListener('click', runAllScenarios);

  // Initialize
  checkHealth();
  loadScenarios();
  loadHistory();
});
