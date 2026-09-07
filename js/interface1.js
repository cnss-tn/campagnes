document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-programme');
    const tableBody = document.getElementById('table-body');
    const modalCampagneEl = document.getElementById('modal-campagne-form');
    let modalCampagne = null;
    try { modalCampagne = typeof bootstrap !== 'undefined' ? bootstrap.Modal.getOrCreateInstance(modalCampagneEl) : null; } catch {}
    const btnOpenForm = document.getElementById('btn-open-campagne-form');
    const typeCampagne = document.getElementById('type_campagne');
    const zoneBlock = document.getElementById('zone-activite-block');
    const wrapSectorielle = document.getElementById('zone-sectorielle-wrap');
    const wrapGeographique = document.getElementById('zone-geographique-wrap');
    const activiteSectorielle = document.getElementById('activite_sectorielle');
    const activiteZoneGeo = document.getElementById('activite_zone_geo');
    const btnCustomActivity = document.getElementById('btn-custom-activity');
    const wrapSectorielleCustom = document.getElementById('zone-sectorielle-custom-wrap');
    const activiteSectorielleCustom = document.getElementById('activite_sectorielle_custom');
    const btnBackToList = document.getElementById('btn-back-to-list');
    const sectorClearBadge = document.getElementById('sector-clear-badge');
    const zoneLabel = document.getElementById('zone-activite-label');
    const inputDateDebut = document.getElementById('date_debut');
    const inputDateFin = document.getElementById('date_fin');

    const statsModalEl = document.getElementById('modal-stats-campagne');
    const statsModal = typeof bootstrap !== 'undefined' ? bootstrap.Modal.getOrCreateInstance(statsModalEl) : null;
    const btnStatsSave = document.getElementById('modal-stats-save');
    const paginationWrap = document.getElementById('programmes-pagination');
    const btnPrevPage = document.getElementById('prog-prev');
    const btnNextPage = document.getElementById('prog-next');
    const pageInfoEl = document.getElementById('prog-page-info');
    const progPages = document.getElementById('prog-pages');
    const progTotal = document.getElementById('prog-total');
    const programmesLoaderRow = document.getElementById('programmes-loader-row');
    const filterTypeEl = document.getElementById('filter-type');
    const filterZoneEl = document.getElementById('filter-zone');
    const filterStatusEl = document.getElementById('filter-status');
    const filterYearEl = document.getElementById('filter-year');
    const btnResetEl = document.getElementById('btn-filters-reset');
    const btnExportXlsx = document.getElementById('btn-export-xlsx');
    const btnExportPdf = document.getElementById('btn-export-pdf');

    if (document.body) {
        document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    }

    // Debug: Check for any overlays that might block interaction
    function checkOverlays() {
        const overlays = document.querySelectorAll('body *');
        overlays.forEach(el => {
            const style = getComputedStyle(el);
            const zIndex = parseInt(style.zIndex);
            const pointerEvents = style.pointerEvents;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (zIndex >= 0 || pointerEvents !== 'none')) {
                console.log('Potential overlay:', el.id || el.className, 
                    'z-index:', zIndex, 
                    'pointer-events:', pointerEvents,
                    'rect:', rect);
            }
        });
    }
    // Run check on load
    setTimeout(checkOverlays, 1000);
    // Also check after modal opens
    if (statsModal) {
        statsModalEl.addEventListener('shown.bs.modal', checkOverlays);
    }



    let currentProgrammeRow = null;
    let currentResultatId = null;
    const resultatsCache = new Map();

    const PROGRAMMES_PAGE_SIZE = 6;
    let programmesAllRows = [];
    let programmesFilteredRows = [];
    let programmeIdsWithResultats = new Set();
    let programmesPage = 1;
    let goToLastPageOnce = false;
    let goToNewCampagneId = '';
    let programmesMessage = '';
    let sortColIdx = 0;
    let sortDir = 'asc';

    function setProgrammesLoading(isLoading) {
        if (programmesLoaderRow) programmesLoaderRow.style.display = isLoading ? '' : 'none';
    }

    function setProgrammesMessage(msg) {
        programmesMessage = msg ? String(msg) : '';
        programmesAllRows = [];
        programmesFilteredRows = [];
        programmeIdsWithResultats = new Set();
        if (paginationWrap) paginationWrap.classList.add('d-none');
        if (progTotal) progTotal.textContent = programmesMessage;
        if (tableBody) {
            tableBody.innerHTML = programmesMessage
                ? `<tr><td colspan="4" class="text-center text-danger fw-semibold">${programmesMessage}</td></tr>`
                : '';
        }
    }

    function isResultatsHeaderRow(r) {
        if (!Array.isArray(r) || r.length < 2) return false;
        const c0 = String(r[0]).trim();
        const c1 = String(r[1]).trim();
        return c0 === "ID_Resultat" || c1 === "ID_Programme";
    }

    function sortFilteredRows() {
        const colMap = [2, 3, 5, 6];
        const col = colMap[sortColIdx] ?? 2;
        const dir = sortDir === 'asc' ? 1 : -1;
        programmesFilteredRows.sort((a, b) => {
            const va = a[col] ?? '';
            const vb = b[col] ?? '';
            if (col === 6) return (Number(va) - Number(vb)) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
    }

    let serverYear = null;

    function extractYearFromDate(val) {
        const s = String(val || '').trim();
        return s.length >= 4 ? s.substring(0, 4) : '';
    }

    function populateYearFilter() {
        if (!filterYearEl) return;
        const years = new Set();
        for (const row of programmesAllRows) {
            const y = extractYearFromDate(row[5]) || extractYearFromDate(row[4]);
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

    function applyFilters() {
        const type = (filterTypeEl?.value || '').trim();
        const zone = (filterZoneEl?.value || '').trim().toLowerCase();
        const status = (filterStatusEl?.value || '').trim();
        const year = (filterYearEl?.value || '').trim();
        programmesFilteredRows = programmesAllRows.filter((row) => {
            if (type && row[2] !== type) return false;
            if (zone && !String(row[3] || '').toLowerCase().includes(zone)) return false;
            if (status === 'realized' && !programmeIdsWithResultats.has(String(row[0]).trim())) return false;
            if (status === 'not-realized' && programmeIdsWithResultats.has(String(row[0]).trim())) return false;
            if (year) {
                const ry = extractYearFromDate(row[5]) || extractYearFromDate(row[4]);
                if (ry !== year) return false;
            }
            return true;
        });
        sortFilteredRows();
        programmesPage = 1;
        renderProgrammesPage(programmesPage);
    }

    function totalProgrammesPages() {
        return Math.max(1, Math.ceil(programmesFilteredRows.length / PROGRAMMES_PAGE_SIZE));
    }

    function updatePaginationUI() {
    if (programmesMessage) {
        if (paginationWrap) paginationWrap.classList.add('d-none');
        if (progTotal) progTotal.textContent = programmesMessage;
        return;
    }
    const pages = totalProgrammesPages();
    const totalFiltered = programmesFilteredRows.length;
    const totalAll = programmesAllRows.length;
    const show = totalFiltered > PROGRAMMES_PAGE_SIZE;
    if (paginationWrap) paginationWrap.classList.toggle('d-none', !show);
    if (pageInfoEl) {
        pageInfoEl.textContent = `Page ${programmesPage} / ${pages} • ${totalFiltered} حملات`;
    }
    if (btnPrevPage) btnPrevPage.disabled = programmesPage <= 1;
    if (btnNextPage) btnNextPage.disabled = programmesPage >= pages;
    if (progPages) {
        progPages.innerHTML = '';
        for (let i = 1; i <= pages; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'programmes-page-number' + (i === programmesPage ? ' is-active' : '');
            btn.textContent = i;
            btn.addEventListener('click', () => renderProgrammesPage(i));
            progPages.appendChild(btn);
        }
    }
    if (progTotal) {
        progTotal.textContent = totalAll === totalFiltered
            ? `${totalAll} ${totalAll > 1 ? 'حملات' : 'حملة'}`
            : `${totalFiltered} / ${totalAll} حملات`;
    }
}

    function renderProgrammesPage(page) {
        if (programmesMessage) return;
        const pages = totalProgrammesPages();
        programmesPage = Math.min(Math.max(1, page), pages);
        const start = (programmesPage - 1) * PROGRAMMES_PAGE_SIZE;
        const slice = programmesFilteredRows.slice(start, start + PROGRAMMES_PAGE_SIZE);

        tableBody.innerHTML = '';
        if (!slice.length) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">قائمة فارغة</td></tr>';
            updatePaginationUI();
            return;
        }

        slice.forEach((row) => {
            const tr = document.createElement('tr');
            tr.className = 'programme-row-clickable';
            tr.dataset.programmeId = row[0];
            const programmeId = String(row[0]).trim();
            const hasResultats = programmeIdsWithResultats.has(programmeId);
            if (hasResultats) {
                tr.classList.add('programme-row-with-resultats');
                tr.setAttribute('aria-label', 'Ouvrir les statistiques — résultats déjà enregistrés pour cette campagne');
            } else {
                tr.setAttribute('aria-label', 'Ouvrir les statistiques de cette campagne');
            }
            tr.setAttribute('role', 'button');
            tr.tabIndex = 0;
                const typeV = String(row[2] ?? '').trim();
                let badgeCls = 'badge campagne-type-badge';
                if (typeV === 'لا شيء' || typeV === '') badgeCls += ' campagne-type-badge--rien';
                else if (typeV === 'جغرافية') badgeCls += ' campagne-type-badge--geo';
                tr.innerHTML = `
                <td><span class="${badgeCls}">${typeV}</span></td>
                <td>${window.renderZoneActivity(row[3])}</td>
                <td><small dir="ltr">${row[4]} ⟻ ${row[5]}</small></td>
                <td class="text-center">${row[6]}</td>
            `;
            tr.addEventListener('click', () => openStatsModal(row));
            tr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openStatsModal(row);
                }
            });
            tableBody.appendChild(tr);
        });

        updatePaginationUI();
    }

    const choiceSelectOpts = {
        searchEnabled: true,
        shouldSort: false,
        itemSelectText: '',
        allowHTML: false,
        position: 'bottom',
    };
    if (filterTypeEl && typeof window !== 'undefined' && window.Choices) {
        try { new window.Choices(filterTypeEl, choiceSelectOpts); } catch {}
    }
    if (filterStatusEl && typeof window !== 'undefined' && window.Choices) {
        try { new window.Choices(filterStatusEl, choiceSelectOpts); } catch {}
    }
    let choicesYear = null;
    if (filterYearEl && typeof window !== 'undefined' && window.Choices) {
        try { choicesYear = new window.Choices(filterYearEl, { ...choiceSelectOpts, searchEnabled: false }); } catch {}
    }

    const fpLocale =
        typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns.ar
            ? flatpickr.l10ns.ar
            : undefined;

    let choicesCampagne = null;
    let choicesSector = null;
    let fpDebut = null;
    let fpFin = null;
    let formPickersReady = false;

    function loadActivities() {
        const data = window.activitiesData;
        if (!data || !Array.isArray(data) || data.length === 0) {
            console.warn('activitiesData not available');
            return;
        }

        const sections = new Map();
        const divisions = new Map();
        const groupes = new Map();
        const classeMap = new Map();

        for (const a of data) {
            if (!sections.has(a.sectionCode))
                sections.set(a.sectionCode, a);
            const dk = a.sectionCode + '|' + a.divisionCode;
            if (!divisions.has(dk))
                divisions.set(dk, a);
            const gk = a.sectionCode + '|' + a.divisionCode + '|' + a.groupeCode;
            if (!groupes.has(gk))
                groupes.set(gk, a);
            const ck = gk;
            if (!classeMap.has(ck)) classeMap.set(ck, []);
            classeMap.get(ck).push(a);
        }

        activiteSectorielle.innerHTML = '<option value="">اختر النشاط...</option>';

        const levels = [
            { bg: 'rgba(4, 143, 64, 0.12)', code: '#048f40', text: '#1a4a2e' },  // section — green
            { bg: 'rgba(0, 102, 204, 0.10)', code: '#0066cc', text: '#1a2a4a' },  // division — blue
            { bg: 'rgba(212, 160, 23, 0.12)', code: '#b8860b', text: '#4a3a1a' }, // groupe — amber
            { bg: 'transparent', code: '#999', text: '#333' },                     // classe — neutral
        ];

        function addOpt(value, code, name, i) {
            const s = levels[i];
            const opt = document.createElement('option');
            opt.value = code + ' - ' + value;
            opt.textContent = code + ' - ' + name;
            opt.setAttribute('label', '<span style="display:block;padding:4px 8px;background:' + s.bg + ';color:' + s.text + '"><span style="color:' + s.code + ';font-weight:700">' + code + '</span> - ' + name + '</span>');
            activiteSectorielle.appendChild(opt);
        }

        for (const a of sections.values()) {
            addOpt(a.sectionName, a.sectionCode, a.sectionName, 0);
            for (const da of divisions.values()) {
                if (da.sectionCode !== a.sectionCode) continue;
                addOpt(da.divisionName, da.divisionCode, da.divisionName, 1);
                for (const ga of groupes.values()) {
                    if (ga.sectionCode !== da.sectionCode || ga.divisionCode !== da.divisionCode) continue;
                    addOpt(ga.groupeName, ga.groupeCode, ga.groupeName, 2);
                    const classeKey = ga.sectionCode + '|' + ga.divisionCode + '|' + ga.groupeCode;
                    const classes = classeMap.get(classeKey) || [];
                    for (const ca of classes) {
                        addOpt(ca.classeName, ca.classeCode, ca.classeName, 3);
                    }
                }
            }
        }
    }

    const sectorSearchOpts = {
        searchEnabled: true,
        searchResultLimit: -1,
        shouldSort: false,
        itemSelectText: '',
        allowHTML: true,
        position: 'bottom',
        noResultsText: 'لا توجد نتائج',
        searchFields: ['value'],
        fuseOptions: {
            threshold: 0,
            distance: 1000,
            minMatchCharLength: 1,
            ignoreLocation: true,
        },
    };

    let selected = false;
    let resetting = false;
    function initSectorChoices() {
        if (choicesSector) return;
        choicesSector = new Choices(activiteSectorielle, sectorSearchOpts);
        activiteSectorielle.addEventListener('showDropdown', onSectorShow);
        activiteSectorielle.addEventListener('change', onSectorChange);
        activiteSectorielle.addEventListener('hideDropdown', onSectorHide);
    }
    function destroySectorChoices() {
        if (!choicesSector) return;
        activiteSectorielle.removeEventListener('showDropdown', onSectorShow);
        activiteSectorielle.removeEventListener('change', onSectorChange);
        activiteSectorielle.removeEventListener('hideDropdown', onSectorHide);
        const c = choicesSector;
        choicesSector = null;
        c.destroy();
    }
    function onSectorShow() { selected = false; }
    function onSectorChange() { selected = true; }
    function onSectorHide() {
        if (selected || resetting) return;
        const hasValue = activiteSectorielle.value && activiteSectorielle.value.trim() !== '';
        if (hasValue) return;
        resetSectorChoices();
    }
    function resetSectorUI() {
        wrapSectorielleCustom.classList.add('d-none');
        activiteSectorielleCustom.removeAttribute('required');
        activiteSectorielleCustom.disabled = true;
        btnCustomActivity.classList.remove('d-none');
        activiteSectorielle.value = '';
        wrapSectorielle.classList.remove('d-none');
        activiteSectorielle.disabled = false;
        activiteSectorielle.setAttribute('required', 'required');
        initSectorChoices();
        updateSectorClearBadge();
    }

    function resetSectorChoices() {
        resetting = true;
        destroySectorChoices();
        activiteSectorielle.value = '';
        loadActivities();
        initSectorChoices();
        updateSectorClearBadge();
        setTimeout(() => { resetting = false; }, 0);
    }

    function updateZoneActiviteUI() {
        const type = typeCampagne.value;
        destroySectorChoices();
        activiteSectorielle.value = '';
        activiteSectorielle.removeAttribute('required');
        activiteZoneGeo.removeAttribute('required');
        activiteSectorielleCustom.removeAttribute('required');
        activiteSectorielle.disabled = true;
        activiteZoneGeo.disabled = true;
        activiteSectorielleCustom.disabled = true;
        wrapSectorielle.classList.add('d-none');
        wrapGeographique.classList.add('d-none');
        wrapSectorielleCustom.classList.add('d-none');
        btnCustomActivity.classList.remove('d-none');
        zoneBlock.hidden = true;

        if (type === 'قطاعية') {
            zoneBlock.hidden = false;
            zoneLabel.textContent = 'نوع النشاط';
            wrapSectorielle.classList.remove('d-none');
            activiteSectorielle.disabled = false;
            activiteSectorielle.setAttribute('required', 'required');
            initSectorChoices();
        } else if (type === 'جغرافية') {
            zoneBlock.hidden = false;
            zoneLabel.textContent = 'المنطقة الجغرافية';
            wrapGeographique.classList.remove('d-none');
            activiteZoneGeo.disabled = false;
            activiteZoneGeo.setAttribute('required', 'required');
        }
        updateSectorClearBadge();
    }

    btnCustomActivity.addEventListener('click', () => {
        destroySectorChoices();
        wrapSectorielle.classList.add('d-none');
        activiteSectorielle.removeAttribute('required');
        activiteSectorielle.disabled = true;
        btnCustomActivity.classList.add('d-none');
        wrapSectorielleCustom.classList.remove('d-none');
        activiteSectorielleCustom.disabled = false;
        activiteSectorielleCustom.setAttribute('required', 'required');
        activiteSectorielleCustom.focus();
    });

    btnBackToList.addEventListener('click', () => {
        activiteSectorielleCustom.value = '';
        resetSectorUI();
    });

    function updateSectorClearBadge() {
        const hasValue = activiteSectorielle.value && activiteSectorielle.value !== '';
        btnCustomActivity.classList.toggle('d-none', hasValue);
        sectorClearBadge.classList.toggle('d-none', !hasValue);
    }

    function clearSectorSelection() {
        destroySectorChoices();
        activiteSectorielle.value = '';
        initSectorChoices();
        updateSectorClearBadge();
    }

    activiteSectorielle.addEventListener('change', updateSectorClearBadge);
    sectorClearBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSectorSelection();
    });

    function initFormPickersOnce() {
        if (formPickersReady) return;
        formPickersReady = true;

        const curYear = new Date().getFullYear();
        const yearMin = new Date(curYear, 0, 1);
        const yearMax = new Date(curYear, 11, 31);

        choicesCampagne = new Choices(typeCampagne, choiceSelectOpts);

        fpDebut = flatpickr(inputDateDebut, {
            locale: fpLocale,
            dateFormat: 'Y-m-d',
            disableMobile: true,
            allowInput: false,
            minDate: yearMin,
            maxDate: yearMax,
            placeholder: "اختر...",
            position: "auto",
            static: false,
            onChange: (dates) => {
                if (dates[0]) {
                    fpFin.set('minDate', dates[0]);
                } else {
                    fpFin.set('minDate', yearMin);
                }
            },
            onYearChange: (sel, dt, inst) => { if (inst.currentYear !== curYear) inst.changeYear(curYear); },
            onMonthChange: (sel, dt, inst) => { if (inst.currentYear !== curYear) inst.changeYear(curYear); },
        });

        fpFin = flatpickr(inputDateFin, {
            locale: fpLocale,
            dateFormat: 'Y-m-d',
            disableMobile: true,
            allowInput: false,
            minDate: yearMin,
            maxDate: yearMax,
            placeholder: "اختر...",
            position: "auto",
            static: false,
            onYearChange: (sel, dt, inst) => { if (inst.currentYear !== curYear) inst.changeYear(curYear); },
            onMonthChange: (sel, dt, inst) => { if (inst.currentYear !== curYear) inst.changeYear(curYear); },
        });

        typeCampagne.addEventListener('change', updateZoneActiviteUI);
        updateZoneActiviteUI();

        if (window.getServerYear) window.getServerYear();
    }

    function getZoneActiviteValue() {
        const type = typeCampagne.value;
        if (type === 'قطاعية') {
            return wrapSectorielleCustom.classList.contains('d-none') ? activiteSectorielle.value : activiteSectorielleCustom.value.trim();
        }
        if (type === 'جغرافية') return activiteZoneGeo.value.trim();
        return '';
    }

    function validateProgrammeForm() {
        const type = typeCampagne.value;
        if (!type) return false;
        if (type === 'قطاعية') {
            const usingCustom = !wrapSectorielleCustom.classList.contains('d-none');
            if (usingCustom) {
                if (!activiteSectorielleCustom.value.trim()) return false;
            } else {
                if (!activiteSectorielle.value) return false;
            }
        }
        if (type === 'جغرافية' && !activiteZoneGeo.value.trim()) return false;
        if (!inputDateDebut.value || !inputDateFin.value) return false;
        const nb = document.getElementById('nb_controleurs').value;
        if (!nb || Number(nb) < 1) return false;
        return true;
    }

    function statVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function setStatVal(id, v) {
        const el = document.getElementById(id);
        if (el) el.value = v === undefined || v === null ? '' : String(v);
    }

    function sanitizeAmountText(v) {
        const raw = String(v === undefined || v === null ? '' : v);
        const normalizedSep = raw.replace(/[.;:،؛'"’‘“”]/g, ',');
        const kept = normalizedSep.replace(/[^\d,]/g, '');
        return kept.replace(/,{2,}/g, ',').replace(/^,/, '');
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

    function populateModalFromCache(progRow) {
        currentResultatId = null;
        const pid = String(progRow[0] ?? '').trim();
        const data = resultatsCache.get(pid) || null;

        setStatVal('res-type-hamla', progRow[2]);
        setStatVal('res-activite-zone', progRow[3]);

        if (data && data.length >= 2) {
            currentResultatId = data[0] != null && String(data[0]).trim() !== "" ? String(data[0]).trim() : null;
            setStatVal('res-w-in', data[2]);
            setStatVal('res-w-ni', data[3]);
            setStatVal('res-nw-in', data[4]);
            setStatVal('res-nw-ni', data[5]);
            setStatVal('res-emp-dec', data[6]);
            setStatVal('res-emp-ndec', data[7]);
            if (data.length >= 12) {
                setStatVal('res-manq-tot', sanitizeAmountText(data[8]));
                setStatVal('res-manq-ok', sanitizeAmountText(data[9]));
                setStatVal('res-manq-nok', sanitizeAmountText(data[10]));
                setStatVal('res-participants', data[11]);
            } else {
                setStatVal('res-manq-tot', '');
                setStatVal('res-manq-ok', sanitizeAmountText(data[8]));
                setStatVal('res-manq-nok', sanitizeAmountText(data[9]));
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
        if (elPeriod) elPeriod.innerHTML = `<span dir="ltr">${programmeRow[4] ?? ''} ⟻ ${programmeRow[5] ?? ''}</span>`;
        if (elEff) elEff.textContent = programmeRow[6] != null ? String(programmeRow[6]) : '';
        populateModalFromCache(programmeRow);
        statsModal.show();
    }

    function buildResultatsRow() {
        if (!currentProgrammeRow) return null;
        const nz = (v) => (v === '' || v === undefined ? '0' : v);
        const amountVal = (id) => statVal(id).replace(/,/g, '');
        const idResultat = currentResultatId && String(currentResultatId).trim() !== '' ? String(currentResultatId).trim() : `R${Date.now()}`;
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

    btnOpenForm?.addEventListener('click', () => {
        initFormPickersOnce();
        if (modalCampagne) modalCampagne.show();
        else if (modalCampagneEl) modalCampagneEl.style.display = 'block';
        requestAnimationFrame(() => {
            if (typeof choicesCampagne?.refresh === 'function') choicesCampagne.refresh();
            if (typeof choicesSector?.refresh === 'function') choicesSector.refresh();
            if (typeof fpDebut?.redraw === 'function') fpDebut.redraw();
            if (typeof fpFin?.redraw === 'function') fpFin.redraw();
        });
    });

    function resetCampagneForm() {
        form.reset();
        if (fpDebut) { fpDebut.destroy(); fpDebut = null; }
        if (fpFin) { fpFin.destroy(); fpFin = null; }

        wrapSectorielleCustom.classList.add('d-none');
        activiteSectorielleCustom.removeAttribute('required');
        activiteSectorielleCustom.disabled = true;
        activiteSectorielleCustom.value = '';

        sectorClearBadge.classList.add('d-none');
        btnCustomActivity.classList.remove('d-none');

        if (choicesCampagne) { choicesCampagne.destroy(); choicesCampagne = null; }
        destroySectorChoices();
        typeCampagne.removeEventListener('change', updateZoneActiviteUI);
        formPickersReady = false;
    }

    function closeCampagneForm() {
        if (modalCampagne) {
            try { modalCampagne.hide(); } catch {}
        } else if (modalCampagneEl) {
            modalCampagneEl.style.display = 'none';
        }
    }

    if (modalCampagneEl) {
        modalCampagneEl.addEventListener('hidden.bs.modal', () => {
            resetCampagneForm();
        });
        modalCampagneEl.addEventListener('shown.bs.modal', () => {
            // ensure Choices / flatpickr redraw inside modal
            if (typeof choicesCampagne?.refresh === 'function') choicesCampagne.refresh();
            if (typeof choicesSector?.refresh === 'function') choicesSector.refresh();
            if (typeof fpDebut?.redraw === 'function') fpDebut.redraw();
            if (typeof fpFin?.redraw === 'function') fpFin.redraw();
        });
    }



    initAmountInputs();

    if (btnStatsSave) {
        btnStatsSave.addEventListener('click', async () => {
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
                const updatedId = currentProgrammeRow ? String(currentProgrammeRow[0] || '').trim() : '';
                if (updatedId) {
                    goToLastPageOnce = true;
                    goToNewCampagneId = updatedId;
                }
                statsModal?.hide();
    await loadTable();
            } else {
                alert("Erreur lors de l'enregistrement des statistiques");
            }
        });
    }

    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('currentUser'));
    } catch {}
    if (!user || !user.codeBr || !user.token) {
        try {
            localStorage.setItem('postLoginRedirect', 'interface1.html');
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
    var _pwc1 = user.pw_changed; if (_pwc1 == null && user.pwChanged != null) _pwc1 = user.pwChanged;
    if (_pwc1 == null) _pwc1 = 0;
    if (Number(_pwc1) === 0) { window.location.href = 'pw-force-change.html'; return; }

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
    const logoutBtn = document.getElementById('btn-logout');
    logoutBtn?.addEventListener('click', () => {
        try {
            localStorage.removeItem('currentUser');
        } catch {}
        window.location.href = 'index.html';
    });

    // Filters
    filterTypeEl?.addEventListener('change', applyFilters);
    filterZoneEl?.addEventListener('input', applyFilters);
    filterStatusEl?.addEventListener('change', applyFilters);
    filterYearEl?.addEventListener('change', applyFilters);
    btnResetEl?.addEventListener('click', () => {
        if (filterTypeEl) filterTypeEl.value = '';
        if (filterZoneEl) filterZoneEl.value = '';
        if (filterStatusEl) filterStatusEl.value = '';
        const resetYear = serverYear ? String(serverYear) : '';
        if (filterYearEl) filterYearEl.value = resetYear;
        if (choicesYear) {
            try { choicesYear.setChoiceByValue(resetYear); } catch {}
        }
        applyFilters();
    });

    // Sort triggers
    const sortHeaders = document.querySelectorAll('.page-programme .sort-trigger');
    function updateSortIndicators() {
        sortHeaders.forEach((th) => {
            const idx = Number(th.dataset.col);
            const arrow = th.querySelector('.sort-indicator');
            if (!arrow) return;
            arrow.textContent = idx === sortColIdx ? (sortDir === 'asc' ? '▼' : '▲') : '';
        });
    }
    sortHeaders.forEach((th) => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const idx = Number(th.dataset.col);
            if (sortColIdx === idx) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortColIdx = idx;
                sortDir = 'asc';
            }
            sortFilteredRows();
            programmesPage = 1;
            renderProgrammesPage(programmesPage);
            updateSortIndicators();
        });
    });
    updateSortIndicators();

    // Export Excel
    btnExportXlsx?.addEventListener('click', () => {
        const XLSX = typeof window !== 'undefined' ? window.XLSX : null;
        if (!XLSX) { alert('XLSX library not loaded.'); return; }
        const data = programmesFilteredRows;
        const headers = ['ID', 'BR', 'نوع الحملة', 'نوع النشاط / المنطقة الجغرافية', 'الفترة الزمنية', 'عدد المراقبين'];
        const aoa = [
            headers,
            ...data.map((r) => [r[0] ?? '', r[1] ?? '', r[2] ?? '', r[3] ?? '', `${r[4] ?? ''} ⟻ ${r[5] ?? ''}`, r[6] ?? '']),
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!rtl'] = true;
        XLSX.utils.book_append_sheet(wb, ws, 'Programmes');
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.Views = [{ RTL: true }];
        XLSX.writeFile(wb, `programmes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });

    // Export PDF
    btnExportPdf?.addEventListener('click', () => {
        const tableEl = document.querySelector('.page-programme .composed-table');
        if (!tableEl) return;
        const filenameBase = `campagnes_${new Date().toISOString().slice(0, 10)}`;
        const rows = programmesFilteredRows;
        const theadCustom = `<thead><tr><th>نوع الحملة</th><th>نوع النشاط / المنطقة الجغرافية</th><th>الفترة الزمنية</th><th>عدد المراقبين</th></tr></thead>`;
        const tbodyHtml = rows.length === 0
            ? `<tbody><tr><td colspan="4" style="text-align:center;color:#777;">لا توجد نتائج</td></tr></tbody>`
            : `<tbody>${rows.map((r) => `<tr><td>${r[2] ?? ''}</td><td>${r[3] ?? ''}</td><td dir="ltr">${r[4] ?? ''} ⟻ ${r[5] ?? ''}</td><td>${r[6] ?? ''}</td></tr>`).join('')}</tbody>`;
        const tableHtml = `<table class="${tableEl.className}" dir="rtl">${theadCustom}${tbodyHtml}</table>`;
        const totalCount = rows.length;
        const totalLabel = totalCount === 1 ? 'حملة' : 'حملات';
        const totalBadge = `<span style="position:absolute;left:10mm;font-size:14pt;font-weight:700;">${totalCount} ${totalLabel}</span>`;
        const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${filenameBase}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,"Segoe UI",Tahoma,sans-serif;direction:rtl;color:#111}h1{text-align:center;font-size:18pt;margin:0 0 10mm 0;position:relative}table{width:100%;border-collapse:collapse;table-layout:fixed}thead th{background:#f2f2f2;font-weight:700}th,td{border:1px solid #999;padding:4px 6px;font-size:9pt;text-align:center;word-wrap:break-word}tr{page-break-inside:avoid;break-inside:avoid}</style></head><body><h1>${totalBadge}برنامج حملات المكتب</h1>${tableHtml}<script>(function(){try{document.title="${filenameBase}"}catch(e){}var hasInvokedPrint=false;function closeMeSoon(){setTimeout(function(){try{window.close()}catch(e){}},120)}window.onafterprint=closeMeSoon;if(window.matchMedia){var mql=window.matchMedia("print");var handler=function(e){if(hasInvokedPrint&&e&&e.matches===false)closeMeSoon()};if(mql&&typeof mql.addEventListener==="function")mql.addEventListener("change",handler);else if(mql&&typeof mql.addListener==="function")mql.addListener(handler)}window.addEventListener("focus",function(){if(hasInvokedPrint)closeMeSoon()});window.onload=function(){setTimeout(function(){window.focus();hasInvokedPrint=true;window.print()},200)}})()<\/script></body></html>`;
        const win = window.open('', '_blank');
        if (!win) { alert('Popup blocked.'); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
    });

    async function loadTable() {
        programmesMessage = '';
        programmesAllRows = [];
        programmeIdsWithResultats = new Set();
        if (paginationWrap) paginationWrap.classList.add('d-none');
        if (progTotal) progTotal.textContent = '';
        tableBody.innerHTML = '';
        const loaderTr = document.createElement('tr');
        loaderTr.id = 'programmes-loader-row';
        loaderTr.innerHTML = '<td colspan="4" class="text-center py-4"><div class="spinner-border text-success" role="status" aria-label="Chargement"></div></td>';
        tableBody.appendChild(loaderTr);
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setProgrammesMessage('Pas de connexion internet');
            return;
        }

        const [progRes, resultatsRes] = await Promise.all([
            postAction('getSheet', { sheet: 'Programmes' }),
            postAction('getSheet', { sheet: 'Resultats' }),
        ]);

        if (!progRes || !progRes.ok || !Array.isArray(progRes.rows)) {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                setProgrammesMessage('Pas de connexion internet');
                return;
            }
            // Some browsers keep navigator.onLine=true even when internet is down.
            // postAction() reports it as network/http error in that case.
            if (!progRes) {
                setProgrammesMessage('Pas de connexion internet');
                return;
            }
            if (progRes && (progRes.error === 'network_error' || progRes.error === 'http_error')) {
                setProgrammesMessage('Pas de connexion internet');
                return;
            }
            // Token session côté Apps Script peut expirer (cache ~ 6h) => logout auto
            if (progRes && progRes.error === 'unauthorized') {
                if (typeof window !== 'undefined' && typeof window.logoutToLogin === 'function') window.logoutToLogin();
                else window.location.href = 'index.html';
                return;
            }
            setProgrammesMessage('Impossible de charger les programmes (API)');
            return;
        }

        const allData = progRes.rows;
        const resultatsRows = resultatsRes && resultatsRes.ok && Array.isArray(resultatsRes.rows) ? resultatsRes.rows : [];
        const myData = allData.filter((row) => row && String(row[1]).trim() === String(user.codeBr).trim());

        programmeIdsWithResultats = new Set();
        resultatsCache.clear();
        const resList = Array.isArray(resultatsRows) ? resultatsRows : [];
        for (const r of resList) {
            if (!r || isResultatsHeaderRow(r) || r.length < 2) continue;
            if (r.length >= 13 && String(r[12]).trim() !== String(user.codeBr).trim()) continue;
            const pid = String(r[1]).trim();
            if (pid) {
                programmeIdsWithResultats.add(pid);
                resultatsCache.set(pid, r);
            }
        }
        programmesAllRows = myData;
        populateYearFilter();
        applyFilters();
        if (goToLastPageOnce && goToNewCampagneId) {
            const idx = programmesFilteredRows.findIndex(r => String(r[0]).trim() === goToNewCampagneId);
            if (idx !== -1) {
                programmesPage = Math.floor(idx / PROGRAMMES_PAGE_SIZE) + 1;
            } else {
                programmesPage = totalProgrammesPages();
            }
            goToLastPageOnce = false;
            goToNewCampagneId = '';
            renderProgrammesPage(programmesPage);
        }
    }

    loadActivities();
    if (typeof window.getServerYear === 'function') {
        serverYear = await window.getServerYear();
    }
    await loadTable();

    btnPrevPage?.addEventListener('click', () => renderProgrammesPage(programmesPage - 1));
    btnNextPage?.addEventListener('click', () => renderProgrammesPage(programmesPage + 1));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        initFormPickersOnce();
        if (!validateProgrammeForm()) {
            alert('الرجاء تعمير جميع الخانات وبشكل صحيح');
            return;
        }

        const btnText = document.getElementById('btn-text');
        const btnSpinner = document.getElementById('btn-submit-spinner');
        btnText.textContent = 'جاري الإضافة';
        btnSpinner.classList.remove('d-none');

        const newEntry = [
            'P' + Date.now(),
            user.codeBr,
            typeCampagne.value,
            getZoneActiviteValue(),
            inputDateFin.value,
            inputDateDebut.value,
            document.getElementById('nb_controleurs').value,
        ];

        const success = await saveData('Programmes', newEntry);

        if (success) {
            goToLastPageOnce = true;
            goToNewCampagneId = newEntry[0];
            btnText.textContent = 'إضافة إلى البرنامج';
            btnSpinner.classList.add('d-none');
            closeCampagneForm();
            await loadTable();
        } else {
            alert('خطأ أثناء إضافة البرنامج. حاول مرة أخرى');
            btnText.textContent = 'إضافة إلى البرنامج';
            btnSpinner.classList.add('d-none');
        }
    });
});
