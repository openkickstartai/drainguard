import { load } from 'js-yaml';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
}

export function analyzeDockerfile(content: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('#') || trimmed === '') return;
    if (/^ENTRYPOINT\s/i.test(trimmed)) {
      const arg = trimmed.slice('ENTRYPOINT'.length).trim();
      if (!arg.startsWith('[')) {
        findings.push({
          rule: 'DG001', severity: 'error', file, line: i + 1,
          message: 'ENTRYPOINT uses shell form — SIGTERM will NOT reach your process. Use exec form: ENTRYPOINT ["executable", "arg"]',
        });
      }
    }
    if (/^CMD\s/i.test(trimmed)) {
      const arg = trimmed.slice('CMD'.length).trim();
      if (!arg.startsWith('[')) {
        findings.push({
          rule: 'DG002', severity: 'warning', file, line: i + 1,
          message: 'CMD uses shell form — signals may not propagate correctly. Prefer exec form: CMD ["executable", "arg"]',
        });
      }
    }
  });
  return findings;
}

export function analyzeK8sManifest(content: string, file: string): Finding[] {
  const findings: Finding[] = [];
  let doc: any;
  try { doc = load(content); } catch { return findings; }
  if (!doc || typeof doc !== 'object') return findings;
  const podSpec = doc?.spec?.template?.spec || doc?.spec;
  if (!podSpec || typeof podSpec !== 'object') return findings;
  if (podSpec.terminationGracePeriodSeconds === undefined) {
    findings.push({
      rule: 'DG101', severity: 'warning', file,
      message: 'terminationGracePeriodSeconds not set — defaults to 30s. Set it explicitly to match your actual shutdown duration.',
    });
  }
  const containers: any[] = podSpec.containers || [];
  for (const c of containers) {
    const name = c.name || 'unnamed';
    if (!c.lifecycle?.preStop) {
      findings.push({
        rule: 'DG102', severity: 'warning', file,
        message: `Container "${name}": no preStop hook. Add "sleep 5" to let kube-proxy propagate iptables rule removal before SIGTERM.`,
      });
    }
    if (!c.readinessProbe) {
      findings.push({
        rule: 'DG103', severity: 'warning', file,
        message: `Container "${name}": no readinessProbe. Without it, the endpoint won't be removed from Service during shutdown.`,
      });
    }
  }
  return findings;
}
