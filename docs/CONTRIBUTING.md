# Contributing to Sentinel AI

Welcome to **Sentinel AI** — a **Community-Driven Edge Security Platform** built for the modern threat landscape. We're building the future of autonomous security operations, and we need your expertise.

---

##  The HAND Architecture

Sentinel AI is designed around the **HAND** (Hierarchical Autonomous Network Defense) architecture:

### The Brain
The **Brain** is the core intelligence layer:
- **D1 Forensic Database**: Persistent threat intelligence storage
- **AI Inference Engine**: Llama 3.3-70b for real-time threat analysis
- **Workflow Orchestrator**: Durable execution with automatic retries
- **Memory Layer**: KV-based caching for sub-millisecond responses

### The Fingers
The **Fingers** are specialized **Detection Agents** that identify specific attack patterns:
- **SQLi Agent**: SQL injection detection
- **XSS Agent**: Cross-site scripting analysis
- **CSRF Agent**: Cross-site request forgery detection
- **Path Traversal Agent**: Directory traversal attacks
- **Command Injection Agent**: OS command injection patterns
- **SSRF Agent**: Server-side request forgery detection
- **XXE Agent**: XML external entity attacks
- **Deserialization Agent**: Unsafe deserialization exploits
- **LDAP Injection Agent**: LDAP query manipulation
- **NoSQL Injection Agent**: NoSQL database attacks

**Your Mission**: Build new Fingers to detect emerging threats from the **OWASP Top 10** and beyond.

---

##  Built on Iron

Sentinel AI is developed and tested on a **Dell PowerEdge R610 Proxmox cluster** to ensure:
- **Enterprise-grade stability** under load
- **Multi-node resilience** testing
- **Real-world performance** benchmarks
- **Hardware-level security** validation

This isn't a toy project. We're building production-ready security infrastructure.

---

##  Contributor Tiers

We welcome contributors at all skill levels. Choose your tier:

### Tier 1: Security Researchers
**Focus**: Identify bypasses and submit Threat Patterns

**What You'll Do**:
- Discover novel attack vectors that bypass current detection
- Submit Threat Pattern Reports with proof-of-concept payloads
- Validate existing detection rules against real-world exploits
- Contribute to the OWASP Top 10 coverage roadmap

**Requirements**:
- Deep understanding of web application security
- Experience with penetration testing or red teaming
- Ability to document attack patterns clearly

**How to Contribute**:
1. Test Sentinel AI against known exploits
2. Document bypasses in `docs/threat-patterns/`
3. Submit a PR with your findings and recommended mitigations
4. Include CVSS scores and OWASP mappings

**Example Contribution**:
```markdown
# Threat Pattern: SQLi Bypass via Unicode Normalization

**OWASP Category**: A03:2021 – Injection
**CVSS Score**: 9.8 (Critical)

## Attack Vector
Using Unicode normalization to bypass SQL injection filters:
\u0053\u0045\u004C\u0045\u0043\u0054 * FROM users

## Current Detection Status
 Not detected by current SQLi Agent

## Recommended Mitigation
Add Unicode normalization to sanitization step before AI inference.
```

### Tier 2: Engineers
**Focus**: Build new Detection Agents or optimize the D1 forensic layer

**What You'll Do**:
- Implement new Detection Agents (Fingers) for specific threats
- Optimize AI prompts for better accuracy and lower latency
- Enhance the D1 database schema for forensic analysis
- Improve workflow orchestration and error handling

**Requirements**:
- Proficiency in TypeScript and Cloudflare Workers
- Understanding of security patterns and threat modeling
- Experience with AI/ML systems (preferred)

**How to Contribute**:
1. Pick an unimplemented Detection Agent from the roadmap
2. Create a new agent in `src/agents/`
3. Write comprehensive tests in `tests/agents/`
4. Submit a PR with performance benchmarks

**Example Contribution**:
```typescript
// src/agents/csrf-agent.ts
export class CSRFAgent implements DetectionAgent {
  async analyze(payload: string): Promise<ThreatAssessment> {
    // CSRF detection logic
    const hasValidToken = this.validateCSRFToken(payload);
    const hasSameSiteHeader = this.checkSameSite(payload);
    
    if (!hasValidToken && !hasSameSiteHeader) {
      return {
        attackType: "CSRF",
        riskScore: 85,
        confidence: "High",
        action: "block"
      };
    }
    
    return { attackType: "Benign", riskScore: 0, action: "allow" };
  }
}
```

### Tier 3: Designers
**Focus**: Improve the SOC Dashboard HUD

**What You'll Do**:
- Design intuitive threat visualization dashboards
- Create real-time alert interfaces for SOC analysts
- Build interactive forensic investigation tools
- Improve UX for mitigation workflows

**Requirements**:
- Experience with React, TypeScript, and modern UI frameworks
- Understanding of SOC analyst workflows
- Ability to visualize complex security data

**How to Contribute**:
1. Review the current dashboard in `pages/`
2. Propose UX improvements in GitHub Discussions
3. Implement new dashboard components
4. Submit a PR with screenshots and user flow diagrams

**Example Contribution**:
- Real-time threat heatmap by attack type
- Interactive timeline for forensic investigation
- Drag-and-drop mitigation rule builder
- Dark mode optimized for 24/7 SOC operations

---

##  PR Guidelines

We maintain strict quality standards to ensure Sentinel AI remains production-ready.

### Code Standards
- **No emojis in code or commits**: Keep code professional and machine-readable
- **Mandatory 'Why' in PR descriptions**: Explain the reasoning behind your changes
- **Zero-False-Positive obsession**: Security systems must be accurate, not noisy
- **Type safety**: No `any` types. Use strict TypeScript.
- **Test coverage**: All new agents must have >90% test coverage

### PR Template
```markdown
## Why
[Explain the problem this PR solves]

## What
[Describe the changes made]

## Testing
[Describe how you tested this]

## Performance Impact
[Benchmark results, if applicable]

## False Positive Rate
[For detection agents: FPR on test dataset]

## OWASP Mapping
[Which OWASP Top 10 category does this address?]
```

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New Detection Agent or feature
- `fix`: Bug fix or bypass mitigation
- `perf`: Performance optimization
- `docs`: Documentation updates
- `test`: Test coverage improvements
- `refactor`: Code refactoring without behavior change

**Example**:
```
feat(agents): Add SSRF Detection Agent

Implements Server-Side Request Forgery detection using:
- URL parsing and validation
- Private IP range detection
- Cloud metadata endpoint blocking

Addresses OWASP A10:2021 - Server-Side Request Forgery

Tested against 500 SSRF payloads with 0% FPR.
```

### Review Process
1. **Automated Checks**: CI/CD runs tests, linting, and type checking
2. **Security Review**: Core team validates threat detection logic
3. **Performance Review**: Benchmarks must show <10ms latency impact
4. **Documentation Review**: All new agents must update `docs/ARCHITECTURE.md`

---

##  Roadmap to v2.5

We're building toward a fully autonomous, multi-node SOC platform. Here's what's coming:

### Webhook Integrations
- **Slack Alerts**: Real-time threat notifications to SOC channels
- **Discord Webhooks**: Community-driven threat intelligence sharing
- **PagerDuty Integration**: Critical alert escalation
- **Microsoft Sentinel**: Enterprise SIEM integration
- **Splunk HEC**: Log aggregation and correlation

### Multi-Node Clusters
- **Distributed Threat Intelligence**: Share detections across edge nodes
- **Consensus-Based Blocking**: Multi-node voting for high-confidence blocks
- **Geo-Distributed Forensics**: Regional threat pattern analysis
- **Failover and Redundancy**: Zero-downtime security operations

### Advanced Detection
- **Behavioral Analysis**: Detect anomalies using historical baselines
- **Threat Hunting Workflows**: Proactive investigation tools
- **Custom Rule Engine**: User-defined detection logic
- **ML Model Fine-Tuning**: Train on your own threat data

### Forensic Enhancements
- **D1 Query Interface**: SQL-based threat intelligence queries
- **R2 Archival**: Long-term storage of attack traces
- **Incident Response Playbooks**: Automated mitigation workflows
- **Threat Attribution**: Link attacks to known threat actors

---

##  Development Setup

### Prerequisites
- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI: `npm install -g wrangler`

### Quick Start
```bash
# Clone the repository
git clone https://github.com/yourusername/sentinel-ai.git
cd sentinel-ai

# Install dependencies
npm install

# Generate Cloudflare types
npm run cf-typegen

# Run tests
npm test

# Start local development server
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

### Creating a New Detection Agent

1. **Create the agent file**:
```bash
touch src/agents/your-agent.ts
```

2. **Implement the DetectionAgent interface**:
```typescript
import { DetectionAgent, ThreatAssessment } from "../types";

export class YourAgent implements DetectionAgent {
  async analyze(payload: string): Promise<ThreatAssessment> {
    // Your detection logic here
  }
}
```

3. **Write tests**:
```bash
touch tests/agents/your-agent.test.ts
```

4. **Register the agent** in `src/workflow.ts`:
```typescript
import { YourAgent } from "./agents/your-agent";

const agents = [
  new SQLiAgent(),
  new XSSAgent(),
  new YourAgent(), // Add your agent
];
```

5. **Document the agent** in `docs/ARCHITECTURE.md`

---

##  Testing Strategy

### What We Test
- **Type Guards**: Runtime validation of AI responses
- **Detection Agents**: Accuracy, false positive rate, performance
- **Workflow Orchestration**: Retry logic, error handling, durability
- **Caching Logic**: Deduplication, TTL expiration, invalidation

### What We Don't Test (Requires Cloudflare Runtime)
- Workers AI inference (use mocks)
- KV operations (use in-memory store)
- Workflow execution (test individual steps)

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test tests/agents/sqli-agent.test.ts
```

### Test Coverage Requirements
- **Detection Agents**: >90% coverage
- **Core Logic**: >80% coverage
- **Type Guards**: 100% coverage

---

##  Security Best Practices

### Code Review Checklist
- [ ] No raw payloads logged (only hashes)
- [ ] All AI responses validated with type guards
- [ ] Fail-safe defaults on errors (fail closed, not open)
- [ ] No secrets in code (use Wrangler secrets)
- [ ] Input sanitization before AI inference
- [ ] Rate limiting on API endpoints
- [ ] CORS headers properly configured

### Threat Modeling
When building a new Detection Agent, consider:
1. **Bypass Techniques**: How could an attacker evade this detection?
2. **False Positives**: What legitimate traffic might trigger this?
3. **Performance Impact**: Does this add >10ms latency?
4. **Fail-Safe Behavior**: What happens if the agent crashes?

---

##  Documentation Standards

### Required Documentation
- **Agent README**: Explain what the agent detects and how
- **Threat Patterns**: Document known bypasses and mitigations
- **Performance Benchmarks**: Include latency and accuracy metrics
- **OWASP Mapping**: Link to relevant OWASP categories

### Documentation Structure
```
docs/
├── ARCHITECTURE.md       # System design and technical deep dive
├── CONTRIBUTING.md       # This file
├── threat-patterns/      # Known attack patterns and bypasses
│   ├── sqli-bypasses.md
│   ├── xss-bypasses.md
│   └── ...
├── agents/               # Agent-specific documentation
│   ├── sqli-agent.md
│   ├── xss-agent.md
│   └── ...
└── playbooks/            # Incident response workflows
    ├── ddos-mitigation.md
    ├── data-exfiltration.md
    └── ...
```

---

##  Community

### Communication Channels
- **GitHub Discussions**: Feature requests, architecture debates
- **GitHub Issues**: Bug reports, bypass discoveries
- **Discord** (coming soon): Real-time collaboration
- **Security Mailing List**: Responsible disclosure of vulnerabilities

### Code of Conduct
- **Be respectful**: We're all here to build better security tools
- **Be constructive**: Critique ideas, not people
- **Be collaborative**: Share knowledge and help others learn
- **Be responsible**: Disclose vulnerabilities privately first

### Recognition
Top contributors will be:
- Listed in `CONTRIBUTORS.md`
- Credited in release notes
- Invited to the core team (for sustained contributions)

---

##  Reporting Security Vulnerabilities

If you discover a security vulnerability in Sentinel AI:

1. **Do NOT open a public GitHub issue**
2. Email: [security@sentinel-ai.dev] (replace with actual email)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested mitigation (if any)

We'll respond within 48 hours and work with you on a fix.

---

##  License

Sentinel AI is licensed under the **Apache License 2.0**. By contributing, you agree that your contributions will be licensed under the same license.

---

##  Acknowledgments

Sentinel AI is built on the shoulders of giants:
- **Cloudflare Workers**: Edge computing platform
- **Llama 3.3-70b**: AI inference engine
- **OWASP**: Security standards and threat intelligence
- **The Security Community**: For discovering and documenting attack patterns

---

##  Ready to Contribute?

1. **Fork the repository**
2. **Pick an issue** from the [Good First Issue](https://github.com/yourusername/sentinel-ai/labels/good%20first%20issue) label
3. **Read the relevant docs** in `docs/`
4. **Write your code** following the PR guidelines
5. **Submit a PR** with a clear "Why" explanation

**Let's build the future of autonomous security together.**

---

**Questions?** Open a [GitHub Discussion](https://github.com/yourusername/sentinel-ai/discussions) or reach out to the core team.

**Found a bypass?** Submit a Threat Pattern Report and help us improve detection accuracy.

**Want to build a new agent?** Check the [Roadmap](https://github.com/yourusername/sentinel-ai/projects) for unimplemented Detection Agents.

---

*Sentinel AI: Zero-False-Positive Security at the Edge.*
