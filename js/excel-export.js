/* Shared Excel import/export — requires ExcelJS (global ExcelJS).
   exportStyledAoA(filename, sheetName, aoa, opts) -> Promise<boolean>:
   - column widths autofit to longest cell (capped, min width floor)
   - long text wrapped (works with the width cap)
   - every cell centered (horizontal + vertical)
   - header row (first row) bold with RGB(220,230,241) fill
   - RTL sheet + zoom 87%
*/
(function () {
    function _EJ() {
        try { return (typeof window !== 'undefined' ? window.ExcelJS : null); } catch (e) { return null; }
    }

    function _len(v) {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'object') {
            if (typeof v.text === 'string') return v.text.length;
            if (Array.isArray(v.richText)) return v.richText.map((p) => p.text || '').join('').length;
            return 0;
        }
        return String(v).length;
    }

    async function exportStyledAoA(filename, sheetName, aoa, opts) {
        opts = opts || {};
        const EJ = _EJ();
        if (!EJ) return false;
        const maxW = opts.maxWch || 115;
        const minW = opts.minWch || 12;
        const factor = opts.factor || 1.3; // Arabic glyphs are wider than latin
        try {
            const wb = new EJ.Workbook();
            const ws = wb.addWorksheet(String(sheetName || 'Sheet1'));
            ws.views = [{ rightToLeft: true, zoomScale: 87 }];
            const rows = Array.isArray(aoa) ? aoa : [[]];
            let nCols = 0;
            rows.forEach((r) => {
                if (Array.isArray(r) && r.length > nCols) nCols = r.length;
            });
            const cols = [];
            for (let c = 0; c < nCols; c++) {
                let mx = minW;
                rows.forEach((r) => {
                    const w = Math.min(maxW, Math.max(minW, Math.ceil(_len(r ? r[c] : null) * factor)));
                    if (w > mx) mx = w;
                });
                cols.push({ width: mx });
            }
            ws.columns = cols;
            rows.forEach((r, ri) => {
                const row = ws.addRow(Array.isArray(r) ? r.slice() : []);
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: _len(cell.value) > maxW };
                    if (ri === 0) {
                        cell.font = { bold: true };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
                    }
                });
            });
            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = String(filename || 'export.xlsx');
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
            return true;
        } catch (e) {
            return false;
        }
    }

    try {
        window.exportStyledAoA = exportStyledAoA;
    } catch (e) {}
})();
