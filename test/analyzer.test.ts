import { describe, it, expect } from 'vitest';
import { analyzeDockerfile, analyzeK8sManifest } from '../src/analyzer';

describe('analyzeDockerfile', () => {
  it('flags shell-form ENTRYPOINT as error (DG001)', () => {
    const findings = analyzeDockerfile('FROM node:20\nENTRYPOINT node server.js\n', 'Dockerfile');
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('DG001');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].line).toBe(2);
  });

  it('passes exec-form ENTRYPOINT', () => {
    const findings = analyzeDockerfile('FROM node:20\nENTRYPOINT ["node", "server.js"]\n', 'Dockerfile');
    expect(findings.filter(f => f.rule === 'DG001')).toHaveLength(0);
  });

  it('flags shell-form CMD as warning (DG002)', () => {
    const findings = analyzeDockerfile('FROM node:20\nCMD node server.js\n', 'Dockerfile');
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('DG002');
    expect(findings[0].severity).toBe('warning');
  });

  it('passes exec-form CMD', () => {
    const findings = analyzeDockerfile('FROM node:20\nCMD ["node", "server.js"]\n', 'Dockerfile');
    expect(findings).toHaveLength(0);
  });

  it('ignores comments and blank lines', () => {
    const dockerfile = '# comment\nFROM node:20\n\nENTRYPOINT ["node", "app.js"]\n';
    const findings = analyzeDockerfile(dockerfile, 'Dockerfile');
    expect(findings).toHaveLength(0);
  });

  it('detects both shell-form ENTRYPOINT and CMD in one file', () => {
    const dockerfile = 'FROM node:20\nENTRYPOINT python app.py\nCMD --port 8080\n';
    const findings = analyzeDockerfile(dockerfile, 'Dockerfile');
    expect(findings).toHaveLength(2);
    expect(findings[0].rule).toBe('DG001');
    expect(findings[1].rule).toBe('DG002');
  });
});

describe('analyzeK8sManifest', () => {
  const goodManifest = `
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: api
          image: myapp:latest
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
          lifecycle:
            preStop:
              exec:
                command: ["sh", "-c", "sleep 5"]
`;

  it('passes a fully configured Deployment manifest', () => {
    const findings = analyzeK8sManifest(goodManifest, 'deploy.yaml');
    expect(findings).toHaveLength(0);
  });

  it('warns when terminationGracePeriodSeconds is missing (DG101)', () => {
    const manifest = 'apiVersion: v1\nkind: Pod\nspec:\n  containers:\n    - name: app\n      image: x:1\n';
    const findings = analyzeK8sManifest(manifest, 'pod.yaml');
    expect(findings.some(f => f.rule === 'DG101')).toBe(true);
  });

  it('warns when preStop hook is missing (DG102)', () => {
    const manifest = 'apiVersion: v1\nkind: Pod\nspec:\n  terminationGracePeriodSeconds: 30\n  containers:\n    - name: app\n      image: x:1\n      readinessProbe:\n        httpGet:\n          path: /health\n          port: 80\n';
    const findings = analyzeK8sManifest(manifest, 'pod.yaml');
    expect(findings.some(f => f.rule === 'DG102')).toBe(true);
    expect(findings.some(f => f.rule === 'DG101')).toBe(false);
  });

  it('warns when readinessProbe is missing (DG103)', () => {
    const manifest = 'apiVersion: v1\nkind: Pod\nspec:\n  terminationGracePeriodSeconds: 30\n  containers:\n    - name: app\n      image: x:1\n';
    const findings = analyzeK8sManifest(manifest, 'pod.yaml');
    expect(findings.some(f => f.rule === 'DG103')).toBe(true);
  });

  it('returns empty findings for invalid YAML', () => {
    const findings = analyzeK8sManifest(': : :\n[invalid', 'bad.yaml');
    expect(findings).toHaveLength(0);
  });
});

  it('analyzes multi-document YAML files separated by ---', () => {
    const multiDoc = `
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: web
          image: app:1
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: worker
          image: worker:1
`;
    const findings = analyzeK8sManifest(multiDoc, 'all.yaml');
    // Both documents should produce DG101 + DG102 + DG103 findings
    const dg101 = findings.filter(f => f.rule === 'DG101');
    const dg102 = findings.filter(f => f.rule === 'DG102');
    const dg103 = findings.filter(f => f.rule === 'DG103');
    expect(dg101).toHaveLength(2);
    expect(dg102).toHaveLength(2);
    expect(dg103).toHaveLength(2);
  });
});
