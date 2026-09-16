// api_1.js — Firebase Firestore replacement for Google Apps Script backend
// Drop-in replacement: exposes the same global functions as the old api.js

const firebaseConfig = {
    apiKey: "AIzaSyBFe7MjZOUlUNgi18hBFHVNFPyVs95RALY",
    authDomain: "app-des-compagnies.firebaseapp.com",
    projectId: "app-des-compagnies",
    storageBucket: "app-des-compagnies.firebasestorage.app",
    messagingSenderId: "378629011040",
    appId: "1:378629011040:web:5010e5d94b2152f8e5b505"
};

/* ── Load Firebase compat SDK dynamically ──────────────────────────── */
function _loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

const _fbReady = (async () => {
    await _loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
    await _loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');
    firebase.initializeApp(firebaseConfig);
    return firebase.firestore();
})();

/* ── SHA-256 helper (matches Google Apps Script sha256Hex_) ────────── */
async function _sha256Hex(text) {
    const data = new TextEncoder().encode(String(text));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _passwordHashHex(matricule, pw) {
    return _sha256Hex(String(matricule || '').trim() + ':' + String(pw || ''));
}

function _passwordHash(matricule, pw) {
    return _passwordHashHex(matricule, pw).then(h => 'sha256:' + h);
}

function _isSha256Hex(s) {
    return /^[0-9a-f]{64}$/i.test(String(s || '').trim());
}

function _isRealEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return false;
    const re = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
    if (!re.test(e)) return false;
    if (e.includes('..')) return false;
    if (e.startsWith('.') || e.startsWith('@') || e.endsWith('.')) return false;
    const at = e.indexOf('@');
    if (at < 1 || at === e.length - 1) return false;
    const domain = e.slice(at + 1);
    if (!domain.includes('.')) return false;
    if (domain.startsWith('-') || domain.endsWith('-') || domain.startsWith('.') || domain.endsWith('.')) return false;
    const fakeTokens = ['fake', 'test', 'example', 'invalid', 'tempmail', 'mailinator', 'yopmail', 'throwaway', 'disposable', 'trashmail', 'guerrilla'];
    for (const t of fakeTokens) if (e.includes(t)) return false;
    const blocked = new Set(['example.com','example.tn','test.com','test.tn','fake.com','fake.tn','invalid.com','invalid.tn','mailinator.com','yopmail.com','tempmail.com','trashmail.com']);
    if (blocked.has(domain)) return false;
    const local = e.slice(0, at);
    if (['test','fake','admin','null','noreply','no-reply','user','example'].includes(local)) return false;
    if (local.length < 3) return false;
    return true;
}

function _maskEmail(email) {
    const e = String(email || '').trim();
    const at = e.indexOf('@');
    if (at < 2) return e.replace(/./g, '*');
    const local = e.slice(0, at);
    const domain = e.slice(at + 1);
    const maskedLocal = local[0] + '***' + local.slice(-1);
    const dot = domain.indexOf('.');
    if (dot < 1) return maskedLocal + '@***';
    const first = domain.slice(0, dot);
    const rest = domain.slice(dot);
    const maskedDomain = first[0] + '***' + rest;
    return maskedLocal + '@' + maskedDomain;
}

function _generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function _createLoginCode(matricule, email) {
    const code = _generateOTP();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000;
    const payload = {
        code: code,
        email: String(email).trim().toLowerCase(),
        matricule: String(matricule).trim(),
        createdAt: now,
        expiresAt: expiresAt,
        attempts: 0
    };
    // Try Firestore, fallback to localStorage if rules not deployed / offline
    try {
        const db = await _fbReady;
        await db.collection('login_codes').doc(String(matricule).trim()).set(payload);
    } catch (e) {
        console.warn('Firestore login_codes set failed, fallback to localStorage', e);
        try { localStorage.setItem('_otp_' + String(matricule).trim(), JSON.stringify(payload)); } catch {}
    }
    // also keep in localStorage for fallback verification
    try { localStorage.setItem('_otp_' + String(matricule).trim(), JSON.stringify(payload)); } catch {}
    return code;
}

async function _verifyLoginCode(matricule, inputCode) {
    const key = String(matricule).trim();
    // Try Firestore first
    try {
        const db = await _fbReady;
        const ref = db.collection('login_codes').doc(key);
        const snap = await ref.get();
        if (snap.exists) {
            const data = snap.data();
            if (data && data.code) {
                if (Date.now() > Number(data.expiresAt)) {
                    try { await ref.delete(); } catch {}
                    try { localStorage.removeItem('_otp_' + key); } catch {}
                    return { ok: false, error: 'code_expired' };
                }
                if (String(data.code).trim() !== String(inputCode).trim()) {
                    try { await ref.update({ attempts: (Number(data.attempts)||0)+1 }); } catch {}
                    return { ok: false, error: 'invalid_code' };
                }
                try { await ref.delete(); } catch {}
                try { localStorage.removeItem('_otp_' + key); } catch {}
                return { ok: true };
            }
        }
    } catch (e) { console.warn('Firestore verify failed, trying localStorage', e); }
    // Fallback to localStorage
    try {
        const raw = localStorage.getItem('_otp_' + key);
        if (!raw) return { ok: false, error: 'code_not_found' };
        const data = JSON.parse(raw);
        if (!data || !data.code) return { ok: false, error: 'code_not_found' };
        if (Date.now() > Number(data.expiresAt)) {
            try { localStorage.removeItem('_otp_' + key); } catch {}
            return { ok: false, error: 'code_expired' };
        }
        if (String(data.code).trim() !== String(inputCode).trim()) return { ok: false, error: 'invalid_code' };
        try { localStorage.removeItem('_otp_' + key); } catch {}
        return { ok: true };
    } catch { return { ok: false, error: 'code_not_found' }; }
}

async function _sendVerificationEmail(email, code, matriculeForLog = '') {
    const masked = _maskEmail(email);
    console.log(`[OTP] Sending code to ${masked}`);
    const isTestMode = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
    function showDebugCode() {
        if (!isTestMode) return;
        try {
            const dbg = document.getElementById('otp-debug-code');
            if (dbg) {
                dbg.textContent = `Code test (localhost): ${code}`;
                dbg.classList.remove('d-none');
                dbg.style.display = 'block';
            }
        } catch {}
    }
    // Vercel SMTP — single source of truth, no garbage
    const otpEndpoint = (typeof window !== 'undefined' && window.VERCEL_OTP_URL) ? window.VERCEL_OTP_URL : '/api/send-otp';
    try {
        const resp = await fetch(otpEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: String(email).trim().toLowerCase(), code: String(code).trim(), matricule: String(matriculeForLog || '').trim() })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data && data.ok) {
            console.log('[OTP] Vercel mail sent to', masked);
            if (!isTestMode) {
                try { const d = document.getElementById('otp-debug-code'); if (d) d.classList.add('d-none'); } catch {}
            } else {
                // keep debug visible for test account
                showDebugCode();
            }
            return true;
        }
        console.warn('[OTP] Vercel failed', resp.status, data);
        showDebugCode();
        return true;
    } catch (e) {
        console.warn('[OTP] Vercel fetch failed, fallback to debug', e);
        showDebugCode();
        return true;
    }
}

async function _passwordMatches(matricule, inputPw, storedPw) {
    const stored = String(storedPw || '').trim();
    if (!stored) return false;
    if (stored.indexOf('sha256:') === 0) {
        const h = await _passwordHash(matricule, inputPw);
        return h === stored;
    }
    if (_isSha256Hex(stored)) {
        const h = await _sha256Hex(String(matricule || '').trim() + ':' + String(inputPw || ''));
        return h === stored.toLowerCase();
    }
    return stored === String(inputPw || '').trim();
}

/* ── Session management (identical to old api.js) ──────────────────── */
const SESSION_TTL_MS = 240 * 60 * 1000; // 4 hours per spec (Session 4h auto-logout)
try { window.SESSION_TTL_MS = SESSION_TTL_MS; } catch {}

/* ── Server time offset (for session based on Firebase server, not user machine) ──
   Uses a real Firestore serverTimestamp write+read with RTT compensation.
   The old snap.readTime approach never worked in the Web SDK (undefined). */
let _serverTimeOffset = 0;
let _serverTimeSynced = false;

async function _syncServerTime(token) {
    try {
        const db = await _fbReady;
        const t0 = Date.now();
        const ref = db.collection('_time_sync').doc('ping');
        await ref.set({ at: firebase.firestore.FieldValue.serverTimestamp(), c: t0 });
        const snap = await ref.get();
        const t3 = Date.now();
        const data = snap.exists ? snap.data() : null;
        const ts = data && data.at;
        if (ts && typeof ts.toDate === 'function') {
            const serverNow = ts.toDate().getTime();
            // Assume symmetric latency: server time ≈ its stamp + half RTT
            _serverTimeOffset = (serverNow + (t3 - t0) / 2) - t3;
            _serverTimeSynced = true;
        }
        // best-effort cleanup, never blocks
        try { await ref.delete(); } catch {}
    } catch {}
}

function getServerTime() {
    return Date.now() + _serverTimeOffset;
}
try { window.getServerTime = getServerTime; } catch {}

if (getToken()) _syncServerTime();

function getCurrentUser() {
    try {
        const raw = localStorage.getItem('currentUser');
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u && typeof u === 'object' ? u : null;
    } catch { return null; }
}

function getToken() {
    const u = getCurrentUser();
    return u && u.token ? String(u.token) : '';
}

function getSessionExpiresAt() {
    const u = getCurrentUser();
    const v = u && u.sessionExpiresAt != null ? Number(u.sessionExpiresAt) : NaN;
    return Number.isFinite(v) ? v : null;
}

function isSessionExpired() {
    // No session at all (login / OTP pages) -> not "expired", just absent
    const u = getCurrentUser();
    if (!u || !u.token) return false;
    const exp = getSessionExpiresAt();
    // Legacy session without expiry (created before 4h limit) -> force re-login
    if (exp == null) return true;
    return getServerTime() >= exp;
}

function rememberPostLoginRedirect() {
    try {
        const file = String(window.location.pathname || '').split('/').pop() || '';
        if (file && file.endsWith('.html') && file !== 'index.html') {
            localStorage.setItem('postLoginRedirect', file);
        }
    } catch {}
}

async function _deleteSessionDoc(token) {
    const t = String(token || '').trim();
    if (!t) return;
    try {
        const db = await _fbReady;
        await db.collection('sessions').doc(t).delete();
    } catch {}
}

function logoutToLogin() {
    rememberPostLoginRedirect();
    let token = null;
    try {
        const u = getCurrentUser();
        token = u && u.token ? u.token : null;
        localStorage.removeItem('currentUser');
    } catch {}
    const go = () => { window.location.href = 'index.html'; };
    if (token) {
        // Wait for the server delete (capped at 2.5s) so the row is really
        // gone before navigation; next login overwrites anyway as fallback.
        try {
            Promise.race([
                _deleteSessionDoc(token).catch(() => {}),
                new Promise(r => setTimeout(r, 2500))
            ]).then(go, go);
        } catch { go(); }
    } else {
        go();
    }
}

function scheduleAutoLogout() {
    const u = getCurrentUser();
    if (!u || !u.token) return;
    const exp = getSessionExpiresAt();
    // Token but no expiry (legacy session) -> logout now, must re-login
    if (exp == null) { logoutToLogin(); return; }
    const delay = exp - getServerTime();
    if (delay <= 0) { logoutToLogin(); return; }
    try {
        if (window.__autoLogoutTimer) clearTimeout(window.__autoLogoutTimer);
        window.__autoLogoutTimer = setTimeout(logoutToLogin, delay);
    } catch { setTimeout(logoutToLogin, delay); }
}

function checkSessionNow() {
    try {
        if (isSessionExpired()) {
            var page = String(window.location.pathname || '').split('/').pop() || '';
            if (page !== 'index.html') logoutToLogin();
            else {
                try { localStorage.removeItem('currentUser'); } catch {}
                try { localStorage.removeItem('_pendingOTP'); } catch {}
            }
            return true;
        }
        // re-arm timer in case it was throttled/killed during sleep
        scheduleAutoLogout();
    } catch {}
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    scheduleAutoLogout();
    const el = document.getElementById('on-user-text');
    if (el) {
        const u = getCurrentUser();
        if (u) {
            const name = u.arName || u.frName || '';
            const bureau = u.bureauNameAr || u.bureauName || '';
            el.textContent = name + (bureau ? ' - ' + bureau : '');
        }
    }
});

// Re-check on tab restore (bfcache), wake from sleep, tab focus and every minute.
// setTimeout alone is throttled/killed during sleep, so restored tabs kept stale sessions.
try {
    window.addEventListener('pageshow', function () { checkSessionNow(); });
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkSessionNow();
    });
    window.addEventListener('focus', function () { checkSessionNow(); });
    window.addEventListener('online', function () { checkSessionNow(); });
    if (!window.__sessionWatchdog) {
        window.__sessionWatchdog = setInterval(checkSessionNow, 60 * 1000);
    }
} catch {}

try {
    window.getSessionExpiresAt = getSessionExpiresAt;
    window.isSessionExpired = isSessionExpired;
    window.logoutToLogin = logoutToLogin;
    window.scheduleAutoLogout = scheduleAutoLogout;
} catch {}

/* ── Collection helpers ────────────────────────────────────────────── */
const COLLECTIONS = { programmes: 'programmes', resultats: 'resultats', bureaux: 'bureaux', users: 'users' };

async function _getAllDocs(collectionName) {
    const db = await _fbReady;
    const snap = await db.collection(collectionName).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function _getDocById(collectionName, docId) {
    const db = await _fbReady;
    const snap = await db.collection(collectionName).doc(String(docId)).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function _addDoc(collectionName, data) {
    const db = await _fbReady;
    const ref = await db.collection(collectionName).add(data);
    return ref.id;
}

async function _setDoc(collectionName, docId, data) {
    const db = await _fbReady;
    await db.collection(collectionName).doc(String(docId)).set(data, { merge: true });
}

/* ── Date formatting helper ──────────────────────────────────────────── */
function _fmtDate(v) {
    if (!v) return '';
    let d;
    if (typeof v === 'object' && v.toDate) {
        // Firestore Timestamp
        d = v.toDate();
    } else {
        const s = String(v).trim();
        d = new Date(s);
        if (isNaN(d.getTime())) return s;
    }
    // Return YYYY-MM-DD in LOCAL timezone (not UTC)
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/* ── Data conversion: Firestore document ↔ array row ───────────────── */
// Programmes: [ID_Programme, Code_Bureau, Type_Campagne, Activite_Zone, Date_Fin, Date_Debut, Nb_Controleurs]
function _programmeToRow(doc) {
    let fin = _fmtDate(doc.Date_Fin);
    let debut = _fmtDate(doc.Date_Debut);
    if (fin && debut && fin < debut) { const t = fin; fin = debut; debut = t; }
    return [
        doc.ID_Programme || doc.id || '',
        doc.Code_Bureau != null ? doc.Code_Bureau : '',
        doc.Type_Campagne || '',
        doc.Activite_Zone || '',
        fin,
        debut,
        doc.Nb_Controleurs != null ? doc.Nb_Controleurs : ''
    ];
}

function _rowToProgramme(row) {
    return {
        ID_Programme: row[0] || '',
        Code_Bureau: row[1] != null ? row[1] : '',
        Type_Campagne: row[2] || '',
        Activite_Zone: row[3] || '',
        Date_Fin: row[4] || '',
        Date_Debut: row[5] || '',
        Nb_Controleurs: row[6] != null ? row[6] : ''
    };
}

// Resultats: [ID_Resultat, ID_Programme, Sal_Aff, Sal_NonAff, NonSal_Aff, NonSal_NonAff,
//             Trav_Declares, Trav_NonDeclares, insuff_totale, Mt_Reconnu, Mt_NonReconnu,
//             Controleurs_participants, Code_br]
function _resultatToRow(doc) {
    return [
        doc.ID_Resultat || doc.id || '',
        doc.ID_Programme || '',
        doc.Sal_Aff != null ? doc.Sal_Aff : 0,
        doc.Sal_NonAff != null ? doc.Sal_NonAff : 0,
        doc.NonSal_Aff != null ? doc.NonSal_Aff : 0,
        doc.NonSal_NonAff != null ? doc.NonSal_NonAff : 0,
        doc.Trav_Declares != null ? doc.Trav_Declares : 0,
        doc.Trav_NonDeclares != null ? doc.Trav_NonDeclares : 0,
        doc.insuff_totale != null ? doc.insuff_totale : 0,
        doc.Mt_Reconnu != null ? doc.Mt_Reconnu : 0,
        doc.Mt_NonReconnu != null ? doc.Mt_NonReconnu : 0,
        doc.Controleurs_participants != null ? doc.Controleurs_participants : 0,
        doc.Code_br != null ? doc.Code_br : ''
    ];
}

function _rowToResultat(row) {
    return {
        ID_Resultat: row[0] || '',
        ID_Programme: row[1] || '',
        Sal_Aff: row[2] != null ? row[2] : 0,
        Sal_NonAff: row[3] != null ? row[3] : 0,
        NonSal_Aff: row[4] != null ? row[4] : 0,
        NonSal_NonAff: row[5] != null ? row[5] : 0,
        Trav_Declares: row[6] != null ? row[6] : 0,
        Trav_NonDeclares: row[7] != null ? row[7] : 0,
        insuff_totale: row[8] != null ? row[8] : 0,
        Mt_Reconnu: row[9] != null ? row[9] : 0,
        Mt_NonReconnu: row[10] != null ? row[10] : 0,
        Controleurs_participants: row[11] != null ? row[11] : 0,
        Code_br: row[12] != null ? row[12] : ''
    };
}

// Bureaux: [Nom_Bureau, Code_Bureau, Region, Nom_Bureau_Ar]
function _bureauToRow(doc) {
    return [
        doc.Nom_Bureau || '',
        doc.Code_Bureau != null ? doc.Code_Bureau : '',
        doc.Region || '',
        doc.Nom_Bureau_Ar || ''
    ];
}

// Users: [Matricule, FR_Name, AR_Name, Grade, Code_BR, Pw, user_type, pw_changed, email]
function _userToRow(doc) {
    var _pwc = doc.pw_changed;
    if (_pwc == null && doc.Pw_changed != null) _pwc = doc.Pw_changed;
    if (_pwc == null && doc.pwChanged != null) _pwc = doc.pwChanged;
    if (_pwc == null) _pwc = String(doc.user_type || '').trim().toLowerCase() === 'admin' ? 1 : 0;
    return [
        doc.Matricule != null ? doc.Matricule : '',
        doc.FR_Name || '',
        doc.AR_Name || '',
        doc.Grade || '',
        doc.Code_BR != null ? doc.Code_BR : '',
        doc.Pw || '',
        doc.user_type || 'normal',
        Number(_pwc),
        doc.email || doc.Email || ''
    ];
}

function _rowToUser(row) {
    var _ut = row[6] || 'normal';
    var _pwcRaw = row[7];
    var _pwcVal = _pwcRaw != null && String(_pwcRaw).trim() !== '' ? Number(_pwcRaw) : (String(_ut || '').trim().toLowerCase() === 'admin' ? 1 : 0);
    return {
        Matricule: row[0] != null && String(row[0]).trim() !== '' ? Number(row[0]) : '',
        FR_Name: row[1] || '',
        AR_Name: row[2] || '',
        Grade: row[3] || '',
        Code_BR: row[4] != null && String(row[4]).trim() !== '' ? Number(row[4]) : '',
        Pw: row[5] || '',
        user_type: _ut,
        pw_changed: _pwcVal,
        email: row[8] ? String(row[8]).trim().toLowerCase() : ''
    };
}

/* ── Network check helper ───────────────────────────────────────────── */
async function _isOnline() {
    // Instant check: external fetch added 1-2s to every login, blocking OTP window
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return true;
}

/* ── Firestore query with network error detection ───────────────────── */
async function _safeFirestoreQuery(queryFn) {
    if (!(await _isOnline())) throw new Error('network_error');
    try {
        return await queryFn();
    } catch (err) {
        const msg = String(err && err.message ? err.message : err || '').toLowerCase();
        const code = err && err.code ? String(err.code).toLowerCase() : '';
        // Only true network errors — don't swallow permission / not-found errors
        const isNetworkError = msg.includes('unavailable') || msg.includes('failed to fetch') ||
            msg.includes('network request failed') || msg.includes('offline') ||
            msg.includes('aborted') || msg.includes('timeout') || msg.includes('could not reach') ||
            code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal';
        if (isNetworkError || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
            throw new Error('network_error');
        }
        throw err;
    }
}

/* ── User lookup helper ─────────────────────────────────────────────── */
async function _findUser(matricule) {
    const db = await _fbReady;
    const snap = await _safeFirestoreQuery(() => db.collection('users').where('Matricule', '==', Number(matricule)).limit(1).get());
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
}

async function _findBureau(codeBr) {
    const db = await _fbReady;
    const snap = await _safeFirestoreQuery(() => db.collection('bureaux').where('Code_Bureau', '==', Number(codeBr)).limit(1).get());
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
}

async function _createToken(matricule, codeBr) {
    const token = crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    const db = await _fbReady;
    const mat = String(matricule || '').trim();
    // Overwrite: one live session per user — drop previous session(s) first.
    // Wrapped so a cleanup failure never blocks login.
    try {
        const old = await _safeFirestoreQuery(() => db.collection('sessions').where('matricule', '==', mat).get());
        if (!old.empty) {
            const batch = db.batch();
            old.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    } catch {}
    await db.collection('sessions').doc(token).set({
        matricule: mat,
        codeBr: String(codeBr || '').trim(),
        createdAt: Date.now()
    });
    return token;
}

async function _getSession(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    const db = await _fbReady;
    const snap = await db.collection('sessions').doc(t).get();
    if (!snap.exists) return null;
    return snap.data();
}

/* ── Main API: postAction (drop-in replacement) ─────────────────────── */
async function postAction(action, payload = {}) {
    if (isSessionExpired()) { logoutToLogin(); return { ok: false, error: 'unauthorized' }; }

    try {
        /* ── login ── */
        if (action === 'login') {
            const matricule = String(payload.matricule || '').trim();
            const pw = String(payload.pw || '').trim();
            if (!matricule || !pw) return { ok: false, error: 'missing_credentials' };

            if (!(await _isOnline())) return { ok: false, error: 'network_error' };

            const user = await _findUser(matricule);
            if (!user) {
                return { ok: false, error: 'invalid_credentials' };
            }

            const storedPw = user.Pw || user.pw || user.password || '';
            const matches = await _passwordMatches(matricule, pw, storedPw);
            if (!matches) return { ok: false, error: 'invalid_credentials' };

            const codeBr = String(user.Code_BR || user.code_br || '').trim();
            const bureau = codeBr ? await _findBureau(codeBr) : null;
            var _pwcRaw = user.pw_changed;
            if (_pwcRaw == null && user.Pw_changed != null) _pwcRaw = user.Pw_changed;
            if (_pwcRaw == null && user.pwChanged != null) _pwcRaw = user.pwChanged;
            var _pwcVal = _pwcRaw != null ? Number(_pwcRaw) : (String(user.user_type || '').trim().toLowerCase() === 'admin' ? 1 : 0);
            if (!Number.isFinite(_pwcVal)) _pwcVal = String(user.user_type || '').trim().toLowerCase() === 'admin' ? 1 : 0;
            let email = String(user.email || user.Email || '').trim().toLowerCase();
            // Fallback for Ahmed Zakraoui test account (126359) if email not yet in Firestore
            if ((!email || !_isRealEmail(email)) && String(matricule).trim() === '126359') {
                email = 'ahmedzakraoui2018@gmail.com';
                try { const db2 = await _fbReady; await db2.collection('users').doc(user.id).update({ email: email, email_verified: false }); } catch (e) { console.warn('auto email update failed', e); }
            }
            const emailValid = email && _isRealEmail(email);

            // If normal user with valid email and pw already changed -> require OTP verification on every login
            if (_pwcVal === 1 && emailValid) {
                const code = await _createLoginCode(matricule, email);
                // Fire-and-forget: don't block OTP window on SMTP (Vercel cold start + Gmail = 4-10s)
                try { _sendVerificationEmail(email, code, matricule).catch(() => {}); } catch {}
                return {
                    ok: true,
                    needOTP: true,
                    email: email,
                    emailMasked: _maskEmail(email),
                    matricule: String(user.Matricule || '').trim(),
                    user: {
                        matricule: String(user.Matricule || '').trim(),
                        frName: String(user.FR_Name || '').trim(),
                        arName: String(user.AR_Name || '').trim(),
                        grade: String(user.Grade || '').trim(),
                        codeBr: codeBr,
                        bureauName: bureau ? String(bureau.Nom_Bureau || '').trim() : '',
                        bureauNameAr: bureau ? String(bureau.Nom_Bureau_Ar || '').trim() : '',
                        bureauRegion: bureau ? String(bureau.Region || '').trim() : '',
                        userType: String(user.user_type || '').trim(),
                        pw_changed: _pwcVal,
                        email: email
                    }
                };
            }

            const token = await _createToken(matricule, codeBr);
            await _syncServerTime(token);

            return {
                ok: true,
                token: token,
                user: {
                    matricule: String(user.Matricule || '').trim(),
                    frName: String(user.FR_Name || '').trim(),
                    arName: String(user.AR_Name || '').trim(),
                    grade: String(user.Grade || '').trim(),
                    codeBr: codeBr,
                    bureauName: bureau ? String(bureau.Nom_Bureau || '').trim() : '',
                    bureauNameAr: bureau ? String(bureau.Nom_Bureau_Ar || '').trim() : '',
                    bureauRegion: bureau ? String(bureau.Region || '').trim() : '',
                    userType: String(user.user_type || '').trim(),
                    pw_changed: _pwcVal,
                    email: email
                }
            };
        }

        /* ── verifyLoginCode (OTP) ── */
        if (action === 'verifyLoginCode') {
            const matricule = String(payload.matricule || '').trim();
            const code = String(payload.code || '').trim();
            if (!matricule || !code) return { ok: false, error: 'missing_fields' };
            const verify = await _verifyLoginCode(matricule, code);
            if (!verify.ok) return verify;
            const user = await _findUser(matricule);
            if (!user) return { ok: false, error: 'user_not_found' };
            const codeBr = String(user.Code_BR || user.code_br || '').trim();
            const bureau = codeBr ? await _findBureau(codeBr) : null;
            const token = await _createToken(matricule, codeBr);
            await _syncServerTime(token);
            var _pwcRaw2 = user.pw_changed;
            if (_pwcRaw2 == null && user.Pw_changed != null) _pwcRaw2 = user.Pw_changed;
            if (_pwcRaw2 == null && user.pwChanged != null) _pwcRaw2 = user.pwChanged;
            var _pwcVal2 = _pwcRaw2 != null ? Number(_pwcRaw2) : (String(user.user_type || '').trim().toLowerCase() === 'admin' ? 1 : 0);
            if (!Number.isFinite(_pwcVal2)) _pwcVal2 = String(user.user_type || '').trim().toLowerCase() === 'admin' ? 1 : 0;
            return {
                ok: true,
                token: token,
                user: {
                    matricule: String(user.Matricule || '').trim(),
                    frName: String(user.FR_Name || '').trim(),
                    arName: String(user.AR_Name || '').trim(),
                    grade: String(user.Grade || '').trim(),
                    codeBr: codeBr,
                    bureauName: bureau ? String(bureau.Nom_Bureau || '').trim() : '',
                    bureauNameAr: bureau ? String(bureau.Nom_Bureau_Ar || '').trim() : '',
                    bureauRegion: bureau ? String(bureau.Region || '').trim() : '',
                    userType: String(user.user_type || '').trim(),
                    pw_changed: _pwcVal2,
                    email: String(user.email || user.Email || '').trim().toLowerCase()
                }
            };
        }

        /* ── resendLoginCode ── */
        if (action === 'resendLoginCode') {
            const matricule = String(payload.matricule || '').trim();
            if (!matricule) return { ok: false, error: 'missing_fields' };
            if (!(await _isOnline())) return { ok: false, error: 'network_error' };
            const user = await _findUser(matricule);
            if (!user) return { ok: false, error: 'user_not_found' };
            const email = String(user.email || user.Email || '').trim().toLowerCase();
            if (!email || !_isRealEmail(email)) return { ok: false, error: 'email_required' };
            const code = await _createLoginCode(matricule, email);
            try { _sendVerificationEmail(email, code, matricule).catch(() => {}); } catch {}
            return { ok: true, emailMasked: _maskEmail(email) };
        }

        /* ── changePassword ── */
        if (action === 'changePassword') {
            const sess = await _getSession(getToken());
            if (!sess || !sess.matricule) return { ok: false, error: 'unauthorized' };
            const oldPw = String(payload.oldPw || '').trim();
            const newPw = String(payload.newPw || '').trim();
            const emailRaw = payload.email != null ? String(payload.email).trim().toLowerCase() : '';
            if (!oldPw || !newPw) return { ok: false, error: 'missing_fields' };

            const user = await _findUser(sess.matricule);
            if (!user) return { ok: false, error: 'user_not_found' };
            // email is now mandatory for forced change (normal users)
            const isAdminUser = String(user.user_type || '').trim().toLowerCase() === 'admin';
            if (!isAdminUser) {
                if (!emailRaw) return { ok: false, error: 'missing_fields' };
                if (!_isRealEmail(emailRaw)) return { ok: false, error: 'invalid_email' };
            }

            if (String(newPw).trim() === String(sess.matricule).trim()) return { ok: false, error: 'same_as_matricule' };
            if (String(newPw).trim() === String(oldPw).trim()) return { ok: false, error: 'same_as_old' };

            const storedPw = user.Pw || user.pw || user.password || '';
            const matches = await _passwordMatches(sess.matricule, oldPw, storedPw);
            if (!matches) return { ok: false, error: 'invalid_old_password' };

            const newHash = await _passwordHash(sess.matricule, newPw);
            const db = await _fbReady;
            const updateData = { Pw: newHash, pw_changed: 1 };
            if (emailRaw && _isRealEmail(emailRaw)) {
                updateData.email = emailRaw;
                updateData.email_verified = false;
            }
            await db.collection('users').doc(user.id).update(updateData);
            return { ok: true };
        }

        /* ── getAdminSheet (all data, no bureau filter) ── */
        if (action === 'getAdminSheet') {
            const sess = await _getSession(getToken());
            if (!sess) return { ok: false, error: 'unauthorized' };
            const sname = String(payload.sheet || '').trim();
            if (!['Programmes', 'Resultats', 'Bureaux', 'Users'].includes(sname)) return { ok: false, error: 'invalid_sheet' };

            if (sname === 'Users') {
                const adminUser = await _findUser(sess.matricule);
                if (!adminUser || String(adminUser.user_type || '').trim().toLowerCase() !== 'admin') return { ok: false, error: 'unauthorized' };
                const docs = await _getAllDocs('users');
                return { ok: true, rows: docs.map(_userToRow) };
            }

            const docs = await _getAllDocs(sname.toLowerCase());
            let rows;
            if (sname === 'Programmes') rows = docs.map(_programmeToRow);
            else if (sname === 'Resultats') rows = docs.map(_resultatToRow);
            else rows = docs.map(_bureauToRow);

            return { ok: true, rows: rows };
        }

        /* ── adminSaveUser (create / update) ── */
        if (action === 'adminSaveUser') {
            const sess = await _getSession(getToken());
            if (!sess || !sess.matricule) return { ok: false, error: 'unauthorized' };
            const adminUser = await _findUser(sess.matricule);
            if (!adminUser || String(adminUser.user_type || '').trim().toLowerCase() !== 'admin') return { ok: false, error: 'unauthorized' };

            const matricule = String(payload.matricule || '').trim();
            const frName = String(payload.frName || '').trim();
            const arName = String(payload.arName || '').trim();
            const grade = String(payload.grade || '').trim();
            const codeBr = String(payload.codeBr || '').trim();
            const emailRaw = payload.email != null ? String(payload.email).trim().toLowerCase() : null;
            const pwRaw = String(payload.pw || '');
            const userType = String(payload.userType || 'normal').trim().toLowerCase() === 'admin' ? 'admin' : 'normal';
            const isEdit = !!payload.isEdit;
            if (emailRaw !== null && emailRaw !== '' && !_isRealEmail(emailRaw)) return { ok: false, error: 'invalid_email' };

            if (!matricule || !frName || !arName || !grade || !codeBr) return { ok: false, error: 'missing_fields' };
            if (!isEdit && !pwRaw.trim()) return { ok: false, error: 'missing_fields' };

            const existing = await _findUser(matricule);
            if (!isEdit && existing) return { ok: false, error: 'duplicate_matricule' };
            if (isEdit && !existing) return { ok: false, error: 'user_not_found' };

            let pwHash = existing ? (existing.Pw || '') : '';
            if (pwRaw && pwRaw.trim() !== '') {
                pwHash = await _passwordHash(matricule, pwRaw.trim());
            }
            if (!pwHash) return { ok: false, error: 'missing_fields' };

            // pw_changed logic: explicit Excel value (Matricule|...|Pw|pw_changed) takes precedence, else auto (normal 0, admin 1)
            var explicitPwc = payload.pw_changed != null && String(payload.pw_changed).trim() !== '' ? Number(payload.pw_changed) : null;
            var existingPwc = null;
            if (existing && existing.pw_changed != null) existingPwc = Number(existing.pw_changed);
            else if (existing && existing.Pw_changed != null) existingPwc = Number(existing.Pw_changed);
            var pw_changedFinal;
            if (explicitPwc === 0 || explicitPwc === 1) {
                pw_changedFinal = explicitPwc;
                if (userType === 'admin' && pw_changedFinal === 0) pw_changedFinal = 1; // admin never forced
            } else if (!isEdit) {
                pw_changedFinal = userType === 'admin' ? 1 : 0;
            } else {
                if (pwRaw && pwRaw.trim() !== '') {
                    pw_changedFinal = userType === 'admin' ? 1 : 0;
                } else {
                    pw_changedFinal = existingPwc != null && Number.isFinite(Number(existingPwc)) ? Number(existingPwc) : (userType === 'admin' ? 1 : 0);
                }
            }

            let emailToSave = '';
            if (emailRaw !== null) {
                emailToSave = emailRaw;
            } else if (existing) {
                emailToSave = String(existing.email || existing.Email || '').trim().toLowerCase();
            }
            const docData = {
                Matricule: Number(matricule),
                FR_Name: frName,
                AR_Name: arName,
                Grade: grade,
                Code_BR: Number(codeBr),
                Pw: pwHash,
                user_type: userType,
                pw_changed: pw_changedFinal,
                email: emailToSave
            };
            if (emailRaw !== null && emailRaw !== String(existing ? (existing.email || existing.Email || '') : '').trim().toLowerCase()) {
                docData.email_verified = false;
            }

            const db = await _fbReady;
            // New users get readable IDs: "Matricule-FR_Name" (edits keep existing ID).
            const _frPart = String(frName || '').trim().replace(/\//g, '-');
            const _newId = _frPart ? String(matricule).trim() + '-' + _frPart : String(matricule).trim();
            const targetId = isEdit && existing && existing.id ? existing.id : _newId;
            await db.collection('users').doc(targetId).set(docData, { merge: true });
            // cleanup duplicates caused by previous bug (auto-id vs matricule-id with same Matricule)
            try {
                const snap = await db.collection('users').where('Matricule', '==', Number(matricule)).get();
                for (const d of snap.docs) {
                    if (d.id !== targetId) {
                        await db.collection('users').doc(d.id).delete().catch(() => {});
                    }
                }
            } catch {}
            return { ok: true };
        }

        /* ── adminDeleteUser ── */
        if (action === 'adminDeleteUser') {
            const sess = await _getSession(getToken());
            if (!sess || !sess.matricule) return { ok: false, error: 'unauthorized' };
            const adminUser = await _findUser(sess.matricule);
            if (!adminUser || String(adminUser.user_type || '').trim().toLowerCase() !== 'admin') return { ok: false, error: 'unauthorized' };
            const matricule = String(payload.matricule || '').trim();
            if (!matricule) return { ok: false, error: 'missing_fields' };
            if (String(sess.matricule).trim() === matricule) return { ok: false, error: 'cannot_delete_self' };
            const target = await _findUser(matricule);
            if (!target) return { ok: false, error: 'user_not_found' };
            const db = await _fbReady;
            // delete by found doc id and also by legacy "matricule" id if different
            await db.collection('users').doc(String(matricule)).delete().catch(() => {});
            if (target.id && String(target.id) !== String(matricule)) {
                await db.collection('users').doc(target.id).delete().catch(() => {});
            }
            return { ok: true };
        }

        /* ── deleteProgramme (bureau owner or admin) — robust lookup ── */
        if (action === 'deleteProgramme') {
            const sess = await _getSession(getToken());
            if (!sess || !sess.matricule) return { ok: false, error: 'unauthorized' };
            const idProgramme = String(payload.idProgramme || payload.id || payload.ID_Programme || '').trim();
            if (!idProgramme) return { ok: false, error: 'missing_fields' };
            console.log('[deleteProgramme] requested id=', idProgramme, 'sess', sess.matricule, 'codeBr', sess.codeBr);
            let prog = null;
            try { prog = await _getDocById('programmes', idProgramme); } catch (e) { console.warn('getDocById failed', e); }
            if (!prog) {
                try {
                    const db2 = await _fbReady;
                    const snap = await db2.collection('programmes').where('ID_Programme', '==', idProgramme).limit(1).get();
                    if (!snap.empty) {
                        const d = snap.docs[0];
                        prog = { id: d.id, ...d.data() };
                        console.log('[deleteProgramme] found via ID_Programme where', prog.id);
                    }
                } catch (e) { console.warn('where ID_Programme failed', e); }
            }
            if (!prog) {
                try {
                    const all = await _getAllDocs('programmes');
                    const found = all.find(d => String(d.ID_Programme || d.id || '').trim() === String(idProgramme).trim());
                    if (found) {
                        prog = found;
                        console.log('[deleteProgramme] found via getAllDocs fallback', prog.id);
                    }
                } catch (e) { console.warn('getAllDocs fallback failed', e); }
            }
            if (!prog) {
                console.warn('[deleteProgramme] not_found for', idProgramme);
                return { ok: false, error: 'not_found' };
            }
            const currentUser = await _findUser(sess.matricule);
            const isAdmin = currentUser && String(currentUser.user_type || '').trim().toLowerCase() === 'admin';
            const sessCode = String(sess.codeBr || '').trim();
            const progCode = String(prog.Code_Bureau != null ? prog.Code_Bureau : (prog.codeBr || '')).trim();
            console.log('[deleteProgramme] progCode', progCode, 'sessCode', sessCode, 'isAdmin', isAdmin);
            if (!isAdmin && progCode !== sessCode) return { ok: false, error: 'unauthorized' };
            const db = await _fbReady;
            try {
                const snap = await db.collection('resultats').where('ID_Programme', '==', String(prog.ID_Programme || idProgramme).trim()).get();
                if (!snap.empty) {
                    const batch = db.batch();
                    snap.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    console.log('[deleteProgramme] cascade deleted', snap.size, 'resultats');
                }
            } catch (e) { console.warn('cascade resultats delete failed', e); }
            const targetId = String(prog.id || idProgramme).trim();
            await db.collection('programmes').doc(targetId).delete().catch(() => {});
            if (String(idProgramme) !== targetId) {
                await db.collection('programmes').doc(String(idProgramme)).delete().catch(() => {});
            }
            // also delete any duplicate docs with same ID_Programme
            try {
                const dupSnap = await db.collection('programmes').where('ID_Programme', '==', String(prog.ID_Programme || idProgramme).trim()).get();
                for (const d of dupSnap.docs) {
                    if (d.id !== targetId && d.id !== String(idProgramme)) {
                        await db.collection('programmes').doc(d.id).delete().catch(()=>{});
                    }
                }
            } catch {}
            console.log('[deleteProgramme] deleted', targetId);
            return { ok: true };
        }

        /* ── getSheet (user-scoped) ── */
        if (action === 'getSheet') {
            const sess = await _getSession(getToken());
            if (!sess || !sess.codeBr) return { ok: false, error: 'unauthorized' };
            const sname = String(payload.sheet || '').trim();
            if (!['Programmes', 'Resultats', 'Bureaux'].includes(sname)) return { ok: false, error: 'invalid_sheet' };
            const code = String(sess.codeBr).trim();

            if (sname === 'Bureaux') {
                const docs = await _getAllDocs('bureaux');
                return { ok: true, rows: docs.map(_bureauToRow) };
            }

            if (sname === 'Programmes') {
                const docs = await _getAllDocs('programmes');
                const filtered = docs.filter(d => String(d.Code_Bureau || '').trim() === code);
                return { ok: true, rows: filtered.map(_programmeToRow) };
            }

            if (sname === 'Resultats') {
                const db = await _fbReady;
                const [progSnap, resSnap] = await Promise.all([
                    db.collection('programmes').where('Code_Bureau', '==', Number(code)).get(),
                    db.collection('resultats').get()
                ]);
                const myProgIds = new Set();
                progSnap.docs.forEach(d => {
                    const pid = d.data().ID_Programme || d.id;
                    if (pid) myProgIds.add(pid);
                });
                const rows = [];
                resSnap.docs.forEach(d => {
                    const r = { id: d.id, ...d.data() };
                    const cbr = String(r.Code_br || '').trim();
                    if (cbr === code) { rows.push(_resultatToRow(r)); return; }
                    if (cbr) return;
                    const pid = String(r.ID_Programme || '').trim();
                    if (pid && myProgIds.has(pid)) rows.push(_resultatToRow(r));
                });
                return { ok: true, rows: rows };
            }

            return { ok: true, rows: [] };
        }

        return { ok: false, error: 'unknown_action' };
    } catch (error) {
        console.error('postAction error:', error);
        const emsg = String(error && error.message ? error.message : error || '').toLowerCase();
        const ecode = error && error.code ? String(error.code).toLowerCase() : '';
        if (emsg.includes('network_error') || ecode === 'unavailable' || ecode === 'deadline-exceeded') {
            return { ok: false, error: 'network_error' };
        }
        if (ecode === 'permission-denied' || emsg.includes('permission') || emsg.includes('unauthenticated')) {
            // Don't mask permission as network — let caller handle as unauthorized or show real reason
            // For OTP flow fallback, still allow localStorage path
            return { ok: false, error: 'unauthorized' };
        }
        // Fallback: treat as network only if navigator says offline, otherwise generic
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'network_error' };
        return { ok: false, error: 'network_error' };
    }
}

/* ── Admin helpers exposed ─────────────────────────────────────────── */
try {
    window._passwordHash = _passwordHash;
    window._findUser = _findUser;
    window._userToRow = _userToRow;
} catch {}

/* ── pw_changed helper & force-change enforcement ───────────────────── */
function _isForcePwChangeRequired(u) {
    if (!u || typeof u !== 'object') return false;
    var ut = String(u.userType || u.user_type || '').trim().toLowerCase();
    if (ut === 'admin') return false;
    var v = u.pw_changed;
    if (v == null && u.pwChanged != null) v = u.pwChanged;
    if (v == null && u.Pw_changed != null) v = u.Pw_changed;
    // missing field => treat as 0 for normal (must change)
    if (v == null) return true;
    return Number(v) === 0;
}
function _shouldForceRedirect() {
    try {
        var u = getCurrentUser();
        if (!u || !u.token) return false;
        if (!_isForcePwChangeRequired(u)) return false;
        var page = String(window.location.pathname || '').split('/').pop() || '';
        var allowed = ['pw-force-change.html', 'index.html'];
        if (allowed.indexOf(page) !== -1) return false;
        return true;
    } catch { return false; }
}
try {
    window._isForcePwChangeRequired = _isForcePwChangeRequired;
    window._shouldForceRedirect = _shouldForceRedirect;
} catch {}
// Immediate redirect (before DOMContentLoaded) for protected pages
try {
    if (_shouldForceRedirect()) {
        window.location.href = 'pw-force-change.html';
    }
} catch {}
// Also on DOMContentLoaded as fallback
document.addEventListener('DOMContentLoaded', function () {
    try { if (_shouldForceRedirect()) window.location.href = 'pw-force-change.html'; } catch {}
});

/* ── Sequential IDs: P-BR-NNNNNNN / R-BR-NNNNNNN ───────────────────────
   Next number = max suffix of the IDs currently in the collection + 1.
   Deleted docs free their numbers: delete every P-80-* -> next is P-80-0000001.
   Scan + existence re-check + creation happen in ONE transaction, so two
   simultaneous creations can never receive the same ID.
   counters/{P|R}_{BR} only mirrors the last number (informational). */
const _TEMP_ID_RE = /^[PR]\d{10,}$/;

function _seqPad(n) { return String(n).padStart(7, '0'); }

async function _createSeqDoc(col, idField, kind, codeBr, data) {
    const db = await _fbReady;
    const br = String(codeBr || '').trim();
    const brEsc = br.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suffixRe = new RegExp('^' + kind + '-' + brEsc + '-(\\d{1,7})$');
    const lo = kind + '-' + br + '-';
    const hi = kind + '-' + br + '-' + String.fromCharCode(63743); // U+F8FF: prefix range end
    // NOTE: the Web SDK only allows DocumentReference in transaction.get(),
    // so the prefix scan runs OUTSIDE the transaction; the transaction only
    // re-checks candidate IDs (DocumentReference.get) and creates the doc.
    // On a write conflict the SDK auto-retries and the loop bumps past the
    // now-taken ID, so concurrent creations can never share an ID.
    const qsnap = await _safeFirestoreQuery(() => db.collection(col).where(idField, '>=', lo).where(idField, '<=', hi).get());
    let n = 0;
    qsnap.docs.forEach(d => {
        [d.id, String(((d.data() || {})[idField]) || '')].forEach(v => {
            const mt = suffixRe.exec(String(v).trim());
            if (mt) {
                const k = parseInt(mt[1], 10);
                if (Number.isFinite(k) && k > n) n = k;
            }
        });
    });
    n += 1;
    return db.runTransaction(async (t) => {
        let ref = db.collection(col).doc(kind + '-' + br + '-' + _seqPad(n));
        let check = await t.get(ref);
        while (check.exists) {
            n += 1;
            ref = db.collection(col).doc(kind + '-' + br + '-' + _seqPad(n));
            check = await t.get(ref);
        }
        const payload = Object.assign({}, data);
        payload[idField] = ref.id;
        t.set(ref, payload);
        t.set(db.collection('counters').doc(kind + '_' + br), { last: n, updatedAt: Date.now() }, { merge: true });
        return ref.id;
    });
}


/* ── Main API: saveData (drop-in replacement) ───────────────────────── */
async function saveData(sheetName, arrayValues) {
    if (isSessionExpired()) { logoutToLogin(); return false; }

    try {
        const sess = await _getSession(getToken());
        if (!sess || !sess.codeBr) return false;
        const code = String(sess.codeBr).trim();

        if (sheetName === 'Programmes') {
            const doc = _rowToProgramme(arrayValues);
            doc.Code_Bureau = code;
            const rawId = String(doc.ID_Programme || '').trim();
            // Edit existing campagne -> keep ID; otherwise create with next P-BR-NNNNNNN
            if (rawId && !_TEMP_ID_RE.test(rawId)) {
                const known = await _getDocById('programmes', rawId);
                if (known) {
                    await _setDoc('programmes', rawId, doc);
                    return rawId;
                }
            }
            return await _createSeqDoc('programmes', 'ID_Programme', 'P', code, doc);
        }

        if (sheetName === 'Resultats') {
            const doc = _rowToResultat(arrayValues);
            doc.Code_br = code;
            const rawId = String(doc.ID_Resultat || '').trim();
            const existing = rawId ? await _getDocById('resultats', rawId) : null;
            if (existing) {
                const db = await _fbReady;
                await db.collection('resultats').doc(existing.id).set(doc, { merge: true });
                return true;
            }
            // New resultat (empty, temp R+timestamp ID, or unknown ID) -> create with next R-BR-NNNNNNN
            await _createSeqDoc('resultats', 'ID_Resultat', 'R', code, doc);
            return true;
        }

        if (sheetName === 'Users') {
            // Admin-only: delegate to postAction adminSaveUser (keeps hashing & checks)
            const row = _rowToUser(arrayValues);
            const res = await postAction('adminSaveUser', {
                matricule: String(row.Matricule),
                frName: row.FR_Name,
                arName: row.AR_Name,
                grade: row.Grade,
                codeBr: String(row.Code_BR),
                pw: row.Pw && String(row.Pw).indexOf('sha256:') === 0 ? '' : String(row.Pw || ''),
                userType: row.user_type,
                isEdit: !!arrayValues._isEdit
            });
            return !!(res && res.ok);
        }

        return false;
    } catch (error) {
        console.error('saveData error:', error);
        return false;
    }
}

/* ── Main API: fetchData (drop-in replacement) ──────────────────────── */
async function fetchData(sheetName) {
    if (isSessionExpired()) { logoutToLogin(); return []; }
    try {
        if (sheetName === 'Programmes' || sheetName === 'Resultats') {
            const res = await postAction('getSheet', { sheet: sheetName });
            return res && res.ok && Array.isArray(res.rows) ? res.rows : [];
        }
        const docs = await _getAllDocs(sheetName.toLowerCase());
        if (sheetName === 'Bureaux') return docs.map(_bureauToRow);
        return docs.map(d => Object.values(d));
    } catch (error) {
        console.error('fetchData error:', error);
        return [];
    }
}

/* ── Helper: render zone activity with colored segments ─────────────── */
window.renderZoneActivity = function (v) {
    const raw = String(v ?? '').trim();
    if (!raw || !raw.includes('\u203a')) return raw || '\u2014';
    const parts = raw.split(/\s*\u203a\s*/);
    const colors = ['#048f40', '#1b9f41', '#3da937', '#a5ca1f'];
    return parts
        .map((p, i) => {
            const c = colors[i % colors.length];
            return '<span style="color:' + c + ';font-weight:' + (i === parts.length - 1 ? '700' : '600') + ';white-space:nowrap">' + p + '</span>';
        })
        .join('<span style="display:inline-flex;align-items:center;margin:0 0.15em;color:#048f40;font-size:75%">▶</span>');
};

/* ── Server time helper (for universal current year) ─────────────────── */
let _serverYearPromise = null;

function _getServerYear() {
    try {
        const cached = localStorage.getItem('_serverYear');
        if (cached) {
            const y = parseInt(cached, 10);
            if (y > 2000) return Promise.resolve(y);
        }
    } catch {}
    return (async () => {
        try {
            if (getToken()) await _syncServerTime();
            const now = new Date(getServerTime());
            const year = now.getFullYear();
            try { localStorage.setItem('_serverYear', String(year)); } catch {}
            return year;
        } catch {
            return new Date().getFullYear();
        }
    })();
}

window.getServerYear = function () {
    if (_serverYearPromise === null) {
        _serverYearPromise = _getServerYear();
    }
    return _serverYearPromise;
};
