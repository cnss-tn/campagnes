document.addEventListener('DOMContentLoaded', () => {
    const nameEls = document.querySelectorAll('.acc-name');
    const matriculeEl = document.getElementById('acc-matricule');
    const gradeEl = document.getElementById('acc-grade');
    const bureauEl = document.getElementById('acc-bureau');
    const emailEl = document.getElementById('acc-email');
    const subtitleEl = document.getElementById('account-subtitle');
    const logoutBtn = document.getElementById('btn-logout');
    const backBtn = document.getElementById('btn-back');

    const alertEl = document.getElementById('account-alert');
    const form = document.getElementById('form-change-password');
    const panelEl = document.getElementById('change-password-panel');
    const loaderEl = document.getElementById('change-password-loader');
    const oldPwEl = document.getElementById('old-pw');
    const newPwEl = document.getElementById('new-pw');
    const newPw2El = document.getElementById('new-pw-2');
    const submitBtn = document.getElementById('btn-change-password');

    function showAlert(kind, msg) {
        if (!alertEl) return;
        if (!msg) {
            alertEl.classList.add('d-none');
            alertEl.textContent = '';
            alertEl.classList.remove('alert-success', 'alert-danger', 'alert-warning');
            return;
        }
        alertEl.classList.remove('d-none');
        alertEl.classList.remove('alert-success', 'alert-danger', 'alert-warning');
        alertEl.classList.add(kind === 'success' ? 'alert-success' : kind === 'warning' ? 'alert-warning' : 'alert-danger');
        alertEl.textContent = msg;
    }

    function setLoading(isLoading) {
        const v = Boolean(isLoading);
        if (panelEl) panelEl.classList.toggle('d-none', v);
        if (loaderEl) loaderEl.classList.toggle('d-none', !v);
        if (submitBtn) submitBtn.disabled = v;
        if (oldPwEl) oldPwEl.disabled = v;
        if (newPwEl) newPwEl.disabled = v;
        if (newPw2El) newPw2El.disabled = v;
    }

    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('currentUser'));
    } catch {}

    if (!user || !user.token) {
        try {
            localStorage.setItem('postLoginRedirect', 'my-account.html');
        } catch {}
        window.location.href = 'index.html';
        return;
    }

    // Force pw change for normal users with pw_changed==0 -> redirect to force page
    var _isAdminMy = user.userType && String(user.userType).trim().toLowerCase() === 'admin';
    if (!_isAdminMy) {
        var _pwcMy = user.pw_changed; if (_pwcMy == null && user.pwChanged != null) _pwcMy = user.pwChanged;
        if (_pwcMy == null) _pwcMy = 0;
        if (Number(_pwcMy) === 0) { window.location.href = 'pw-force-change.html'; return; }
    }

    // Apply admin theme if user is admin
    if (user.userType && String(user.userType).trim().toLowerCase() === 'admin') {
        document.body.classList.add('page-admin');
    }

    // Auto logout when session TTL is reached (token expires server-side after ~6h)
    if (typeof window !== 'undefined' && typeof window.isSessionExpired === 'function' && window.isSessionExpired()) {
        if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
        else window.location.href = 'index.html';
        return;
    }

    const displayName = user.arName || user.frName || '';
    nameEls.forEach((el) => {
        el.textContent = displayName || '--';
    });
    if (matriculeEl) matriculeEl.textContent = user.matricule ? String(user.matricule).trim() : '--';
    const gradeMap = {
        'CU': 'رئيس وحدة المراقبة',
        'CC': 'رئيس خلية المراقبة الحسابية',
        'CT': 'رئيس خلية المراقبة الفنية',
    };
    const gradeRaw = user.grade ? String(user.grade).trim() : '';
    if (gradeEl) gradeEl.textContent = gradeMap[gradeRaw] || gradeRaw || '--';
    const bureauParts = [];
    if (user.bureauNameAr) bureauParts.push(String(user.bureauNameAr).trim());
    else if (user.bureauName) bureauParts.push(String(user.bureauName).trim());
    if (user.codeBr) bureauParts.push(`(${String(user.codeBr).trim()})`);
    if (bureauEl) bureauEl.textContent = bureauParts.length ? bureauParts.join(' ') : '--';
    if (emailEl) emailEl.textContent = user.email ? String(user.email).trim().toLowerCase() : '--';
    if (subtitleEl) subtitleEl.textContent = user.bureauRegion ? String(user.bureauRegion).trim() : '--';

    logoutBtn?.addEventListener('click', () => {
        if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
    });

    backBtn?.addEventListener('click', () => {
        window.location.href = 'interface1.html';
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showAlert('', '');
        if (loaderEl) loaderEl.classList.add('d-none');
        if (panelEl) panelEl.classList.remove('d-none');
        const oldPw = oldPwEl?.value || '';
        const newPw = newPwEl?.value || '';
        const newPw2 = newPw2El?.value || '';

        if (!oldPw.trim() || !newPw.trim() || !newPw2.trim()) {
            showAlert('warning', 'الرجاء ملء جميع الحقول');
            return;
        }
        if (newPw !== newPw2) {
            showAlert('warning', 'كلمتا المرور الجديدتان غير متطابقتين');
            return;
        }
        if (newPw.trim().length < 4) {
            showAlert('warning', 'كلمة المرور الجديدة يجب أن تكون على الأقل 4 أحرف');
            return;
        }
        var matStr = String(user.matricule || '').trim();
        if (matStr && newPw.trim() === matStr) {
            showAlert('warning', 'كلمة المرور الجديدة لا يجب أن تكون نفس رقم التسجيل (المعرف)');
            return;
        }
        if (newPw.trim() === oldPw.trim()) {
            showAlert('warning', 'كلمة المرور الجديدة يجب أن تكون مختلفة عن القديمة');
            return;
        }

        setLoading(true);
        const res = await postAction('changePassword', { oldPw, newPw }).catch(() => null);
        setLoading(false);

        if (!res || !res.ok) {
            const err = res && res.error ? String(res.error) : 'unknown_error';
            let msg = 'حدث خطأ أثناء تغيير كلمة المرور. حاول مرة أخرى.';
            if (err === 'invalid_old_password') msg = "كلمة المرور القديمة غير صحيحة";
            else if (err === 'same_as_matricule') msg = 'كلمة المرور الجديدة لا يجب أن تكون نفس رقم التسجيل (المعرف)';
            else if (err === 'same_as_old') msg = 'كلمة المرور الجديدة يجب أن تكون مختلفة عن القديمة';
            else if (err === 'invalid_email') msg = 'البريد الإلكتروني غير صالح أو وهمي';
            showAlert('danger', msg);
            if (panelEl) panelEl.classList.remove('d-none');
            if (loaderEl) loaderEl.classList.add('d-none');
            return;
        }

        if (oldPwEl) oldPwEl.value = '';
        if (newPwEl) newPwEl.value = '';
        if (newPw2El) newPw2El.value = '';
        showAlert('success', 'تم تغيير كلمة المرور بنجاح');
        if (panelEl) panelEl.classList.add('d-none');
        if (loaderEl) loaderEl.classList.add('d-none');
    });
});
