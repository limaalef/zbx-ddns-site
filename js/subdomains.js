// ============================================================
//  SUBDOMAINS MODULE — registro, listagem, seleção, exclusão
// ============================================================
const SubdomainsModule = (() => {

    let _cache = [];
    let _selectedId = null;
    let _onSelectCallbacks = [];
    let _refreshSeq = 0; // evita que uma resposta antiga sobrescreva uma mais nova

    function onSelect(cb) { _onSelectCallbacks.push(cb); }
    function getSelected() { return _cache.find(s => s.id === _selectedId) || null; }
    function getCached() { return _cache; }

    // ── Registro ──────────────────────────────────────────
    function initRegisterForm() {
        document.getElementById('domain-suffix-label').textContent = `-${CONFIG.BASE_DOMAIN}`;

        document.getElementById('register-btn').addEventListener('click', async () => {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal(() => _doRegister());
                return;
            }
            await _doRegister();
        });

        document.getElementById('subdomain-label').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('register-btn').click();
        });
    }

    async function _doRegister() {
        const input = document.getElementById('subdomain-label');
        const label = input.value.trim().toLowerCase();
        if (!label) { Utils.showNotification('Informe o nome do subdomínio', 'warning'); return; }

        const btn = document.getElementById('register-btn');
        btn.disabled = true;
        btn.textContent = 'Registrando...';

        try {
            const res = await AuthModule.authFetch('/subdomains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

            Utils.showNotification(`Subdomínio ${data.subdomain.fqdn} registrado!`, 'success');
            input.value = '';

            // Atualiza a lista e o script imediatamente com o retorno do próprio
            // POST (já traz o registro completo, com apiKey), sem depender de um
            // GET /subdomains subsequente — evita a lista "atrasar" por causa de
            // race conditions (ex.: um refresh disparado pelo login em paralelo).
            _cache = [data.subdomain, ..._cache.filter(s => s.id !== data.subdomain.id)];
            selectSubdomain(data.subdomain.id);

            // Reconcilia com o servidor em segundo plano (não bloqueia a UI).
            refresh();
        } catch (e) {
            Utils.showNotification(`Erro ao registrar: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Registrar';
        }
    }

    // ── Listagem ──────────────────────────────────────────
    async function refresh() {
        const listEl = document.getElementById('sub-list');
        const seq = ++_refreshSeq; // marca esta chamada como a mais recente

        if (!AuthModule.isLoggedIn()) {
            _cache = [];
            listEl.innerHTML = `<li class="empty-state">Faça login para ver seus subdomínios registrados.</li>`;
            _selectedId = null;
            _onSelectCallbacks.forEach(cb => cb(null));
            return;
        }

        // Só mostra "Carregando..." se ainda não há nada renderizado (evita
        // piscar a lista quando o refresh roda em segundo plano após um
        // registro/exclusão que já atualizou a UI otimisticamente).
        if (_cache.length === 0) listEl.innerHTML = `<li class="empty-state">Carregando...</li>`;

        try {
            const res = await AuthModule.authFetch('/subdomains');
            const data = await res.json();
            if (seq !== _refreshSeq) return; // uma chamada mais nova já assumiu, descarta esta
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            _cache = data.subdomains || [];
            _renderList();
        } catch (e) {
            if (seq !== _refreshSeq) return;
            listEl.innerHTML = `<li class="empty-state" style="color:var(--error-color)">
                Erro ao carregar subdomínios.</li>`;
        }
    }

    function _renderList() {
        const listEl = document.getElementById('sub-list');
        if (_cache.length === 0) {
            listEl.innerHTML = `<li class="empty-state">Nenhum subdomínio registrado ainda.</li>`;
            return;
        }

        listEl.innerHTML = _cache.map(s => `
            <li class="sub-item ${s.id === _selectedId ? 'selected' : ''}" data-id="${s.id}">
                <div class="sub-info">
                    <div class="sub-fqdn-group">
                        <span class="status-dot ${s.lastIp ? 'has-ip' : 'no-ip'}"></span>
                        <span class="sub-fqdn">${Utils.esc(s.fqdn)}</span>
                    </div>
                    <span class="sub-meta">
                        ${s.lastIp ? Utils.esc(s.lastIp) : 'Aguardando atualização'}
                        ${s.lastUpdateAt ? ' · ' + Utils.formatDateTime(s.lastUpdateAt) : ''}
                    </span>
                </div>
                <div class="sub-actions">
                    <button class="action-btn btn-ghost btn-xs" data-action="view-key" title="Ver chave da API">Ver chave</button>
                    <button class="action-btn btn-ghost btn-xs" data-action="rotate" title="Gerar nova chave">Renovar chave</button>
                    <button class="action-btn btn-danger btn-xs" data-action="delete" title="Excluir subdomínio">Excluir</button>
                </div>
            </li>
        `).join('');

        listEl.querySelectorAll('.sub-item').forEach(item => {
            const id = item.dataset.id;
            item.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                selectSubdomain(id);
            });
            item.querySelector('[data-action="view-key"]').addEventListener('click', (e) => {
                e.stopPropagation();
                _showKeyModal(id);
            });
            item.querySelector('[data-action="rotate"]').addEventListener('click', (e) => {
                e.stopPropagation();
                _confirmRotate(id);
            });
            item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                _confirmDelete(id);
            });
        });
    }

    function selectSubdomain(id) {
        _selectedId = id;
        _renderList();
        const sub = getSelected();
        _onSelectCallbacks.forEach(cb => cb(sub));
        document.getElementById('step-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Visualizar chave ─────────────────────────────────────
    function _showKeyModal(id) {
        const sub = _cache.find(s => s.id === id);
        if (!sub) return;
        if (!sub.apiKey) {
            Utils.showNotification('Chave não disponível nesta listagem. Selecione o subdomínio e tente novamente.', 'warning');
            return;
        }
        _ensureConfirmModal();
        _confirmModal.innerHTML = `
            <div class="modal-box confirm-box">
                <h3>Chave de <span class="confirm-fqdn">${Utils.esc(sub.fqdn)}</span></h3>
                <p>Essa chave só permite atualizar o IP deste subdomínio via <code>PUT /update-ip</code>.
                   Não compartilhe — cole-a apenas no script do passo 2.</p>
                <div class="key-display" id="key-display-value">${Utils.esc(sub.apiKey)}</div>
                <div style="margin-top:var(--sp-5)">
                    <button class="action-btn btn-ghost" style="flex:1" id="key-modal-close">Fechar</button>
                    <button class="action-btn btn-primary" style="flex:1" id="key-modal-copy">Copiar chave</button>
                </div>
            </div>`;
        _confirmModal.classList.add('open');
        document.getElementById('key-modal-close').addEventListener('click', () => _confirmModal.classList.remove('open'));
        document.getElementById('key-modal-copy').addEventListener('click', (e) => {
            Utils.copyToClipboard(sub.apiKey, e.currentTarget);
        });
    }

    // ── Exclusão (com confirmação) ──────────────────────────
    let _confirmModal = null;
    function _ensureConfirmModal() {
        if (_confirmModal) return;
        _confirmModal = document.createElement('div');
        _confirmModal.className = 'modal-overlay';
        document.body.appendChild(_confirmModal);
        _confirmModal.addEventListener('click', (e) => {
            if (e.target === _confirmModal) _confirmModal.classList.remove('open');
        });
    }

    function _confirmDelete(id) {
        const sub = _cache.find(s => s.id === id);
        if (!sub) return;
        _ensureConfirmModal();
        _confirmModal.innerHTML = `
            <div class="modal-box confirm-box">
                <h3>Excluir subdomínio?</h3>
                <p>Isso vai remover <span class="confirm-fqdn">${Utils.esc(sub.fqdn)}</span> e seu
                   registro DNS na Cloudflare. Essa ação não pode ser desfeita.</p>
                <div style="display:flex; gap:var(--sp-3)">
                    <button class="action-btn btn-ghost" style="flex:1" id="confirm-delete-cancel">Cancelar</button>
                    <button class="action-btn btn-danger" style="flex:1" id="confirm-delete-ok">Excluir</button>
                </div>
            </div>`;
        _confirmModal.classList.add('open');
        document.getElementById('confirm-delete-cancel').addEventListener('click', () => _confirmModal.classList.remove('open'));
        document.getElementById('confirm-delete-ok').addEventListener('click', async () => {
            _confirmModal.classList.remove('open');
            await _doDelete(id);
        });
    }

    async function _doDelete(id) {
        try {
            const res = await AuthModule.authFetch(`/subdomains/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            Utils.showNotification('Subdomínio excluído', 'success');
            if (_selectedId === id) {
                _selectedId = null;
                _onSelectCallbacks.forEach(cb => cb(null));
            }
            await refresh();
        } catch (e) {
            Utils.showNotification(`Erro ao excluir: ${e.message}`, 'error');
        }
    }

    // ── Rotação de chave (com confirmação) ──────────────────
    function _confirmRotate(id) {
        const sub = _cache.find(s => s.id === id);
        if (!sub) return;
        _ensureConfirmModal();
        _confirmModal.innerHTML = `
            <div class="modal-box confirm-box">
                <h3>Gerar nova chave?</h3>
                <p>A chave atual de <span class="confirm-fqdn">${Utils.esc(sub.fqdn)}</span> vai parar
                   de funcionar imediatamente. Você precisará atualizar o script no seu servidor.</p>
                <div style="display:flex; gap:var(--sp-3)">
                    <button class="action-btn btn-ghost" style="flex:1" id="confirm-rotate-cancel">Cancelar</button>
                    <button class="action-btn btn-primary" style="flex:1" id="confirm-rotate-ok">Gerar nova chave</button>
                </div>
            </div>`;
        _confirmModal.classList.add('open');
        document.getElementById('confirm-rotate-cancel').addEventListener('click', () => _confirmModal.classList.remove('open'));
        document.getElementById('confirm-rotate-ok').addEventListener('click', async () => {
            _confirmModal.classList.remove('open');
            await _doRotate(id);
        });
    }

    async function _doRotate(id) {
        try {
            const res = await AuthModule.authFetch(`/subdomains/${id}/rotate-key`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            Utils.showNotification('Nova chave gerada', 'success');
            await refresh();
            if (_selectedId === id) selectSubdomain(id);
        } catch (e) {
            Utils.showNotification(`Erro ao gerar chave: ${e.message}`, 'error');
        }
    }

    return { initRegisterForm, refresh, onSelect, getSelected, getCached, selectSubdomain };
})();

window.SubdomainsModule = SubdomainsModule;
AuthModule.onChange(() => SubdomainsModule.refresh());
