// ============================================================
//  UTILS — notificação, clipboard, formatação
// ============================================================
const Utils = (() => {

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const icons  = { success: '', error: '✕', warning: '⚠', info: '' };
        notification.style.border = `1px solid ${colors[type] || colors.info}`;

        notification.innerHTML = `
            <span style="font-size:1.1em;">${icons[type] || icons.info}</span>
            <span>${_esc(message)}</span>
        `;

        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOutCenter 0.25s ease forwards';
            setTimeout(() => notification.remove(), 250);
        }, 3200);
    }

    async function copyToClipboard(text, btnEl) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // Fallback para contextos sem permissão de clipboard
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (_) {}
            document.body.removeChild(ta);
        }
        if (btnEl) {
            const original = btnEl.innerHTML;
            btnEl.classList.add('copied');
            btnEl.innerHTML = 'Copiado';
            setTimeout(() => {
                btnEl.classList.remove('copied');
                btnEl.innerHTML = original;
            }, 1600);
        }
        showNotification('Copiado para a área de transferência', 'success');
    }

    function formatDateTime(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return iso; }
    }

    function _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return { showNotification, copyToClipboard, formatDateTime, esc: _esc };
})();

window.Utils = Utils;
