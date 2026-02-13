# 🛡️ DrainGuard

**Container graceful shutdown compliance validator** — prove every service can exit gracefully *before* rolling deployments drop requests.

## The Problem

Every Kubernetes rolling deployment sends SIGTERM to old Pods. Most services never test this path:

- `ENTRYPOINT` in shell form → SIGTERM never reaches your process
- No `preStop` hook → kube-proxy still routes traffic during shutdown
- No `readinessProbe` → load balancer keeps sending requests to a dying Pod
- `terminationGracePeriodSeconds` too short → SIGKILL before cleanup finishes

Result: silent 502 spikes in production.

## Install

```bash
npm install -g drainguard
# or run directly
npx drainguard Dockerfile deployment.yaml
```

## Usage

```bash
# Analyze a Dockerfile
drainguard Dockerfile

# Analyze a Kubernetes manifest
drainguard deployment.yaml

# Analyze multiple files with JUnit output
drainguard --format=junit Dockerfile k8s/deployment.yaml

# SARIF output for GitHub Code Scanning
drainguard --format=sarif Dockerfile k8s/*.yaml
```

## Rules

| Rule   | Severity | Description |
|--------|----------|-------------|
| DG001  | error    | ENTRYPOINT uses shell form — SIGTERM won't reach process |
| DG002  | warning  | CMD uses shell form — signals may not propagate |
| DG101  | warning  | `terminationGracePeriodSeconds` not set explicitly |
| DG102  | warning  | No `preStop` hook — kube-proxy needs time to update iptables |
| DG103  | warning  | No `readinessProbe` — endpoints won't be removed on shutdown |

## CI Integration

```yaml
# .github/workflows/drainguard.yml
name: DrainGuard
on:
  pull_request:
    paths: ['Dockerfile', 'k8s/**']
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx drainguard --format=sarif Dockerfile k8s/*.yaml
```

## Output Formats

- **text** (default) — human-readable terminal output
- **junit** — `drainguard-report.xml` for CI test reporting
- **sarif** — `drainguard-report.sarif.json` for GitHub Code Scanning

## License

MIT
