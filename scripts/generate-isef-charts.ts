// scripts/generate-isef-charts.ts
import fs from 'fs';
import { solveMukasaCircularDebt, type DebtEdge } from '../server/bolmizanFinalCore';

function generateIsefCharts() {
  const sizes = [10, 25, 50, 100, 250];
  const results: { n: number; ms: number; savedPct: number; memMb: number }[] = [];

  for (const n of sizes) {
    const edges: DebtEdge[] = [];
    for (let i = 0; i < n; i++) {
      edges.push({ from: `M-${i}`, to: `M-${(i + 1) % n}`, amount: 5000 });
      if (i % 3 === 0) {
        edges.push({ from: `M-${i}`, to: `M-${(i + 3) % n}`, amount: 2500 });
      }
    }

    const memBefore = process.memoryUsage().heapUsed;
    const res = solveMukasaCircularDebt(edges);
    const memAfter = process.memoryUsage().heapUsed;
    const memMb = Math.max(0.01, Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(3)));

    results.push({
      n,
      ms: res.executionTimeMs,
      savedPct: res.reductionPercentage,
      memMb,
    });
  }

  const width = 700;
  const height = 400;
  const maxMs = Math.max(...results.map((r) => r.ms), 1);

  const bars = results
    .map((r, idx) => {
      const barWidth = 65;
      const x = 90 + idx * 95;
      const barHeight = Math.max(10, (r.ms / maxMs) * 240);
      const y = 320 - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#2563eb" rx="4" />
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="12" font-family="Arial" fill="#1e293b">${r.ms} ms</text>
        <text x="${x + barWidth / 2}" y="345" text-anchor="middle" font-size="12" font-family="Arial" fill="#334155">N=${r.n}</text>
      `;
    })
    .join('');

  const svgContent = `
    <svg xmlns="http://w3.org" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="35" text-anchor="middle" font-size="18" font-weight="bold" font-family="Arial" fill="#0f172a">
        Mukasa Graph Solver: Execution Latency vs. Merchant Network Size
      </text>
      <line x1="70" y1="320" x2="660" y2="320" stroke="#94a3b8" stroke-width="2" />
      <line x1="70" y1="60" x2="70" y2="320" stroke="#94a3b8" stroke-width="2" />
      ${bars}
      <text x="${width / 2}" y="380" text-anchor="middle" font-size="13" font-family="Arial" fill="#475569">
        Number of Merchant Nodes (N) | Average Debt Reduction: ${results[0]?.savedPct ?? 0}%
      </text>
    </svg>
  `;

  fs.mkdirSync('data/charts', { recursive: true });
  fs.writeFileSync('data/charts/mukasa-latency-chart.svg', svgContent.trim());
  fs.writeFileSync('data/charts/full-system-profile.json', JSON.stringify(results, null, 2));
  console.log('Generated Print-Ready ISEF Chart -> data/charts/mukasa-latency-chart.svg');
  console.log('Generated Memory & Latency Profile -> data/charts/full-system-profile.json');
}

generateIsefCharts();
