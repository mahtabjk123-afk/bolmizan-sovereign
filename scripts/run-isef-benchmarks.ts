// scripts/run-isef-benchmarks.ts
import fs from 'fs';
import { solveMukasaCircularDebt, type DebtEdge } from '../server/bolmizanFinalCore';
import { analyzeMessageForScam } from '../server/scamClassifier';

function benchmarkMukasa() {
    const nodeCounts = [25, 50, 100, 250, 500];
    const csvRows = [
        'Merchant_Nodes,Total_Edges,Initial_Volume_PKR,Final_Volume_PKR,Liquidity_Saved_PKR,Reduction_Percent,Execution_Time_Ms',
    ];

    for (const n of nodeCounts) {
        const edges: DebtEdge[] = [];
        for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            edges.push({ from: `M-${i}`, to: `M-${next}`, amount: 5000 });
            if (i % 3 === 0) {
                const jump = (i + 3) % n;
                edges.push({ from: `M-${i}`, to: `M-${jump}`, amount: 2500 });
            }
        }

        const res = solveMukasaCircularDebt(edges);
        csvRows.push(
            `${n},${edges.length},${res.initialVolume},${res.finalVolume},${res.liquiditySaved},${res.reductionPercentage},${res.executionTimeMs}`
        );
    }

    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/mukasa-isef-benchmarks.csv', csvRows.join('\n'));
    console.log('1. Generated -> data/mukasa-isef-benchmarks.csv');
}

function benchmarkScamClassifier() {
    const testDataset = [
        { text: '8558: Apko Rs 25,000 BISP imdad mili hai. Code 4412 batayen 03001234567 par', actualScam: true },
        { text: 'Mubarak ho! Apka inaam nikla hai, apna JazzCash PIN send karein', actualScam: true },
        { text: 'توهان جو اڪائونٽ بلاڪ ٿي ويندو، فوري طور 03129876543 تي رابطو ڪريو', actualScam: true },
        { text: 'Rs 15,000 received from 03451122334. Bal Rs 45,000.', actualScam: true },
        { text: '3737: Apka Easypaisa account band hone wala hai. OTP code share karein.', actualScam: true },
        { text: 'بینظیر انکم سپورٹ پروگرام سے آپ کے 14000 روپے منظور ہو گئے ہیں، ابھی رابطہ کریں', actualScam: true },
        { text: 'توهان کي 20000 رپيا امداد ملي وئي آهي، پن ڪوڊ موڪليو', actualScam: true },
        { text: 'Congratulations! You won lucky draw. Click http://bit.ly to verify.', actualScam: true },
        { text: '9999: Emergency alert! Verify your MPIN immediately or account will suspend.', actualScam: true },
        { text: 'Rs 8,500 received from 03019988776 on your account. Call back for refund.', actualScam: true },
        { text: 'Customer Ahmed paid Rs 4,500 cash for 2 bags of flour.', actualScam: false },
        { text: 'Udhaar entry: Bilal Store Sakrand, 10kg Sugar, Rs 1,400.', actualScam: false },
        { text: 'آج کا حساب: کل فروخت 12,500 روپے اور ادھار وصولی 3,000 روپے۔', actualScam: false },
        { text: 'دڪان جو حساب: علي کان 2000 رپيا وصول ٿيا.', actualScam: false },
        { text: 'Wholesale rice 50kg bag delivered to Madina Kiryana, balance Rs 6,200.', actualScam: false },
        { text: 'Monthly electricity bill paid Rs 4,800 via shop cashbox.', actualScam: false },
        { text: 'سکرنڈ منڈی مان سبزي خريد ڪئي، ڪل رقم 3500 رپيا.', actualScam: false },
        { text: 'کریم بخش کے کھاتے میں 1500 روپے جمع کر دیے گئے ہیں۔', actualScam: false },
        { text: 'Invoice #104: 5 cartons cooking oil, total Rs 22,000, paid in full.', actualScam: false },
        { text: 'Daily closing balance verified: Rs 18,450 cash in drawer.', actualScam: false },
    ];

    let tp = 0, tn = 0, fp = 0, fn = 0;
    let totalLatency = 0;

    for (const sample of testDataset) {
        const prediction = analyzeMessageForScam(sample.text);
        totalLatency += prediction.latencyMs;

        if (prediction.isScam && sample.actualScam) tp++;
        else if (!prediction.isScam && !sample.actualScam) tn++;
        else if (prediction.isScam && !sample.actualScam) fp++;
        else if (!prediction.isScam && sample.actualScam) fn++;
    }

    const accuracy = ((tp + tn) / testDataset.length) * 100;
    const precision = (tp / (tp + fp || 1)) * 100;
    const recall = (tp / (tp + fn || 1)) * 100;
    const f1Score = (2 * precision * recall) / (precision + recall || 1);
    const avgLatency = totalLatency / testDataset.length;

    const metricsCsv = [
        'Total_Samples,True_Positives,True_Negatives,False_Positives,False_Negatives,Accuracy_Percent,Precision_Percent,Recall_Percent,F1_Score_Percent,Avg_Latency_Ms',
        `${testDataset.length},${tp},${tn},${fp},${fn},${accuracy.toFixed(2)},${precision.toFixed(2)},${recall.toFixed(2)},${f1Score.toFixed(2)},${avgLatency.toFixed(4)}`,
    ];

    fs.writeFileSync('data/scam-isef-metrics.csv', metricsCsv.join('\n'));
    console.log('2. Generated -> data/scam-isef-metrics.csv');
    console.log(`   Accuracy: ${accuracy.toFixed(2)}% | Precision: ${precision.toFixed(2)}% | Recall: ${recall.toFixed(2)}% | F1: ${f1Score.toFixed(2)}%`);
}

benchmarkMukasa();
benchmarkScamClassifier();
