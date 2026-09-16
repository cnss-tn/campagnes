document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const matriculeEl = document.getElementById('login-matricule');
    const pwEl = document.getElementById('login-pw');
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');
    const submitTextEl = document.getElementById('login-submit-text');
    const submitSpinnerEl = document.getElementById('login-submit-spinner');

    const loginHeader = document.getElementById('login-header');
    const otpCard = document.getElementById('otp-card');
    const otpForm = document.getElementById('otp-form');
    const otpCodeEl = document.getElementById('otp-code');
    const otpErrorEl = document.getElementById('otp-error');
    const otpSuccessEl = document.getElementById('otp-success');
    const otpMaskedEl = document.getElementById('otp-masked-email');
    const otpSubmitBtn = document.getElementById('otp-submit');
    const otpSubmitText = document.getElementById('otp-submit-text');
    const otpSpinner = document.getElementById('otp-spinner');
    const otpResendBtn = document.getElementById('otp-resend');
    const otpBackBtn = document.getElementById('otp-back');

    let pendingMatricule = '';
    let pendingEmail = '';
    const PENDING_OTP_KEY = '_pendingOTP';
    function savePendingOTP(matricule, email, emailMasked) {
        try {
            const now = Date.now();
            localStorage.setItem(PENDING_OTP_KEY, JSON.stringify({
                matricule: String(matricule||'').trim(),
                email: String(email||'').trim().toLowerCase(),
                emailMasked: String(emailMasked||'').trim(),
                createdAt: now,
                expiresAt: now + 10*60*1000
            }));
        } catch {}
    }
    function loadPendingOTP() {
        try {
            const raw = localStorage.getItem(PENDING_OTP_KEY);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !o.matricule) return null;
            if (o.expiresAt && Date.now() > Number(o.expiresAt)) {
                try { localStorage.removeItem(PENDING_OTP_KEY); } catch {}
                return null;
            }
            return o;
        } catch { return null; }
    }
    function clearPendingOTP() {
        try { localStorage.removeItem(PENDING_OTP_KEY); } catch {}
        // also clear fallback code storage is kept for verification; don't delete _otp_ here — verified separately
    }

    function setError(msg) {
        if (!errorEl) return;
        if (!msg) {
            errorEl.classList.add('d-none');
            errorEl.textContent = '';
            return;
        }
        errorEl.textContent = msg;
        errorEl.classList.remove('d-none');
    }

    function setOtpError(msg) {
        if (!otpErrorEl) return;
        if (!msg) { otpErrorEl.classList.add('d-none'); otpErrorEl.textContent=''; return; }
        otpErrorEl.textContent = msg;
        otpErrorEl.classList.remove('d-none');
        if (otpSuccessEl) { otpSuccessEl.classList.add('d-none'); otpSuccessEl.textContent=''; }
    }
    function setOtpSuccess(msg) {
        if (!otpSuccessEl) return;
        if (!msg) { otpSuccessEl.classList.add('d-none'); otpSuccessEl.textContent=''; return; }
        otpSuccessEl.textContent = msg;
        otpSuccessEl.classList.remove('d-none');
        if (otpErrorEl) { otpErrorEl.classList.add('d-none'); otpErrorEl.textContent=''; }
    }

    function setLoading(isLoading) {
        const v = Boolean(isLoading);
        if (submitBtn) submitBtn.disabled = v;
        if (matriculeEl) matriculeEl.disabled = Boolean(isLoading);
        if (pwEl) pwEl.disabled = Boolean(isLoading);
        if (submitSpinnerEl) submitSpinnerEl.classList.toggle('d-none', !v);
        if (submitTextEl) submitTextEl.textContent = v ? 'تسجيل الدخول' : 'سجِّل الدخول';
    }
    function setOtpLoading(v) {
        if (otpSubmitBtn) otpSubmitBtn.disabled = Boolean(v);
        if (otpCodeEl) otpCodeEl.disabled = Boolean(v);
        if (otpSpinner) otpSpinner.classList.toggle('d-none', !v);
        if (otpSubmitText) otpSubmitText.textContent = v ? 'تحقق...' : 'تأكيد';
    }

    function showLoginForm() {
        if (form) form.classList.remove('d-none');
        if (loginHeader) loginHeader.classList.remove('d-none');
        if (otpCard) otpCard.classList.add('d-none');
        setOtpError(''); setOtpSuccess('');
        if (otpCodeEl) otpCodeEl.value='';
        pendingMatricule=''; pendingEmail='';
        clearPendingOTP();
    }
    function showOtpCard(maskedEmail) {
        if (form) form.classList.add('d-none');
        if (loginHeader) loginHeader.classList.add('d-none');
        setError('');
        if (otpCard) otpCard.classList.remove('d-none');
        if (otpMaskedEl) otpMaskedEl.textContent = maskedEmail || pendingEmail || 'بريدك';
        if (otpCodeEl) { otpCodeEl.value=''; otpCodeEl.focus(); }
        setOtpError(''); setOtpSuccess('');
        // persist across refresh — same code stays valid
        if (pendingMatricule) savePendingOTP(pendingMatricule, pendingEmail, maskedEmail || pendingEmail);
    }

    function defaultHomeForUser(userObj) {
        const isAdmin = userObj && String(userObj.userType || '').trim().toLowerCase() === 'admin';
        return isAdmin ? 'admin-main-page.html' : 'main-page.html';
    }

    function isForceRequired(userObj) {
        if (!userObj) return false;
        var isAdmin = String(userObj.userType || '').trim().toLowerCase() === 'admin';
        if (isAdmin) return false;
        var v = userObj.pw_changed;
        if (v == null && userObj.pwChanged != null) v = userObj.pwChanged;
        if (v == null) return true;
        return Number(v) === 0;
    }

    // Restore pending OTP after refresh — stay in code form with same code
    try {
        const pending = loadPendingOTP();
        if (pending && pending.matricule) {
            // don't restore if already has valid session
            const hasSession = (() => {
                try {
                    const cu = JSON.parse(localStorage.getItem('currentUser')||'null');
                    const exp = cu && Number(cu.sessionExpiresAt);
                    return cu && cu.token && Number.isFinite(exp) && Date.now() < exp;
                } catch { return false; }
            })();
            if (!hasSession) {
                pendingMatricule = pending.matricule;
                pendingEmail = pending.email || '';
                // show OTP immediately, same code still valid in Firestore/localStorage
                setTimeout(() => showOtpCard(pending.emailMasked || pending.email), 0);
                // don't redirect to login form
            }
        }
    } catch {}

    try {
        const existing = localStorage.getItem('currentUser');
        if (existing) {
            const u = JSON.parse(existing);
            const exp = u && typeof u === 'object' ? Number(u.sessionExpiresAt) : NaN;
            // Missing/invalid expiry (legacy session) counts as expired -> force re-login
            const isExpired = !Number.isFinite(exp) || Date.now() >= exp;
            if (u && typeof u === 'object' && u.token && !isExpired) {
                if (isForceRequired(u)) {
                    window.location.href = 'pw-force-change.html';
                } else {
                    window.location.href = defaultHomeForUser(u);
                }
                return;
            }
            localStorage.removeItem('currentUser');
        }
    } catch {}

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        setError('');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setError('لا يوجد اتصال بالإنترنت');
            return;
        }
        const matricule = matriculeEl?.value.trim() || '';
        const pw = pwEl?.value || '';
        if (!matricule || !pw) {
            setError('يرجى إدخال رقم التسجيل وكلمة المرور');
            return;
        }

        setLoading(true);
        let res;
        try {
            res = await postAction('login', { matricule, pw });
        } catch (err) {
            res = { ok: false, error: 'network_error' };
        }
        setLoading(false);

        if (!res?.ok) {
            if (res?.error === 'network_error' || res?.error === 'http_error' || res?.error === 'offline') {
                setError('لا يوجد اتصال بالإنترنت');
                return;
            }
            setError('بيانات الدخول غير صحيحة');
            return;
        }

        // If OTP is required (normal user with email and pw_changed==1)
        if (res.needOTP) {
            pendingMatricule = res.matricule || matricule;
            pendingEmail = res.email || '';
            const masked = res.emailMasked || res.email || pendingEmail;
            // Hide login, show OTP — hint already in static text
            showOtpCard(masked);
            return;
        }

        // No OTP (admin or user without email or forced) — immediate session
        if (!res.user || !res.token) {
            // Could be forced change case where needForceChange
            if (res.user && isForceRequired(res.user)) {
                try {
                    const startedAt = typeof window.getServerTime === 'function' ? window.getServerTime() : Date.now();
                    const ttl = typeof window.SESSION_TTL_MS === 'number' ? window.SESSION_TTL_MS : 240*60*1000;
                    localStorage.setItem('currentUser', JSON.stringify({ ...res.user, token: res.token || 'force-'+Date.now(), sessionStartedAt: startedAt, sessionExpiresAt: startedAt + ttl }));
                } catch {}
                window.location.href = 'pw-force-change.html';
                return;
            }
            setError('بيانات الدخول غير صحيحة');
            return;
        }

        try {
            const startedAt = typeof window.getServerTime === 'function' ? window.getServerTime() : Date.now();
            const ttl = typeof window.SESSION_TTL_MS === 'number' ? window.SESSION_TTL_MS : 240*60*1000;
            localStorage.setItem('currentUser', JSON.stringify({ ...res.user, token: res.token, sessionStartedAt: startedAt, sessionExpiresAt: startedAt + ttl }));
        } catch {}
        if (isForceRequired(res.user)) {
            window.location.href = 'pw-force-change.html';
            return;
        }
        // Always land on home after login (never restore the attempted page)
        window.location.href = defaultHomeForUser(res.user);
    });

    otpForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        setOtpError(''); setOtpSuccess('');
        const code = (otpCodeEl?.value || '').trim();
        if (!/^\d{6}$/.test(code)) {
            setOtpError('الرمز يجب أن يكون 6 أرقام');
            return;
        }
        if (!pendingMatricule) {
            setOtpError('انتهت الجلسة، أعد تسجيل الدخول');
            showLoginForm();
            return;
        }
        setOtpLoading(true);
        let res;
        try {
            res = await postAction('verifyLoginCode', { matricule: pendingMatricule, code });
        } catch { res = { ok:false, error:'network_error' }; }
        setOtpLoading(false);
        if (!res?.ok) {
            // reset input on wrong/expired code as requested
            if (otpCodeEl) { otpCodeEl.value = ''; try { otpCodeEl.focus(); } catch {} }
            if (res?.error === 'network_error') { setOtpError('لا يوجد اتصال بالإنترنت'); return; }
            if (res?.error === 'code_expired') { setOtpError('انتهت صلاحية الرمز — اضغط إعادة الإرسال'); return; }
            if (res?.error === 'invalid_code' || res?.error === 'code_not_found') { setOtpError('رمز غير صحيح — حاول مجدداً'); return; }
            setOtpError('خطأ في التحقق — حاول مجدداً');
            return;
        }
        // success — create 4h session and clear pending OTP (refresh will now go to app, not OTP)
        try {
            const startedAt = typeof window.getServerTime === 'function' ? window.getServerTime() : Date.now();
            const ttl = typeof window.SESSION_TTL_MS === 'number' ? window.SESSION_TTL_MS : 240*60*1000;
            localStorage.setItem('currentUser', JSON.stringify({ ...res.user, token: res.token, sessionStartedAt: startedAt, sessionExpiresAt: startedAt + ttl }));
            if (typeof window.scheduleAutoLogout === 'function') window.scheduleAutoLogout();
        } catch {}
        clearPendingOTP();
        setOtpSuccess('تم التأكيد — جارٍ الدخول...');
        // Force check
        if (isForceRequired(res.user)) { window.location.href = 'pw-force-change.html'; return; }
        // Always land on home after login (never restore the attempted page)
        window.location.href = defaultHomeForUser(res.user);
    });

    otpResendBtn?.addEventListener('click', async () => {
        if (!pendingMatricule) {
            const p = loadPendingOTP();
            if (p && p.matricule) pendingMatricule = p.matricule;
            else { setOtpError('انتهت الجلسة، أعد تسجيل الدخول'); return; }
        }
        setOtpError(''); setOtpSuccess('');
        // reset input from any old wrong/expired code before resending
        if (otpCodeEl) { otpCodeEl.value = ''; try { otpCodeEl.focus(); } catch {} }
        otpResendBtn.disabled = true;
        let res;
        try { res = await postAction('resendLoginCode', { matricule: pendingMatricule }); } catch { res={ok:false}; }
        otpResendBtn.disabled = false;
        if (!res?.ok) {
            setOtpError(res?.error==='email_required' ? 'البريد غير موجود — راجع الإدارة' : 'تعذر إعادة الإرسال — حاول مجدداً');
            return;
        }
        if (otpMaskedEl && res.emailMasked) {
            otpMaskedEl.textContent = res.emailMasked;
            // refresh pending expiry
            savePendingOTP(pendingMatricule, pendingEmail, res.emailMasked);
        } else {
            savePendingOTP(pendingMatricule, pendingEmail, pendingEmail);
        }
        setOtpSuccess('تمت إعادة الإرسال');
    });

    otpBackBtn?.addEventListener('click', () => {
        showLoginForm();
    });

    otpCodeEl?.addEventListener('input', () => {
        let v = otpCodeEl.value.replace(/\D/g,'').slice(0,6);
        if (otpCodeEl.value !== v) otpCodeEl.value = v;
        setOtpError(''); setOtpSuccess('');
    });
});
