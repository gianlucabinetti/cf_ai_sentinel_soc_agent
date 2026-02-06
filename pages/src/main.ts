import './style.css';
import type { AnalyzeRequest, AnalyzeResponse, MitigationsResponse, MitigationRecord } from './types';

// API Configuration
const API_BASE = 'http://127.0.0.1:8787';

/**
 * SentinelDashboard - Class-based State Management
 * 
 * Manages the entire SOC dashboard lifecycle including:
 * - State management (analyzing, threats, API status)
 * - Auto-refresh functionality
 * - API connectivity monitoring
 * - UI rendering and updates
 */
class SentinelDashboard {
  // State
  private isAnalyzing: boolean = false;
  private activeThreats: MitigationRecord[] = [];
  private apiStatus: 'online' | 'offline' | 'checking' = 'checking';
  private autoRefreshInterval: number | null = null;
  private autoRefreshCountdown: number = 30;
  private countdownInterval: number | null = null;

  // DOM Elements
  private app: HTMLElement;
  private analyzeBtn: HTMLButtonElement | null = null;
  private analyzeBtnText: HTMLElement | null = null;
  private threatInput: HTMLTextAreaElement | null = null;
  private refreshBtn: HTMLButtonElement | null = null;
  private mitigationsContainer: HTMLElement | null = null;
  private resultsDiv: HTMLElement | null = null;
  private summaryDiv: HTMLElement | null = null;
  private statusDot: HTMLElement | null = null;
  private countdownText: HTMLElement | null = null;

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
    await this.loadMitigations();
    this.startAutoRefresh();
  }

  /**
   * Cleanup and destroy the dashboard
   */
  destroy(): void {
    this.stopAutoRefresh();
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  /**
   * Render the main UI structure
   */
  private renderUI(): void {
    this.app.innerHTML = `
      <div class="min-h-screen bg-sentinel-bg text-gray-100 font-mono p-6">
        <!-- Header -->
        <header class="mb-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div id="status-dot" class="status-dot" title="API Status"></div>
              <h1 class="text-3xl font-bold text-sentinel-accent">SENTINEL SOC</h1>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-sm text-gray-400">
                Edge-Native Agentic Security Operations Center
              </div>
              <div id="api-status-text" class="text-xs px-3 py-1 rounded-full bg-sentinel-panel border border-sentinel-border">
                <span class="text-gray-400">API:</span>
                <span id="api-status-label" class="ml-1 font-semibold text-sentinel-accent">Checking...</span>
              </div>
            </div>
          </div>
        </header>

        <!-- Two-Column Layout -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-180px)]">
          
          <!-- LEFT COLUMN: Threat Analysis -->
          <div class="panel flex flex-col">
            <h2 class="text-xl font-semibold text-sentinel-accent mb-4 flex items-center gap-2">
              <span>⚡</span>
              <span>Threat Analysis</span>
            </h2>
            
            <div class="flex-1 flex flex-col gap-4">
              <!-- Input Textarea -->
              <div class="flex-1">
                <label for="threat-input" class="block text-sm text-gray-400 mb-2">
                  Security Event Payload
                </label>
                <textarea
                  id="threat-input"
                  class="w-full h-full bg-[#0a0e1a] border border-sentinel-border rounded-lg p-4 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:border-sentinel-accent transition-colors"
                  placeholder="Paste security logs, suspicious requests, or threat indicators here...&#10;&#10;Example:&#10;POST /admin/login HTTP/1.1&#10;User-Agent: sqlmap/1.0&#10;X-Forwarded-For: 192.168.1.100&#10;Content-Type: application/x-www-form-urlencoded&#10;&#10;username=admin' OR '1'='1&password=test"
                ></textarea>
              </div>

              <!-- Analyze Button -->
              <button
                id="analyze-btn"
                class="bg-sentinel-accent hover:bg-sentinel-accent-dim text-sentinel-bg font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span id="analyze-btn-text">Analyze Threat</span>
              </button>

              <!-- Results Area -->
              <div id="analysis-results" class="hidden">
                <div class="bg-[#0a0e1a] border border-sentinel-border rounded-lg p-4">
                  <h3 class="text-sm font-semibold text-sentinel-accent mb-3">📋 Executive Summary</h3>
                  <div id="executive-summary" class="text-sm text-gray-300 leading-relaxed"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT COLUMN: System Monitoring -->
          <div class="panel flex flex-col">
            <h2 class="text-xl font-semibold text-sentinel-accent mb-4 flex items-center gap-2">
              <span>🛡️</span>
              <span>Live Threat Feed</span>
            </h2>
            
            <div class="flex-1 flex flex-col">
              <!-- Active IP Blocks Header -->
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-300">Active IP Blocks</h3>
                <div class="flex items-center gap-3">
                  <span id="countdown-text" class="text-xs text-gray-500">Next refresh: 30s</span>
                  <button
                    id="refresh-btn"
                    class="text-xs text-sentinel-accent hover:text-sentinel-accent-dim transition-colors"
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>

              <!-- Mitigations Table -->
              <div class="flex-1 overflow-auto">
                <div id="mitigations-container" class="space-y-3">
                  <!-- Loading state -->
                  <div class="text-center text-gray-500 py-8">
                    <div class="spinner mx-auto"></div>
                    <p class="text-sm mt-2">Loading mitigations...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Version Footer -->
        <footer class="fixed bottom-4 right-4 text-xs text-gray-600 opacity-40 hover:opacity-100 transition-opacity">
          v2.2.0
        </footer>
      </div>
    `;

    // Cache DOM elements
    this.analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
    this.analyzeBtnText = document.getElementById('analyze-btn-text') as HTMLElement;
    this.threatInput = document.getElementById('threat-input') as HTMLTextAreaElement;
    this.refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
    this.mitigationsContainer = document.getElementById('mitigations-container') as HTMLElement;
    this.resultsDiv = document.getElementById('analysis-results') as HTMLElement;
    this.summaryDiv = document.getElementById('executive-summary') as HTMLElement;
    this.statusDot = document.getElementById('status-dot') as HTMLElement;
    this.countdownText = document.getElementById('countdown-text') as HTMLElement;
  }

  /**
   * Attach event listeners to UI elements
   */
  private attachEventListeners(): void {
    this.analyzeBtn?.addEventListener('click', () => this.analyzeThreat());
    this.refreshBtn?.addEventListener('click', () => {
      this.loadMitigations();
      this.resetAutoRefreshCountdown();
    });
  }

  /**
   * Check API connectivity status
   */
  private async checkApiStatus(): Promise<void> {
    const statusLabel = document.getElementById('api-status-label');
    
    try {
      this.apiStatus = 'checking';
      const response = await fetch(`${API_BASE}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        this.apiStatus = 'online';
        if (statusLabel) statusLabel.textContent = 'Online';
        if (statusLabel) statusLabel.className = 'ml-1 font-semibold text-sentinel-accent';
        if (this.statusDot) this.statusDot.className = 'status-dot';
      } else {
        throw new Error('API returned non-OK status');
      }
    } catch (error) {
      this.apiStatus = 'offline';
      if (statusLabel) statusLabel.textContent = 'Offline';
      if (statusLabel) statusLabel.className = 'ml-1 font-semibold text-sentinel-danger';
      if (this.statusDot) {
        this.statusDot.className = 'w-2.5 h-2.5 bg-sentinel-danger rounded-full';
        this.statusDot.style.animation = 'none';
      }
      console.error('API health check failed:', error);
    }
  }

  /**
   * Start auto-refresh with countdown
   */
  private startAutoRefresh(): void {
    // Refresh every 30 seconds
    this.autoRefreshInterval = window.setInterval(() => {
      this.loadMitigations();
      this.checkApiStatus();
    }, 30000);

    // Update countdown every second
    this.autoRefreshCountdown = 30;
    this.countdownInterval = window.setInterval(() => {
      this.autoRefreshCountdown--;
      if (this.autoRefreshCountdown <= 0) {
        this.autoRefreshCountdown = 30;
      }
      if (this.countdownText) {
        this.countdownText.textContent = `Next refresh: ${this.autoRefreshCountdown}s`;
      }
    }, 1000);
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
   * Reset auto-refresh countdown
   */
  private resetAutoRefreshCountdown(): void {
    this.autoRefreshCountdown = 30;
    if (this.countdownText) {
      this.countdownText.textContent = `Next refresh: ${this.autoRefreshCountdown}s`;
    }
  }

  /**
   * Load active mitigations from API
   */
  private async loadMitigations(): Promise<void> {
    if (!this.mitigationsContainer) return;

    try {
      this.mitigationsContainer.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <div class="spinner mx-auto"></div>
          <p class="text-sm mt-2">Loading mitigations...</p>
        </div>
      `;

      const response = await fetch(`${API_BASE}/v1/mitigations`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MitigationsResponse = await response.json();
      this.activeThreats = data.mitigations;

      if (data.mitigations.length === 0) {
        this.mitigationsContainer.innerHTML = `
          <div class="text-center text-gray-500 py-8">
            <p class="text-sm">✓ No active mitigations</p>
            <p class="text-xs text-gray-600 mt-1">All systems nominal</p>
          </div>
        `;
        return;
      }

      // Render mitigations
      this.mitigationsContainer.innerHTML = data.mitigations
        .map(mitigation => this.renderMitigation(mitigation))
        .join('');

    } catch (error) {
      console.error('Failed to load mitigations:', error);
      this.mitigationsContainer.innerHTML = `
        <div class="text-center text-red-400 py-8">
          <p class="text-sm">⚠ Failed to load mitigations</p>
          <p class="text-xs text-gray-500 mt-1">${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      `;
    }
  }

  /**
   * Render a single mitigation record
   */
  private renderMitigation(mitigation: MitigationRecord): string {
    // Calculate risk color
    const riskColor = mitigation.riskScore >= 80 ? 'bg-sentinel-danger' :
      mitigation.riskScore >= 50 ? 'bg-sentinel-warning' :
        'bg-sentinel-success';

    // Determine if this is a tracked-only threat (not blocked)
    const isTrackedOnly = mitigation.ruleId === 'tracked-only';
    const statusBadge = isTrackedOnly 
      ? '<span class="text-xs px-2 py-0.5 rounded bg-sentinel-warning/20 text-sentinel-warning border border-sentinel-warning/30">TRACKED</span>'
      : '<span class="text-xs px-2 py-0.5 rounded bg-sentinel-danger/20 text-sentinel-danger border border-sentinel-danger/30">BLOCKED</span>';

    return `
      <div class="bg-[#0a0e1a] border border-sentinel-border rounded-lg p-4 hover:border-sentinel-accent transition-colors">
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <div class="text-sm font-semibold text-sentinel-accent">${mitigation.sourceIP}</div>
              ${statusBadge}
            </div>
            <div class="text-xs text-gray-400">${mitigation.attackType}</div>
          </div>
          <div class="text-xs text-gray-500">${mitigation.timeRemaining}</div>
        </div>
        
        <!-- Risk Score Bar -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-400">Risk Score</span>
            <span class="text-gray-300 font-semibold">${mitigation.riskScore}/100</span>
          </div>
          <div class="w-full bg-sentinel-panel rounded-full h-2 overflow-hidden">
            <div class="${riskColor} h-full rounded-full transition-all duration-500" style="width: ${mitigation.riskScore}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Format executive summary with markdown-like styling
   */
  private formatExecutiveSummary(summary: string): string {
    // Split into lines
    const lines = summary.split('\n');
    let formatted = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) {
        formatted += '<br>';
        continue;
      }

      // Bold headers (lines ending with :)
      if (trimmed.endsWith(':')) {
        formatted += `<div class="font-bold text-sentinel-accent mt-3 mb-1">${trimmed}</div>`;
        continue;
      }

      // Risk indicators
      if (trimmed.toLowerCase().includes('risk score:') || trimmed.toLowerCase().includes('risk:')) {
        const riskMatch = trimmed.match(/(\d+)/);
        if (riskMatch) {
          const riskScore = parseInt(riskMatch[1]);
          const riskColor = riskScore >= 80 ? 'text-sentinel-danger' :
            riskScore >= 50 ? 'text-sentinel-warning' :
              'text-sentinel-success';
          formatted += `<div class="my-2"><span class="text-gray-400">${trimmed.split(':')[0]}:</span> <span class="font-bold ${riskColor}">${riskScore}/100</span></div>`;
          continue;
        }
      }

      // Confidence levels
      if (trimmed.toLowerCase().includes('confidence:')) {
        const confidenceMatch = trimmed.match(/confidence:\s*(\w+)/i);
        if (confidenceMatch) {
          const confidence = confidenceMatch[1];
          const confidenceColor = confidence.toLowerCase() === 'high' ? 'text-sentinel-danger' :
            confidence.toLowerCase() === 'medium' ? 'text-sentinel-warning' :
              'text-sentinel-success';
          formatted += `<div class="my-2"><span class="text-gray-400">Confidence:</span> <span class="font-semibold ${confidenceColor}">${confidence}</span></div>`;
          continue;
        }
      }

      // Action items
      if (trimmed.toLowerCase().includes('action:')) {
        const actionMatch = trimmed.match(/action:\s*(\w+)/i);
        if (actionMatch) {
          const action = actionMatch[1].toUpperCase();
          const actionColor = action === 'BLOCK' ? 'text-sentinel-danger' :
            action === 'FLAG' ? 'text-sentinel-warning' :
              'text-sentinel-success';
          formatted += `<div class="my-2"><span class="text-gray-400">Action:</span> <span class="font-bold ${actionColor}">${action}</span></div>`;
          continue;
        }
      }

      // Bullet points (lines starting with - or *)
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        formatted += `<div class="ml-4 my-1 text-gray-300">• ${trimmed.substring(1).trim()}</div>`;
        continue;
      }

      // Regular text
      formatted += `<div class="my-1 text-gray-300">${trimmed}</div>`;
    }

    return formatted;
  }

  /**
   * Analyze threat payload
   */
  private async analyzeThreat(): Promise<void> {
    const payload = this.threatInput?.value || '';

    if (!payload.trim()) {
      alert('Please enter a security event payload to analyze');
      return;
    }

    if (this.isAnalyzing) return;

    try {
      this.isAnalyzing = true;
      if (this.analyzeBtn) this.analyzeBtn.disabled = true;
      if (this.analyzeBtnText) this.analyzeBtnText.innerHTML = '<span class="spinner"></span>Analyzing...';
      if (this.resultsDiv) this.resultsDiv.classList.add('hidden');

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

      // Display formatted executive summary
      if (this.summaryDiv) {
        this.summaryDiv.innerHTML = this.formatExecutiveSummary(data.assessment.executive_summary);
      }
      if (this.resultsDiv) this.resultsDiv.classList.remove('hidden');

      // Refresh mitigations if action was taken
      if (data.assessment.action === 'block' || data.assessment.riskScore > 70) {
        setTimeout(() => {
          this.loadMitigations();
          this.resetAutoRefreshCountdown();
        }, 1000);
      }

    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isAnalyzing = false;
      if (this.analyzeBtn) this.analyzeBtn.disabled = false;
      if (this.analyzeBtnText) this.analyzeBtnText.textContent = 'Analyze Threat';
    }
  }
}

// Initialize dashboard on load
const app = document.getElementById("app");
if (app) {
  const dashboard = new SentinelDashboard(app);
  dashboard.init();
}
