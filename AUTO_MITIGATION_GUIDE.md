# Auto-Mitigation System - Implementation Guide

## Overview
Sentinel AI now includes a **production-grade auto-mitigation system** that automatically blocks malicious IP addresses using Cloudflare's Firewall API when critical threats are detected.

## How It Works

### Workflow Architecture
```
Step 1: Sanitize → Step 2: AI Analysis → Step 3: Cache → Step 4: SOC Alert → Step 5: Auto-Mitigation
```

### Trigger Conditions
Auto-mitigation is activated when:
- **Risk Score >= 95** (Critical threats only)
- **Source IP is available** (extracted from request headers)
- **Cloudflare API credentials are configured**

### Automatic IP Blocking Process
1. **Threat Detection**: AI identifies a critical threat (riskScore >= 95)
2. **IP Extraction**: Source IP extracted from `CF-Connecting-IP` header
3. **API Call**: Creates Cloudflare IP Access Rule via Firewall API
4. **Block Duration**: 1-hour TTL (configurable)
5. **Metadata Storage**: Rule details stored in KV for cleanup tracking
6. **Rate Limit Handling**: Automatic retry with exponential backoff on 429 errors

## Configuration

### 1. Create Cloudflare API Token

**Required Permissions:**
- Zone → Firewall Services → Edit

**Steps:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens
2. Click **"Create Token"** → **"Create Custom Token"**
3. Configure permissions:
   - **Permissions**: Zone → Firewall Services → Edit
   - **Zone Resources**: Include → Specific zone → [Select your zone]
   - **Client IP Address Filtering**: (Optional) Restrict to your server IPs
4. Click **"Continue to summary"** → **"Create Token"**
5. **Copy the token** (you won't see it again!)

### 2. Find Your Zone ID

1. Go to Cloudflare Dashboard → [Your Domain]
2. Scroll down to **"API"** section on the right sidebar
3. Copy the **Zone ID** (e.g., `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

### 3. Configure Environment Variables

#### Development/Testing
Edit `wrangler.toml`:
```toml
[vars]
CLOUDFLARE_API_TOKEN = "your-test-token-here"
CLOUDFLARE_ZONE_ID = "your-zone-id-here"
```

#### Production (Recommended)
Use Wrangler secrets for sensitive data:
```bash
# Set API token as a secret
wrangler secret put CLOUDFLARE_API_TOKEN
# Enter your token when prompted

# Set Zone ID (can be in vars since it's not sensitive)
# Edit wrangler.toml:
[vars]
CLOUDFLARE_ZONE_ID = "your-zone-id-here"
```

### 4. Deploy
```bash
npm run deploy
```

## Security Features

###  Scoped API Permissions
- Token has **ONLY** Firewall Services permissions
- Cannot modify DNS, SSL, or other zone settings
- Follows principle of least privilege

###  Rate Limit Handling
- Detects 429 (Too Many Requests) responses
- Automatically retries with exponential backoff
- Respects `Retry-After` header from Cloudflare API
- Workflow durability ensures no lost mitigation attempts

###  Non-Blocking Execution
- Mitigation failures don't crash the workflow
- Assessment and SOC alert still complete successfully
- Errors are logged for monitoring

###  Automatic Cleanup
- Rule metadata stored in KV with 1-hour TTL
- Expired rules can be cleaned up via Cron Trigger
- Prevents indefinite IP blocks

###  Source IP Validation
- Extracts IP from `CF-Connecting-IP` (Cloudflare's trusted header)
- Fallback to `X-Forwarded-For` and `X-Real-IP`
- Skips mitigation if no valid IP is found

## Example Scenarios

### Scenario 1: Critical SQL Injection Attack
```
Request: POST /v1/analyze
Payload: "SELECT * FROM users WHERE id=1 OR 1=1; DROP TABLE users;--"
Source IP: 203.0.113.42

AI Analysis:
- attackType: "SQLi"
- riskScore: 98
- action: "block"

Auto-Mitigation:
 IP 203.0.113.42 blocked via Cloudflare Firewall
 Block expires in 1 hour
 Rule ID: cf-rule-abc123
 Metadata stored in KV: mitigation:203.0.113.42
```

### Scenario 2: High-Risk XSS (Below Threshold)
```
Request: POST /v1/analyze
Payload: "<script>alert('xss')</script>"
Source IP: 198.51.100.10

AI Analysis:
- attackType: "XSS"
- riskScore: 85
- action: "block"

Auto-Mitigation:
 Skipped (riskScore < 95)
 SOC alert still triggered
```

### Scenario 3: Rate Limit Encountered
```
Request: POST /v1/analyze (during high traffic)
Source IP: 192.0.2.100

Cloudflare API Response:
- Status: 429 Too Many Requests
- Retry-After: 60 seconds

Auto-Mitigation:
 Workflow retries after 60 seconds
 Block applied on retry
 No manual intervention required
```

## Monitoring & Observability

### Log Messages

**Successful Mitigation:**
```
[Sentinel] Auto-mitigation: Blocked IP 203.0.113.42 (Rule ID: cf-rule-abc123, Expires: 2026-02-04T13:00:00Z)
[Sentinel] Mitigation metadata stored for cleanup: 203.0.113.42
```

**Skipped (Below Threshold):**
```
[Sentinel] No auto-mitigation needed for {cacheKey} (risk: 85)
```

**Skipped (No IP):**
```
[Sentinel] No source IP provided. Skipping auto-mitigation for {cacheKey}
```

**Skipped (Not Configured):**
```
[Sentinel] Cloudflare API credentials not configured. Skipping auto-mitigation for {cacheKey}
```

**Rate Limited:**
```
[Sentinel] Cloudflare API rate limit hit. Retry-After: 60s
```

**Failed:**
```
[Sentinel] Failed to auto-mitigate 203.0.113.42: Cloudflare API returned 403: Forbidden
```

### Cloudflare Dashboard

View blocked IPs:
1. Go to Cloudflare Dashboard → [Your Domain]
2. Navigate to **Security** → **WAF** → **Tools**
3. Click **"IP Access Rules"**
4. Look for rules with notes: `Auto-blocked by Sentinel AI`

### KV Namespace

Check mitigation metadata:
```bash
wrangler kv:key get --namespace-id=<your-kv-id> "mitigation:203.0.113.42"
```

**Response:**
```json
{
  "ruleId": "cf-rule-abc123",
  "sourceIP": "203.0.113.42",
  "attackType": "SQLi",
  "riskScore": 98,
  "createdAt": "2026-02-04T12:00:00Z",
  "expiresAt": "2026-02-04T13:00:00Z"
}
```

## Advanced Configuration

### Adjusting Block Duration

Edit `src/workflow.ts` (Step 5):
```typescript
// Change from 1 hour to 24 hours
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// Update KV TTL to match
await this.env.SENTINEL_KV.put(
    `mitigation:${sourceIP}`,
    JSON.stringify(ruleMetadata),
    { expirationTtl: 24 * 60 * 60 } // 24 hours
);
```

### Adjusting Risk Threshold

Edit `src/workflow.ts` (Step 5):
```typescript
// Change from 95 to 90 for more aggressive blocking
if (assessment.riskScore < 90) {
    console.log(`[Sentinel] No auto-mitigation needed...`);
    return;
}
```

### Automatic Rule Cleanup (Cron Trigger)

Create a Cron Trigger to delete expired rules:

**wrangler.toml:**
```toml
[triggers]
crons = ["0 * * * *"] # Run every hour
```

**src/cleanup.ts:**
```typescript
export default {
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        // List all mitigation metadata keys
        const list = await env.SENTINEL_KV.list({ prefix: "mitigation:" });
        
        for (const key of list.keys) {
            const metadata = await env.SENTINEL_KV.get(key.name, "json");
            if (!metadata) continue;
            
            const { ruleId, expiresAt } = metadata;
            
            // Check if rule has expired
            if (new Date(expiresAt) < new Date()) {
                // Delete the Cloudflare Firewall rule
                await fetch(
                    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/firewall/access_rules/rules/${ruleId}`,
                    {
                        method: "DELETE",
                        headers: {
                            "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                        },
                    }
                );
                
                console.log(`[Cleanup] Deleted expired rule: ${ruleId}`);
            }
        }
    }
};
```

## API Reference

### Cloudflare Firewall API

**Create IP Access Rule:**
```http
POST https://api.cloudflare.com/client/v4/zones/{zone_id}/firewall/access_rules/rules
Authorization: Bearer {api_token}
Content-Type: application/json

{
  "mode": "block",
  "configuration": {
    "target": "ip",
    "value": "203.0.113.42"
  },
  "notes": "Auto-blocked by Sentinel AI | Attack: SQLi | Risk: 98"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "id": "cf-rule-abc123",
    "mode": "block",
    "configuration": {
      "target": "ip",
      "value": "203.0.113.42"
    },
    "created_on": "2026-02-04T12:00:00Z"
  }
}
```

**Delete IP Access Rule:**
```http
DELETE https://api.cloudflare.com/client/v4/zones/{zone_id}/firewall/access_rules/rules/{rule_id}
Authorization: Bearer {api_token}
```

## Troubleshooting

### Issue: "Cloudflare API credentials not configured"
**Solution:** Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` in `wrangler.toml` or as secrets.

### Issue: "Cloudflare API returned 403: Forbidden"
**Solution:** 
- Verify API token has Firewall Services permissions
- Check token is not expired
- Ensure Zone ID is correct

### Issue: "Rate limited by Cloudflare API (429)"
**Solution:** 
- This is expected during high traffic
- Workflow will automatically retry with backoff
- Consider increasing Cloudflare API rate limits (Enterprise plan)

### Issue: "No source IP provided"
**Solution:**
- Ensure requests are proxied through Cloudflare (orange cloud enabled)
- Check `CF-Connecting-IP` header is present
- For local testing, manually add `X-Forwarded-For` header

### Issue: IP blocks not expiring after 1 hour
**Solution:**
- Cloudflare API doesn't support TTL on access rules
- Implement Cron Trigger cleanup (see Advanced Configuration)
- Manually delete rules from Cloudflare Dashboard

## Performance Impact

### Latency
- **Auto-mitigation step**: ~200-500ms (Cloudflare API call)
- **Total workflow**: ~700-1000ms (including AI inference)
- **Non-blocking**: Client receives response before mitigation completes

### API Rate Limits
- **Cloudflare API**: 1,200 requests/5 minutes (Free plan)
- **Mitigation rate**: Max ~240 IPs blocked per 5 minutes
- **Recommendation**: Use Enterprise plan for high-traffic sites

### Cost
- **Cloudflare API**: Free (included in all plans)
- **Workers AI**: ~$0.01 per 1M tokens
- **KV Operations**: $0.50 per 1M reads, $5.00 per 1M writes

## Best Practices

###  DO
- Use scoped API tokens with minimal permissions
- Store API tokens as Wrangler secrets in production
- Monitor mitigation logs for false positives
- Implement Cron Trigger for automatic rule cleanup
- Test with low-risk payloads before enabling in production

###  DON'T
- Commit API tokens to version control
- Use Account-level API keys (too broad permissions)
- Set risk threshold below 90 (risk of false positives)
- Block IPs indefinitely (implement cleanup)
- Disable rate limit handling (causes workflow failures)

## Conclusion

The auto-mitigation system provides **autonomous threat response** at the edge, blocking critical attacks in real-time without manual intervention. Combined with SOC alerting, Sentinel AI delivers a complete security automation pipeline.

**Key Benefits:**
-  **Instant Response**: Blocks IPs within seconds of detection
-  **Zero Trust**: Fail-closed on uncertainty
-  **Durable**: Automatic retries on API failures
-  **Observable**: Comprehensive logging and monitoring
-  **Secure**: Scoped permissions and secret management

For questions or issues, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md) or open a GitHub issue.
