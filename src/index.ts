#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { analyzeDockerfile, analyzeK8sManifest, Finding } from './analyzer';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toJUnit(findings: Finding[]): string {
  const fails = findings.filter(f => f.severity === 'error').length;
  const cases = findings.map(f => {
    const body = f.severity === 'error' ? `<failure message="${esc(f.message)}"/>` : '';
    return `    <testcase name="${f.rule}: ${esc(f.message.slice(0, 60))}" classname="${f.file}">${body}</testcase>`;
  }).join('\n');
  return `<?xml version="1.0"?>\n<testsuites>\n  <testsuite name="DrainGuard" tests="${findings.length}" failures="${fails}">\n${cases}\n  </testsuite>\n</testsuites>`;
}

function toSarif(findings: Finding[]): string {
  const sarif = {
    $schema: 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'DrainGuard', version: '0.1.0' } },
      results: findings.map(f => ({
        ruleId: f.rule, level: f.severity === 'error' ? 'error' : 'warning',
        message: { text: f.message },
        locations: f.line ? [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }] : [],
      })),
    }],
  };
  return JSON.stringify(sarif, null, 2);
}

export function analyze(paths: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const fp of paths) {
    const content = readFileSync(fp, 'utf-8');
    if (/dockerfile/i.test(fp)) findings.push(...analyzeDockerfile(content, fp));
    else if (/\.ya?ml$/i.test(fp)) findings.push(...analyzeK8sManifest(content, fp));
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.filter(a => !a.startsWith('--'));
  const fmt = (args.find(a => a.startsWith('--format=')) || '--format=text').split('=')[1];
  if (files.length === 0) {
    console.log('DrainGuard v0.1.0 — Container graceful shutdown compliance validator\n');
    console.log('Usage: drainguard [--format=text|junit|sarif] <Dockerfile|manifest.yaml> ...');
    process.exit(0);
  }
  const findings = analyze(files);
  const hasError = findings.some(f => f.severity === 'error');
  if (fmt === 'junit') {
    const xml = toJUnit(findings);
    writeFileSync('drainguard-report.xml', xml);
    console.log(xml);
  } else if (fmt === 'sarif') {
    const out = toSarif(findings);
    writeFileSync('drainguard-report.sarif.json', out);
    console.log(out);
  } else {
    for (const f of findings) {
      const loc = f.line ? `:${f.line}` : '';
      const icon = f.severity === 'error' ? '\u274C' : '\u26A0\uFE0F';
      console.log(`${icon}  [${f.rule}] ${f.file}${loc}: ${f.message}`);
    }
    if (!findings.length) console.log('\u2705 All DrainGuard checks passed!');
  }
  process.exit(hasError ? 1 : 0);
}

main();
