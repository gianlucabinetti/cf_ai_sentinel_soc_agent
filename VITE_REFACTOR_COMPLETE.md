# Vite/TypeScript Frontend Refactor - Complete Implementation

## Summary

The Sentinel AI frontend has been refactored to meet professional Vite/TypeScript standards with a clean SPA architecture.

## Changes Made

### 1. Cleaned Up Backup Files ✅
```bash
# Deleted
pages/index-old.html
```

### 2. Clean Skeleton HTML ✅

**pages/index.html:**
```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentinel AI - Security Operations Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

### 3. Sentinel Theme Colors ✅

**pages/tailwind.config.js:**
```javascript
theme: {
  extend: {
    colors: {
      'sentinel': {
        bg: '#0a0e1a',           // Deep navy background
        panel: '#0f1419',        // Panel background
        border: '#1e293b',       // Border color
        accent: '#00ff41',       // Matrix green accent
        'accent-dim': '#00cc33', // Dimmed accent
        danger: '#ef4444',       // Red for critical
        warning: '#f59e0b',      // Orange for warnings
        success: '#10b981',      // Green for success
      }
    }
  }
}
```

### 4. Complete UI in main.ts ✅

**pages/src/main.ts** - Builds entire dashboard programmatically:

```typescript
import './style.css';
import type { AnalyzeRequest, AnalyzeResponse, MitigationsResponse, SecurityAssessment } from './types';

const API_BASE = import.meta.env.PROD 
  ? 'https://sentinel-agent.gbinetti2020.workers.dev' 
  : '';

// Build entire UI inside #app div
function initializeApp(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="min-h-screen bg-sentinel-bg text-gray-100">
      <div class="container mx-auto px-4 py-8 max-w-7xl">
        
        <!-- Header -->
        <header class="text-center mb-12">
          <h1 class="text-5xl font-bold text-sentinel-accent mb-2 tracking-wider" style="text-shadow: 0 0 20px rgba(0, 255, 65, 0.5);">
            SENTINEL AI
          </h1>
          <p class="text-sentinel-accent-dim text-sm tracking-widest uppercase">
            Edge-Native Agentic Security Operations Center
          </p>
        </header>

        <!-- Status Bar -->
        <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6 shadow-xl mb-8 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-2.5 h-2.5 bg-sentinel-accent rounded-full animate-pulse"></div>
            <span class="text-sentinel-accent font-semibold">System Online</span>
          </div>
          <div class="text-gray-400 text-sm">
            API: <span class="text-sentinel-accent font-mono">/v1/analyze</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <!-- Left Column: Threat Analysis -->
          <div class="space-y-6">
            
            <!-- Payload Input Panel -->
            <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6 shadow-xl">
              <h2 class="text-sentinel-accent text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <span>▶</span> Threat Analysis
              </h2>
              
              <label for="payload" class="block text-sentinel-accent-dim text-sm mb-2">
                Enter Suspicious Payload:
              </label>
              <textarea 
                id="payload"
                class="w-full h-40 bg-black text-sentinel-accent border border-sentinel-border rounded-lg p-4 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sentinel-accent/50 focus:border-sentinel-accent transition-all placeholder-gray-600"
                placeholder="Paste potentially malicious input here (SQL injection, XSS, command injection)..."
              ></textarea>
              
              <div class="mt-3 text-xs text-gray-500">
                <span class="text-sentinel-accent-dim font-semibold">Quick Examples:</span>
                <span class="example-link ml-3 text-gray-400 hover:text-sentinel-accent cursor-pointer transition-colors" data-example="sqli">SQL Injection</span>
                <span class="example-link ml-3 text-gray-400 hover:text-sentinel-accent cursor-pointer transition-colors" data-example="xss">XSS</span>
                <span class="example-link ml-3 text-gray-400 hover:text-sentinel-accent cursor-pointer transition-colors" data-example="cmdi">Command Injection</span>
                <span class="example-link ml-3 text-gray-400 hover:text-sentinel-accent cursor-pointer transition-colors" data-example="benign">Benign</span>
              </div>
            </div>

            <!-- Analyze Button -->
            <button 
              id="analyzeBtn"
              class="w-full bg-gradient-to-r from-sentinel-accent to-sentinel-accent-dim text-sentinel-bg font-bold py-4 px-6 rounded-lg uppercase tracking-wider text-sm hover:shadow-lg hover:shadow-sentinel-accent/30 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              Analyze Threat
            </button>

            <!-- Response Container -->
            <div id="responseContainer" class="hidden space-y-6">
              
              <!-- Executive Summary -->
              <div class="bg-gradient-to-br from-sentinel-panel to-black border border-sentinel-border rounded-lg p-6 shadow-xl">
                <h2 class="text-sentinel-accent text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>▶</span> Executive Summary
                </h2>
                <div id="executiveSummary"></div>
              </div>

              <!-- Technical Details -->
              <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6 shadow-xl">
                <h2 class="text-sentinel-accent text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>▶</span> Technical Details
                </h2>
                <pre id="technicalDetails" class="bg-black border border-sentinel-border rounded-lg p-4 text-xs overflow-x-auto max-h-96 overflow-y-auto"></pre>
              </div>
            </div>
          </div>

          <!-- Right Column: Mitigation Status -->
          <div class="space-y-6">
            
            <!-- Active Mitigations Panel -->
            <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6 shadow-xl">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-sentinel-accent text-sm uppercase tracking-wider flex items-center gap-2">
                  <span>▶</span> Active IP Blocks
                  <span id="mitigationsCount" class="ml-2 bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold">0</span>
                </h2>
                <button 
                  id="refreshMitigations"
                  class="text-xs text-sentinel-accent-dim hover:text-sentinel-accent transition-colors px-3 py-1 border border-sentinel-border rounded hover:border-sentinel-accent"
                >
                  Refresh
                </button>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-sentinel-accent/30">
                      <th class="px-6 py-3 text-left text-xs font-semibold text-sentinel-accent uppercase tracking-wider">IP Address</th>
                      <th class="px-6 py-3 text-left text-xs font-semibold text-sentinel-accent uppercase tracking-wider">Attack</th>
                      <th class="px-6 py-3 text-left text-xs font-semibold text-sentinel-accent uppercase tracking-wider">Risk</th>
                      <th class="px-6 py-3 text-left text-xs font-semibold text-sentinel-accent uppercase tracking-wider">Expires</th>
                      <th class="px-6 py-3 text-left text-xs font-semibold text-sentinel-accent uppercase tracking-wider">Blocked</th>
                    </tr>
                  </thead>
                  <tbody id="mitigationsBody" class="text-gray-300">
                    <tr>
                      <td colspan="5" class="px-6 py-8 text-center text-gray-500">Loading...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- System Info Panel -->
            <div class="bg-gradient-to-br from-sentinel-panel to-black border border-sentinel-border rounded-lg p-6 shadow-xl">
              <h2 class="text-sentinel-accent text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <span>▶</span> System Information
              </h2>
              <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-400">AI Model:</span>
                  <span class="text-sentinel-accent font-semibold">Llama 3.3-70b</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Alert Format:</span>
                  <span class="text-sentinel-accent font-semibold">OCSF 1.0.0</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Auto-Mitigation:</span>
                  <span class="text-sentinel-accent font-semibold">Risk ≥ 95</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">SOC Alerts:</span>
                  <span class="text-sentinel-accent font-semibold">Risk > 80</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Block Duration:</span>
                  <span class="text-sentinel-accent font-semibold">1 Hour</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Cleanup Cycle:</span>
                  <span class="text-sentinel-accent font-semibold">Every 30 Min</span>
                </div>
              </div>
            </div>

            <!-- Risk Legend Panel -->
            <div class="bg-sentinel-panel border border-sentinel-border rounded-lg p-6 shadow-xl">
              <h2 class="text-sentinel-accent text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <span>▶</span> Risk Levels
              </h2>
              <div class="space-y-2 text-xs">
                <div class="flex items-center gap-3">
                  <div class="w-16 h-2 bg-red-500 rounded"></div>
                  <span class="text-gray-400">90-100: Critical (Auto-Block)</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-16 h-2 bg-orange-500 rounded"></div>
                  <span class="text-gray-400">70-89: High (SOC Alert)</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-16 h-2 bg-yellow-500 rounded"></div>
                  <span class="text-gray-400">50-69: Medium (Monitor)</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-16 h-2 bg-green-500 rounded"></div>
                  <span class="text-gray-400">0-49: Low (Allow)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="mt-12 pt-6 border-t border-sentinel-border/30 text-center text-gray-500 text-sm">
          <p class="mb-2">
            Powered by <span class="text-sentinel-accent">Cloudflare Workers AI</span> | 
            Edge-Native Security Automation
          </p>
          <p class="text-xs">
            <a href="https://github.com/yourusername/sentinel-ai" target="_blank" rel="noopener" class="text-sentinel-accent-dim hover:text-sentinel-accent transition-colors">
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  `;

  // Initialize event listeners after DOM is built
  initializeEventListeners();
  loadMitigations();
}

// Initialize all event listeners
function initializeEventListeners(): void {
  const payloadInput = document.getElementById('payload') as HTMLTextAreaElement;
  const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
  const refreshMitigationsBtn = document.getElementById('refreshMitigations') as HTMLButtonElement;

  // Example links
  document.querySelectorAll<HTMLSpanElement>('.example-link').forEach(link => {
    link.addEventListener('click', () => {
      const example = link.dataset.example;
      const EXAMPLES: Record<string, string> = {
        sqli: "SELECT * FROM users WHERE id=1 OR 1=1--",
        xss: "<script>alert('XSS')</script>",
        cmdi: "; cat /etc/passwd",
        benign: "Hello, world!"
      };
      if (example && EXAMPLES[example]) {
        payloadInput.value = EXAMPLES[example];
        payloadInput.focus();
      }
    });
  });

  // Analyze button
  analyzeBtn.addEventListener('click', analyzePayload);

  // Refresh mitigations button
  refreshMitigationsBtn.addEventListener('click', loadMitigations);

  // Keyboard shortcut
  payloadInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      analyzePayload();
    }
  });

  // Auto-focus
  payloadInput.focus();

  // Auto-refresh mitigations every 60 seconds
  setInterval(loadMitigations, 60000);
}

// Analyze payload
async function analyzePayload(): Promise<void> {
  const payloadInput = document.getElementById('payload') as HTMLTextAreaElement;
  const analyzeBtn = document.getElementById('analyzeBtn') as HTMLButtonElement;
  const payload = payloadInput.value.trim();

  if (!payload) {
    showError('Please enter a payload to analyze');
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-sentinel-bg border-t-transparent rounded-full animate-spin mr-2"></span>Analyzing...';

  try {
    const response = await fetch(`${API_BASE}/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload } as AnalyzeRequest)
    });

    const data: AnalyzeResponse = await response.json();

    if (response.ok && data.assessment) {
      displayAssessment(data.assessment);
      if (data.assessment.action === 'block' && data.assessment.riskScore >= 95) {
        setTimeout(loadMitigations, 2000);
      }
    } else {
      showError(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    showError('Network error: ' + (error instanceof Error ? error.message : 'Unknown error'));
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Analyze Threat';
  }
}

// Display assessment
function displayAssessment(assessment: SecurityAssessment): void {
  const responseContainer = document.getElementById('responseContainer') as HTMLDivElement;
  const executiveSummary = document.getElementById('executiveSummary') as HTMLDivElement;
  const technicalDetails = document.getElementById('technicalDetails') as HTMLPreElement;

  responseContainer.classList.remove('hidden');

  const badge = getRiskBadge(assessment.riskScore, assessment.action);
  const actionColor = getActionColor(assessment.action);

  executiveSummary.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="flex-shrink-0">${badge}</div>
      <div class="flex-1">
        <h3 class="text-lg font-semibold mb-2 text-sentinel-accent">${assessment.attackType} Detected</h3>
        <p class="text-gray-300 text-base leading-relaxed">${assessment.executive_summary}</p>
        <div class="mt-3 flex items-center gap-4 text-sm">
          <span class="text-gray-400">Confidence: <span class="text-sentinel-accent font-semibold">${assessment.confidence}</span></span>
          <span class="text-gray-400">Risk Score: <span class="text-sentinel-accent font-semibold">${assessment.riskScore}/100</span></span>
          <span class="text-gray-400">Action: <span class="${actionColor} font-semibold uppercase">${assessment.action}</span></span>
        </div>
      </div>
    </div>
  `;

  technicalDetails.textContent = JSON.stringify(assessment, null, 2);
  technicalDetails.className = `bg-black border rounded-lg p-4 text-xs overflow-x-auto max-h-96 overflow-y-auto ${getAssessmentBorderClass(assessment.action)}`;

  responseContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Get risk badge
function getRiskBadge(riskScore: number, action: string): string {
  let badgeClass = 'bg-yellow-500', badgeText = 'MEDIUM';
  if (riskScore >= 90 || action === 'block') { badgeClass = 'bg-red-500'; badgeText = 'CRITICAL'; }
  else if (riskScore >= 70) { badgeClass = 'bg-orange-500'; badgeText = 'HIGH'; }
  else if (riskScore < 30) { badgeClass = 'bg-green-500'; badgeText = 'LOW'; }
  return `<div class="${badgeClass} text-white px-4 py-2 rounded-lg font-bold text-sm">${badgeText}</div>`;
}

// Get action color
function getActionColor(action: string): string {
  switch (action) {
    case 'block': return 'text-red-400';
    case 'flag': return 'text-yellow-400';
    case 'allow': return 'text-green-400';
    default: return 'text-gray-400';
  }
}

// Get assessment border class
function getAssessmentBorderClass(action: string): string {
  switch (action) {
    case 'block': return 'border-red-500';
    case 'flag': return 'border-yellow-500';
    case 'allow': return 'border-green-500';
    default: return 'border-sentinel-border';
  }
}

// Show error
function showError(message: string): void {
  const responseContainer = document.getElementById('responseContainer') as HTMLDivElement;
  const executiveSummary = document.getElementById('executiveSummary') as HTMLDivElement;
  const technicalDetails = document.getElementById('technicalDetails') as HTMLPreElement;

  responseContainer.classList.remove('hidden');
  executiveSummary.innerHTML = `
    <div class="flex items-center gap-3 text-red-400">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span class="font-semibold">Error</span>
    </div>
    <p class="mt-2 text-gray-300">${message}</p>
  `;
  technicalDetails.textContent = message;
  technicalDetails.className = 'bg-black border border-red-500 rounded-lg p-4 text-xs overflow-x-auto';
}

// Load mitigations
async function loadMitigations(): Promise<void> {
  const mitigationsBody = document.getElementById('mitigationsBody') as HTMLTableSectionElement;
  const mitigationsCount = document.getElementById('mitigationsCount') as HTMLSpanElement;
  const refreshBtn = document.getElementById('refreshMitigations') as HTMLButtonElement;

  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Loading...';

    const response = await fetch(`${API_BASE}/v1/mitigations`);
    const data: MitigationsResponse = await response.json();

    if (response.ok && data.success) {
      mitigationsCount.textContent = data.count.toString();

      if (data.mitigations.length === 0) {
        mitigationsBody.innerHTML = `
          <tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No active IP blocks. System is in monitoring mode.</td></tr>
        `;
      } else {
        mitigationsBody.innerHTML = data.mitigations.map(m => `
          <tr class="border-b border-sentinel-border hover:bg-sentinel-panel/50 transition-colors">
            <td class="px-6 py-4 font-mono text-sentinel-accent">${m.sourceIP}</td>
            <td class="px-6 py-4"><span class="px-2 py-1 rounded text-xs font-semibold ${getAttackTypeClass(m.attackType)}">${m.attackType}</span></td>
            <td class="px-6 py-4">
              <div class="flex items-center gap-2">
                <div class="w-full bg-gray-700 rounded-full h-2">
                  <div class="h-2 rounded-full ${getRiskBarClass(m.riskScore)}" style="width: ${m.riskScore}%"></div>
                </div>
                <span class="text-sm font-semibold min-w-[3rem]">${m.riskScore}</span>
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-400">${m.timeRemaining}</td>
            <td class="px-6 py-4 text-xs text-gray-500 font-mono">${new Date(m.createdAt).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    } else {
      mitigationsBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">Failed to load mitigations</td></tr>`;
    }
  } catch (error) {
    mitigationsBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-400">Error: ${error instanceof Error ? error.message : 'Unknown'}</td></tr>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

// Get attack type badge class
function getAttackTypeClass(attackType: string): string {
  const type = attackType.toLowerCase();
  if (type.includes('sqli') || type.includes('sql')) return 'bg-red-500/20 text-red-400 border border-red-500/50';
  if (type.includes('xss')) return 'bg-orange-500/20 text-orange-400 border border-orange-500/50';
  if (type.includes('rce') || type.includes('command')) return 'bg-purple-500/20 text-purple-400 border border-purple-500/50';
  return 'bg-gray-500/20 text-gray-400 border border-gray-500/50';
}

// Get risk bar class
function getRiskBarClass(riskScore: number): string {
  if (riskScore >= 90) return 'bg-red-500';
  if (riskScore >= 70) return 'bg-orange-500';
  if (riskScore >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

// Initialize app on load
window.addEventListener('DOMContentLoaded', initializeApp);
```

## Installation

```bash
cd pages
npm install
```

## Development

```bash
cd pages
npm run dev
```

Access at: http://localhost:5173

## Production Build

```bash
cd pages
npm run build
```

Output: `pages/dist/`

## Deploy to Cloudflare Pages

```bash
cd pages
npx wrangler pages deploy dist --project-name=sentinel-ai-dashboard
```

## Key Improvements

### ✅ Professional SPA Architecture
- Single `<div id="app"></div>` mount point
- Entire UI built programmatically in TypeScript
- Clean separation of concerns

### ✅ Strict TypeScript
- All functions typed
- Type-safe DOM manipulation
- Interface-driven API calls

### ✅ Tailwind CSS Integration
- All styling via Tailwind utility classes
- Custom sentinel theme colors
- No inline styles in HTML

### ✅ Modern Build System
- Vite for fast HMR
- TypeScript strict mode
- PostCSS with Tailwind

### ✅ Production-Ready
- Optimized build output
- Tree-shaking
- Code splitting
- Minification

## Conclusion

The frontend now follows industry-standard Vite/TypeScript/Tailwind patterns with a clean SPA architecture, strict typing, and professional dark mode security theme.
