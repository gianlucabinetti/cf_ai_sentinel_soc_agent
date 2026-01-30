# AI Prompts Used in Sentinel

This document contains all AI prompts used during the development of the Sentinel security triage agent, as required by the Cloudflare AI internship assignment.

AI-assisted coding was used to accelerate development while maintaining strict type safety and production-grade architecture.

---

## Prompt 1: High-Level Architecture Design

**Goal:** Design a production-grade SOC-style security triage system using Cloudflare Workers.

**Prompt:**
> Design a Security Operations Center (SOC) style AI agent called "Sentinel" using Cloudflare Workers, Workers AI (Llama 3.3), Cloudflare Workflows, and KV. The system should analyze potentially malicious payloads (SQLi/XSS), cache results, and fail closed on uncertainty. Prioritize type safety, durability, and auditability.

---

## Prompt 2: Type-Safe Worker Entrypoint

**Goal:** Generate a type-safe `index.ts` Worker that validates input, hashes payloads, checks KV, and triggers workflows.

**Prompt:**
> Generate a Cloudflare Workers `index.ts` in TypeScript that validates input using type guards, generates a SHA-256 hash for idempotency, checks KV for cached results, and triggers a Cloudflare Workflow for further processing. Avoid `any` and enforce strict typing.

---

## Prompt 3: Cloudflare Workflow Orchestration

**Goal:** Split execution into durable steps.

**Prompt:**
> Create a Cloudflare Workflow that separates execution into three durable steps: payload sanitization, AI inference using Llama 3.3 via Workers AI, and logging/caching to KV. Each step should be independently retryable and type-safe.

---

## Prompt 4: SOC-Grade System Prompt

**Goal:** Produce a professional, defensive system prompt suitable for security engineering.

**Prompt:**
> Write a system prompt for an LLM acting as a SOC security triage analyst. The model must classify SQL injection and XSS payloads, avoid hallucination, fail closed on uncertainty, and output strict JSON matching a predefined schema.

---

## Prompt 5: KV Memory Abstraction

**Goal:** Safely store AI results.

**Prompt:**
> Design a type-safe abstraction around Cloudflare KV for storing AI security assessments with TTL, metadata indexing, and no raw payload storage.

---

## Prompt 6: Production-Grade Documentation

**Goal:** Fully document the system.

**Prompt:**
> Generate professional technical documentation for a Cloudflare Workers AI project, explaining architecture, type safety, workflows, memory design, threat model, and operational considerations.

---

## Notes on AI Usage

- All AI-generated code was reviewed and modified by the author.
- No AI-generated code was accepted without strict TypeScript validation.
- Security logic, threat modeling, and architectural decisions were human-directed.

This project demonstrates effective use of AI as a development accelerator, not a replacement for engineering judgment.