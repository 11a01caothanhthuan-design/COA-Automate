'use strict';
// Chạy MỘT LẦN: node prepare_template.js "<đường dẫn HTML gốc>"  → tạo template.html
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
if (!src) { console.error('Thiếu đường dẫn HTML gốc'); process.exit(1); }
let h = fs.readFileSync(src, 'utf8');

const dataRe = /window\.COA_DEFAULT_DATA\s*=\s*\{[\s\S]*?\}\s*;(\s*let activeData\s*=\s*window\.COA_DEFAULT_DATA;)/;
if (!dataRe.test(h)) throw new Error('Không tìm thấy khối window.COA_DEFAULT_DATA');
h = h.replace(dataRe, (_m, tail) => 'window.COA_DEFAULT_DATA = /*__DATA__*/null;' + tail);

function once(from, to, label) {
  const n = h.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: tìm thấy ${n} vị trí (cần đúng 1)`);
  h = h.replace(from, () => to);
}
once('function dynamicBounds(t){let l=t.lsl,u=t.usl;',
  'function dynamicBounds(t){if(t.spec_ok===false)return{lsl:null,usl:null,has:false};let l=t.lsl,u=t.usl;', 'dynamicBounds');
once('const b=dynamicBounds(t),readings=parseReadings(t.result);',
  'const b=dynamicBounds(t),readings=Array.isArray(t.values)?t.values:parseReadings(t.result);', 'dynamicEvaluate');
once("result:p.raw,lsl:series.lsl,usl:series.usl}",
  "result:p.raw,values:p.values,spec_ok:series.spec_ok,lsl:series.lsl,usl:series.usl}", 'pointDynamicStatus');

// Nút Reload + Clear filters + dòng "Data updated"
const btn = '<span style="display:flex;gap:10px;align-items:center;font-size:12px;font-weight:500">' +
  '<span id="dataStamp"></span>' +
  '<button type="button" class="btn-refresh" onclick="clearAllFilters()">Clear filters</button>' +
  '<button type="button" class="btn-refresh" onclick="location.reload()">&#10227; Reload</button></span>';
if (!/<\/h1>\s*<\/header>/.test(h)) throw new Error('Không tìm thấy </h1></header>');
h = h.replace(/<\/h1>(\s*<\/header>)/, (_m, t) => btn + '</h1>' + t);

const stamp = `<script>
document.addEventListener('DOMContentLoaded',function(){
  var el=document.getElementById('dataStamp');if(!el||!activeData.metadata)return;
  var g=activeData.metadata.generated_at||'';
  el.textContent='Data updated '+g;
  var t=Date.parse(g.replace(' GMT+7','+07:00').replace(' ','T'));
  if(t&&Date.now()-t>2*3600*1000){el.style.color='#fca5a5';el.textContent+=' (old data)';}
});
</script>`;
const linked = '<script>\n' + fs.readFileSync(path.join(__dirname, 'linked_slicers.js'), 'utf8') + '\n</script>';
if (!h.includes('</body>')) throw new Error('Không tìm thấy </body>');
h = h.replace('</body>', () => stamp + '\n' + linked + '\n</body>');

fs.writeFileSync(path.join(__dirname, 'template.html'), h, 'utf8');
console.log('OK → template.html', (h.length / 1024).toFixed(0) + ' KB');
