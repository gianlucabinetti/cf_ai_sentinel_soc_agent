import './style.css';
import type { AnalyzeRequest, AnalyzeResponse, MitigationsResponse, TelemetryData, ThreatStreamEntry } from './types';

// API Configuration
const API_BASE = 'http://127.0.0.1:8787';

/**
 * SentinelDashboard - Enterprise SOC HUD
 * 
 * Professional IPS monitoring interface with:
 * - Real-time telemetry cards
 * - High-density threat stream
 * - Sandbox modal for manual testing
 * - Auto-polling every 5 seconds
 */
class SentinelDashboard {
  // State
  private telemetry: TelemetryData = {
    systemStatus: 'checking',
    latency: 0,
    activeRules: 0,
    totalBlocks: 0
  };
  private threatStream: ThreatStreamEntry[] = [];
  private isAnalyzing: boolean = false;
  private autoRefreshInterval: number | null = null;

  // DOM Elements
  private app: HTMLElement;

  constructor(appElement: HTMLElement) {
    this.app = appElement;
  }

  /**
   * Initialize the dashboard
   */
  async init(): Promise<void> {
    this.renderUI();
    this.attachEventListeners();
    await this.checkApiStatus();
    await this.loadThreatStream();
    this.startAutoRefresh();
  }

  /**
   * Cleanup and destroy the dashboard
   */
  destroy(): void {
    this.stopAutoRefresh();
  }

  /**
   * Render the main UI structure
   */
  private renderUI(): void {
    this.app.innerHTML = `
      <div class="min-h-screen bg-sentinel-bg text-gray-100 font-mono p-6">
        <!-- Header -->
        <header class="mb-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h1 class="text-3xl font-bold text-sentinel-accent">SENTINEL IPS</h1>
              <span class="text-xs text-gray-500 px-2 py-1 bg-sentinel-panel border border-sentinel-border rounded">v2.2.0</span>
            </div>
            <button
              id="sandbox-toggle"
              class="text-sm text-gray-400 hover:text-sentinel-accent transition-colors px-4 py-2 border border-sentinel-border rounded-lg"
            >
              Sandbox
            </button>
          </div>
        </header>

        <!-- Telemetry HUD -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <!-- System Status Card -->
          <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-400 uppercase tracking-wide">System Status</span>
              <div id="status-indicator" class="status-dot"></div>
            </div>
            <div id="status-value" class="text-2xl font-bold text-sentinel-accent">Checking</div>
          </div>

          <!-- Latency Card -->
          <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-400 uppercase tracking-wide">Latency</span>
            </div>
            <div id="latency-value" class="text-2xl font-bold text-gray-300">
              <span id="latency-number">0</span><span class="text-sm text-gray-500">ms</span>
            </div>
          </div>

          <!-- Active Rules Card -->
          <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-400 uppercase tracking-wide">Active Rules</span>
            </div>
            <div id="active-rules-value" class="text-2xl font-bold text-gray-300">0</div>
          </div>

          <!-- Total Blocks Card -->
          <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-400 uppercase tracking-wide">Total Blocks</span>
            </div>
            <div id="total-blocks-value" class="text-2xl font-bold text-sentinel-danger">0</div>
          </div>
        </div>

        <!-- Live Threat Stream -->
        <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-semibold text-sentinel-accent">Live Threat Stream</h2>
            <div class="text-xs text-gray-500">Auto-refresh: 5s</div>
          </div>

          <!-- Threat Stream Table -->
          <div class="overflow-x-auto">
            <div id="threat-stream-container">
              <!-- Loading state -->
              <div class="text-center text-gray-500 py-12">
                <div class="spinner mx-auto mb-3"></div>
                <p class="text-sm">Initializing threat monitoring...</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Sandbox Modal -->
        <div id="sandbox-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden items-center justify-center z-50">
          <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-semibold text-sentinel-accent">Sandbox: Manual Threat Analysis</h3>
              <button id="sandbox-close" class="text-gray-400 hover:text-gray-200 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div class="space-y-4">
              <!-- Input Textarea -->
              <div>
                <label for="threat-input" class="block text-sm text-gray-400 mb-2">
                  Security Event Payload
                </label>
                <textarea
                  id="threat-input"
                  class="w-full h-48 bg-sentinel-bg border border-sentinel-border rounded-lg p-4 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:border-sentinel-accent transition-colors"
                  placeholder="Paste security logs, suspicious requests, or threat indicators here...

Example:
POST /admin/login HTTP/1.1
User-Agent: sqlmap/1.0
X-Forwarded-For: 192.168.1.100
Content-Type: application/x-www-form-urlencoded

username=admin' OR '1'='1&password=test"
                ></textarea>
              </div>

              <!-- Analyze Button -->
              <button
                id="analyze-btn"
                class="w-full bg-sentinel-accent hover:bg-sentinel-accent-dim text-sentinel-bg font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span id="analyze-btn-text">Analyze Threat</span>
              </button>

              <!-- Results Area -->
              <div id="analysis-results" class="hidden">
                <div class="bg-sentinel-bg border border-sentinel-border rounded-lg p-4">
                  <h4 class="text-sm font-semibold text-sentinel-accent mb-3">Executive Summary</h4>
                  <div id="executive-summary" class="text-sm text-gray-300 leading-relaxed"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners after rendering
    this.attachEventListeners();
  }

  /**
   * Attach event listeners to UI elements
   */
  private attachEventListeners(): void {
    const sandboxToggle = document.getElementById('sandbox-toggle');
    const sandboxClose = document.getElementById('sandbox-close');
    const sandboxModal = document.getElementById('sandbox-modal');
    const analyzeBtn = document.getElementById('analyze-btn');

    sandboxToggle?.addEventListener('click', () => {
      sandboxModal?.classList.remove('hidden');
      sandboxModal?.classList.add('flex');
    });

    sandboxClose?.addEventListener('click', () => {
      sandboxModal?.classList.add('hidden');
      sandboxModal?.classList.remove('flex');
    });

    analyzeBtn?.addEventListener('click', () => this.analyzeThreat());
  }

  /**
   * Check API connectivity status
   */
  private async checkApiStatus(): Promise<void> {
    const startTime = performance.now();
    
    try {
      this.telemetry.systemStatus = 'checking';
      this.updateTelemetryUI();

      const response = await fetch(`${API_BASE}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      const endTime = performance.now();
      this.telemetry.latency = Math.round(endTime - startTime);

      if (response.ok) {
        this.telemetry.systemStatus = 'online';
      } else {
        throw new Error('API returned non-OK status');
      }
    } catch (error) {
      this.telemetry.systemStatus = 'offline';
      this.telemetry.latency = 0;
      console.error('API health check failed:', error);
    }

    this.updateTelemetryUI();
  }

  /**
   * Update telemetry UI elements
   */
  private updateTelemetryUI(): void {
    const statusValue = document.getElementById('status-value');
    const statusIndicator = document.getElementById('status-indicator');
    const latencyNumber = document.getElementById('latency-number');
    const activeRulesValue = document.getElementById('active-rules-value');
    const totalBlocksValue = document.getElementById('total-blocks-value');

    // System Status
    if (statusValue && statusIndicator) {
      if (this.telemetry.systemStatus === 'online') {
        statusValue.textContent = 'Online';
        statusValue.className = 'text-2xl font-bold text-sentinel-accent';
        statusIndicator.className = 'status-dot';
      } else if (this.telemetry.systemStatus === 'offline') {
        statusValue.textContent = 'Offline';
        statusValue.className = 'text-2xl font-bold text-sentinel-danger';
        statusIndicator.className = 'w-2 h-2 bg-sentinel-danger rounded-full';
      } else {
        statusValue.textContent = 'Checking';
        statusValue.className = 'text-2xl font-bold text-gray-400';
        statusIndicator.className = 'w-2 h-2 bg-gray-400 rounded-full animate-pulse';
      }
    }

    // Latency
    if (latencyNumber) {
      latencyNumber.textContent = this.telemetry.latency.toString();
    }

    // Active Rules
    if (activeRulesValue) {
      activeRulesValue.textContent = this.telemetry.activeRules.toString();
    }

    // Total Blocks
    if (totalBlocksValue) {
      totalBlocksValue.textContent = this.telemetry.totalBlocks.toString();
    }
  }

  /**
   * Start auto-refresh with 5 second interval
   */
  private startAutoRefresh(): void {
    this.autoRefreshInterval = window.setInterval(() => {
      this.loadThreatStream();
      this.checkApiStatus();
    }, 5000);
  }

  /**
   * Stop auto-refresh
   */
  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  /**
   * Load threat stream from API
   */
  private async loadThreatStream(): Promise<void> {
    const container = document.getElementById('threat-stream-container');
    if (!container) return;

    try {
      const response = await fetch(`${API_BASE}/v1/mitigations`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MitigationsResponse = await response.json();
      
      // Update telemetry
      this.telemetry.activeRules = data.count;
      this.telemetry.totalBlocks = data.mitigations.filter(m => m.ruleId !== 'tracked-only').length;
      this.updateTelemetryUI();

      // Convert mitigations to threat stream entries
      this.threatStream = data.mitigations.map(m => ({
        timestamp: new Date(m.createdAt).toLocaleTimeString(),
        sourceIP: m.sourceIP,
        attackVector: m.attackType,
        riskScore: m.riskScore,
        action: m.ruleId === 'tracked-only' ? 'FLAGGED' : 'BLOCKED'
      }));

      if (this.threatStream.length === 0) {
        container.innerHTML = `
          <div class="text-center text-gray-500 py-12">
            <p class="text-sm font-mono">Network Secure: Monitoring Edge Traffic...</p>
          </div>
        `;
        return;
      }

      // Render threat stream table
      container.innerHTML = `
        <table class="w-full text-sm">
          <thead class="border-b border-sentinel-border">
            <tr class="text-left text-gray-400 uppercase tracking-wide text-xs">
              <th class="pb-3 font-semibold">Timestamp</th>
              <th class="pb-3 font-semibold">Source IP</th>
              <th class="pb-3 font-semibold">Attack Vector</th>
              <th class="pb-3 font-semibold">Risk Score</th>
              <th class="pb-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sentinel-border">
            ${this.threatStream.map(entry => this.renderThreatEntry(entry)).join('')}
          </tbody>
        </table>
      `;

    } catch (error) {
      console.error('Failed to load threat stream:', error);
      container.innerHTML = `
        <div class="text-center text-sentinel-danger py-12">
          <p class="text-sm">Failed to load threat stream</p>
          <p class="text-xs text-gray-500 mt-1">${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      `;
    }
  }

  /**
   * Render a single threat stream entry
   */
  private renderThreatEntry(entry: ThreatStreamEntry): string {
    const riskColor = entry.riskScore >= 90 ? 'text-sentinel-danger' :
      entry.riskScore >= 70 ? 'text-sentinel-warning' :
        'text-sentinel-success';

    const actionColor = entry.action === 'BLOCKED' ? 'bg-sentinel-danger/20 text-sentinel-danger border-sentinel-danger/30' :
      entry.action === 'FLAGGED' ? 'bg-sentinel-warning/20 text-sentinel-warning border-sentinel-warning/30' :
        'bg-sentinel-success/20 text-sentinel-success border-sentinel-success/30';

    return `
      <tr class="hover:bg-sentinel-bg/50 transition-colors">
        <td class="py-3 text-gray-400">${entry.timestamp}</td>
        <td class="py-3 text-gray-200 font-mono">${entry.sourceIP}</td>
        <td class="py-3 text-gray-300">${entry.attackVector}</td>
        <td class="py-3">
          <div class="flex items-center gap-2">
            <div class="w-16 h-2 bg-sentinel-bg rounded-full overflow-hidden">
              <div class="${riskColor.replace('text-', 'bg-')} h-full rounded-full" style="width: ${entry.riskScore}%"></div>
            </div>
            <span class="${riskColor} font-semibold">${entry.riskScore}</span>
          </div>
        </td>
        <td class="py-3">
          <span class="text-xs px-2 py-1 rounded border ${actionColor}">${entry.action}</span>
        </td>
      </tr>
    `;
  }

  /**
   * Analyze threat payload (Sandbox)
   */
  private async analyzeThreat(): Promise<void> {
    const threatInput = document.getElementById('threat-input') as HTMLTextAreaElement;
    const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
    const analyzeBtnText = document.getElementById('analyze-btn-text');
    const resultsDiv = document.getElementById('analysis-results');
    const summaryDiv = document.getElementById('executive-summary');

    const payload = threatInput?.value || '';

    if (!payload.trim()) {
      alert('Please enter a security event payload to analyze');
      return;
    }

    if (this.isAnalyzing) return;

    try {
      this.isAnalyzing = true;
      if (analyzeBtn) analyzeBtn.disabled = true;
      if (analyzeBtnText) analyzeBtnText.innerHTML = '<span class="spinner"></span>Analyzing...';
      if (resultsDiv) resultsDiv.classList.add('hidden');

      const requestBody: AnalyzeRequest = { payload };
      const response = await fetch(`${API_BASE}/v1/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: AnalyzeResponse = await response.json();

      // Display executive summary
      if (summaryDiv) {
        summaryDiv.innerHTML = this.formatExecutiveSummary(data.assessment.executive_summary);
      }
      if (resultsDiv) resultsDiv.classList.remove('hidden');

      // Refresh threat stream
      setTimeout(() => {
        this.loadThreatStream();
      }, 1000);

    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isAnalyzing = false;
      if (analyzeBtn) analyzeBtn.disabled = false;
      if (analyzeBtnText) analyzeBtnText.textContent = 'Analyze Threat';
    }
  }

  /**
   * Format executive summary
   */
  private formatExecutiveSummary(summary: string): string {
    return `<div class="text-gray-300">${summary}</div>`;
  }
}

// Initialize dashboard on load
const app = document.getElementById("app");
if (app) {
  const dashboard = new SentinelDashboard(app);
  dashboard.init();
}
