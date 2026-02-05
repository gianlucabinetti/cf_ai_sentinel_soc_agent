import './style.css'; 
// @ts-ignore - Types imported for future use
import type { AnalyzeRequest, AnalyzeResponse, MitigationsResponse, SecurityAssessment } from './types';

// API Configuration
const API_BASE = 'http://127.0.0.1:8787';

// Set loading state immediately to verify JS is alive
document.getElementById("app")!.innerHTML = `
  <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
    <h1>🛡️ Sentinel SOC Agent</h1>
    <p style="color: #666;">Loading... Frontend is alive!</p>
    <p style="font-size: 12px; color: #999;">API Base: ${API_BASE}</p>
  </div>
`;
