const TableCore = (typeof window !== 'undefined' && window.TableCore) ? window.TableCore : null;
if (!TableCore) {
    console.error('TanStack TableCore is not loaded. Check network access to unpkg.com.');
}

const {
    createColumnHelper,
    createTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
} = TableCore || {};

function flexRender(comp, props) {
    if (typeof comp === 'function') return comp(props);
    return comp ?? '';
}

function parseMaybeNumber(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const cleaned = s.replace(/[^\d.-]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function parseMaybeAmount(v) {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const cleaned = s.replace(/[^\d]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function formatMontant(v) {
    const n = parseMaybeAmount(v);
    if (n === null) return '';
    const parts = n.toFixed(3).split('.');
    const intPart = parts[0];
    const decPart = parts[1];
    const sep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sep + ',' + decPart;
}

function sanitizeAmountText(v) {
    const raw = String(v === undefined || v === null ? '' : v);
    const normalizedSep = raw.replace(/[.;:،؛'"’‘“”]/g, ',');
    const kept = normalizedSep.replace(/[^\d,]/g, '');
    return kept.replace(/,{2,}/g, ',').replace(/^,/, '');
}

function isResultatsHeaderRow(r) {
    if (!Array.isArray(r) || r.length < 2) return false;
    const c0 = String(r[0]).trim();
    const c1 = String(r[1]).trim();
    return c0 === 'ID_Resultat' || c1 === 'ID_Programme';
}

function isHeaderRow(r) {
    if (!Array.isArray(r) || r.length < 1) return false;
    const c0 = String(r[0]).trim().toLowerCase();
    return c0 === 'id_programme' || c0 === 'id_resultat' || c0.indexOf('id_') === 0;
}

function findColumnIndex(headers, names) {
    for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || '').trim().toLowerCase().replace(/\s+/g, '_');
        for (const n of names) {
            if (h === n || h.indexOf(n) !== -1) return i;
        }
    }
    return -1;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!TableCore) return;
    const postAction = window.postAction;
    const bootstrap = window.bootstrap;

    const theadEl = document.getElementById('results-thead');
    const tbodyEl = document.getElementById('results-tbody');
    const resultsTotalEl = document.getElementById('results-total');
    const resultsTableWrap = document.getElementById('results-table-wrap');
    const resultsTableLoader = document.getElementById('results-table-loader');

    const filterTypeEl = document.getElementById('filter-type');
    const filterBrEl = document.getElementById('filter-br');
    const filterZoneEl = document.getElementById('filter-zone');
    const filterYearEl = document.getElementById('filter-year');
    const btnResetEl = document.getElementById('btn-filters-reset');
    const btnExportXlsx = document.getElementById('btn-export-xlsx');
    const btnExportPdf = document.getElementById('btn-export-pdf');
    const paginationWrap = document.getElementById('results-pagination');
    const btnPrevPage = document.getElementById('res-prev');
    const btnNextPage = document.getElementById('res-next');
    const resPages = document.getElementById('res-pages');
    const tfootEl = document.getElementById('results-tfoot');

    const statsModalEl = document.getElementById('modal-stats-campagne');
    const statsModal = bootstrap ? bootstrap.Modal.getOrCreateInstance(statsModalEl) : null;

    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('currentUser'));
    } catch {}
    if (!user || !user.token) {
        window.location.href = 'index.html';
        return;
    }

    // Redirect normal users away from admin pages
    if ((user.userType || '').trim().toLowerCase() !== 'admin') {
        window.location.href = 'main-page.html';
        return;
    }

    if (typeof window !== 'undefined' && typeof window.isSessionExpired === 'function' && window.isSessionExpired()) {
        if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
        else window.location.href = 'index.html';
        return;
    }

    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
        const name = user.frName || user.arName || '';
        userInfoEl.textContent = name ? String(name).trim() : '--';
    }
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
    });

    function setResultsLoading(isLoading) {
        if (resultsTableWrap) resultsTableWrap.classList.toggle('is-loading', Boolean(isLoading));
        if (resultsTableLoader) resultsTableLoader.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
        if (isLoading && tfootEl) tfootEl.classList.add('d-none');
    }



    function statVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setStatVal(id, v) {
        const el = document.getElementById(id);
        if (el) el.value = v === undefined || v === null ? '' : String(v);
    }

    let currentResultatId = null;
    let bureauMap = new Map();

    function populateModalFromCache(progRow, resultatRow) {
        currentResultatId = null;
        setStatVal('res-type-hamla', progRow[2]);
        setStatVal('res-activite-zone', progRow[3]);
        // Full text on hover (long activity names)
        try {
            const _t = document.getElementById('res-type-hamla');
            if (_t) _t.title = _t.value;
            const _z = document.getElementById('res-activite-zone');
            if (_z) {
                _z.title = _z.value;
                // Grow to fit the whole text (works even while modal hidden)
                try { _z.rows = Math.min(6, Math.max(2, Math.ceil(String(_z.value).length / 55))); } catch {}
            }
        } catch {}

        if (resultatRow && resultatRow.length >= 2) {
            currentResultatId = resultatRow[0] != null && String(resultatRow[0]).trim() !== '' ? String(resultatRow[0]).trim() : null;
            setStatVal('res-w-in', resultatRow[2]);
            setStatVal('res-w-ni', resultatRow[3]);
            setStatVal('res-nw-in', resultatRow[4]);
            setStatVal('res-nw-ni', resultatRow[5]);
            setStatVal('res-emp-dec', resultatRow[6]);
            setStatVal('res-emp-ndec', resultatRow[7]);
            if (resultatRow.length >= 12) {
                setStatVal('res-manq-tot', sanitizeAmountText(resultatRow[8]));
                setStatVal('res-manq-ok', sanitizeAmountText(resultatRow[9]));
                setStatVal('res-manq-nok', sanitizeAmountText(resultatRow[10]));
                setStatVal('res-participants', resultatRow[11]);
            } else {
                setStatVal('res-manq-tot', '');
                setStatVal('res-manq-ok', sanitizeAmountText(resultatRow[8]));
                setStatVal('res-manq-nok', sanitizeAmountText(resultatRow[9]));
                setStatVal('res-participants', resultatRow.length > 10 ? resultatRow[10] : '');
            }
        } else {
            setStatVal('res-w-in', '');
            setStatVal('res-w-ni', '');
            setStatVal('res-nw-in', '');
            setStatVal('res-nw-ni', '');
            setStatVal('res-emp-dec', '');
            setStatVal('res-emp-ndec', '');
            setStatVal('res-manq-tot', '');
            setStatVal('res-manq-ok', '');
            setStatVal('res-manq-nok', '');
            setStatVal('res-participants', '');
        }
    }

    function openStatsModal(rowOriginal) {
        if (!statsModal) {
            alert('Interface modal indisponible (Bootstrap JS).');
            return;
        }
        const programmeRow = rowOriginal.programmeRow;
        const resultatRow = rowOriginal.resultatRow;
        const pid = String(programmeRow[0] ?? '').trim();
        const elType = document.getElementById('modal-prog-type');
        const elZone = document.getElementById('modal-prog-zone');
        const elPeriod = document.getElementById('modal-prog-period');
        const elEff = document.getElementById('modal-prog-effectif');
        if (elType) elType.textContent = programmeRow[2] ?? '';
        if (elZone) elZone.textContent = programmeRow[3] ?? '';
        if (elPeriod) elPeriod.textContent = `${programmeRow[4] ?? ''} ↤ ${programmeRow[5] ?? ''}`;
        if (elEff) elEff.textContent = programmeRow[6] != null ? String(programmeRow[6]) : '';
        populateModalFromCache(programmeRow, resultatRow);
        statsModal.show();
    }

    const choiceSelectOpts = {
        searchEnabled: false,
        shouldSort: false,
        itemSelectText: '',
        allowHTML: false,
        position: 'bottom',
    };
    if (filterTypeEl && typeof window !== 'undefined' && window.Choices) {
        try {
            new window.Choices(filterTypeEl, choiceSelectOpts);
        } catch {}
    }
    let choicesYear = null;
    if (filterYearEl && typeof window !== 'undefined' && window.Choices) {
        try { choicesYear = new window.Choices(filterYearEl, { ...choiceSelectOpts, searchEnabled: false }); } catch {}
    }

    let serverYear = null;
    function extractYearFromDate(val) {
        const s = String(val || '').trim();
        return s.length >= 4 ? s.substring(0, 4) : '';
    }
    function populateYearFilter() {
        if (!filterYearEl) return;
        const years = new Set();
        for (const row of rowsAll) {
            const prog = row.programmeRow;
            const y = extractYearFromDate(prog?.[5]) || extractYearFromDate(prog?.[4]);
            if (y) years.add(y);
        }
        const sorted = [...years].sort((a, b) => b.localeCompare(a));
        const prev = filterYearEl.value;
        filterYearEl.innerHTML = '<option value="">الكل</option>';
        for (const y of sorted) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            filterYearEl.appendChild(opt);
        }
        if (prev && sorted.includes(prev)) {
            filterYearEl.value = prev;
        } else if (serverYear && sorted.includes(String(serverYear))) {
            filterYearEl.value = String(serverYear);
        }
        if (choicesYear) {
            try { choicesYear.destroy(); } catch {}
            choicesYear = null;
        }
        if (filterYearEl && typeof window !== 'undefined' && window.Choices) {
            try { choicesYear = new window.Choices(filterYearEl, { ...choiceSelectOpts, searchEnabled: false }); } catch {}
        }
    }

    function populateBrFilter() {
        if (!filterBrEl) return;
        filterBrEl.value = '';
    }

    const columnHelper = createColumnHelper();

    const numberMinFilter = (row, columnId, filterValue) => {
        const min = filterValue === '' || filterValue == null ? null : Number(filterValue);
        if (min == null || !Number.isFinite(min)) return true;
        const v = parseMaybeNumber(row.getValue(columnId)) ?? 0;
        return v >= min;
    };
    const amountMinFilter = (row, columnId, filterValue) => {
        const min = filterValue === '' || filterValue == null ? null : Number(filterValue);
        if (min == null || !Number.isFinite(min)) return true;
        const v = parseMaybeAmount(row.getValue(columnId)) ?? 0;
        return v >= min;
    };

    const columns = [
        columnHelper.accessor('br', {
            id: 'br',
            header: () => 'BR',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: 'includesString',
        }),
        columnHelper.accessor('typeCampagne', {
            id: 'typeCampagne',
            header: () => 'نوع الحملة',
            cell: (info) => {
                const v = String(info.getValue() ?? '').trim();
                let cls = 'badge campagne-type-badge';
                if (v === 'لا شيء' || v === '') cls += ' campagne-type-badge--rien';
                else if (v === 'جغرافية') cls += ' campagne-type-badge--geo';
                return `<span class="${cls}">${v}</span>`;
            },
            filterFn: 'includesString',
        }),
        columnHelper.accessor('zone', {
            id: 'zone',
            header: () => 'نوع النشاط / المنطقة الجغرافية',
            cell: (info) => window.renderZoneActivity(info.getValue()),
            filterFn: 'includesString',
        }),
        columnHelper.accessor('salAff', {
            id: 'salAff',
            header: () => 'عدد المؤجرين المنخرطين',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('salAff')) ?? 0) - (parseMaybeNumber(b.getValue('salAff')) ?? 0),
        }),
        columnHelper.accessor('salNonAff', {
            id: 'salNonAff',
            header: () => 'عدد المؤجرين غير المنخرطين',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('salNonAff')) ?? 0) - (parseMaybeNumber(b.getValue('salNonAff')) ?? 0),
        }),
        columnHelper.accessor('nonSalAff', {
            id: 'nonSalAff',
            header: () => 'عدد المنخرطين TNS',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('nonSalAff')) ?? 0) - (parseMaybeNumber(b.getValue('nonSalAff')) ?? 0),
        }),
        columnHelper.accessor('nonSalNonAff', {
            id: 'nonSalNonAff',
            header: () => 'عدد غير المنخرطين TNS',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('nonSalNonAff')) ?? 0) - (parseMaybeNumber(b.getValue('nonSalNonAff')) ?? 0),
        }),
        columnHelper.accessor('travDeclares', {
            id: 'travDeclares',
            header: () => 'عدد الأجراء المصرح بهم',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('travDeclares')) ?? 0) - (parseMaybeNumber(b.getValue('travDeclares')) ?? 0),
        }),
        columnHelper.accessor('travNonDeclares', {
            id: 'travNonDeclares',
            header: () => 'عدد الأجراء غير المصرح بهم',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('travNonDeclares')) ?? 0) - (parseMaybeNumber(b.getValue('travNonDeclares')) ?? 0),
        }),
        columnHelper.accessor('insuffTotale', {
            id: 'insuffTotale',
            header: () => 'المبلغ الجملي للنقص في المساهمات',
            cell: (info) => formatMontant(info.getValue()),
            filterFn: amountMinFilter,
            sortingFn: (a, b) => (parseMaybeAmount(a.getValue('insuffTotale')) ?? 0) - (parseMaybeAmount(b.getValue('insuffTotale')) ?? 0),
        }),
        columnHelper.accessor('mtReconnu', {
            id: 'mtReconnu',
            header: () => 'معترف به',
            cell: (info) => formatMontant(info.getValue()),
            filterFn: amountMinFilter,
            sortingFn: (a, b) => (parseMaybeAmount(a.getValue('mtReconnu')) ?? 0) - (parseMaybeAmount(b.getValue('mtReconnu')) ?? 0),
        }),
        columnHelper.accessor('mtNonReconnu', {
            id: 'mtNonReconnu',
            header: () => 'غير معترف به',
            cell: (info) => formatMontant(info.getValue()),
            filterFn: amountMinFilter,
            sortingFn: (a, b) => (parseMaybeAmount(a.getValue('mtNonReconnu')) ?? 0) - (parseMaybeAmount(b.getValue('mtNonReconnu')) ?? 0),
        }),
        columnHelper.accessor('controleursParticipants', {
            id: 'controleursParticipants',
            header: () => 'عدد المراقبين المشاركين',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) =>
                (parseMaybeNumber(a.getValue('controleursParticipants')) ?? 0) -
                (parseMaybeNumber(b.getValue('controleursParticipants')) ?? 0),
        }),
    ];

    const TABLE_COLS = 12;

    let table = null;
    let tableState = null;
    let rowsAll = [];
    const RESULTS_PAGE_SIZE = 7;
    let resultsPage = 1;

    function totalResultsPages(totalRows) {
        return Math.max(1, Math.ceil((totalRows || 0) / RESULTS_PAGE_SIZE));
    }

    function renderResultsPage(page) {
        if (!table) return;
        const totalRows = (table.getRowModel()?.rows || []).length;
        const pages = totalResultsPages(totalRows);
        resultsPage = Math.min(Math.max(1, page), pages);
        renderTanstackTable();
    }

    function updateResultsPaginationUI(totalRows) {
        const pages = totalResultsPages(totalRows);
        const show = (totalRows || 0) > RESULTS_PAGE_SIZE;
        if (paginationWrap) paginationWrap.classList.toggle('d-none', !show);
        if (btnPrevPage) btnPrevPage.disabled = resultsPage <= 1;
        if (btnNextPage) btnNextPage.disabled = resultsPage >= pages;
        if (resPages) {
            resPages.innerHTML = '';
            if (show) {
                for (let i = 1; i <= pages; i++) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'programmes-page-number' + (i === resultsPage ? ' is-active' : '');
                    btn.textContent = i;
                    btn.addEventListener('click', () => renderResultsPage(i));
                    resPages.appendChild(btn);
                }
            }
        }
    }

    btnPrevPage?.addEventListener('click', () => renderResultsPage(resultsPage - 1));
    btnNextPage?.addEventListener('click', () => renderResultsPage(resultsPage + 1));

    function updateTotalUI(countAll, countFiltered) {
        if (!resultsTotalEl) return;
        if (countAll === 0) {
            resultsTotalEl.textContent = '';
            return;
        }
        resultsTotalEl.textContent =
            countAll === countFiltered ? `${countAll} ${countAll > 1 ? 'حملات' : 'حملة'}` : `${countFiltered} / ${countAll} حملات`;
    }

    function renderTanstackTable() {
        if (!table || !theadEl || !tbodyEl) return;

        const getSortingState = () => {
            try {
                const s = table.getState ? table.getState().sorting : (table.options?.state?.sorting ?? []);
                return Array.isArray(s) ? s : [];
            } catch {
                return [];
            }
        };
        const setSortingState = (next) => {
            tableState = { ...(tableState || {}), sorting: next };
            table.setOptions((prev) => ({
                ...prev,
                state: {
                    ...(prev.state || {}),
                    sorting: next,
                },
            }));
        };

        theadEl.innerHTML = '';
        const headerGroups = table.getHeaderGroups();
        const totalHeaderRows = headerGroups.length;
        const fuseIds = ['br', 'typeCampagne', 'zone', 'controleursParticipants'];
        const nonSortableGroupIds = [];

        headerGroups.forEach((hg, idx) => {
            const tr = document.createElement('tr');
            tr.className = idx === 0 ? 'results-head-top' : 'results-head-sub';
            hg.headers.forEach((header) => {
                const colId = header.column?.id;
                const shouldFuse = fuseIds.includes(colId);
                if (!header.isPlaceholder && shouldFuse && idx > 0) return;

                const th = document.createElement('th');
                th.colSpan = header.colSpan;
                th.rowSpan = header.rowSpan || 1;
                th.className = header.isPlaceholder ? 'is-placeholder' : '';
                if (header.isPlaceholder && shouldFuse && idx === 0) th.className = '';
                if (!header.isPlaceholder || (header.isPlaceholder && shouldFuse && idx === 0)) {
                    if (shouldFuse && idx === 0 && totalHeaderRows > 1) th.rowSpan = totalHeaderRows;

                    const canSort = !nonSortableGroupIds.includes(colId) && header.column.getCanSort();
                    const div = document.createElement('div');
                    div.className = canSort ? 'results-th-sortable' : 'results-th-static';
                    if (canSort) {
                        div.setAttribute('role', 'button');
                        div.tabIndex = 0;
                        const toggle = () => {
                            const id = header.column.id;
                            const cur = getSortingState();
                            const curEntry = cur.find((x) => x && x.id === id);
                            let next = [];
                            if (!curEntry) next = [{ id, desc: false }];
                            else next = [{ id, desc: !curEntry.desc }];
                            setSortingState(next);
                            resultsPage = 1;
                            renderTanstackTable();
                        };
                        div.addEventListener('click', toggle);
                        div.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggle();
                            }
                        });
                    }
                    div.innerHTML = header.isPlaceholder && shouldFuse ? flexRender(header.column.columnDef.header, {}) : flexRender(header.column.columnDef.header, header.getContext());
                    const s = header.column.getIsSorted();
                    if (s) {
                        const badge = document.createElement('span');
                        badge.className = 'results-sort-indicator';
                        badge.textContent = s === 'asc' ? '▼' : '▲';
                        div.appendChild(badge);
                    }
                    th.appendChild(div);
                }
                tr.appendChild(th);
            });
            theadEl.appendChild(tr);
        });

        const rowModel = table.getRowModel();
        tbodyEl.innerHTML = '';
        if (!rowModel.rows.length) {
            tbodyEl.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="text-center text-muted">القائمة فارغة</td></tr>`;
            if (tfootEl) tfootEl.classList.add('d-none');
            updateTotalUI(rowsAll.length, 0);
            updateResultsPaginationUI(0);
            return;
        }
        updateTotalUI(rowsAll.length, rowModel.rows.length);

        const totalFiltered = rowModel.rows.length;
        const pages = totalResultsPages(totalFiltered);
        if (resultsPage > pages) resultsPage = pages;
        updateResultsPaginationUI(totalFiltered);

        const start = (resultsPage - 1) * RESULTS_PAGE_SIZE;
        const pageRows = rowModel.rows.slice(start, start + RESULTS_PAGE_SIZE);

        pageRows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.className = 'results-row-clickable';
            tr.setAttribute('role', 'button');
            tr.tabIndex = 0;

            const open = () => openStatsModal(row.original);
            tr.addEventListener('click', open);
            tr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                }
            });

            row.getVisibleCells().forEach((cell) => {
                const td = document.createElement('td');
                td.innerHTML = flexRender(cell.column.columnDef.cell, cell.getContext());
                tr.appendChild(td);
            });
            tbodyEl.appendChild(tr);
        });

        // Footer totals
        if (tfootEl) {
            const sumFields = ['salAff', 'salNonAff', 'nonSalAff', 'nonSalNonAff', 'travDeclares', 'travNonDeclares', 'insuffTotale', 'mtReconnu', 'mtNonReconnu', 'controleursParticipants'];
            const amounts = ['insuffTotale', 'mtReconnu', 'mtNonReconnu'];
            const sums = {};
            const hasData = {};
            sumFields.forEach((f) => { sums[f] = 0; hasData[f] = false; });
            rowModel.rows.forEach((row) => {
                const o = row.original;
                sumFields.forEach((f) => {
                    const v = parseMaybeNumber(o[f]) ?? 0;
                    sums[f] += v;
                    if (v !== 0 || String(o[f] ?? '').trim() !== '') hasData[f] = true;
                });
            });
            const fieldsOrder = sumFields;
            tfootEl.innerHTML = '';
            const tr = document.createElement('tr');
            rowModel.rows[0].getVisibleCells().forEach((cell, ci) => {
                if (ci > 0 && ci < 3) return;
                const td = document.createElement('td');
                const colId = cell.column.id;
                if (ci === 0) {
                    td.textContent = 'المجموع الكلي';
                    td.style.fontWeight = '700';
                    td.colSpan = 3;
                } else if (fieldsOrder.includes(colId)) {
                    if (amounts.includes(colId)) {
                        td.textContent = hasData[colId] ? formatMontant(sums[colId]) : '';
                    } else {
                        td.textContent = String(sums[colId] || '—');
                    }
                    td.style.fontWeight = '700';
                } else {
                    td.textContent = '';
                }
                tr.appendChild(td);
            });
            tfootEl.appendChild(tr);
            if (resultsPage === pages) {
                tfootEl.classList.remove('d-none');
            } else {
                tfootEl.classList.add('d-none');
            }
        }
    }

    function applyFiltersToState() {
        if (!table) return;

        const type = (filterTypeEl?.value || '').trim();
        const br = (filterBrEl?.value || '').trim();
        const zone = (filterZoneEl?.value || '').trim();
        const year = (filterYearEl?.value || '').trim();

        const nextColumnFilters = [];
        if (type) nextColumnFilters.push({ id: 'typeCampagne', value: type });
        if (br) nextColumnFilters.push({ id: 'br', value: br });
        if (zone) nextColumnFilters.push({ id: 'zone', value: zone });

        let filtered = rowsAll;
        if (year) {
            filtered = filtered.filter((r) => {
                const prog = r.programmeRow;
                const ry = extractYearFromDate(prog?.[5]) || extractYearFromDate(prog?.[4]);
                return ry === year;
            });
        }

        table.setOptions((prev) => ({
            ...prev,
            data: filtered,
            state: {
                ...prev.state,
                globalFilter: '',
                columnFilters: nextColumnFilters,
            },
        }));
        resultsPage = 1;
        renderTanstackTable();
    }

    function bindFilterHandlers() {
        filterTypeEl?.addEventListener('change', applyFiltersToState);
        filterBrEl?.addEventListener('input', applyFiltersToState);
        filterZoneEl?.addEventListener('input', applyFiltersToState);
        filterYearEl?.addEventListener('change', applyFiltersToState);
        btnResetEl?.addEventListener('click', () => {
            if (filterTypeEl) filterTypeEl.value = '';
            if (filterBrEl) filterBrEl.value = '';
            if (filterZoneEl) filterZoneEl.value = '';
            const resetYear = serverYear ? String(serverYear) : '';
            if (filterYearEl) filterYearEl.value = resetYear;
            if (choicesYear) {
                try { choicesYear.setChoiceByValue(resetYear); } catch {}
            }
            table?.setOptions((prev) => ({
                ...prev,
                data: rowsAll,
                state: {
                    ...prev.state,
                    globalFilter: '',
                    columnFilters: [],
                    sorting: [{ id: 'br', desc: false }],
                },
            }));
            resultsPage = 1;
            renderTanstackTable();
        });
    }
    bindFilterHandlers();

    function buildExportRowsFromTable() {
        if (!table) return [];
        const rowModel = table.getRowModel();
        const rows = rowModel?.rows || [];
        return rows.map((r) => r.original || {});
    }

    async function exportToXlsx() {
        if (typeof window === 'undefined' || !window.exportStyledAoA) {
            alert('XLSX library not loaded.');
            return;
        }
        const data = buildExportRowsFromTable();
        const headers = [
            'BR',
            'نوع الحملة',
            'نوع النشاط / المنطقة الجغرافية',
            'عدد المؤجرين المنخرطين',
            'عدد المؤجرين غير المنخرطين',
            'عدد المنخرطين TNS',
            'عدد غير المنخرطين TNS',
            'عدد الأجراء المصرح بهم',
            'عدد الأجراء غير المصرح بهم',
            'المبلغ الجملي للنقص في المساهمات',
            'معترف به',
            'غير معترف به',
            'عدد المراقبين المشاركين',
        ];
        const aoa = [
            headers,
            ...data.map((r) => [
                r.br ?? '',
                r.typeCampagne ?? '',
                r.zone ?? '',
                r.salAff ?? '',
                r.salNonAff ?? '',
                r.nonSalAff ?? '',
                r.nonSalNonAff ?? '',
                r.travDeclares ?? '',
                r.travNonDeclares ?? '',
                r.insuffTotale ?? '',
                r.mtReconnu ?? '',
                r.mtNonReconnu ?? '',
                r.controleursParticipants ?? '',
            ]),
        ];

        const filename = `campagnes_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const ok = await window.exportStyledAoA(filename, 'Campagnes', aoa);
        if (!ok) alert('XLSX library not loaded.');
    }

    function exportToPdf() {
        const tableEl = document.querySelector('.page-results .results-table');
        if (!tableEl || !table) return;

        const filenameBase = `campagnes_${new Date().toISOString().slice(0, 10)}`;

        const theadSrc = tableEl.querySelector('thead');
        const theadClone = theadSrc ? theadSrc.cloneNode(true) : null;
        if (theadClone) theadClone.querySelectorAll('.results-sort-indicator').forEach((el) => el.remove());
        const theadHtml = theadClone ? theadClone.outerHTML : '';

        const rowModel = table.getRowModel();
        const rows = rowModel?.rows || [];
        const tbodyHtml =
            rows.length === 0
                ? `<tbody><tr><td colspan="${TABLE_COLS}" style="text-align:center;color:#777;">لا توجد نتائج</td></tr></tbody>`
                : `<tbody>${rows
                      .map((row) => {
                          const tds = row
                              .getVisibleCells()
                              .map((cell) => `<td>${flexRender(cell.column.columnDef.cell, cell.getContext())}</td>`)
                              .join('');
                          return `<tr>${tds}</tr>`;
                      })
                      .join('')}</tbody>`;

        // Build tfoot for PDF
        const pdfSumFields = ['salAff', 'salNonAff', 'nonSalAff', 'nonSalNonAff', 'travDeclares', 'travNonDeclares', 'insuffTotale', 'mtReconnu', 'mtNonReconnu', 'controleursParticipants'];
        const pdfAmounts = ['insuffTotale', 'mtReconnu', 'mtNonReconnu'];
        const pdfSums = {};
        const pdfHasData = {};
        pdfSumFields.forEach((f) => { pdfSums[f] = 0; pdfHasData[f] = false; });
        rows.forEach((row) => {
            const o = row.original;
            pdfSumFields.forEach((f) => {
                const v = parseMaybeNumber(o[f]) ?? 0;
                pdfSums[f] += v;
                if (v !== 0 || String(o[f] ?? '').trim() !== '') pdfHasData[f] = true;
            });
        });
        let tfootHtml = '';
        if (rows.length > 0) {
            const fc = rows[0].getVisibleCells();
            tfootHtml = '<tfoot><tr>';
            fc.forEach((cell, ci) => {
                const colId = cell.column.id;
                if (ci === 0) {
                    tfootHtml += '<td colspan="3" style="font-weight:700;">المجموع الكلي</td>';
                } else if (ci > 0 && ci < 3) {
                    return;
                } else if (pdfSumFields.includes(colId)) {
                    if (pdfAmounts.includes(colId)) {
                        const val = pdfHasData[colId] ? formatMontant(pdfSums[colId]) : '';
                        tfootHtml += `<td style="font-weight:700;">${val}</td>`;
                    } else {
                        tfootHtml += `<td style="font-weight:700;">${String(pdfSums[colId] || '—')}</td>`;
                    }
                } else {
                    tfootHtml += '<td></td>';
                }
            });
            tfootHtml += '</tr></tfoot>';
        }

        const tableHtml = `<table class="${tableEl.className}" dir="rtl">${theadHtml}${tbodyHtml}${tfootHtml}</table>`;

        const totalCount = rows.length;
        const totalLabel = totalCount === 1 ? 'حملة' : 'حملات';
        const totalBadge = `<span style="position:absolute;left:10mm;font-size:14pt;font-weight:700;">${totalCount} ${totalLabel}</span>`;

        const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${filenameBase}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: Arial, "Segoe UI", Tahoma, sans-serif; direction: rtl; color: #111; }
      h1 { text-align: center; font-size: 18pt; margin: 0 0 10mm 0; position: relative; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead th { background: #f2f2f2; font-weight: 700; }
      th, td { border: 1px solid #999; padding: 4px 6px; font-size: 9pt; text-align: center; word-wrap: break-word; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      .results-type-cell { display: block; }
      .results-type-main { font-weight: 700; }
      .results-type-sub { font-size: 8pt; color: #555; }
    </style>
  </head>
  <body>
    <h1>${totalBadge}جميع الحملات</h1>
    ${tableHtml}
    <script>
      (function () {
        try { document.title = "${filenameBase}"; } catch (e) {}
        var hasInvokedPrint = false;
        function closeMeSoon() {
          setTimeout(function () {
            try { window.close(); } catch (e) {}
          }, 120);
        }
        window.onafterprint = closeMeSoon;
        if (window.matchMedia) {
          var mql = window.matchMedia('print');
          var handler = function (e) {
            if (hasInvokedPrint && e && e.matches === false) closeMeSoon();
          };
          if (mql && typeof mql.addEventListener === 'function') mql.addEventListener('change', handler);
          else if (mql && typeof mql.addListener === 'function') mql.addListener(handler);
        }
        window.addEventListener('focus', function () {
          if (hasInvokedPrint) closeMeSoon();
        });
        window.onload = function () {
          setTimeout(function () {
            window.focus();
            hasInvokedPrint = true;
            window.print();
          }, 200);
        };
      })();
    </script>
  </body>
</html>`;

        const win = window.open('', '_blank');
        if (!win) {
            alert('Popup blocked. Please allow popups to export PDF.');
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
    }

    btnExportXlsx?.addEventListener('click', exportToXlsx);
    btnExportPdf?.addEventListener('click', exportToPdf);

    async function loadAndBuildTable() {
        setResultsLoading(true);
        if (tbodyEl) tbodyEl.innerHTML = '';
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setResultsLoading(false);
            if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="text-center text-muted">Pas de connexion internet</td></tr>`;
            return;
        }

        let progRes = null;
        let resultatsRes = null;
        let bureauxRes = null;
        try {
            [progRes, resultatsRes, bureauxRes] = await Promise.all([
                postAction('getAdminSheet', { sheet: 'Programmes' }),
                postAction('getAdminSheet', { sheet: 'Resultats' }),
                postAction('getAdminSheet', { sheet: 'Bureaux' }),
            ]);
        } catch (e) {
            setResultsLoading(false);
            if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="text-center text-muted">Erreur réseau</td></tr>`;
            return;
        }

        if (!progRes || !progRes.ok || !Array.isArray(progRes.rows)) {
            if (progRes && progRes.error === 'unauthorized') {
                if (typeof window !== 'undefined' && typeof window.logoutToLogin === 'function') window.logoutToLogin();
                else window.location.href = 'index.html';
                return;
            }
            setResultsLoading(false);
            const isOffline =
                (typeof navigator !== 'undefined' && navigator.onLine === false) ||
                !progRes ||
                (progRes && (progRes.error === 'network_error' || progRes.error === 'http_error'));
            if (tbodyEl) {
                tbodyEl.innerHTML = `<tr><td colspan="${TABLE_COLS}" class="text-center text-muted">${
                    isOffline ? 'Pas de connexion internet' : 'Impossible de charger les programmes (API).'
                }</td></tr>`;
            }
            return;
        }

        bureauMap = new Map();
        if (bureauxRes && bureauxRes.ok && Array.isArray(bureauxRes.rows)) {
            const bHeaders = bureauxRes.rows[0] || [];
            const bData = bureauxRes.rows.slice(1);
            const codeIdx = findColumnIndex(bHeaders, ['code_bureau', 'code_br', 'code', 'bureau_code']);
            const nameIdx = findColumnIndex(bHeaders, ['nom_bureau', 'bureau_name', 'name']);
            for (const r of bData) {
                if (!r) continue;
                const code = codeIdx >= 0 ? String(r[codeIdx] || '').trim() : '';
                const name = nameIdx >= 0 ? String(r[nameIdx] || '').trim() : code;
                if (code) bureauMap.set(code, name);
            }
        }
        populateBrFilter();

        const programmesById = new Map();
        progRes.rows.forEach((r) => {
            if (!r || !r.length || isHeaderRow(r)) return;
            const id = String(r[0] ?? '').trim();
            if (id) programmesById.set(id, r);
        });

        const resultatsRows = resultatsRes && resultatsRes.ok && Array.isArray(resultatsRes.rows) ? resultatsRes.rows : [];
        const latestByProgramme = new Map();
        for (const r of resultatsRows) {
            if (!r || isResultatsHeaderRow(r) || r.length < 2) continue;
            const pid = String(r[1]).trim();
            if (!pid) continue;
            latestByProgramme.set(pid, r);
        }

        rowsAll = [];
        for (const [pid, r] of latestByProgramme.entries()) {
            const prog = programmesById.get(pid);
            if (!prog) continue;
            const brCode = String(prog[1] ?? '').trim();
            const brName = bureauMap.get(brCode) || '';
            const brLabel = brName ? `${brCode} - ${brName}` : brCode;
            const modern = r.length >= 12;
            rowsAll.push({
                programmeId: pid,
                br: brLabel,
                programmeRow: prog,
                resultatRow: r,
                resultatId: String(r[0] ?? '').trim(),
                typeCampagne: prog[2] ?? '',
                zone: prog[3] ?? '',
                salAff: r[2] ?? '',
                salNonAff: r[3] ?? '',
                nonSalAff: r[4] ?? '',
                nonSalNonAff: r[5] ?? '',
                travDeclares: r[6] ?? '',
                travNonDeclares: r[7] ?? '',
                insuffTotale: modern ? r[8] ?? '' : '',
                mtReconnu: modern ? r[9] ?? '' : r[8] ?? '',
                mtNonReconnu: modern ? r[10] ?? '' : r[9] ?? '',
                controleursParticipants: modern ? r[11] ?? '' : r[10] ?? '',
            });
        }

        const resolvedOptions = {
            data: rowsAll,
            columns,
            filterFns: { numberMinFilter, amountMinFilter },
            globalFilterFn: (row, columnId, filterValue) => {
                const q = String(filterValue ?? '').trim().toLowerCase();
                if (!q) return true;
                const r = row.original;
                const hay = [
                    r.br, r.typeCampagne, r.zone,
                    r.salAff, r.salNonAff, r.nonSalAff, r.nonSalNonAff,
                    r.travDeclares, r.travNonDeclares, r.insuffTotale, r.mtReconnu, r.mtNonReconnu,
                    r.controleursParticipants,
                ]
                    .map((v) => String(v ?? '').toLowerCase())
                    .join(' ');
                return hay.includes(q);
            },
            getCoreRowModel: getCoreRowModel(),
            getFilteredRowModel: getFilteredRowModel(),
            getSortedRowModel: getSortedRowModel(),
            state: {},
            onStateChange: () => {},
            renderFallbackValue: null,
        };

        table = createTable(resolvedOptions);
        tableState = table.initialState;
        table.setOptions((prev) => ({
            ...prev,
            ...resolvedOptions,
            state: {
                ...tableState,
                sorting: [{ id: 'br', desc: false }],
                columnFilters: [],
                globalFilter: '',
            },
            onStateChange: (updater) => {
                if (typeof updater === 'function') {
                    tableState = updater(tableState);
                } else {
                    tableState = updater;
                }
                table.setOptions((p2) => ({ ...p2, state: { ...tableState, ...p2.state } }));
                renderTanstackTable();
            },
        }));

        populateYearFilter();
        applyFiltersToState();
        renderTanstackTable();
        setResultsLoading(false);
    }

    if (typeof window.getServerYear === 'function') {
        serverYear = await window.getServerYear();
    }
    await loadAndBuildTable();
});
