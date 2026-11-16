/* Linked slicers: mỗi bộ lọc chỉ cho chọn giá trị còn dữ liệu theo các bộ lọc khác */
(function () {
  var F = [
    { id: 'selectSlice',  field: 'category', all: 'All materials' },
    { id: 'selectYear',   field: 'year',     all: 'All' },
    { id: 'selectWeek',   field: 'week',     all: 'All', mode: 'week' },
    { id: 'selectDate',   field: 'date',     all: 'All', mode: 'date' },
    { id: 'selectVendor', field: 'vendor',   all: 'All' }
  ];
  function val(f) { var el = document.getElementById(f.id); return el ? (el.value || f.all) : f.all; }
  function active(f) { return !f.mode || (typeof timeMode === 'undefined' ? f.mode === 'week' : timeMode === f.mode); }
  function matchExcept(r, skip) {
    for (var i = 0; i < F.length; i++) {
      var f = F[i];
      if (f === skip || !active(f)) continue;
      var v = val(f);
      if (v !== f.all && String(r[f.field]) !== v) return false;
    }
    return true;
  }
  function updateLinkedSlicers() {
    var rs = (typeof activeData !== 'undefined' && activeData && activeData.records) || [];
    F.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      var avail = {};
      rs.forEach(function (r) { if (matchExcept(r, f)) avail[String(r[f.field])] = (avail[String(r[f.field])] || 0) + 1; });
      Array.prototype.forEach.call(el.options, function (o) {
        if (o.dataset.base == null) o.dataset.base = o.textContent;
        var isAll = o.value === f.all, n = avail[o.value] || 0;
        var ok = isAll || n > 0 || o.value === el.value;
        o.disabled = !ok;
        o.style.color = ok ? '' : '#b6bfcc';
        o.textContent = isAll ? o.dataset.base : o.dataset.base + ' (' + n + ')';
      });
    });
  }
  window.updateLinkedSlicers = updateLinkedSlicers;
  window.clearAllFilters = function () {
    F.forEach(function (f) { var el = document.getElementById(f.id); if (el) el.value = f.all; });
    applyFilters();
  };
  if (typeof renderAll === 'function') {
    var _renderAll = renderAll;
    renderAll = function () { updateLinkedSlicers(); return _renderAll.apply(this, arguments); };
  }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(updateLinkedSlicers, 0); });
})();
