/* Shared Excel export styling — requires xlsx-js-style (global XLSX).
   styleExportSheet(aoa, opts) -> styled worksheet:
   - column widths autofit to longest cell (capped, min width floor)
   - long text wrapped (works with the width cap)
   - every cell centered (horizontal + vertical)
   - header row (first row) bold
   - RTL sheet view flag preserved
   Usage: const ws = window.styleExportSheet(aoa);
*/
(function () {
    function _len(v) {
        if (v === null || v === undefined) return 0;
        return String(v).length;
    }

    function styleExportSheet(aoa, opts) {
        opts = opts || {};
        const maxWch = opts.maxWch || 115;
        const minWch = opts.minWch || 12;
        const factor = opts.factor || 1.3; // Arabic glyphs are wider than latin
        const XLSX = typeof window !== 'undefined' ? window.XLSX : null;
        if (!XLSX) return null;
        const ws = XLSX.utils.aoa_to_sheet(aoa || [[]]);
        let nCols = 0;
        (aoa || []).forEach((r) => {
            if (Array.isArray(r) && r.length > nCols) nCols = r.length;
        });
        const widths = [];
        for (let c = 0; c < nCols; c++) widths.push(minWch);
        const ref = ws['!ref'];
        if (ref) {
            const range = XLSX.utils.decode_range(ref);
            for (let C = range.s.c; C <= range.e.c && C < nCols; C++) {
                let mx = minWch;
                for (let R = range.s.r; R <= range.e.r; R++) {
                    let cell;
                    try {
                        cell = ws[XLSX.utils.encode_cell({ c: C, r: R })];
                    } catch (e) { cell = null; }
                    if (!cell) continue;
                    const len = _len(cell.v);
                    const wrap = len > maxWch;
                    cell.s = cell.s || {};
                    cell.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: wrap };
                    if (R === range.s.r) {
                        cell.s.font = cell.s.font || {};
                        cell.s.font.bold = true;
                        // Header fill: RGB(220, 230, 241)
                        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FFDCE6F1' } };
                    }
                    const w = Math.min(maxWch, Math.max(minWch, Math.ceil(len * factor)));
                    if (w > mx) mx = w;
                }
                widths[C] = mx;
            }
        }
        ws['!cols'] = widths.map((wch) => ({ wch: wch }));
        ws['!rtl'] = true;
        // NOTE: xlsx-js-style ignores '!sheetViews' on write (writer has no
        // zoom support) — sheet zoom cannot be set with this library.
        return ws;
    }

    try { window.styleExportSheet = styleExportSheet; } catch (e) {}
})();
