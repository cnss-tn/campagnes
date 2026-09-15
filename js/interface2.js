// TanStack Table Core (UMD) is loaded from CDN in interface2.html
const TableCore = (typeof window !== 'undefined' && window.TableCore) ? window.TableCore : null;
if (!TableCore) {
    // Fail-safe: keep the legacy "Chargement…" placeholders, but show an explicit error.
    console.error('TanStack TableCore is not loaded. Check network access to unpkg.com.');
}

const {
    createColumnHelper,
    createTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
} = TableCore || {};

// Vanilla helper used by TanStack examples
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
    return String(n);
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

document.addEventListener('DOMContentLoaded', async () => {
    if (!TableCore) return;
    // Globals from classic scripts (api.js + bootstrap)
    const postAction = window.postAction;
    const saveData = window.saveData;
    const bootstrap = window.bootstrap;

    const theadEl = document.getElementById('results-thead');
    const tbodyEl = document.getElementById('results-tbody');
    const tfootEl = document.getElementById('results-tfoot');
    const resultsTotalEl = document.getElementById('results-total');
    const resultsTableWrap = document.getElementById('results-table-wrap');
    const resultsTableLoader = document.getElementById('results-table-loader');

    const filterTypeEl = document.getElementById('filter-type');
    const filterZoneEl = document.getElementById('filter-zone');
    const filterYearEl = document.getElementById('filter-year');
    const btnResetEl = document.getElementById('btn-filters-reset');
    const btnExportXlsx = document.getElementById('btn-export-xlsx');
    const btnExportPdf = document.getElementById('btn-export-pdf');
    const paginationWrap = document.getElementById('results-pagination');
    const btnPrevPage = document.getElementById('res-prev');
    const btnNextPage = document.getElementById('res-next');
    const resPages = document.getElementById('res-pages');

    const statsModalEl = document.getElementById('modal-stats-campagne');
    const statsModal = bootstrap ? bootstrap.Modal.getOrCreateInstance(statsModalEl) : null;
    const btnStatsSave = document.getElementById('modal-stats-save');

    // Auth guard
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('currentUser'));
    } catch {}
    if (!user || !user.codeBr || !user.token) {
        try {
            localStorage.setItem('postLoginRedirect', 'interface2.html');
        } catch {}
        window.location.href = 'index.html';
        return;
    }

    // Redirect admins away from bureau pages
    if ((user.userType || '').trim().toLowerCase() === 'admin') {
        window.location.href = 'admin-main-page.html';
        return;
    }

    // Force pw change for normal users with pw_changed==0
    var _pwc2 = user.pw_changed; if (_pwc2 == null && user.pwChanged != null) _pwc2 = user.pwChanged;
    if (_pwc2 == null) _pwc2 = 0;
    if (Number(_pwc2) === 0) { window.location.href = 'pw-force-change.html'; return; }

    // Auto logout when session TTL is reached (token expires server-side after ~6h)
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
        if (tfootEl && isLoading) tfootEl.classList.add('d-none');
    }

    // ----- Modal edit (reuses Interface1 IDs/logic)
    function statVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setStatVal(id, v) {
        const el = document.getElementById(id);
        if (el) el.value = v === undefined || v === null ? '' : String(v);
    }

    function initAmountInputs() {
        const ids = ['res-manq-tot', 'res-manq-ok', 'res-manq-nok'];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                const next = sanitizeAmountText(el.value);
                if (el.value !== next) el.value = next;
            });
            el.addEventListener('blur', () => {
                const next = sanitizeAmountText(el.value);
                if (el.value !== next) el.value = next;
            });
        });
    }
    initAmountInputs();

    let currentProgrammeRow = null;
    let currentResultatId = null;
    const resultatsCache = new Map();

    function populateModalFromCache(progRow) {
        currentResultatId = null;
        const pid = String(progRow[0] ?? '').trim();
        const data = resultatsCache.get(pid) || null;

        setStatVal('res-type-hamla', progRow[2]);
        setStatVal('res-activite-zone', progRow[3]);

        if (data && data.length >= 2) {
            currentResultatId = data[0] != null && String(data[0]).trim() !== '' ? String(data[0]).trim() : null;
            setStatVal('res-w-in', data[2]);
            setStatVal('res-w-ni', data[3]);
            setStatVal('res-nw-in', data[4]);
            setStatVal('res-nw-ni', data[5]);
            setStatVal('res-emp-dec', data[6]);
            setStatVal('res-emp-ndec', data[7]);
            if (data.length >= 12) {
                setStatVal('res-manq-tot', formatMontant(data[8]));
                setStatVal('res-manq-ok', formatMontant(data[9]));
                setStatVal('res-manq-nok', formatMontant(data[10]));
                setStatVal('res-participants', data[11]);
            } else {
                setStatVal('res-manq-tot', '');
                setStatVal('res-manq-ok', formatMontant(data[8]));
                setStatVal('res-manq-nok', formatMontant(data[9]));
                setStatVal('res-participants', data.length > 10 ? data[10] : '');
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

    function openStatsModal(programmeRow) {
        if (!statsModal) {
            alert('Interface modal indisponible (Bootstrap JS).');
            return;
        }
        currentProgrammeRow = programmeRow;
        const pid = String(programmeRow[0] ?? '').trim();
        const elType = document.getElementById('modal-prog-type');
        const elZone = document.getElementById('modal-prog-zone');
        const elPeriod = document.getElementById('modal-prog-period');
        const elEff = document.getElementById('modal-prog-effectif');
        if (elType) elType.textContent = programmeRow[2] ?? '';
        if (elZone) elZone.textContent = programmeRow[3] ?? '';
        if (elPeriod) elPeriod.textContent = `${programmeRow[4] ?? ''} ↤ ${programmeRow[5] ?? ''}`;
        if (elEff) elEff.textContent = programmeRow[6] != null ? String(programmeRow[6]) : '';
        populateModalFromCache(programmeRow);
        statsModal.show();
    }

    function buildResultatsRow() {
        if (!currentProgrammeRow) return null;
        const nz = (v) => (v === '' || v === undefined ? '0' : v);
        const amountVal = (id) => statVal(id).replace(/,/g, '');
        const idResultat =
            currentResultatId && String(currentResultatId).trim() !== '' ? String(currentResultatId).trim() : `R${Date.now()}`;
        return [
            idResultat,
            String(currentProgrammeRow[0]).trim(),
            nz(statVal('res-w-in')),
            nz(statVal('res-w-ni')),
            nz(statVal('res-nw-in')),
            nz(statVal('res-nw-ni')),
            nz(statVal('res-emp-dec')),
            nz(statVal('res-emp-ndec')),
            nz(amountVal('res-manq-tot')),
            nz(amountVal('res-manq-ok')),
            nz(amountVal('res-manq-nok')),
            nz(statVal('res-participants')),
            String(user.codeBr).trim(),
        ];
    }


    btnStatsSave?.addEventListener('click', async () => {
        const statsFieldIds = ['res-w-in','res-w-ni','res-nw-in','res-nw-ni','res-emp-dec','res-emp-ndec','res-manq-tot','res-manq-ok','res-manq-nok','res-participants'];
        for (const id of statsFieldIds) {
            const el = document.getElementById(id);
            if (!el || el.value.trim() === '') {
                el?.focus();
                el?.select();
                alert('الرجاء تعمير جميع الخانات وبشكل صحيح');
                return;
            }
        }
        const payload = buildResultatsRow();
        if (!payload) return;
        btnStatsSave.disabled = true;
        const ok = await saveData('Resultats', payload);
        btnStatsSave.disabled = false;
        if (ok) {
            statsModal?.hide();
    if (typeof window.getServerYear === 'function') {
        serverYear = await window.getServerYear();
    }
    await loadAndBuildTable();
        } else {
            alert("Erreur lors de l'enregistrement des statistiques.");
        }
    });

    // ----- Filters UI -> TanStack column filters
    // Numeric filters were removed to keep more space for the table.
    const choiceSelectOpts = {
        searchEnabled: false,
        shouldSort: false,
        itemSelectText: '',
        allowHTML: false,
        position: 'bottom',
    };
    if (filterTypeEl && typeof window !== 'undefined' && window.Choices) {
        try {
            // Modern select like Interface1
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

    // ----- TanStack table build/render
    const columnHelper = createColumnHelper();

    // Custom filter fns
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
        // Employees (flat headers, no pre-header groups)
        columnHelper.accessor('salAff', {
            id: 'salAff',
            header: () => 'عدد المنخرطين (الأجراء)',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('salAff')) ?? 0) - (parseMaybeNumber(b.getValue('salAff')) ?? 0),
        }),
        columnHelper.accessor('salNonAff', {
            id: 'salNonAff',
            header: () => 'عدد غير المنخرطين (الأجراء)',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('salNonAff')) ?? 0) - (parseMaybeNumber(b.getValue('salNonAff')) ?? 0),
        }),
        columnHelper.accessor('nonSalAff', {
            id: 'nonSalAff',
            header: () => 'عدد المنخرطين (غير الأجراء)',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('nonSalAff')) ?? 0) - (parseMaybeNumber(b.getValue('nonSalAff')) ?? 0),
        }),
        columnHelper.accessor('nonSalNonAff', {
            id: 'nonSalNonAff',
            header: () => 'عدد غير المنخرطين (غير الأجراء)',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('nonSalNonAff')) ?? 0) - (parseMaybeNumber(b.getValue('nonSalNonAff')) ?? 0),
        }),
        columnHelper.accessor('travTotal', {
            id: 'travTotal',
            header: () => 'عدد الأجراء',
            cell: (info) => String(info.getValue() ?? '—'),
            filterFn: numberMinFilter,
            sortingFn: (a, b) => (parseMaybeNumber(a.getValue('travTotal')) ?? 0) - (parseMaybeNumber(b.getValue('travTotal')) ?? 0),
        }),

        // Amounts (flat headers, no pre-header group)
        columnHelper.accessor('insuffTotale', {
            id: 'insuffTotale',
            header: () => 'المبلغ الإجمالي للنقص',
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

        // Header
        theadEl.innerHTML = '';
        const headerGroups = table.getHeaderGroups();
        const totalHeaderRows = headerGroups.length;
        const fuseIds = ['programmeId', 'typeCampagne', 'zone', 'controleursParticipants'];
        const nonSortableGroupIds = [];

        headerGroups.forEach((hg, idx) => {
            const tr = document.createElement('tr');
            tr.className = idx === 0 ? 'results-head-top' : 'results-head-sub';
            hg.headers.forEach((header) => {
                // Fuse the 3 standalone columns by letting their top header span all header rows
                // and skipping the placeholder cell generated on the next header row(s).
                const colId = header.column?.id;
                const shouldFuse = fuseIds.includes(colId);
                // TanStack may generate a placeholder in the top row, and the real header in the sub row.
                // We "move" the header into the top placeholder cell and make it span all rows.
                if (!header.isPlaceholder && shouldFuse && idx > 0) return;

                const th = document.createElement('th');
                th.colSpan = header.colSpan;
                th.rowSpan = header.rowSpan || 1;
                th.className = header.isPlaceholder ? 'is-placeholder' : '';
                if (header.isPlaceholder && shouldFuse && idx === 0) th.className = '';
                if (!header.isPlaceholder || (header.isPlaceholder && shouldFuse && idx === 0)) {
                    // If we're fusing and we're in the first header row, force it to span all header rows.
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
                            // Keep only 2 states: ASC <-> DESC (no "unsorted" state)
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
                    // When fusing, a placeholder has no header context; render using the column definition instead.
                    div.innerHTML = header.isPlaceholder && shouldFuse ? flexRender(header.column.columnDef.header, {}) : flexRender(header.column.columnDef.header, header.getContext());
                    const s = header.column.getIsSorted();
                    if (s) {
                        const badge = document.createElement('span');
                        badge.className = 'results-sort-indicator';
                        // Arrow direction requested:
                        // - ASC: down arrow
                        // - DESC: up arrow
                        badge.textContent = s === 'asc' ? '▼' : '▲';
                        div.appendChild(badge);
                    }
                    th.appendChild(div);
                }
                tr.appendChild(th);
            });
            theadEl.appendChild(tr);
        });

        // Body
        const rowModel = table.getRowModel();
        tbodyEl.innerHTML = '';
        if (!rowModel.rows.length) {
            tbodyEl.innerHTML = `<tr><td colspan="11" class="text-center text-muted">القائمة فارغة</td></tr>`;
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

            const progRow = row.original.programmeRow;
            const open = () => {
                if (progRow) openStatsModal(progRow);
            };
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
            const sumFields = ['salAff', 'salNonAff', 'nonSalAff', 'nonSalNonAff', 'travTotal', 'insuffTotale', 'mtReconnu', 'mtNonReconnu', 'controleursParticipants'];
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
            let fi = 0;
            tfootEl.innerHTML = '';
            const tr = document.createElement('tr');
            rowModel.rows[0].getVisibleCells().forEach((cell, ci) => {
                if (ci > 0 && ci < 2) return;
                const td = document.createElement('td');
                const colId = cell.column.id;
                if (ci === 0) {
                    td.textContent = 'المجموع الكلي';
                    td.style.fontWeight = '700';
                    td.colSpan = 2;
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
        const zone = (filterZoneEl?.value || '').trim();
        const year = (filterYearEl?.value || '').trim();

        const nextColumnFilters = [];
        if (type) nextColumnFilters.push({ id: 'typeCampagne', value: type });
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
        filterZoneEl?.addEventListener('input', applyFiltersToState);
        filterYearEl?.addEventListener('change', applyFiltersToState);
        btnResetEl?.addEventListener('click', () => {
            if (filterTypeEl) filterTypeEl.value = '';
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
                    sorting: [{ id: 'typeCampagne', desc: false }],
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

    function exportToXlsx() {
        const XLSX = typeof window !== 'undefined' ? window.XLSX : null;
        if (!XLSX) {
            alert('XLSX library not loaded.');
            return;
        }
        const data = buildExportRowsFromTable();
        const headers = [
            'نوع الحملة',
            'نوع النشاط / المنطقة الجغرافية',
            'عدد المنخرطين (الأجراء)',
            'عدد غير المنخرطين (الأجراء)',
            'عدد المنخرطين (غير الأجراء)',
            'عدد غير المنخرطين (غير الأجراء)',
            'عدد الأجراء',
            'المبلغ الإجمالي للنقص',
            'معترف به',
            'غير معترف به',
            'عدد المراقبين المشاركين',
        ];
        const aoa = [
            headers,
            ...data.map((r) => [
                r.typeCampagne ?? '',
                r.zone ?? '',
                r.salAff ?? '',
                r.salNonAff ?? '',
                r.nonSalAff ?? '',
                r.nonSalNonAff ?? '',
                r.travTotal ?? '',
                r.insuffTotale ?? '',
                r.mtReconnu ?? '',
                r.mtNonReconnu ?? '',
                r.controleursParticipants ?? '',
            ]),
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Arabic / RTL sheet view
        ws['!rtl'] = true;
        XLSX.utils.book_append_sheet(wb, ws, 'Resultats');
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.Views = [{ RTL: true }];
        const filename = `resultats_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    function exportToPdf() {
        const tableEl = document.querySelector('.page-results .results-table');
        if (!tableEl || !table) return;

        const filenameBase = `statistiques_campagnes_${new Date().toISOString().slice(0, 10)}`;

        // Reliable approach: open a clean print window (A4 landscape) with a title + the table.
        // Then user can "Save as PDF" from the print dialog.
        // (This avoids html2canvas/html2pdf blank-page issues on some machines.)
        const theadSrc = tableEl.querySelector('thead');
        const theadClone = theadSrc ? theadSrc.cloneNode(true) : null;
        if (theadClone) theadClone.querySelectorAll('.results-sort-indicator').forEach((el) => el.remove());
        const theadHtml = theadClone ? theadClone.outerHTML : '';

        const rowModel = table.getRowModel();
        const rows = rowModel?.rows || [];
        const tbodyHtml =
            rows.length === 0
                ? `<tbody><tr><td colspan="11" style="text-align:center;color:#777;">لا توجد نتائج</td></tr></tbody>`
                : `<tbody>${rows
                      .map((row) => {
                          const tds = row
                              .getVisibleCells()
                              .map((cell) => `<td>${flexRender(cell.column.columnDef.cell, cell.getContext())}</td>`)
                              .join('');
                          return `<tr>${tds}</tr>`;
                      })
                      .join('')}</tbody>`;

        // Build tfoot for PDF (same sums as visible table)
        const pdfAmounts = ['insuffTotale', 'mtReconnu', 'mtNonReconnu'];
        const pdfSumFields = ['salAff', 'salNonAff', 'nonSalAff', 'nonSalNonAff', 'travTotal', 'insuffTotale', 'mtReconnu', 'mtNonReconnu', 'controleursParticipants'];
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
                    tfootHtml += '<td colspan="2" style="font-weight:700;">المجموع الكلي</td>';
                } else if (ci > 0 && ci < 2) {
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
    <h1>${totalBadge}إحصائيات الحملات</h1>
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

        // Fired after the print dialog closes (both "Imprimer" and "Annuler" cases in most browsers)
        window.onafterprint = closeMeSoon;

        // Extra safety: detect leaving print mode (some browsers are more reliable with matchMedia)
        if (window.matchMedia) {
          var mql = window.matchMedia('print');
          var handler = function (e) {
            if (hasInvokedPrint && e && e.matches === false) closeMeSoon();
          };
          if (mql && typeof mql.addEventListener === 'function') mql.addEventListener('change', handler);
          else if (mql && typeof mql.addListener === 'function') mql.addListener(handler);
        }

        // Fallback: when focus returns after closing print dialog, close the tab/window
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
            if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="11" class="text-center text-muted">Pas de connexion internet</td></tr>`;
            return;
        }
        let progRes = null;
        let resultatsRes = null;
        try {
            [progRes, resultatsRes] = await Promise.all([
                postAction('getSheet', { sheet: 'Programmes' }),
                postAction('getSheet', { sheet: 'Resultats' }),
            ]);
        } catch (e) {
            setResultsLoading(false);
            if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="11" class="text-center text-muted">Erreur réseau</td></tr>`;
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
                tbodyEl.innerHTML = `<tr><td colspan="11" class="text-center text-muted">${
                    isOffline
                        ? 'Pas de connexion internet'
                        : 'Impossible de charger les programmes (API).'
                }</td></tr>`;
            }
            return;
        }

        const programmesById = new Map();
        progRes.rows.forEach((r) => {
            if (!r || !r.length) return;
            const id = String(r[0] ?? '').trim();
            if (id) programmesById.set(id, r);
        });

        const resultatsRows = resultatsRes && resultatsRes.ok && Array.isArray(resultatsRes.rows) ? resultatsRes.rows : [];
        const latestByProgramme = new Map();
        resultatsCache.clear();
        for (const r of resultatsRows) {
            if (!r || isResultatsHeaderRow(r) || r.length < 2) continue;
            if (r.length >= 13 && String(r[12]).trim() !== String(user.codeBr).trim()) continue;
            const pid = String(r[1]).trim();
            if (!pid) continue;
            if (!programmesById.has(pid)) continue;
            latestByProgramme.set(pid, r);
            resultatsCache.set(pid, r);
        }

        rowsAll = [];
        for (const [pid, r] of latestByProgramme.entries()) {
            const prog = programmesById.get(pid);
            if (!prog) continue;
            const modern = r.length >= 12;
            const dec = parseMaybeNumber(r[6]) ?? null;
            const ndec = parseMaybeNumber(r[7]) ?? null;
            const travTotal =
                dec == null && ndec == null
                    ? ''
                    : String((dec ?? 0) + (ndec ?? 0));
            rowsAll.push({
                programmeId: pid,
                resultatId: String(r[0] ?? '').trim(),
                programmeRow: prog,
                typeCampagne: prog[2] ?? '',
                zone: prog[3] ?? '',
                salAff: r[2] ?? '',
                salNonAff: r[3] ?? '',
                nonSalAff: r[4] ?? '',
                nonSalNonAff: r[5] ?? '',
                travDeclares: r[6] ?? '',
                travNonDeclares: r[7] ?? '',
                travTotal,
                insuffTotale: modern ? r[8] ?? '' : '',
                mtReconnu: modern ? r[9] ?? '' : r[8] ?? '',
                mtNonReconnu: modern ? r[10] ?? '' : r[9] ?? '',
                controleursParticipants: modern ? r[11] ?? '' : r[10] ?? '',
            });
        }

        // Create/refresh TanStack table
        const resolvedOptions = {
            data: rowsAll,
            columns,
            filterFns: { numberMinFilter, amountMinFilter },
            globalFilterFn: (row, columnId, filterValue) => {
                // columnId unused (TanStack global filter runs per-row)
                const q = String(filterValue ?? '').trim().toLowerCase();
                if (!q) return true;
                const r = row.original;
                const hay = [
                    r.programmeId,
                    r.typeCampagne,
                    r.zone,
                    r.salAff,
                    r.salNonAff,
                    r.nonSalAff,
                    r.nonSalNonAff,
                    r.travTotal,
                    r.insuffTotale,
                    r.mtReconnu,
                    r.mtNonReconnu,
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
                // Default sort by Programme ID (ascending)
                sorting: [{ id: 'typeCampagne', desc: false }],
                columnFilters: [],
                globalFilter: '',
            },
            onStateChange: (updater) => {
                if (typeof updater === 'function') {
                    tableState = updater(tableState);
                } else {
                    tableState = updater;
                }
                // Push the merged state back in (controlled)
                table.setOptions((p2) => ({ ...p2, state: { ...tableState, ...p2.state } }));
                renderTanstackTable();
            },
        }));

        populateYearFilter();
        applyFiltersToState();
        renderTanstackTable();
        setResultsLoading(false);
    }

    await loadAndBuildTable();
});
