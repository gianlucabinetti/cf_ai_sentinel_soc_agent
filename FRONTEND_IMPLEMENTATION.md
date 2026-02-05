# Frontend Implementation Guide

## Overview
The Sentinel AI frontend has been refactored into a modern TypeScript application using Vite and Tailwind CSS with a professional dark mode security theme.

## Project Structure

```
pages/
├── package.json          # Vite + TypeScript + Tailwind dependencies
├── tsconfig.json         # Strict TypeScript configuration
├── vite.config.ts        # Vite configuration with API proxy
├── tailwind.config.js    # Custom security theme colors
├── postcss.config.js     # PostCSS with Tailwind
├── index.html            # Main dashboard HTML
└── src/
    ├── main.ts           # TypeScript UI logic with strict typing
    ├── types.ts          # API response interfaces
    └── style.css         # Tailwind CSS imports
```

## Features Implemented

### 1. TypeScript Dashboard (`src/main.ts`)
-  Strict typing for all API responses
-  Type-safe DOM element references
-  Async/await for API calls
-  Error handling with proper types

### 2. Executive Summary Display
-  Prominent display of `executive_summary` field
-  Risk badge (Critical/High/Medium/Low)
-  Attack type, confidence, and risk score
-  Color-coded action indicators

### 3. Mitigation Status Table
-  Real-time display of active IP blocks
-  Fetches from `/v1/mitigations` endpoint
-  Shows: IP address, attack type, risk score, time remaining, blocked timestamp
-  Auto-refresh every 60 seconds
-  Manual refresh button
-  Visual risk score bars

### 4. Dark Mode Security Theme (Tailwind CSS)
Custom color palette:
```javascript
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
```

### 5. Professional UI Components
-  Gradient backgrounds
-  Hover effects and transitions
-  Loading spinners
-  Responsive grid layout (2-column on desktop)
-  Custom scrollbars
-  Pulsing status indicators
-  Risk level legend

## API Integration

### Backend Endpoint: GET /v1/mitigations

**Location:** `src/index.ts`

**Response Format:**
```json
{
  "success": true,
  "count": 3,
  "mitigations": [
    {
      "sourceIP": "203.0.113.42",
      "ruleId": "cf-rule-abc123",
      "attackType": "SQLi",
      "riskScore": 98,
      "createdAt": "2026-02-04T12:00:00Z",
      "expiresAt": "2026-02-04T13:00:00Z",
      "timeRemaining": "45m"
    }
  ]
}
```

**Features:**
-  Cursor-based pagination (up to 100 keys for UI)
-  Sorted by risk score (highest first)
-  Calculates time remaining dynamically
-  CORS headers for cross-origin requests

## Installation & Build

### Install Dependencies
```bash
cd pages
npm install
```

**Dependencies:**
- `vite` - Fast build tool
- `typescript` - Type checking
- `tailwindcss` - Utility-first CSS
- `autoprefixer` - CSS vendor prefixes
- `postcss` - CSS processing

### Development Server
```bash
cd pages
npm run dev
```

Access at: `http://localhost:5173`

**Vite Proxy Configuration:**
```typescript
server: {
  proxy: {
    '/v1': {
      target: 'https://sentinel-agent.gbinetti2020.workers.dev',
      changeOrigin: true,
    }
  }
}
```

### Production Build
```bash
cd pages
npm run build
```

Output: `pages/dist/` directory with optimized assets

### Deploy to Cloudflare Pages
```bash
cd pages
npx wrangler pages deploy dist --project-name=sentinel-ai-dashboard
```

## Dashboard Features

### Left Column: Threat Analysis

**Payload Input:**
- Large textarea for suspicious payloads
- Quick example buttons (SQL Injection, XSS, Command Injection, Benign)
- Keyboard shortcut: Ctrl/Cmd + Enter to analyze

**Executive Summary Panel:**
- Risk badge (color-coded)
- Attack type heading
- Human-readable summary (from AI)
- Confidence, risk score, and action indicators

**Technical Details Panel:**
- Full JSON response
- Syntax-highlighted
- Scrollable for long responses

### Right Column: System Monitoring

**Active IP Blocks Table:**
- Real-time mitigation status
- Columns: IP Address, Attack Type, Risk Score (visual bar), Expires In, Blocked At
- Color-coded attack type badges
- Auto-refresh every 60 seconds
- Manual refresh button

**System Information Panel:**
- AI Model: Llama 3.3-70b
- Alert Format: OCSF 1.0.0
- Auto-Mitigation threshold: Risk ≥ 95
- SOC Alert threshold: Risk > 80
- Block duration: 1 Hour
- Cleanup cycle: Every 30 Min

**Risk Levels Legend:**
- Visual color bars for each risk level
- 90-100: Critical (Auto-Block)
- 70-89: High (SOC Alert)
- 50-69: Medium (Monitor)
- 0-49: Low (Allow)

## TypeScript Interfaces

### SecurityAssessment
```typescript
interface SecurityAssessment {
  attackType: string;
  confidence: 'High' | 'Medium' | 'Low';
  explanation: string;
  impact: string;
  mitigation: string;
  riskScore: number;
  action: 'allow' | 'block' | 'flag';
  timestamp: string;
  executive_summary: string; // NEW: Human-readable summary
}
```

### MitigationRecord
```typescript
interface MitigationRecord {
  sourceIP: string;
  ruleId: string;
  attackType: string;
  riskScore: number;
  createdAt: string;
  expiresAt: string;
  timeRemaining: string;
}
```

## Styling Details

### Color Scheme
- **Background**: Deep navy gradient (#0a0e1a → #1a1a2e)
- **Accent**: Matrix green (#00ff41)
- **Text**: Light gray (#e5e7eb)
- **Panels**: Semi-transparent black with green borders
- **Shadows**: Glowing green shadows on interactive elements

### Typography
- **Font**: JetBrains Mono (monospace)
- **Headings**: Uppercase with letter-spacing
- **Code**: Syntax-highlighted JSON

### Animations
- Pulsing status dot
- Button hover lift effect
- Loading spinner
- Smooth scrolling
- Transition effects on all interactive elements

## Security Considerations

### API Security
-  CORS headers configured
-  Type-safe API calls
-  Error handling for network failures
-  No sensitive data in frontend code

### XSS Prevention
-  All user input is sent to backend (not rendered)
-  API responses are JSON (not HTML)
-  innerHTML only used for trusted, sanitized content

## Future Enhancements

### Recommended Additions
1. **Real-time Updates**: WebSocket connection for live threat feed
2. **Historical Charts**: Risk score trends over time
3. **Filtering**: Filter mitigations by attack type, risk score
4. **Export**: Download mitigations as CSV/JSON
5. **Authentication**: Login system for multi-user access
6. **Dark/Light Toggle**: Theme switcher
7. **Notifications**: Browser notifications for critical threats

## Troubleshooting

### Issue: "Failed to load mitigations"
**Solution:** Ensure backend is deployed and `/v1/mitigations` endpoint is accessible

### Issue: CORS errors
**Solution:** Verify CORS headers in `src/index.ts` include proper origins

### Issue: Build fails
**Solution:** 
```bash
cd pages
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Vite dev server can't reach API
**Solution:** Update `vite.config.ts` proxy target to your deployed Worker URL

## Deployment Checklist

- [ ] Update `vite.config.ts` proxy target to production Worker URL
- [ ] Update `API_BASE` in `src/main.ts` for production
- [ ] Run `npm run build` to create production bundle
- [ ] Deploy `dist/` folder to Cloudflare Pages
- [ ] Configure Pages to route `/v1/*` to Worker
- [ ] Test all features in production environment

## Conclusion

The Sentinel AI dashboard provides a modern, type-safe, and visually appealing interface for security analysts. The combination of Vite, TypeScript, and Tailwind CSS ensures fast development, type safety, and professional styling.

**Key Benefits:**
-  Fast build times with Vite
-  Type safety with strict TypeScript
-  Professional dark mode security theme
-  Real-time mitigation monitoring
-  Prominent executive summaries for analysts
-  Auto-refresh for live data


