'use strict';
// Đọc Specification và Result thành số (port từ fxParseNumber / fxParseResult / fxParseSpec của M code).
// Không đoán khi mơ hồ: trả về status/flag thay vì tự suy diễn.

const MISSING = new Set(['', '/', '-', '—', 'N/A', 'NA', 'NULL']);
const DIGITS = /^[0-9]+$/;

// Chuẩn hoá ký hiệu thường gặp trong COA trước khi đọc
function normalizeText(v) {
  return String(v == null ? '' : v)
    .replace(/\u00a0/g, ' ')
    .replace(/＜/g, '<').replace(/＞/g, '>').replace(/≦/g, '≤').replace(/≧/g, '≥')
    .replace(/＋/g, '+').replace(/％/g, '%').replace(/～/g, '~').replace(/−/g, '-').replace(/[–—]/g, '-')
    .replace(/⁰/g, '0').replace(/¹/g, '1').replace(/²/g, '2').replace(/³/g, '3').replace(/⁴/g, '4')
    .replace(/⁵/g, '5').replace(/⁶/g, '6').replace(/⁷/g, '7').replace(/⁸/g, '8').replace(/⁹/g, '9')
    .replace(/10([0-9]{1,2})(?![0-9.])/g, (m0, e, off, s) => (/[x×*]\s*$/.test(s.slice(0, off)) ? `10^${e}` : m0))
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')      // bỏ dấu phẩy hàng nghìn: 1,250.0 -> 1250.0
    .trim();
}

const stripSign = (s) => (s.startsWith('+') || s.startsWith('-') ? s.slice(1) : s);
const isDigits = (s) => s !== '' && DIGITS.test(s);
const isIntegerText = (s) => isDigits(stripSign(s));
const isDecimalText = (s) => {
  const parts = stripSign(s).split('.');
  if (parts.length === 1) return isDigits(parts[0]);
  if (parts.length === 2) {
    return (parts[0] !== '' || parts[1] !== '') &&
      (parts[0] === '' || isDigits(parts[0])) && (parts[1] === '' || isDigits(parts[1]));
  }
  return false;
};

function parseSimple(s) {
  const t = s.trim();
  const parts = t.split('e');
  let valid;
  if (parts.length === 1) valid = isDecimalText(parts[0]);
  else if (parts.length === 2) valid = isDecimalText(parts[0]) && isIntegerText(parts[1]);
  else valid = false;
  if (!valid) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parsePower(s) {
  const parts = s.trim().split('^').map((p) => p.trim());
  if (parts.length !== 2 || parts[0] !== '10' || !isIntegerText(parts[1])) return null;
  const e = parseSimple(parts[1]);
  if (e === null) return null;
  const n = Math.pow(10, e);
  return Number.isFinite(n) ? n : null;
}

function parseNumber(value) {
  const t0 = normalizeText(value);
  const missing = MISSING.has(t0.toUpperCase());
  const cleaned = t0.replace(/×/g, 'x').replace(/＊/g, '*');
  const isPercent = cleaned.endsWith('%');
  const body = (isPercent ? cleaned.slice(0, -1) : cleaned).trim();
  const lower = body.toLowerCase();
  const commaCount = lower.split(',').length - 1;
  const separatorProblem = commaCount > 1 || (commaCount > 0 && lower.includes('.'));
  const normalized = commaCount === 1 && !separatorProblem ? lower.replace(',', '.') : lower;
  const sci = normalized.replace(/\*/g, 'x').replace(/\s+/g, '');
  const sciParts = sci.split('x');

  let parsed;
  if (missing || separatorProblem) parsed = null;
  else if (sciParts.length > 1) {
    if (sciParts.length !== 2) parsed = null;
    else {
      const c = parseSimple(sciParts[0]);
      const p = parsePower(sciParts[1]);
      parsed = c === null || p === null ? null : c * p;
    }
  } else if (sci.includes('^')) parsed = parsePower(sci);
  else parsed = parseSimple(sci);

  const finite = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  const status = missing ? 'MISSING' : finite === null ? 'AMBIGUOUS' : 'OK';
  const flag = missing ? 'MISSING_NUMBER'
    : separatorProblem ? 'AMBIGUOUS_DECIMAL_SEPARATOR'
    : finite === null ? 'UNRECOGNIZED_NUMBER' : null;
  return { value: finite, isPercent, status, flag };
}

// Bỏ đơn vị dính ở cuối (vd "22.0 ± 0.5 mm", "15-16 s") để đọc được số
function stripTrailingUnit(t) {
  return t.replace(/\s*(mm|cm|m|g\/10\s?min|g\/cm3|g\/d|kj\/m2|mpa|n\/mm2|n|s|sec|秒|cps|den|dtex|ppm|kg\/m3|cm3\/g|mg\/100g|°c|℃)\s*$/i, '').trim();
}

function parseResult(value) {
  let rawNorm = normalizeText(value);
  // Bỏ chú thích trong ngoặc đơn đi kèm số (vd: "12.5 (Pass)" -> "12.5", "89; 89; 87 (avg 88)" -> "89; 89; 87")
  rawNorm = rawNorm.replace(/\s*\((?:avg|average|tb|trung bình)[^)]*\)/i, '');
  rawNorm = rawNorm.replace(/(\d+(?:\.\d+)?)\s*\((?:pass|fail|ok|ng|đạt|không đạt|tc)[^)]*\)/i, '$1');
  const t = stripTrailingUnit(rawNorm);
  const missing = MISSING.has(t.toUpperCase());
  const make = (kind, values, status, flag, isPercent) => ({
    ResultKind: kind, Values: values,
    ResultNumeric: kind === 'SCALAR' && values.length === 1 ? values[0] : null,
    ResultMin: values.length ? Math.min(...values) : null,
    ResultMax: values.length ? Math.max(...values) : null,
    ResultIsPercent: isPercent, ResultParseStatus: status, ResultParseFlag: flag,
  });

  const scalar = parseNumber(t);
  const commaCount = t.split(',').length - 1;
  const hasSemicolon = t.includes(';');
  const hasCommaList = !hasSemicolon && commaCount === 1 && t.includes(', ');
  const ambiguousCommaList = !hasSemicolon && commaCount > 1;
  const isReadingList = hasSemicolon || hasCommaList;
  const readingParts = hasSemicolon ? t.split(';').map((x) => x.trim()).filter(Boolean)
    : hasCommaList ? t.split(', ').map((x) => x.trim()) : [];
  const parsedReadings = readingParts.map(parseNumber);
  const readingsAllOK = parsedReadings.length >= 2 && parsedReadings.every((r) => r.status === 'OK');
  const readingPercentConsistent = readingsAllOK && new Set(parsedReadings.map((r) => r.isPercent)).size === 1;

  const parsePair = (left, right) => {
    const l = left.trim(); const r = right.trim();
    const a0 = parseNumber(l); const b = parseNumber(r);
    const shared = b.isPercent && !a0.isPercent && !l.includes('%');
    const a = shared ? parseNumber(l + '%') : a0;
    const valid = a.status === 'OK' && b.status === 'OK' && a.isPercent === b.isPercent && a.value <= b.value;
    return valid ? { values: [a.value, b.value], isPercent: a.isPercent } : null;
  };

  const hasTilde = t.includes('~');
  const tildeParts = t.split('~');
  const tildePair = tildeParts.length === 2 ? parsePair(tildeParts[0], tildeParts[1]) : null;

  const hyphenPositions = [];
  for (let i = 1; i < t.length; i++) {
    if (t[i] !== '-') continue;
    const before = t.slice(0, i).trimEnd();
    const prev = before === '' ? '' : before.slice(-1).toLowerCase();
    if (prev !== 'e' && prev !== '^') hyphenPositions.push(i);
  }
  const hyphenCandidates = (isReadingList || hasTilde || scalar.status === 'OK') ? []
    : hyphenPositions.map((p) => parsePair(t.slice(0, p), t.slice(p + 1))).filter(Boolean);
  const rangePair = hasTilde ? tildePair : hyphenCandidates.length === 1 ? hyphenCandidates[0] : null;

  if (missing) return make('MISSING', [], 'MISSING', 'MISSING_RESULT', false);
  if (ambiguousCommaList) return make('AMBIGUOUS', [], 'AMBIGUOUS', 'AMBIGUOUS_COMMA_READING_LIST', false);
  if (isReadingList) {
    if (!readingsAllOK) return make('AMBIGUOUS', [], 'AMBIGUOUS', 'READINGS_NOT_FULLY_PARSED', false);
    if (!readingPercentConsistent) return make('AMBIGUOUS', [], 'AMBIGUOUS', 'MIXED_PERCENT_MARKERS', false);
    return make('READINGS', parsedReadings.map((r) => r.value), 'OK', null, parsedReadings[0].isPercent);
  }
  if (scalar.status === 'OK') return make('SCALAR', [scalar.value], 'OK', null, scalar.isPercent);
  if (rangePair) return make('RANGE', rangePair.values, 'OK', null, rangePair.isPercent);
  return make('AMBIGUOUS', [], 'AMBIGUOUS',
    hasTilde || hyphenPositions.length > 0 ? 'RANGE_NOT_FULLY_PARSED' : scalar.flag, false);
}

function parseSpec(value) {
  let rawNorm = normalizeText(value)
    .replace(/&lt;=/g, '≤').replace(/&gt;=/g, '≥').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&le;/g, '≤').replace(/&ge;/g, '≥').replace(/&plusmn;/g, '±').replace(/&nbsp;/g, ' ')
    .replace(/<=/g, '≤').replace(/>=/g, '≥')
    .replace(/\.$/, '');                         // dấu chấm thừa cuối: "7-10." -> "7-10"

  // 1. Chuẩn hóa "A to B" thành "A ~ B" (vd: "10 to 20", "-10 to 10")
  rawNorm = rawNorm.replace(/\s+to\s+/gi, ' ~ ');

  // 2. Chuẩn hóa Min / Max / NLT / NMT thành ≥ / ≤ (vd: "Min 15", "Max 25.5")
  rawNorm = rawNorm.replace(/\b(?:min|minimum|not\s+less\s+than|nlt)\b\.?\s*[:=]?\s*/gi, '≥ ')
                   .replace(/\b(?:max|maximum|not\s+more\s+than|nmt)\b\.?\s*[:=]?\s*/gi, '≤ ');

  // 3. Chuẩn hóa dấu phẩy thập phân trong dải đo: "1,5 - 2,5" -> "1.5 ~ 2.5"
  rawNorm = rawNorm.replace(/(\d+),(\d{1,2})\s*([~-])\s*(\d+),(\d{1,2})/g, '$1.$2 $3 $4.$5');

  const T = stripTrailingUnit(rawNorm);
  const missing = MISSING.has(T.toUpperCase());

  const make = (kind, lsl, usl, strictLower, strictUpper, target, isPercent, status, flag) => ({
    SpecKind: kind, LSL: lsl, USL: usl, StrictLower: strictLower, StrictUpper: strictUpper,
    Target: target, SpecIsPercent: isPercent, SpecParseStatus: status, SpecParseFlag: flag,
  });
  const invalid = (flag) => make('AMBIGUOUS', null, null, false, false, null, false, 'AMBIGUOUS', flag);

  const first = T.slice(0, 1);
  const isComparator = ['<', '>', '≤', '≥'].includes(first);
  const body = isComparator ? T.slice(1).trim() : T;
  const isSymmetric = body.startsWith('±');
  const symmetric = isSymmetric ? parseNumber(body.slice(1).trim()) : parseNumber(null);
  const limit = isComparator && !isSymmetric ? parseNumber(body) : parseNumber(null);
  const pm = T.split('±');
  const hasTT = !isComparator && !isSymmetric && pm.length === 2;
  const center = hasTT ? parseNumber(pm[0].trim()) : parseNumber(null);
  const tol = hasTT ? parseNumber(pm[1].trim()) : parseNumber(null);
  const ttOK = hasTT && center.status === 'OK' && tol.status === 'OK' && tol.value >= 0 &&
    !(center.isPercent && tol.isPercent);
  const absTol = !ttOK ? null : tol.isPercent ? Math.abs(center.value) * tol.value / 100 : tol.value;
  const rangeResult = parseResult(T);
  const single = parseNumber(T);

  if (missing) return make('MISSING', null, null, false, false, null, false, 'MISSING', 'MISSING_SPEC');
  if (isSymmetric) {
    if (symmetric.status !== 'OK') return invalid('INVALID_SYMMETRIC_NUMBER');
    if (symmetric.value < 0) return invalid('NEGATIVE_TOLERANCE');
    if (isComparator && !['<', '≤'].includes(first)) return invalid('UNSUPPORTED_SYMMETRIC_COMPARATOR');
    return make('SYMMETRIC', -symmetric.value, symmetric.value, isComparator && first === '<',
      isComparator && first === '<', 0, symmetric.isPercent, 'OK', null);
  }
  if (isComparator) {
    if (limit.status !== 'OK') return invalid('INVALID_LIMIT');
    if (['<', '≤'].includes(first))
      return make('UPPER_LIMIT', null, limit.value, false, first === '<', null, limit.isPercent, 'OK', null);
    return make('LOWER_LIMIT', limit.value, null, first === '>', false, null, limit.isPercent, 'OK', null);
  }
  if (hasTT) {
    if (center.status !== 'OK' || tol.status !== 'OK') return invalid('TARGET_TOLERANCE_NOT_FULLY_PARSED');
    if (tol.value < 0) return invalid('NEGATIVE_TOLERANCE');
    if (center.isPercent && tol.isPercent) return invalid('PERCENT_TOLERANCE_NEEDS_VERIFIED_RULE');
    if (!ttOK) return invalid('INVALID_TARGET_TOLERANCE');
    return make('TARGET_TOLERANCE', center.value - absTol, center.value + absTol, false, false,
      center.value, center.isPercent, 'OK', null);
  }
  if (rangeResult.ResultKind === 'RANGE' && rangeResult.ResultParseStatus === 'OK')
    return make('RANGE', rangeResult.ResultMin, rangeResult.ResultMax, false, false, null,
      rangeResult.ResultIsPercent, 'OK', null);
  if (single.status === 'OK')
    return make('NOMINAL', null, null, false, false, single.value, single.isPercent,
      'NOT_EVALUABLE', 'NOMINAL_WITHOUT_ACCEPTANCE_RULE');
  return invalid('UNRECOGNIZED_SPEC');
}

// Giới hạn dùng cho dashboard (áp quy tắc đơn vị % của hàm Evaluate trong M code)
function specBounds(specRaw, unit) {
  const s = parseSpec(specRaw);
  const u = (unit == null ? '' : String(unit)).trim();
  const uPct = u === '%' || /^%/.test(u);
  if (s.SpecParseStatus !== 'OK') return { lsl: null, usl: null, ok: false, reason: s.SpecParseFlag, spec: s };
  if (s.SpecIsPercent && !uPct) return { lsl: null, usl: null, ok: false, reason: 'PERCENT_UNIT_MISMATCH', spec: s };
  if (s.SpecKind === 'SYMMETRIC' && !uPct)
    return { lsl: null, usl: null, ok: false, reason: 'SYMMETRIC_SPEC_NEEDS_VERIFIED_CONTEXT', spec: s };
  if (s.LSL === null && s.USL === null)
    return { lsl: null, usl: null, ok: false, reason: 'NO_ACCEPTANCE_LIMIT', spec: s };
  return { lsl: s.LSL, usl: s.USL, ok: true, reason: null, spec: s };
}

module.exports = { normalizeText, parseNumber, parseResult, parseSpec, specBounds };
