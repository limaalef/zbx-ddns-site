// ============================================================
//  AUTH MODULE — Login Google + sessão (JWT próprio do backend)
//  Baseado no padrão de login usado em request.js
// ============================================================
const AuthModule = (() => {

    const SESSION_KEY = 'ddns_session';
    let user = _loadSession();
    let _onChangeCallbacks = [];

    function _loadSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function _saveSession(u) {
        user = u;
        if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
        else localStorage.removeItem(SESSION_KEY);
        _onChangeCallbacks.forEach(cb => cb(user));
    }

    function onChange(cb) { _onChangeCallbacks.push(cb); }

    function getUser() { return user; }
    function getToken() { return user?.token || null; }
    function isLoggedIn() { return !!user?.token; }

    function logout() {
        _saveSession(null);
        Utils.showNotification('Sessão encerrada', 'info');
        document.getElementById('subdomain-group').style.display = 'none'
    }

    // ── Modal de login ──────────────────────────────────────
    let _modal = null;
    function _ensureModal() {
        if (_modal) return;
        _modal = document.createElement('div');
        _modal.className = 'modal-overlay';
        _modal.id = 'login-modal';
        _modal.innerHTML = `
            <div class="modal-box">
                <h3>Entrar</h3>
                <p>Faça login para registrar e gerenciar seus subdomínios.</p>
                <button class="oauth-btn" id="login-google-btn">
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Continuar com Google
                </button>
                <button class="modal-close" id="login-modal-close">Cancelar</button>
            </div>`;
        document.body.appendChild(_modal);
        _modal.addEventListener('click', (e) => { if (e.target === _modal) closeLoginModal(); });
        document.getElementById('login-modal-close').addEventListener('click', closeLoginModal);
        document.getElementById('login-google-btn').addEventListener('click', _loginGoogle);
    }

    let _onLoginSuccess = null;
    function openLoginModal(onSuccess) {
        _ensureModal();
        _onLoginSuccess = onSuccess || null;
        _modal.classList.add('open');
    }
    function closeLoginModal() {
        _modal?.classList.remove('open');
    }

    // ── Google Identity Services ────────────────────────────
    function _loadGsiScript() {
        if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) return;
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        document.head.appendChild(s);
    }

    async function _loginGoogle() {
        if (!window.google?.accounts?.id) {
            _openOAuthPopup();
            return;
        }
        google.accounts.id.initialize({
            client_id: CONFIG.GOOGLE_CLIENT_ID,
            cancel_on_tap_outside: false,
            callback: async (response) => {
                try {
                    const res = await fetch(`${CONFIG.API_BASE}/auth/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ credential: response.credential }),
                    });
                    if (!res.ok) {
                        const e = await res.json().catch(() => ({}));
                        Utils.showNotification(e.error || 'Erro ao autenticar com Google', 'error');
                        return;
                    }
                    const data = await res.json();
                    const p = _decodeJwt(response.credential);
                    _saveSession({
                        name: data.user?.name || p.name || p.email,
                        email: data.user?.email || p.email,
                        picture: data.user?.picture || p.picture || '',
                        provider: 'google',
                        token: data.token,
                        isAdmin: data.isAdmin,
                    });
                    closeLoginModal();
                    Utils.showNotification(`Bem-vindo, ${user.name.split(' ')[0]}!`, 'success');
                    if (_onLoginSuccess) { _onLoginSuccess(); _onLoginSuccess = null; }
                } catch (err) {
                    Utils.showNotification('Erro ao autenticar com Google', 'error');
                }
            },
        });
        google.accounts.id.prompt();
    }

    function _openOAuthPopup() {
        const popup = window.open(
            `${CONFIG.API_BASE}/auth/google?origin=${encodeURIComponent(window.location.origin)}`,
            'oauth', 'width=480,height=600'
        );
        window.addEventListener('message', function handler(e) {
            if (!e.origin.includes('workers.dev') && e.origin !== new URL(CONFIG.API_BASE).origin) return;
            if (e.data?.type === 'oauth_success') {
                _saveSession(e.data.user);
                window.removeEventListener('message', handler);
                popup?.close();
                closeLoginModal();
                Utils.showNotification(`Bem-vindo, ${user.name.split(' ')[0]}!`, 'success');
                if (_onLoginSuccess) { _onLoginSuccess(); _onLoginSuccess = null; }
            } else if (e.data?.type === 'oauth_error') {
                Utils.showNotification(e.data.message || 'Erro ao autenticar', 'error');
            }
        });
    }

    function _decodeJwt(token) {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(
            atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        ));
    }

    // ── fetch autenticado (injeta Bearer token) ─────────────
    async function authFetch(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (user?.token) headers.Authorization = `Bearer ${user.token}`;
        const res = await fetch(`${CONFIG.API_BASE}${path}`, { ...options, headers });
        if (res.status === 401) {
            _saveSession(null);
            Utils.showNotification('Sua sessão expirou. Faça login novamente.', 'warning');
        }
        return res;
    }

    function init() {
        _loadGsiScript();
    }

    return {
        init, onChange, getUser, getToken, isLoggedIn, logout,
        openLoginModal, closeLoginModal, authFetch,
    };
})();

window.AuthModule = AuthModule;
document.addEventListener('DOMContentLoaded', () => AuthModule.init());
