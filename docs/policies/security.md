---
title: Security Policy
slug: security-policy
status: living
last_updated: 2025-11-05
tags:
- security
- governance
summary: Vulnerability reporting process, operational safeguards, and deployment expectations
  for MAGSAG.
authors: []
sources: []
last_synced: '2025-11-02'
description: Vulnerability reporting process, operational safeguards, and deployment
  expectations for MAGSAG.
---

# Security Policy

> **For Humans**: Follow these procedures to report vulnerabilities, configure production environments, and enforce operational safeguards.
>
> **For AI Agents**: Never disclose sensitive details publicly. Reference this policy when documenting or modifying security-sensitive code.

## Reporting a Vulnerability

If you discover a security vulnerability within the MAGSAG framework, please report it responsibly:

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please use one of the following methods:

### Option 1: GitHub Private Vulnerability Reporting (Recommended)

Use GitHub's private vulnerability reporting feature:
1. Go to the [Security tab](https://github.com/artificial-intelligence-first/magsag/security/advisories/new) of this repository
2. Click "Report a vulnerability"
3. Fill in the details of the vulnerability

### Option 2: GitHub Security Advisories

If private reporting is not available, you can report through:
- **GitHub Discussions**: Create a private security discussion thread
- **Repository Issues**: Contact repository maintainers to request a private disclosure channel

Include the following in your report:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity assessment
- Any suggested fixes (if available)

We will acknowledge your report within 48 hours and provide a detailed response indicating the next steps in handling your report. After the initial reply, we will keep you informed of the progress toward a fix and full announcement.

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: (latest minor version only) |
| < 0.1.0 | :x:                |

We recommend always using the latest release to ensure you have the most recent security patches.

## Security Considerations

When deploying the MAGSAG framework, please be aware of the following security considerations:

### API Key Authentication

- **Development:** API key authentication is optional for local development
- **Production:** API key authentication is **strongly recommended** for production deployments
- Configure via `MAGSAG_API_KEY` environment variable
- Use strong, randomly-generated keys (minimum 32 characters)
- Rotate keys periodically and whenever team membership changes

### GitHub Webhook Security

- **Mandatory:** GitHub webhook secret verification is **required** for all webhook integrations
- Configure via `MAGSAG_GITHUB_WEBHOOK_SECRET` environment variable
- Use a strong, randomly-generated secret (minimum 32 characters)
- Never commit secrets to version control
- Verify webhook signatures before processing events

### Transport Security

- **Production:** Always use HTTPS in production environments
- Use TLS 1.2 or higher
- Ensure valid SSL/TLS certificates
- Consider placing the API behind a reverse proxy (nginx, Caddy) for additional security layers

### Rate Limiting

- **Production Default:** Rate limiting is automatically enabled (10 QPS, burst `3×QPS`) unless you explicitly set `MAGSAG_RATE_LIMIT_ENABLED=false`.
- **Non-production:** The limiter is disabled by default so local developers are not throttled. Opt in by setting `MAGSAG_RATE_LIMIT_ENABLED=true` (default 25 QPS) to rehearse rollout configs.
- **Tuning:** Adjust `MAGSAG_RATE_LIMIT_QPS` / `MAGSAG_RATE_LIMIT_BURST` to fit expected traffic. Flip `MAGSAG_RATE_LIMIT_ENABLED` off only during controlled incident response.
- **Distributed deployments:** Provide `MAGSAG_REDIS_URL` so multiple API instances share limiter state and enable `MAGSAG_RATE_LIMIT_TRUST_PROXY=true` only behind trusted proxies.
- **Remote address source:** When `MAGSAG_RATE_LIMIT_TRUST_PROXY` is left at the default (`false`), the guard derives identifiers from the raw socket address surfaced by `@hono/node-server` via `context.env.incoming`. No client-supplied header (including `X-Forwarded-For`) is considered until you explicitly trust forwarded headers.
- Monitor rate-limit violations (`429`, `x-ratelimit-*`) and alert when they spike unexpectedly.

**Example:**
```bash
# Production-style limiter
export MAGSAG_RATE_LIMIT_ENABLED=true
export MAGSAG_RATE_LIMIT_QPS=10

# Disable temporarily (incident response only)
export MAGSAG_RATE_LIMIT_ENABLED=false

# Multi-instance deployment
export MAGSAG_REDIS_URL=redis://localhost:6379
```

### Data Security

- Agent execution artifacts are stored in `.magsag/runs/` directory
- Ensure appropriate filesystem permissions
- Consider encryption at rest for sensitive data
- Implement backup and retention policies
- Use the storage layer's vacuum feature to clean up old data

### Session Store Recovery

- The agent API uses a bounded in-memory session store by default to cap event growth and enforce retention.
- Toggle `MAGSAG_SESSION_BACKEND=memory` to revert to the legacy unbounded store when you need a fast, in-place rollback during incidents.
- Revert the toggle (or supply a persistent store via `sessions.store`) once the incident is mitigated to regain backpressure guarantees.

### Dependency Security

- Regularly update dependencies with `pnpm up --latest` (or targeted `pnpm up <pkg>`).
- Monitor security advisories surfaced by `pnpm audit` and provider dashboards.
- Review `package.json` / `pnpm-lock.yaml` for pinned vulnerable versions.
- Capture dependency upgrade outcomes and remediation steps in delivery notes.

## Production Deployment Checklist

Before deploying MAGSAG to production, ensure the following security measures are in place:

### Required Environment Variables

- [ ] **`MAGSAG_API_KEY`**: Set a strong API key (generate with `openssl rand -hex 32`)
- [ ] **`MAGSAG_CORS_ORIGINS`**: Configure with your actual frontend/client domains (no wildcard `["*"]`)
- [ ] **`MAGSAG_API_DEBUG`**: Set to `false` (disable debug mode and hot reload)

### Recommended Environment Variables

- [ ] **`MAGSAG_RATE_LIMIT_ENABLED` / `MAGSAG_RATE_LIMIT_QPS`**: Confirm limiter settings match the deployment profile (defaults to `true`/`10` in production, `false`/`25` elsewhere)
- [ ] **`MAGSAG_REDIS_URL`**: Configure Redis for distributed rate limiting in multi-instance deployments
- [ ] **`MAGSAG_SESSION_BACKEND`**: Keep `bounded` for steady-state and document when to flip to `memory` during incidents
- [ ] **`MAGSAG_GITHUB_WEBHOOK_SECRET`**: Set if using GitHub webhooks (generate with `openssl rand -hex 32`)
- [ ] **`MAGSAG_OTEL_TRACING_ENABLED`**: Enable observability for production monitoring
- [ ] **`MAGSAG_OTLP_ENDPOINT`**: Configure OpenTelemetry collector endpoint

### Infrastructure Requirements

- [ ] **HTTPS/TLS**: Deploy behind HTTPS with valid SSL/TLS certificates (TLS 1.2+)
- [ ] **Reverse Proxy**: Use nginx, Caddy, or similar for additional security layers
- [ ] **Firewall Rules**: Restrict API access to known client IPs/networks
- [ ] **Filesystem Permissions**: Ensure `.magsag/runs/` directory has appropriate permissions (read/write for API user only)

### Rate Limiting Behavior

**Default (in-memory)**:
- Rate limiting state is stored in process memory
- Suitable for single-process deployments
- Resets on application restart

**Redis-backed (distributed)**:
- Rate limiting state is shared across all API instances
- Suitable for multi-process/multi-instance deployments
- **Fail-open behavior**: If Redis connection fails, rate limiting falls back to in-memory mode
  - Logs warning: `"Redis unavailable, using in-memory rate limiter"`
  - Application continues to operate with degraded rate limiting
  - Reconnects automatically when Redis becomes available

**Configuration Example**:
```bash
# Single-instance deployment (in-memory)
export MAGSAG_RATE_LIMIT_QPS=10

# Multi-instance deployment (Redis-backed)
export MAGSAG_RATE_LIMIT_QPS=10
export MAGSAG_REDIS_URL=redis://localhost:6379
```

### Secret Management

- [ ] Never commit `.env` files or secrets to version control
- [ ] Use environment-specific secret management (AWS Secrets Manager, Vault, etc.)
- [ ] Rotate API keys and webhook secrets periodically (at least quarterly)
- [ ] Use different secrets for development, staging, and production

### Monitoring and Logging

- [ ] Enable OpenTelemetry tracing for distributed request tracking
- [ ] Configure log aggregation (ELK, Datadog, etc.)
- [ ] Set up alerts for rate limit violations, authentication failures, and errors
- [ ] Monitor `.magsag/runs/` directory disk usage and implement retention policies

### Deployment Validation

After deployment, verify:

- [ ] Authentication is enforced (test with missing/invalid API key)
- [ ] Rate limiting is active (test with burst requests)
- [ ] CORS is correctly configured (test from browser client)
- [ ] HTTPS is enforced (no HTTP fallback)
- [ ] Webhook signature verification is working (if using GitHub integration)
- [ ] Observability data is flowing to monitoring systems

## Security Best Practices

1. **Minimal Permissions:** Run the API server with minimal necessary permissions
2. **Network Isolation:** Use firewalls and network policies to restrict access
3. **Logging and Monitoring:** Enable comprehensive logging and monitor for suspicious activity
4. **Secret Management:** Use environment variables or secret management systems (never hardcode)
5. **Input Validation:** All agent payloads are validated against JSON schemas
6. **Regular Updates:** Keep the framework and dependencies up to date

## Known Security Limitations

- The framework stores execution artifacts on the filesystem without encryption by default
- Rate limiting is **disabled by default** and must be explicitly enabled via `MAGSAG_RATE_LIMIT_QPS`
  - When enabled, token bucket rate limiting is in-memory by default
  - Use Redis (`MAGSAG_REDIS_URL`) for distributed deployments
- No built-in user authentication/authorization (relies on optional API key authentication)

## Disclosure Policy

When we receive a security report, we will:

1. Confirm the vulnerability and determine its impact
2. Develop and test a fix
3. Prepare a security advisory
4. Release a patched version
5. Publish the security advisory with credit to the reporter (if desired)

We aim to handle all security reports within 30 days of initial disclosure.

## Contact

For security-related questions or concerns:
- Use the vulnerability reporting methods described above
- Or open a GitHub Discussion for security-related questions (non-vulnerability)

For general support and non-security issues, please use GitHub Issues.

## Update Log

- 2025-11-05: Updated run artifact paths to `.magsag/runs/` and refreshed metadata.
- 2025-11-02: Refreshed metadata and aligned tags with the documentation taxonomy.
- 2025-11-01: Added frontmatter and aligned the policy with the unified documentation standard.
- 2025-10-24: Documented production deployment checklist and rate limiting defaults.
