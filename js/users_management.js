document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('form-user');
    const modalUserFormEl = document.getElementById('modal-user-form');
    const modalUserTitle = document.getElementById('modal-user-title');
    const btnOpenForm = document.getElementById('btn-open-user-form');
    const formTitle = document.getElementById('modal-user-title');
    let modalUser = null;
    try { modalUser = typeof bootstrap !== 'undefined' ? bootstrap.Modal.getOrCreateInstance(modalUserFormEl) : null; } catch {}
    const inputMatricule = document.getElementById('user-matricule');
    const inputFrName = document.getElementById('user-fr-name');
    const inputArName = document.getElementById('user-ar-name');
    const selectGrade = document.getElementById('user-grade');
    const selectCodeBr = document.getElementById('user-code-br');
    const inputEmail = document.getElementById('user-email');
    const inputPw = document.getElementById('user-pw');
    const selectUserType = document.getElementById('user-type');
    const pwHint = document.getElementById('pw-hint');
    const btnSubmit = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-submit-spinner');

    const tableBody = document.getElementById('table-body');
    const usersLoaderRow = document.getElementById('users-loader-row');
    const paginationWrap = document.getElementById('users-pagination');
    const btnPrev = document.getElementById('users-prev');
    const btnNext = document.getElementById('users-next');
    const usersPages = document.getElementById('users-pages');
    const usersTotal = document.getElementById('users-total');

    const filterSearch = document.getElementById('filter-search');
    const filterGrade = document.getElementById('filter-grade');
    const filterBureau = document.getElementById('filter-bureau');
    const filterUsertype = document.getElementById('filter-usertype');
    const btnReset = document.getElementById('btn-filters-reset');
    const btnExportXlsx = document.getElementById('btn-export-xlsx');
    const btnExportPdf = document.getElementById('btn-export-pdf');

    // Auth guard
    let user = null;
    try { user = JSON.parse(localStorage.getItem('currentUser')); } catch {}
    if (!user || !user.token) {
        window.location.href = 'index.html';
        return;
    }
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

    const USERS_PAGE_SIZE = 5;
    let usersAllRows = [];
    let usersFilteredRows = [];
    let usersPage = 1;
    let usersMessage = '';
    let sortColIdx = 0;
    let sortDir = 'asc';
    let isEditMode = false;
    let editMatricule = null;

    const bureauxMap = new Map(); // Code_Bureau -> Nom_Bureau_Ar / Nom_Bureau
    let bureauxRows = [];

    const choiceOpts = {
        searchEnabled: true,
        shouldSort: false,
        itemSelectText: '',
        allowHTML: false,
        position: 'bottom',
    };

    let choicesGrade = null;
    let choicesCodeBr = null;
    let choicesUserType = null;
    let choicesFilterGrade = null;
    let choicesFilterBureau = null;
    let choicesFilterUsertype = null;

    function initChoices() {
        if (typeof window.Choices === 'undefined') return;
        try {
            if (selectGrade && !choicesGrade) choicesGrade = new window.Choices(selectGrade, { ...choiceOpts, searchEnabled: false });
            if (selectUserType && !choicesUserType) choicesUserType = new window.Choices(selectUserType, { ...choiceOpts, searchEnabled: false });
            if (filterGrade && !choicesFilterGrade) choicesFilterGrade = new window.Choices(filterGrade, { ...choiceOpts, searchEnabled: false });
            if (filterUsertype && !choicesFilterUsertype) choicesFilterUsertype = new window.Choices(filterUsertype, { ...choiceOpts, searchEnabled: false });
        } catch {}
    }

    function destroyFormChoices() {
        try { choicesGrade?.destroy(); } catch {}
        try { choicesCodeBr?.destroy(); } catch {}
        try { choicesUserType?.destroy(); } catch {}
        choicesGrade = null;
        choicesCodeBr = null;
        choicesUserType = null;
    }

    function rebuildFormChoices() {
        if (typeof window.Choices === 'undefined') return;
        try {
            if (selectGrade) choicesGrade = new window.Choices(selectGrade, { ...choiceOpts, searchEnabled: false });
            if (selectCodeBr) {
                choicesCodeBr = new window.Choices(selectCodeBr, { ...choiceOpts, searchEnabled: true, searchResultLimit: 50 });
            }
            if (selectUserType) choicesUserType = new window.Choices(selectUserType, { ...choiceOpts, searchEnabled: false });
        } catch {}
    }

    function setUsersLoading(isLoading) {
        if (usersLoaderRow) usersLoaderRow.style.display = isLoading ? '' : 'none';
    }

    function setUsersMessage(msg) {
        usersMessage = msg ? String(msg) : '';
        usersAllRows = [];
        usersFilteredRows = [];
        if (paginationWrap) paginationWrap.classList.add('d-none');
        if (usersTotal) usersTotal.textContent = usersMessage;
        if (tableBody) {
            tableBody.innerHTML = usersMessage
                ? `<tr><td colspan="8" class="text-center text-danger fw-semibold">${usersMessage}</td></tr>`
                : '';
        }
    }

    function sortFilteredRows() {
        // _userToRow: [Matricule, FR_Name, AR_Name, Grade, Code_BR, Pw, user_type, pw_changed, email]
        // UI sort triggers: 0 matricule, 1 AR_Name, 2 FR_Name, 3 email, 4 Grade, 5 Code_BR, 6 user_type
        const dir = sortDir === 'asc' ? 1 : -1;
        usersFilteredRows.sort((a, b) => {
            let va, vb;
            if (sortColIdx === 0) { // matricule numeric
                return (Number(a[0]) - Number(b[0])) * dir;
            }
            if (sortColIdx === 1) { // AR_Name
                va = String(a[2] || '').toLowerCase();
                vb = String(b[2] || '').toLowerCase();
                return va.localeCompare(vb) * dir;
            }
            if (sortColIdx === 2) { // FR_Name
                va = String(a[1] || '').toLowerCase();
                vb = String(b[1] || '').toLowerCase();
                return va.localeCompare(vb) * dir;
            }
            if (sortColIdx === 3) { // email
                va = String(a[8] || '').toLowerCase();
                vb = String(b[8] || '').toLowerCase();
                return va.localeCompare(vb) * dir;
            }
            if (sortColIdx === 4) { // grade
                va = String(a[3] || '');
                vb = String(b[3] || '');
                return va.localeCompare(vb) * dir;
            }
            if (sortColIdx === 5) { // bureau code
                return (Number(a[4]) - Number(b[4])) * dir;
            }
            if (sortColIdx === 6) { // user_type (النوع)
                va = String(a[6] || '').toLowerCase();
                vb = String(b[6] || '').toLowerCase();
                return va.localeCompare(vb) * dir;
            }
            return 0;
        });
    }

    function applyFilters() {
        const search = (filterSearch?.value || '').trim().toLowerCase();
        const grade = (filterGrade?.value || '').trim();
        const bureau = (filterBureau?.value || '').trim();
        const utype = (filterUsertype?.value || '').trim().toLowerCase();
        usersFilteredRows = usersAllRows.filter((row) => {
            if (grade && String(row[3] || '').trim() !== grade) return false;
            if (bureau && String(row[4] || '').trim() !== bureau) return false;
            if (utype && String(row[6] || '').trim().toLowerCase() !== utype) return false;
            if (search) {
                const mat = String(row[0] || '').toLowerCase();
                const fr = String(row[1] || '').toLowerCase();
                const ar = String(row[2] || '').toLowerCase();
                const email = String(row[8] || '').toLowerCase();
                if (!mat.includes(search) && !fr.includes(search) && !ar.includes(search) && !email.includes(search)) return false;
            }
            return true;
        });
        sortFilteredRows();
        usersPage = 1;
        renderUsersPage(usersPage);
    }

    function totalUsersPages() {
        return Math.max(1, Math.ceil(usersFilteredRows.length / USERS_PAGE_SIZE));
    }

    function updatePaginationUI() {
        if (usersMessage) {
            if (paginationWrap) paginationWrap.classList.add('d-none');
            if (usersTotal) usersTotal.textContent = usersMessage;
            return;
        }
        const pages = totalUsersPages();
        const totalFiltered = usersFilteredRows.length;
        const totalAll = usersAllRows.length;
        const show = totalFiltered > USERS_PAGE_SIZE;
        if (paginationWrap) paginationWrap.classList.toggle('d-none', !show);
        if (btnPrev) btnPrev.disabled = usersPage <= 1;
        if (btnNext) btnNext.disabled = usersPage >= pages;
        if (usersPages) {
            usersPages.innerHTML = '';
            for (let i = 1; i <= pages; i++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'programmes-page-number' + (i === usersPage ? ' is-active' : '');
                btn.textContent = i;
                btn.addEventListener('click', () => renderUsersPage(i));
                usersPages.appendChild(btn);
            }
        }
        if (usersTotal) {
            usersTotal.textContent = totalAll === totalFiltered
                ? `${totalAll} ${totalAll > 1 ? 'مستخدمين' : 'مستخدم'}`
                : `${totalFiltered} / ${totalAll} مستخدم`;
        }
    }

    function bureauLabel(code) {
        const c = String(code || '').trim();
        if (!c) return '—';
        const b = bureauxMap.get(c);
        if (b) return `${c} - ${b.ar || b.fr || ''}`;
        return c;
    }

    function renderUsersPage(page) {
        if (usersMessage) return;
        const pages = totalUsersPages();
        usersPage = Math.min(Math.max(1, page), pages);
        const start = (usersPage - 1) * USERS_PAGE_SIZE;
        const slice = usersFilteredRows.slice(start, start + USERS_PAGE_SIZE);

        tableBody.innerHTML = '';
        if (!slice.length) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">قائمة فارغة</td></tr>';
            updatePaginationUI();
            return;
        }

        slice.forEach((row) => {
            const tr = document.createElement('tr');
            const matricule = String(row[0] || '').trim();
            const isSelf = String(user.matricule || '').trim() === matricule;
            tr.dataset.matricule = matricule;
            const typeVal = String(row[6] || 'normal').trim().toLowerCase();
            const badgeCls = typeVal === 'admin' ? 'user-type-badge user-type-badge--admin' : 'user-type-badge user-type-badge--normal';
            const bLabel = bureauLabel(row[4]);
            const emailVal = String(row[8] || '').trim();
            tr.innerHTML = `
                <td><strong>${matricule}</strong></td>
                <td><span style="display:block;margin-right:34%;text-align:right;direction:rtl;white-space:normal;word-break:break-word;font-weight:700;font-size:0.82rem">${row[2] || ''}</span></td>
                <td><span style="display:block;margin-left:34%;text-align:left;direction:ltr;white-space:normal;word-break:break-word;font-size:0.78rem;color:#4a4458">${row[1] || ''}</span></td>
                <td><span style="display:block;direction:ltr;text-align:right;white-space:normal;word-break:break-all;font-size:0.76rem;color:#1e0f29">${emailVal || '<span class=\"text-muted\">—</span>'}</span></td>
                <td class="text-center"><span style="color:#7c3aed;font-weight:700;font-size:0.78rem">${row[3] || ''}</span></td>
                <td><span style="display:block;margin-right:25%;text-align:right;direction:rtl;white-space:normal;word-break:break-word;font-size:0.75rem">${bLabel}</span></td>
                <td><span class="${badgeCls}">${typeVal}</span></td>
                <td>
                    <div style="display:flex;gap:0.3rem;justify-content:center;flex-wrap:wrap">
                        <button type="button" class="user-action-btn user-action-edit" data-action="edit" data-matricule="${matricule}">تعديل</button>
                        ${isSelf ? '' : `<button type="button" class="user-action-btn user-action-delete" data-action="delete" data-matricule="${matricule}">حذف</button>`}
                    </div>
                </td>
            `;
            tr.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditUser(row));
            const delBtn = tr.querySelector('[data-action="delete"]');
            if (delBtn && !isSelf) {
                delBtn.addEventListener('click', () => deleteUser(matricule));
            }
            tableBody.appendChild(tr);
        });

        updatePaginationUI();
    }

    async function loadBureaux() {
        try {
            const res = await postAction('getAdminSheet', { sheet: 'Bureaux' });
            if (res && res.ok && Array.isArray(res.rows)) {
                bureauxRows = res.rows;
                bureauxMap.clear();
                // also populate filter select
                if (filterBureau) {
                    // keep existing choice instance handling
                    if (choicesFilterBureau) { try { choicesFilterBureau.destroy(); } catch {} choicesFilterBureau = null; }
                    filterBureau.innerHTML = '<option value="">الكل</option>';
                }
                if (selectCodeBr) {
                    selectCodeBr.innerHTML = '<option value="">اختر المكتب...</option>';
                }
                for (const r of bureauxRows) {
                    // Bureaux row: [Nom_Bureau, Code_Bureau, Region, Nom_Bureau_Ar] per _bureauToRow
                    const code = String(r[1] || '').trim();
                    const fr = String(r[0] || '').trim();
                    const ar = String(r[3] || '').trim();
                    if (!code) continue;
                    bureauxMap.set(code, { fr, ar });
                    if (filterBureau) {
                        const opt = document.createElement('option');
                        opt.value = code;
                        opt.textContent = `${code} - ${ar || fr}`;
                        filterBureau.appendChild(opt);
                    }
                    if (selectCodeBr) {
                        const opt2 = document.createElement('option');
                        opt2.value = code;
                        opt2.textContent = `${code} - ${ar || fr}`;
                        selectCodeBr.appendChild(opt2);
                    }
                }
                if (typeof window.Choices !== 'undefined') {
                    try {
                        if (selectCodeBr && !choicesCodeBr) {
                            choicesCodeBr = new window.Choices(selectCodeBr, { ...choiceOpts, searchEnabled: true, searchResultLimit: 50, shouldSort: false });
                        }
                        if (filterBureau && !choicesFilterBureau) {
                            choicesFilterBureau = new window.Choices(filterBureau, { ...choiceOpts, searchEnabled: true, searchResultLimit: 50, shouldSort: false });
                        }
                    } catch {}
                }
            }
        } catch (e) {
            console.error('loadBureaux error', e);
        }
    }

    async function loadUsers() {
        usersMessage = '';
        usersAllRows = [];
        usersFilteredRows = [];
        if (paginationWrap) paginationWrap.classList.add('d-none');
        if (usersTotal) usersTotal.textContent = '';
        tableBody.innerHTML = '';
        const loaderTr = document.createElement('tr');
        loaderTr.id = 'users-loader-row';
        loaderTr.innerHTML = '<td colspan="8" class="text-center py-4"><div class="spinner-border text-success" role="status" aria-label="Chargement"></div></td>';
        tableBody.appendChild(loaderTr);

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setUsersMessage('لا يوجد اتصال بالإنترنت');
            return;
        }

        const res = await postAction('getAdminSheet', { sheet: 'Users' });
        // remove loader
        const loader = document.getElementById('users-loader-row');
        if (loader) loader.remove();

        if (!res || !res.ok || !Array.isArray(res.rows)) {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                setUsersMessage('لا يوجد اتصال بالإنترنت');
                return;
            }
            if (res && (res.error === 'network_error' || res.error === 'http_error')) {
                setUsersMessage('لا يوجد اتصال بالإنترنت');
                return;
            }
            if (res && res.error === 'unauthorized') {
                if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
                else window.location.href = 'index.html';
                return;
            }
            setUsersMessage('تعذر تحميل المستعملين');
            return;
        }

        // filter out header if any (unlikely for Users) and sort by matricule asc default
        usersAllRows = res.rows.filter(r => Array.isArray(r) && r.length >= 2 && String(r[0]).trim() !== '' && String(r[0]).trim() !== 'Matricule');
        // default sort by matricule asc
        usersAllRows.sort((a, b) => Number(a[0]) - Number(b[0]));
        applyFilters();
    }

    function resetFormState() {
        form.reset();
        isEditMode = false;
        editMatricule = null;
        if (modalUserTitle) modalUserTitle.textContent = 'مستخدم جديد';
        if (btnText) btnText.textContent = 'إضافة المستعمل';
        if (pwHint) pwHint.textContent = '(مطلوبة للإضافة)';
        inputMatricule.removeAttribute('readonly');
        inputMatricule.style.backgroundColor = '';
        inputPw.placeholder = '••••••••';
        inputPw.required = false;
        if (inputEmail) inputEmail.value = '';
        try { choicesGrade?.setChoiceByValue(''); } catch {}
        try { choicesCodeBr?.setChoiceByValue(''); } catch {}
        try { choicesUserType?.setChoiceByValue('normal'); } catch {}
        if (selectGrade) selectGrade.value = '';
        if (selectCodeBr) selectCodeBr.value = '';
        if (selectUserType) selectUserType.value = 'normal';
        destroyFormChoices();
        rebuildFormChoices();
    }

    function openUserForm() {
        resetFormState();
        isEditMode = false;
        editMatricule = null;
        if (modalUser) modalUser.show();
        else if (modalUserFormEl) modalUserFormEl.style.display = 'block';
    }

    function closeUserForm() {
        if (modalUser) {
            try { modalUser.hide(); } catch {}
        }
        // reset will happen on hidden event
    }

    function openEditUser(row) {
        // row: [Matricule, FR_Name, AR_Name, Grade, Code_BR, Pw, user_type, pw_changed, email]
        isEditMode = true;
        editMatricule = String(row[0]).trim();
        if (modalUser) modalUser.show();
        setTimeout(() => {
            inputMatricule.value = String(row[0] || '');
            inputMatricule.setAttribute('readonly', 'readonly');
            inputMatricule.style.backgroundColor = '#f5f3ff';
            inputFrName.value = String(row[1] || '');
            inputArName.value = String(row[2] || '');
            if (inputEmail) inputEmail.value = String(row[8] || '').trim();
            if (modalUserTitle) modalUserTitle.textContent = 'تعديل المستعمل';
            if (btnText) btnText.textContent = 'حفظ التعديلات';
            if (pwHint) pwHint.textContent = '(اتركه فارغاً للإبقاء)';
            inputPw.value = '';
            inputPw.placeholder = 'اتركه فارغاً للإبقاء';
            const gradeVal = String(row[3] || '');
            const codeVal = String(row[4] || '');
            const typeVal = String(row[6] || 'normal').trim().toLowerCase() === 'admin' ? 'admin' : 'normal';
            try {
                if (choicesGrade) choicesGrade.setChoiceByValue(gradeVal);
                else if (selectGrade) selectGrade.value = gradeVal;
            } catch { if (selectGrade) selectGrade.value = gradeVal; }
            try {
                if (choicesCodeBr) choicesCodeBr.setChoiceByValue(codeVal);
                else if (selectCodeBr) selectCodeBr.value = codeVal;
            } catch { if (selectCodeBr) selectCodeBr.value = codeVal; }
            try {
                if (choicesUserType) choicesUserType.setChoiceByValue(typeVal);
                else if (selectUserType) selectUserType.value = typeVal;
            } catch { if (selectUserType) selectUserType.value = typeVal; }
            inputFrName.focus();
        }, 180);
    }

    async function deleteUser(matricule) {
        if (!matricule) return;
        if (String(user.matricule).trim() === String(matricule).trim()) {
            alert('لا يمكنك حذف حسابك الحالي');
            return;
        }
        if (!confirm(`هل أنت متأكد من حذف المستعمل ${matricule} ؟`)) return;
        const res = await postAction('adminDeleteUser', { matricule: String(matricule).trim() });
        if (res && res.ok) {
            await loadUsers();
        } else {
            let msg = 'تعذر حذف المستعمل';
            if (res && res.error === 'cannot_delete_self') msg = 'لا يمكنك حذف حسابك الحالي';
            else if (res && res.error === 'user_not_found') msg = 'المستعمل غير موجود';
            else if (res && res.error === 'unauthorized') msg = 'غير مصرح';
            else if (res && res.error === 'network_error') msg = 'لا يوجد اتصال بالإنترنت';
            alert(msg);
        }
    }

    // Form open/close (popup centered)
    btnOpenForm?.addEventListener('click', () => {
        openUserForm();
    });
    if (modalUserFormEl) {
        modalUserFormEl.addEventListener('hidden.bs.modal', () => {
            // reset after close
            form.reset();
            isEditMode = false;
            editMatricule = null;
            if (modalUserTitle) modalUserTitle.textContent = 'مستخدم جديد';
            if (btnText) btnText.textContent = 'إضافة المستعمل';
            if (pwHint) pwHint.textContent = '(مطلوبة للإضافة)';
            inputMatricule.removeAttribute('readonly');
            inputMatricule.style.backgroundColor = '';
            inputPw.placeholder = '••••••••';
            inputPw.required = false;
            try { choicesGrade?.setChoiceByValue(''); } catch {}
            try { choicesCodeBr?.setChoiceByValue(''); } catch {}
            try { choicesUserType?.setChoiceByValue('normal'); } catch {}
            if (selectGrade) selectGrade.value = '';
            if (selectCodeBr) selectCodeBr.value = '';
            if (selectUserType) selectUserType.value = 'normal';
            destroyFormChoices();
            rebuildFormChoices();
        });
        modalUserFormEl.addEventListener('shown.bs.modal', () => {
            // ensure Choices are rendered correctly inside modal
            try { choicesGrade?.showDropdown?.(); choicesGrade?.hideDropdown?.(); } catch {}
            try { choicesCodeBr?.showDropdown?.(); choicesCodeBr?.hideDropdown?.(); } catch {}
            inputMatricule.focus();
        });
    }

    // Filters
    filterSearch?.addEventListener('input', applyFilters);
    filterGrade?.addEventListener('change', applyFilters);
    filterBureau?.addEventListener('change', applyFilters);
    filterUsertype?.addEventListener('change', applyFilters);
    btnReset?.addEventListener('click', () => {
        if (filterSearch) filterSearch.value = '';
        if (filterGrade) filterGrade.value = '';
        if (filterBureau) filterBureau.value = '';
        if (filterUsertype) filterUsertype.value = '';
        try { choicesFilterGrade?.setChoiceByValue(''); } catch {}
        try { choicesFilterBureau?.setChoiceByValue(''); } catch {}
        try { choicesFilterUsertype?.setChoiceByValue(''); } catch {}
        applyFilters();
    });

    // Sort triggers
    const sortHeaders = document.querySelectorAll('.page-users .sort-trigger');
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
            usersPage = 1;
            renderUsersPage(usersPage);
            updateSortIndicators();
        });
    });
    updateSortIndicators();

    // Pagination
    btnPrev?.addEventListener('click', () => renderUsersPage(usersPage - 1));
    btnNext?.addEventListener('click', () => renderUsersPage(usersPage + 1));

    // Export XLSX - without Pw (Pw only for import), includes email after Nom FR
    btnExportXlsx?.addEventListener('click', async () => {
        if (typeof window === 'undefined' || !window.exportStyledAoA) { alert('XLSX library not loaded.'); return; }
        const data = usersFilteredRows;
        const headers = ['Matricule', 'Nom AR', 'Nom FR', 'Email', 'Grade', 'Code Bureau', 'Bureau', 'Type'];
        const aoa = [
            headers,
            ...data.map((r) => {
                const code = String(r[4] || '').trim();
                const b = bureauxMap.get(code);
                const bName = b ? (b.ar || b.fr) : '';
                return [r[0] ?? '', r[2] ?? '', r[1] ?? '', r[8] ?? '', r[3] ?? '', code, bName, r[6] ?? ''];
            }),
        ];
        const ok = await window.exportStyledAoA(`users_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Users', aoa);
        if (!ok) alert('XLSX library not loaded.');
    });

    // Export PDF via print window — includes email after Nom FR
    btnExportPdf?.addEventListener('click', () => {
        const rows = usersFilteredRows;
        const filenameBase = `users_${new Date().toISOString().slice(0, 10)}`;
        const theadCustom = `<thead><tr><th>المعرف</th><th>الاسم بالعربية</th><th>الاسم بالفرنسية</th><th>البريد الإلكتروني</th><th>الرتبة</th><th>المكتب</th><th>النوع</th></tr></thead>`;
        const tbodyHtml = rows.length === 0
            ? `<tbody><tr><td colspan="7" style="text-align:center;color:#777;">لا توجد نتائج</td></tr></tbody>`
            : `<tbody>${rows.map((r) => {
                const code = String(r[4] || '').trim();
                const b = bureauxMap.get(code);
                const bName = b ? (b.ar || b.fr) : code;
                return `<tr><td>${r[0] ?? ''}</td><td>${r[2] ?? ''}</td><td>${r[1] ?? ''}</td><td>${r[8] ?? ''}</td><td>${r[3] ?? ''}</td><td>${bName}</td><td>${r[6] ?? ''}</td></tr>`;
            }).join('')}</tbody>`;
        const tableHtml = `<table dir="rtl" style="width:100%;border-collapse:collapse;table-layout:fixed"><style>th,td{border:1px solid #999;padding:4px 6px;font-size:9pt;text-align:center;word-wrap:break-word}thead th{background:#f2f2f2;font-weight:700}</style>${theadCustom}${tbodyHtml}</table>`;
        const totalCount = rows.length;
        const totalLabel = totalCount === 1 ? 'مستخدم' : 'مستخدمين';
        const totalBadge = `<span style="position:absolute;left:10mm;font-size:14pt;font-weight:700;">${totalCount} ${totalLabel}</span>`;
        const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${filenameBase}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,"Segoe UI",Tahoma,sans-serif;direction:rtl;color:#111}h1{text-align:center;font-size:18pt;margin:0 0 10mm 0;position:relative}table{width:100%;border-collapse:collapse}tr{page-break-inside:avoid}</style></head><body><h1>${totalBadge}قائمة المستعملين</h1>${tableHtml}<script>(function(){try{document.title="${filenameBase}"}catch(e){}var hasInvokedPrint=false;function closeMeSoon(){setTimeout(function(){try{window.close()}catch(e){}},120)}window.onafterprint=closeMeSoon;if(window.matchMedia){var mql=window.matchMedia("print");var handler=function(e){if(hasInvokedPrint&&e&&e.matches===false)closeMeSoon()};if(mql&&typeof mql.addEventListener==="function")mql.addEventListener("change",handler);else if(mql&&typeof mql.addListener==="function")mql.addListener(handler)}window.addEventListener("focus",function(){if(hasInvokedPrint)closeMeSoon()});window.onload=function(){setTimeout(function(){window.focus();hasInvokedPrint=true;window.print()},200)}})()<\/script></body></html>`;
        const win = window.open('', '_blank');
        if (!win) { alert('Popup blocked.'); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
    });

    // Form submit — now includes email editable
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const matricule = String(inputMatricule.value || '').trim();
        const frName = String(inputFrName.value || '').trim();
        const arName = String(inputArName.value || '').trim();
        const grade = String(selectGrade.value || '').trim();
        const codeBr = String(selectCodeBr.value || '').trim();
        const emailRaw = String(inputEmail?.value || '').trim().toLowerCase();
        const pw = String(inputPw.value || '');
        const userType = String(selectUserType.value || 'normal').trim();

        if (!matricule || !frName || !arName || !grade || !codeBr || !userType) {
            alert('الرجاء تعمير جميع الخانات المطلوبة');
            return;
        }
        if (emailRaw && !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(emailRaw)) {
            alert('البريد الإلكتروني غير صالح');
            inputEmail?.focus();
            return;
        }
        if (!isEditMode && !pw.trim()) {
            alert('كلمة المرور مطلوبة عند الإضافة');
            inputPw.focus();
            return;
        }

        btnSubmit.disabled = true;
        if (btnText) btnText.textContent = isEditMode ? 'جاري الحفظ...' : 'جاري الإضافة...';
        if (btnSpinner) btnSpinner.classList.remove('d-none');

        const payload = {
            matricule,
            frName,
            arName,
            grade,
            codeBr,
            email: emailRaw,
            pw: pw.trim(),
            userType,
            isEdit: isEditMode
        };

        const res = await postAction('adminSaveUser', payload);

        btnSubmit.disabled = false;
        if (btnSpinner) btnSpinner.classList.add('d-none');
        if (btnText) btnText.textContent = isEditMode ? 'حفظ التعديلات' : 'إضافة المستعمل';

        if (res && res.ok) {
            closeUserForm();
            await loadUsers();
        } else {
            let msg = 'خطأ أثناء الحفظ';
            if (res) {
                if (res.error === 'duplicate_matricule') msg = 'المعرف موجود مسبقاً';
                else if (res.error === 'user_not_found') msg = 'المستعمل غير موجود';
                else if (res.error === 'missing_fields') msg = 'الرجاء تعمير جميع الخانات المطلوبة';
                else if (res.error === 'unauthorized') msg = 'غير مصرح';
                else if (res.error === 'network_error') msg = 'لا يوجد اتصال بالإنترنت';
            }
            alert(msg);
        }
    });

    // Init
    initChoices();
    await loadBureaux();
    await loadUsers();
});
