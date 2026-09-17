document.addEventListener('DOMContentLoaded', () => {
    const alertEl = document.getElementById('account-alert');
    const form = document.getElementById('form-change-password');
    const panelEl = document.getElementById('change-password-panel');
    const loaderEl = document.getElementById('change-password-loader');
    const oldPwEl = document.getElementById('old-pw');
    const newPwEl = document.getElementById('new-pw');
    const newPw2El = document.getElementById('new-pw-2');
    const emailEl = document.getElementById('user-email');
    const submitBtn = document.getElementById('btn-change-password');
    const logoutBtn = document.getElementById('btn-logout');
    const warningMatriculeEl = document.getElementById('warn-matricule');

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
        if (emailEl) emailEl.disabled = v;
    }

    function isRealEmail(email) {
        const e = String(email || '').trim().toLowerCase();
        if (!e) return false;
        // RFC-ish but strict: no consecutive dots, valid chars, TLD >=2
        const re = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
        if (!re.test(e)) return false;
        if (e.includes('..')) return false;
        if (e.startsWith('.') || e.startsWith('@') || e.endsWith('.')) return false;
        const at = e.indexOf('@');
        if (at < 1 || at === e.length - 1) return false;
        const domain = e.slice(at + 1);
        if (!domain.includes('.')) return false;
        if (domain.startsWith('-') || domain.endsWith('-') || domain.startsWith('.') || domain.endsWith('.')) return false;
        // block fake / disposable / example domains
        const fakeTokens = ['fake', 'test', 'example', 'invalid', 'tempmail', 'mailinator', 'yopmail', 'throwaway', 'disposable', 'trashmail', 'guerrilla'];
        for (const t of fakeTokens) {
            if (e.includes(t)) return false;
        }
        const blockedDomains = new Set(['example.com','example.tn','test.com','test.tn','fake.com','fake.tn','invalid.com','invalid.tn','mailinator.com','yopmail.com','tempmail.com','trashmail.com']);
        if (blockedDomains.has(domain)) return false;
        // local part should not be trivial fake
        const local = e.slice(0, at);
        if (['test','fake','admin','null','noreply','no-reply','user','example'].includes(local)) return false;
        if (local.length < 3) return false;
        return true;
    }

    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('currentUser'));
    } catch {}

    if (!user || !user.token) {
        window.location.href = 'index.html';
        return;
    }

    // Admins with pw_changed=0 stay (forced like everyone else); anyone at 1 leaves for their home
    var isAdmin = user.userType && String(user.userType).trim().toLowerCase() === 'admin';
    var pwc = user.pw_changed;
    if (pwc == null && user.pwChanged != null) pwc = user.pwChanged;
    if (pwc == null) pwc = 0; // missing => force
    if (Number(pwc) === 1) {
        window.location.href = isAdmin ? 'admin-main-page.html' : 'main-page.html';
        return;
    }

    if (typeof window !== 'undefined' && typeof window.isSessionExpired === 'function' && window.isSessionExpired()) {
        if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
        else window.location.href = 'index.html';
        return;
    }

    // Show matricule in warning if element exists
    if (warningMatriculeEl && user.matricule) {
        warningMatriculeEl.textContent = String(user.matricule).trim();
    }
    // Prefill email if already known (e.g., from previous attempt)
    if (emailEl && user.email) {
        emailEl.value = String(user.email).trim();
    }

    // Disable navigation away: intercept clicks on nav links
    try {
        document.querySelectorAll('a.composed-menu-btn').forEach(function (a) {
            var href = (a.getAttribute('href') || '').trim();
            if (href === 'pw-force-change.html' || href === '' || href === '#') return;
            a.addEventListener('click', function (e) {
                try {
                    var cur = JSON.parse(localStorage.getItem('currentUser') || '{}');
                    var curPwc = cur.pw_changed;
                    if (curPwc == null && cur.pwChanged != null) curPwc = cur.pwChanged;
                    if (Number(curPwc) === 1) return;
                } catch {}
                e.preventDefault();
                showAlert('warning', 'يجب تغيير كلمة المرور وإدخال البريد الإلكتروني أولاً قبل الانتقال إلى صفحات أخرى');
                try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
            });
        });
    } catch {}

    logoutBtn?.addEventListener('click', () => {
        if (typeof window.logoutToLogin === 'function') window.logoutToLogin();
    });

    // live email validation hint
    emailEl?.addEventListener('blur', () => {
        const v = emailEl.value.trim();
        if (v && !isRealEmail(v)) {
            emailEl.classList.add('is-invalid');
        } else {
            emailEl.classList.remove('is-invalid');
        }
    });
    emailEl?.addEventListener('input', () => {
        emailEl.classList.remove('is-invalid');
        showAlert('', '');
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showAlert('', '');
        if (loaderEl) loaderEl.classList.add('d-none');
        if (panelEl) panelEl.classList.remove('d-none');
        const oldPw = oldPwEl?.value || '';
        const newPw = newPwEl?.value || '';
        const newPw2 = newPw2El?.value || '';
        const email = (emailEl?.value || '').trim().toLowerCase();

        if (!oldPw.trim() || !newPw.trim() || !newPw2.trim() || !email) {
            showAlert('warning', 'الرجاء ملء جميع الحقول (كلمات المرور + البريد الإلكتروني)');
            if (!email) emailEl?.focus();
            return;
        }
        if (!isRealEmail(email)) {
            showAlert('warning', 'يرجى إدخال بريد إلكتروني حقيقي صالح (يُمنع البريد الوهمي مثل test@example.com)');
            emailEl?.focus();
            emailEl?.classList.add('is-invalid');
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
        const res = await postAction('changePassword', { oldPw: oldPw, newPw: newPw, email: email }).catch(() => null);
        setLoading(false);

        if (!res || !res.ok) {
            const err = res && res.error ? String(res.error) : 'unknown_error';
            let msg = 'حدث خطأ أثناء تغيير كلمة المرور. حاول مرة أخرى.';
            if (err === 'invalid_old_password') msg = 'كلمة المرور القديمة غير صحيحة';
            else if (err === 'invalid_email' || err === 'fake_email') msg = 'البريد الإلكتروني غير صالح أو وهمي — يرجى إدخال بريد حقيقي';
            else if (err === 'missing_fields') msg = 'الرجاء ملء جميع الحقول (البريد مطلوب)';
            showAlert('danger', msg);
            if (panelEl) panelEl.classList.remove('d-none');
            if (loaderEl) loaderEl.classList.add('d-none');
            return;
        }

        // Success: update localStorage pw_changed to 1 and store email
        try {
            var curRaw = localStorage.getItem('currentUser');
            var cur = curRaw ? JSON.parse(curRaw) : {};
            cur.pw_changed = 1;
            cur.pwChanged = 1;
            cur.email = email;
            localStorage.setItem('currentUser', JSON.stringify(cur));
            user = cur;
        } catch {}

        if (oldPwEl) oldPwEl.value = '';
        if (newPwEl) newPwEl.value = '';
        if (newPw2El) newPw2El.value = '';
        if (emailEl) emailEl.value = email;
        showAlert('success', 'تم تغيير كلمة المرور وحفظ البريد بنجاح — جارٍ التحويل إلى الصفحة الرئيسية...');
        if (panelEl) panelEl.classList.add('d-none');
        if (loaderEl) loaderEl.classList.add('d-none');

        setTimeout(() => {
            var _isAdm = user && String(user.userType || '').trim().toLowerCase() === 'admin';
            window.location.href = _isAdm ? 'admin-main-page.html' : 'main-page.html';
        }, 1400);
    });
});
