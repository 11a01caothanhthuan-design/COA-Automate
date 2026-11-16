const { parseResult, specBounds } = require('./src/parse');

const specs = [
  ['±15', '%'],
  ['±10', '%'],
  ['≤10^12', 'Ω·cm'],
  ['≥130', 'cm³/g'],
  ['14.0±1.4', 'den'],
  ['>=3.8', 'g/d'],
  ['<=4.5', '%'],
  ['20 ± 25%', 'den'],
  ['51 ± 10%', 'mm'],
  ['7~9', 'den'],
  ['0.20~0.60%', '%'],
  ['0.3-0.60', 'g/10 min'],
  ['1.33-2.50', 'dtex'],
  ['7x10^8 ~ 9x10^10', ''],
  ['10^6~10^10', ''],
  ['≤1.0E12', 'Ω·cm'],
  ['≤9.9*10^13', 'Ω·cm'],
  ['<30', 'mg/100'],
  ['51.0', 'mm'],
  ['', '%'],
  ['/', '%'],
  ['≤±8', '%'],
  ['≤±8', 'mm'],
  ['Superior grade', ''],
  ['12-16', 's'],
  ['2~3', 'crimps'],
  ['100±30', 'CPS'],
  ['+5', '%'],
  ['0.3-0.5', '%'],
  ['60-70', '%'],
  ['-10 to 10', '%'],
  ['10 to 20', 'mm'],
  ['Min 15', 'MPa'],
  ['Min. 80', '%'],
  ['min 5.0', 'g/10 min'],
  ['Max 25.5', 'mm'],
  ['max: 100', 'cps'],
  ['NMT 50', 'ppm'],
  ['NLT 10', 'N/mm2'],
  ['1,5 - 2,5', 'mm'],
];

console.log('--- SPECIFICATIONS ---');
for (const [s, u] of specs) {
  const b = specBounds(s, u);
  console.log(JSON.stringify(s).padEnd(24), JSON.stringify(u).padEnd(12), b.ok ? `LSL=${b.lsl} USL=${b.usl}` : `-- ${b.reason}`);
}

console.log('\n--- RESULTS ---');
const results = [
  '143.8',
  '2.2*10^8',
  '3.2×10^8',
  '7.9E8',
  '2~3',
  '0.28%',
  '8.0*10^9; 7.4*10^9',
  '7.4x10^7, 6.6x10^7',
  '4.1x10^10 ~ 8.2x10^10',
  '15-16',
  '2-4',
  '-3.10',
  '+1',
  '/',
  '.961',
  '1,5',
  '1,000.5',
  '12.5 (Pass)',
  '89; 89; 87 (avg 88)',
  '5.2 (Average)',
  '10.5 (OK)',
  'Black',
  '94 HB',
  'Pass'
];

for (const r of results) {
  const p = parseResult(r);
  console.log(JSON.stringify(r).padEnd(26), p.ResultKind.padEnd(9), JSON.stringify(p.Values), p.ResultParseFlag || '');
}
