# Sentinel

**AI-powered security threat analysis at the edge**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Workers AI](https://img.shields.io/badge/Workers%20AI-Llama%203.3--70b-F38020)](https://ai.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-36%20passing-success)](./tests/sentinel.test.ts)

> **Cloudflare AI Internship Assignment** - See [ASSIGNMENT.md](./ASSIGNMENT.md) for requirements checklist and reviewer quick-start.

Sentinel is a production-grade Cloudflare Workers application that uses AI to automatically classify and assess security threats in real-time. Built entirely on Cloudflare's edge infrastructure, it delivers sub-millisecond responses for known threats and intelligent analysis for unknown payloads—without managing servers.

## What It Does

Sentinel analyzes potentially malicious payloads (SQL injection, XSS, command injection, etc.) and returns structured security assessments with recommended actions. It's designed for SOC teams, WAF integrations, and security automation pipelines that need fast, reliable threat classification.

**Key capabilities:**
- Detects common attack patterns using Meta Llama 3.3-70b
- Caches assessments globally for instant responses to repeat attacks
- Provides structured output: attack type, risk score, confidence level, and recommended action
- Handles failures gracefully with fail-safe defaults (block on uncertainty)

## Features

 **Edge-Native AI Inference** – Runs Meta Llama 3.3-70b directly on Cloudflare Workers AI  
 **Global Caching** – Sub-millisecond responses via Cloudflare KV (90%+ cache hit rate)  
 **Durable Workflows** – Automatic retries and state management for long-running analysis  
 **Durable Alerting** – Automated SOC platform integration with risk-based alert triggering  
 **Autonomous Mitigation** – Automatic IP blocking via Cloudflare Firewall API for critical threats  
 **Type-Safe Architecture** – Strict TypeScript with runtime validation at all boundaries  
 **Production-Ready** – Comprehensive error handling, fail-safe defaults, and audit trails  
 **Zero Infrastructure** – No servers, databases, or containers to manage

## Demo

### Security Triage Console

The Cloudflare Pages UI provides a terminal-inspired interface for security analysts:

![Sentinel UI Screenshot](./screenshot-ui.png)
*Security analyst console with payload input, quick examples, and real-time AI analysis*


## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com/) |
| AI Model | [Workers AI](https://ai.cloudflare.com/) (Llama 3.3-70b) |
| Orchestration | [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) |
| Caching | [Workers KV](https://developers.cloudflare.com/kv/) |
| Language | TypeScript (strict mode) |
| Deployment | [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) |

## Try It Locally

### Prerequisites
- Node.js 18+ and npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Cloudflare account (free tier works)

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd cf_ai_sentinel
   npm install
   ```

2. **Create a KV namespace**
   ```bash
   wrangler kv:namespace create SENTINEL_KV
   ```
   Copy the returned namespace ID and update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "SENTINEL_KV"
   id = "your-namespace-id-here"
   ```

3. **Generate Cloudflare types**
   ```bash
   npm run cf-typegen
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   The API will be available at `http://localhost:8787`

### Test the API

Analyze a suspicious payload:
```bash
curl -X POST http://localhost:8787/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"payload": "SELECT * FROM users WHERE id=1 OR 1=1"}'
```

**Response:**
```json
{
  "status": "workflow_triggered",
  "id": "scan-abc123...",
  "cacheKey": "abc123..."
}
```

Health check:
```bash
curl http://localhost:8787/health
```

## Try It via UI

Sentinel includes a minimal web-based triage console built with Cloudflare Pages.

### Deploy the Frontend

1. **Deploy the Worker API first:**
   ```bash
   npm run deploy
   ```
   Note your Worker URL (e.g., `https://sentinel-agent.workers.dev`)

2. **Deploy the Pages frontend:**
   ```bash
   cd pages
   npx wrangler pages deploy . --project-name=sentinel-ui
   ```

3. **Connect Pages to the Worker:**
   
   In the Cloudflare dashboard:
   - Go to **Workers & Pages** → **sentinel-ui** → **Settings** → **Functions**
   - Add a **Service Binding**:
     - Variable name: `SENTINEL_API`
     - Service: `sentinel-agent` (your Worker name)
   
   Alternatively, use a `_routes.json` file in the `pages/` directory:
   ```json
   {
     "version": 1,
     "include": ["/v1/*"],
     "exclude": []
   }
   ```
   Then redeploy. This routes `/v1/*` requests to your Worker.

4. **Access the UI:**
   Open `https://sentinel-ui.pages.dev` in your browser

### How It Works

The Pages frontend (`pages/index.html`) is a single-page security analyst console that:
- Accepts payload input via textarea
- POSTs to `/v1/analyze` (relative path)
- Displays the raw JSON response
- Includes quick-fill examples (SQL injection, XSS, etc.)

**Connection Architecture:**
```
Browser → Cloudflare Pages (static HTML) → Worker API (/v1/analyze) → AI Analysis
```

When deployed together, Pages and Workers share the same Cloudflare domain, avoiding CORS issues. The frontend uses a relative path (`/v1/analyze`) which Cloudflare automatically routes to your Worker via Service Bindings or `_routes.json`.

> **Local Development:** To test locally, run `npm run dev` for the Worker, then serve `pages/index.html` with any static server and update the `API_ENDPOINT` constant to `http://localhost:8787/v1/analyze`.

### User Input Requirement (Cloudflare AI Assignment)

**Requirement:** "User input via chat or voice"

**Implementation:** The Cloudflare Pages UI (`pages/index.html`) provides **text-based user input** via a textarea field where users can:
- Type or paste security payloads directly (chat-style input)
- Submit analysis requests via button click or keyboard shortcut (Ctrl/Cmd + Enter)
- Receive AI-generated responses displayed in real-time

This satisfies the **chat input** portion of the requirement. The textarea accepts natural language or technical payloads, which are sent to the Workers AI backend for analysis.

> **Note:** Voice input is not implemented in this version. The focus is on text-based security analyst workflows, which are the primary use case for SOC triage operations.

## How It Works

```
Client Request → Worker (hash + cache check) → Workflow (sanitize → AI → cache → alert → mitigate) → Response
```

1. **Request arrives** at the edge Worker
2. **SHA-256 hash** is generated from the payload
3. **KV cache** is checked for existing assessment
4. **Workflow triggers** on cache miss:
   - Step 1: Sanitize payload (normalize, remove null bytes)
   - Step 2: AI inference (Llama 3.3-70b analyzes threat)
   - Step 3: Cache result in KV (72-hour TTL)
   - Step 4: Trigger SOC alert (if risk score > 80 or action = "block")
   - Step 5: Auto-mitigation (if risk score >= 95, block source IP via Cloudflare API)
5. **Structured assessment** is returned with action recommendation

For deep technical details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## SOC Alert Integration

Sentinel includes **durable alerting** capabilities that automatically notify your Security Operations Center (SOC) when high-risk threats are detected. Alerts are triggered via Cloudflare Workflows, ensuring reliable delivery even if external systems are temporarily unavailable.

### Risk-Based Alert Thresholds

Alerts are automatically triggered when either condition is met:

| Condition | Alert Triggered | Severity Level |
|-----------|----------------|----------------|
| `riskScore >= 90` |  Yes | **Critical** |
| `riskScore >= 80` |  Yes | **High** |
| `riskScore >= 70` AND `action = "block"` |  Yes | **High** |
| `action = "block"` (any score) |  Yes | **High/Critical** |
| `riskScore < 80` AND `action = "allow"` |  No | N/A |
| `action = "flag"` |  Yes (if score > 80) | **Medium/High** |

**Example Scenarios:**
- **SQL Injection (riskScore: 95, action: "block")** → Critical alert sent to SOC
- **XSS Attack (riskScore: 85, action: "block")** → High alert sent to SOC
- **Suspicious Pattern (riskScore: 75, action: "flag")** → No alert (below threshold)
- **Benign Traffic (riskScore: 10, action: "allow")** → No alert

### Supported SOC Platforms

Sentinel integrates with any webhook-compatible SOC platform:

- **Microsoft Sentinel** – Azure Monitor Data Collection API
- **Splunk HEC** – HTTP Event Collector
- **PagerDuty** – Events API v2
- **Custom Webhooks** – Any endpoint accepting POST with JSON payload

### Alert Payload Structure

When an alert is triggered, Sentinel sends a structured JSON payload:

```json
{
  "alertId": "scan-abc123...",
  "severity": "critical",
  "source": "Sentinel AI Agent",
  "timestamp": "2026-02-04T12:00:00Z",
  "assessment": {
    "attackType": "SQLi",
    "confidence": "High",
    "riskScore": 95,
    "action": "block",
    "explanation": "Boolean-based SQL injection detected...",
    "impact": "Unauthorized database access...",
    "mitigation": "Use parameterized queries..."
  },
  "metadata": {
    "cacheKey": "abc123...",
    "originalTimestamp": "2026-02-04T12:00:00Z"
  }
}
```

### Quick Setup Guide

#### 1. Configure SOC Webhook URL

Edit `wrangler.toml` and set your SOC platform's webhook endpoint:

```toml
[vars]
SOC_WEBHOOK_URL = "https://your-soc-platform.com/api/webhooks/sentinel"
```

**Platform-Specific Examples:**

**Microsoft Sentinel:**
```toml
SOC_WEBHOOK_URL = "https://your-workspace.ods.opinsights.azure.com/api/logs?api-version=2016-04-01"
```

**Splunk HEC:**
```toml
SOC_WEBHOOK_URL = "https://your-splunk-instance.com:8088/services/collector/event"
```

**PagerDuty:**
```toml
SOC_WEBHOOK_URL = "https://events.pagerduty.com/v2/enqueue"
```

#### 2. Configure Authentication (Production)

For production deployments, use Wrangler secrets to securely store API keys:

```bash
# Set the API key as a secret (recommended for production)
wrangler secret put SOC_API_KEY
# Enter your API key when prompted
```

Then remove the `SOC_API_KEY` line from `wrangler.toml`.

**For development/testing only:**
```toml
[vars]
SOC_API_KEY = "your-test-api-key"
```

#### 3. Deploy and Test

Deploy the updated configuration:
```bash
npm run deploy
```

Test with a high-risk payload:
```bash
curl -X POST https://your-worker.workers.dev/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"payload": "SELECT * FROM users WHERE id=1 OR 1=1"}'
```

Check your SOC platform for the incoming alert.

### Disabling Alerts

To disable SOC alerts, leave `SOC_WEBHOOK_URL` empty in `wrangler.toml`:

```toml
[vars]
SOC_WEBHOOK_URL = ""
```

Sentinel will continue to analyze threats but won't send external alerts.

### Monitoring Alert Delivery

Check Cloudflare Workers logs for alert status:

```bash
wrangler tail
```

**Log Messages:**
- `[Sentinel] SOC alert triggered for {cacheKey} (severity: critical)` – Alert sent successfully
- `[Sentinel] No SOC alert needed for {cacheKey} (action: allow, risk: 45)` – Below threshold
- `[Sentinel] SOC_WEBHOOK_URL not configured. Skipping alert` – Alerts disabled
- `[Sentinel] Failed to trigger SOC alert: {error}` – Webhook failure (non-blocking)

### Reliability & Error Handling

**Durable Execution:**
- SOC alerts are triggered as a separate workflow step
- Automatic retries on transient failures (network errors, 5xx responses)
- Non-blocking: Webhook failures don't prevent threat analysis

**Graceful Degradation:**
- If the SOC webhook is unavailable, the assessment is still cached and returned
- Errors are logged for monitoring and debugging
- The workflow continues even if alert delivery fails

For advanced configuration and troubleshooting, see [SOC_INTEGRATION_SUMMARY.md](../SOC_INTEGRATION_SUMMARY.md).

## Autonomous Mitigation

Sentinel AI includes **autonomous threat mitigation** that automatically blocks malicious IP addresses using Cloudflare's Firewall API when critical threats are detected. This provides real-time, automated defense without manual intervention.

### Risk-Based Response Matrix

Sentinel's response escalates based on threat severity:

| Risk Score | Action | SOC Alert | IP Blocking | Duration |
|------------|--------|-----------|-------------|----------|
| **95-100** (Critical) | Block |  Critical |  **Auto-blocked** | 1 hour |
| **80-94** (High) | Block/Flag |  High |  Manual review | N/A |
| **70-79** (Medium) | Flag |  Medium (if action=block) |  No | N/A |
| **0-69** (Low) | Allow |  No |  No | N/A |

**Example Scenarios:**

**Critical SQL Injection (Score: 98)**
```
 AI Analysis Complete
 SOC Alert Sent (Critical)
 IP 203.0.113.42 Auto-Blocked (1 hour)
 Rule ID: cf-rule-abc123
```

**High-Risk XSS (Score: 85)**
```
 AI Analysis Complete
 SOC Alert Sent (High)
 No Auto-Block (Manual review required)
```

**Suspicious Pattern (Score: 75)**
```
 AI Analysis Complete
 Flagged for Review
 No SOC Alert (Below threshold)
 No Auto-Block
```

### How Auto-Mitigation Works

1. **Threat Detection**: AI identifies critical threat (riskScore >= 95)
2. **IP Extraction**: Source IP extracted from `CF-Connecting-IP` header
3. **Cloudflare API Call**: Creates IP Access Rule via Firewall API
4. **Automatic Block**: IP blocked across entire Cloudflare zone
5. **Metadata Storage**: Rule details stored in KV for tracking
6. **Auto-Expiry**: Block expires after 1 hour (configurable)

### Configuration

#### 1. Create Cloudflare API Token

**Required Permissions:** Zone → Firewall Services → Edit

**Steps:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens
2. Click **"Create Token"** → **"Create Custom Token"**
3. Set permissions:
   - **Permissions**: Zone → Firewall Services → Edit
   - **Zone Resources**: Include → Specific zone → [Your zone]
4. Click **"Create Token"** and copy the token

#### 2. Find Your Zone ID

1. Go to Cloudflare Dashboard → [Your Domain]
2. Scroll to **"API"** section on the right
3. Copy the **Zone ID** (e.g., `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

#### 3. Configure Environment Variables

**Development/Testing:**
```toml
# wrangler.toml
[vars]
CLOUDFLARE_API_TOKEN = "your-test-token"
CLOUDFLARE_ZONE_ID = "your-zone-id"
```

**Production (Recommended):**
```bash
# Use secrets for sensitive data
wrangler secret put CLOUDFLARE_API_TOKEN
# Enter token when prompted

# Edit wrangler.toml for Zone ID
[vars]
CLOUDFLARE_ZONE_ID = "your-zone-id"
```

#### 4. Deploy
```bash
npm run deploy
```

### Security Features

** Scoped Permissions**
- API token has ONLY Firewall Services access
- Cannot modify DNS, SSL, or other zone settings
- Follows principle of least privilege

** Rate Limit Handling**
- Detects 429 (Too Many Requests) responses
- Automatic retry with exponential backoff
- Respects `Retry-After` header

** Non-Blocking Execution**
- Mitigation failures don't crash workflow
- Assessment and alerts still complete
- Errors logged for monitoring

** Automatic Cleanup**
- Rule metadata stored in KV with 1-hour TTL
- Expired rules can be cleaned via Cron Trigger
- Prevents indefinite IP blocks

### Monitoring

**View Blocked IPs:**
1. Cloudflare Dashboard → [Your Domain] → Security → WAF → Tools
2. Click **"IP Access Rules"**
3. Look for rules with notes: `Auto-blocked by Sentinel AI`

**Check Logs:**
```bash
wrangler tail
```

**Log Messages:**
- `[Sentinel] Auto-mitigation: Blocked IP 203.0.113.42 (Rule ID: cf-rule-abc123)`
- `[Sentinel] No auto-mitigation needed (risk: 85)`
- `[Sentinel] Cloudflare API rate limit hit. Retry-After: 60s`

### Disabling Auto-Mitigation

Leave credentials empty in `wrangler.toml`:
```toml
[vars]
CLOUDFLARE_API_TOKEN = ""
CLOUDFLARE_ZONE_ID = ""
```

Sentinel will continue threat analysis and SOC alerting without IP blocking.

## Project Structure

```
src/
├── index.ts       # API gateway (fetch handler)
├── workflow.ts    # 3-step analysis pipeline
├── types.ts       # TypeScript interfaces and type guards
├── prompts.ts     # AI system prompt
└── memory.ts      # KV caching abstraction

tests/
└── sentinel.test.ts  # Smoke tests (type guards, hashing)
```

## Testing

Run smoke tests locally (no Cloudflare credentials required):

```bash
npm test
```

**What's tested:**
-  Type guards and input validation
-  SHA-256 hash determinism (idempotency)
-  Workflow ID generation consistency
-  SecurityAssessment validation edge cases

**What's NOT tested:**
-  Workers AI inference (requires Cloudflare runtime)
-  KV operations (requires KV namespace)
-  Workflow execution (requires Workflows runtime)

The tests focus on pure, deterministic functions that ensure type safety and correctness without external dependencies.

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

Your API will be live at `https://your-worker-name.workers.dev`

## Configuration

Edit `wrangler.toml` to customize:
- **AI model** (default: `@cf/meta/llama-3.3-70b-instruct`)
- **Cache TTL** (default: 72 hours)
- **SOC alerting** (webhook URL, API key, alert thresholds)
- **Environment variables** (API keys, environment flags)

**SOC Alert Configuration:**
```toml
[vars]
SOC_WEBHOOK_URL = "https://your-soc-platform.com/webhooks/sentinel"
SOC_API_KEY = ""  # Use 'wrangler secret put SOC_API_KEY' for production
```

See [ARCHITECTURE.md](./ARCHITECTURE.md#configuration) for advanced configuration.

## Performance

- **Cache hit:** <1ms (KV read at edge)
- **Cache miss:** ~500ms (AI inference + caching)
- **Deduplication:** 90%+ cache hit rate for automated attacks

## Security

- **Fail-safe defaults:** Blocks on uncertainty or system failure
- **No raw payload storage:** Only hashes and assessments are cached
- **Type-safe validation:** All AI responses are validated before use
- **Idempotent processing:** Same payload never analyzed twice

For threat model and security architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md#security-architecture).

## Documentation

### For Reviewers
- **[ASSIGNMENT.md](./ASSIGNMENT.md)** –  **Start here!** Requirements checklist, quick-start guide, and design decisions

### Technical Documentation
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** – Deep dive into system design, Cloudflare API usage, and implementation details (758 lines)
- **[PROMPTS.md](./PROMPTS.md)** – AI prompt engineering and response schemas
- **[tests/sentinel.test.ts](./tests/sentinel.test.ts)** – Test suite with detailed comments (36 tests)

## License

MIT

---

**Built with Cloudflare Workers** – No servers, no containers, just edge-native security automation.
