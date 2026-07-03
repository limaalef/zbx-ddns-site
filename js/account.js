// ============================================================
//  ACCOUNT BAR — login / consultar chave / consultar IP / excluir
// ============================================================
const AccountModule = (() => {

    let _selectedSubId = null; // usado pelas ações rápidas quando nada está selecionado no passo 1

    function render() {
        const bar = document.getElementById('account-bar');
        const user = AuthModule.getUser();

        if (!user) {
            bar.innerHTML = `
                <div class="account-info">
                    <span style="color:var(--text-secondary); font-size: var(--font-size-sm)">
                        Faça login para registrar e gerenciar seus subdomínios.
                    </span>
                </div>
                <div class="account-actions">
                    <button class="action-btn btn-primary" id="account-login-btn">Entrar com Google</button>
                </div>`;
            document.getElementById('account-login-btn')
                .addEventListener('click', () => AuthModule.openLoginModal(() => {
                    render();
                    SubdomainsModule.refresh();
                }));
            return;
        }

        bar.innerHTML = `
            <div class="account-info">
                <img class="avatar" src="${Utils.esc(user.picture || '')}" alt="" onerror="this.style.display='none'">
                <div class="who">
                    <strong>${Utils.esc(user.name)}</strong>
                    <small>${Utils.esc(user.email)}</small>
                </div>
            </div>
            <div class="account-actions tools-row">
                <button class="action-btn btn-ghost btn-sm" id="account-lookup-key-btn">Consultar por chave</button>
                <button class="action-btn btn-ghost btn-sm" id="account-lookup-ip-btn">Meu IP atual</button>
                <button class="action-btn btn-danger btn-sm" id="account-logout-btn">Sair</button>
            </div>`;

        document.getElementById('account-logout-btn').addEventListener('click', () => {
            AuthModule.logout();
            render();
            SubdomainsModule.refresh();
        });
        document.getElementById('account-lookup-key-btn').addEventListener('click', openLookupKeyModal);
        document.getElementById('account-lookup-ip-btn').addEventListener('click', showMyIp);
    }

    // ── Consultar dados por chave (apiKey) ──────────────────
    let _keyModal = null;
    function _ensureKeyModal() {
        if (_keyModal) return;
        _keyModal = document.createElement('div');
        _keyModal.className = 'modal-overlay';
        _keyModal.innerHTML = `
            <div class="modal-box" style="max-width:420px; text-align:left">
                <h3 style="text-align:center">Consultar subdomínio por chave</h3>
                <p style="text-align:center">Cole a chave (apiKey) de um subdomínio para ver seus dados.</p>
                <div class="form-field">
                    <label for="lookup-key-input">Chave</label>
                    <input type="text" id="lookup-key-input" placeholder="ddns_..." style="width:100%">
                </div>
                <div id="lookup-key-result" style="margin-top:var(--sp-4)"></div>
                <div style="margin-top:var(--sp-5)">
                    <button class="action-btn btn-ghost" id="lookup-key-cancel" style="flex:1">Fechar</button>
                    <button class="action-btn btn-primary" id="lookup-key-submit" style="flex:1">Consultar</button>
                </div>
            </div>`;
        document.body.appendChild(_keyModal);
        _keyModal.addEventListener('click', (e) => { if (e.target === _keyModal) _keyModal.classList.remove('open'); });
        _keyModal.querySelector('#lookup-key-cancel').addEventListener('click', () => _keyModal.classList.remove('open'));
        _keyModal.querySelector('#lookup-key-submit').addEventListener('click', _doLookupByKey);
    }

    function openLookupKeyModal() {
        _ensureKeyModal();
        _keyModal.querySelector('#lookup-key-result').innerHTML = '';
        _keyModal.querySelector('#lookup-key-input').value = '';
        _keyModal.classList.add('open');
    }

    async function _doLookupByKey() {
        const key = _keyModal.querySelector('#lookup-key-input').value.trim();
        const resultEl = _keyModal.querySelector('#lookup-key-result');
        if (!key) { Utils.showNotification('Informe a chave', 'warning'); return; }

        resultEl.innerHTML = `<p class="hint">Consultando...</p>`;
        try {
            // A consulta por chave usa a lista de subdomínios do usuário logado
            // (a chave não tem endpoint de leitura pública por segurança —
            // somente o dono ou admin pode visualizar os detalhes).
            const list = await SubdomainsModule.getCached();
            const found = list.find(s => s.apiKey === key);
            if (!found) {
                resultEl.innerHTML = `<p class="hint" style="color:var(--error-color)">
                    Nenhum subdomínio seu corresponde a essa chave.</p>`;
                return;
            }
            resultEl.innerHTML = `
                <div class="sub-item" style="cursor:default">
                    <div class="sub-info">
                        <div class="sub-fqdn-group">
                            <span class="sub-fqdn">${Utils.esc(found.fqdn)}</span>
                            <span class="status-dot ${found.lastIp ? 'has-ip' : 'no-ip'}"></span>
                        </div>
                        <span class="sub-meta">
                            IP atual: ${Utils.esc(found.lastIp || '— ainda não atualizado')}
                        </span>
                        <span class="sub-meta">Última atualização: ${Utils.formatDateTime(found.lastUpdateAt)}</span>
                    </div>
                </div>`;
        } catch (e) {
            resultEl.innerHTML = `<p class="hint" style="color:var(--error-color)">Erro ao consultar.</p>`;
        }
    }

    // ── Consultar IP atual (de quem está acessando a página) ─
    async function showMyIp() {
        try {
            const res = await fetch(`${CONFIG.API_BASE}/myip`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha ao consultar IP');
            Utils.showNotification(`Seu IP público é: ${data.ip}`, 'info');
        } catch (e) {
            Utils.showNotification('Não foi possível consultar seu IP agora.', 'error');
        }
    }

    return { render };
})();

window.AccountModule = AccountModule;
AuthModule.onChange(() => AccountModule.render());
