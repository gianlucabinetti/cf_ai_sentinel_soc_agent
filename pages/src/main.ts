import './style.css'; 
import type { AnalyzeRequest, AnalyzeResponse, MitigationsResponse, MitigationRecord } from './types';

// API Configuration
const API_BASE = 'http://127.0.0.1:8787';

// State
let isAnalyzing = false;

// Initialize the Dashboard UI
function initDashboard() {
  const app = document.getElementById("app")!;
  
  app.innerHTML = `
    <div class="min-h-screen bg-sentinel-bg text-gray-100 font-mono p-6">
      <!-- Header -->
      <header class="mb-8">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="status-dot"></div>
            <h1 class="text-3xl font-bold text-sentinel-accent">SENTINEL SOC</h1>
          </div>
          <div class="text-sm text-gray-400">
            Edge-Native Agentic Security Operations Center
          </div>
        </div>
      </header>

      <!-- Two-Column Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-180px)]">
        
        <!-- LEFT COLUMN: Threat Analysis -->
        <div class="panel flex flex-col">
          <h2 class="text-xl font-semibold text-sentinel-accent mb-4 flex items-center gap-2">
            <span>🔍</span>
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
                <h3 class="text-sm font-semibold text-sentinel-accent mb-3">Executive Summary</h3>
                <div id="executive-summary" class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: System Monitoring -->
        <div class="panel flex flex-col">
          <h2 class="text-xl font-semibold text-sentinel-accent mb-4 flex items-center gap-2">
            <span>🛡️</span>
            <span>System Monitoring</span>
          </h2>
          
          <div class="flex-1 flex flex-col">
            <!-- Active IP Blocks Header -->
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-300">Active IP Blocks</h3>
              <button
                id="refresh-btn"
                class="text-xs text-sentinel-accent hover:text-sentinel-accent-dim transition-colors"
              >
                ↻ Refresh
              </button>
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
    </div>
  `;

  // Attach event listeners
  const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
  const threatInput = document.getElementById('threat-input') as HTMLTextAreaElement;
  const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;

  analyzeBtn.addEventListener('click', () => analyzeThreat(threatInput.value));
  refreshBtn.addEventListener('click', () => loadMitigations());

  // Initial load
  loadMitigations();
}

// Load Active Mitigations
async function loadMitigations() {
  const container = document.getElementById('mitigations-container')!;
  
  try {
    container.innerHTML = `
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

    if (data.mitigations.length === 0) {
      container.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <p class="text-sm">No active mitigations</p>
          <p class="text-xs text-gray-600 mt-1">All systems nominal</p>
        </div>
      `;
      return;
    }

    // Render mitigations
    container.innerHTML = data.mitigations.map(mitigation => renderMitigation(mitigation)).join('');

  } catch (error) {
    console.error('Failed to load mitigations:', error);
    container.innerHTML = `
      <div class="text-center text-red-400 py-8">
        <p class="text-sm">⚠️ Failed to load mitigations</p>
        <p class="text-xs text-gray-500 mt-1">${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
}

// Render a single mitigation record
function renderMitigation(mitigation: MitigationRecord): string {
  // Calculate risk color
  const riskColor = mitigation.riskScore >= 80 ? 'bg-sentinel-danger' :
                    mitigation.riskScore >= 50 ? 'bg-sentinel-warning' :
                    'bg-sentinel-success';

  return `
    <div class="bg-[#0a0e1a] border border-sentinel-border rounded-lg p-4 hover:border-sentinel-accent transition-colors">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <div class="text-sm font-semibold text-sentinel-accent mb-1">${mitigation.sourceIP}</div>
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

// Analyze Threat
async function analyzeThreat(payload: string) {
  if (!payload.trim()) {
    alert('Please enter a security event payload to analyze');
    return;
  }

  if (isAnalyzing) return;

  const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
  const analyzeBtnText = document.getElementById('analyze-btn-text')!;
  const resultsDiv = document.getElementById('analysis-results')!;
  const summaryDiv = document.getElementById('executive-summary')!;

  try {
    isAnalyzing = true;
    analyzeBtn.disabled = true;
    analyzeBtnText.innerHTML = '<span class="spinner"></span>Analyzing...';
    resultsDiv.classList.add('hidden');

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
    summaryDiv.textContent = data.assessment.executive_summary;
    resultsDiv.classList.remove('hidden');

    // Refresh mitigations if action was taken
    if (data.assessment.action === 'block') {
      setTimeout(() => loadMitigations(), 1000);
    }

  } catch (error) {
    console.error('Analysis failed:', error);
    alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    isAnalyzing = false;
    analyzeBtn.disabled = false;
    analyzeBtnText.textContent = 'Analyze Threat';
  }
}

// Initialize on load
initDashboard();
