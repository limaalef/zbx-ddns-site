// ============================================================
//  SCRIPT BUILDER — gera o script bash de DDNS e os comandos
//  do passo 3 (instalação/configuração no Linux) a partir do
//  subdomínio selecionado.
// ============================================================
const ScriptBuilderModule = (() => {
    // Linux
    const INSTALL_DIR = '/etc/zbx-ddns-client';
    const SCRIPT_NAME = 'ddns_update.sh';
    const LOG_FILE    = `${INSTALL_DIR}/update.log`;

    function buildScript(sub) {
        const apiKey = sub?.apiKey || 'COLE_SUA_CHAVE_AQUI';
        const fqdn   = sub?.fqdn   || 'SEU-ENDERECO.zbx-ddns.com';
        const apiBase = CONFIG.API_BASE;

        return `#!/bin/bash
set -uo pipefail

API_BASE="${apiBase}"
API_KEY="${apiKey}"
FQDN="${fqdn}"
LOG_FILE="${LOG_FILE}"
STATE_FILE="${INSTALL_DIR}/last_ip"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Descobre o IP público atual
CURRENT_IP=$(curl -fsS "$API_BASE/myip" 2>/dev/null | cut -d'"' -f4)
if [ -z "$CURRENT_IP" ]; then
    log "ERRO: não foi possível obter o IP"
    exit 1
fi

# Verifica se o IP alterou desde a última execução
LAST_IP=""
[ -f "$STATE_FILE" ] && LAST_IP=$(cat "$STATE_FILE")
if [ "$CURRENT_IP" = "$LAST_IP" ]; then
    exit 0
fi

# Envia o IP para a API
BODY_FILE=$(mktemp)
HTTP_STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' -X PUT "$API_BASE/update-ip" \\
    -H "X-Api-Key: $API_KEY" \\
    -H "Content-Type: application/json" \\
    --data "{\\"ip\\":\\"$CURRENT_IP\\"}")

log "$(cat "$BODY_FILE")"
rm -f "$BODY_FILE"

# Só grava o novo IP localmente se a API confirmou (HTTP 200).
[ "$HTTP_STATUS" = "200" ] && echo "$CURRENT_IP" > "$STATE_FILE"
`;
    }

    function buildFolderCommands(sub) {
        return `sudo mkdir -p ${INSTALL_DIR}
sudo nano ${INSTALL_DIR}/${SCRIPT_NAME}`;
    }

    function buildPermsCommands() {
        return `sudo chown USER:USER ${INSTALL_DIR}/${SCRIPT_NAME}
sudo chmod 700 ${INSTALL_DIR}/${SCRIPT_NAME}
sudo chmod 700 ${INSTALL_DIR}`;
    }

    function buildTestCommands() {
        return `${INSTALL_DIR}/${SCRIPT_NAME}
cat ${LOG_FILE}`;
    }

    function buildCronCommands() {
        return `# Abra o crontab do seu usuário
crontab -e

# Adicione a linha abaixo (executa a cada 5 minutos)
*/5 * * * * ${INSTALL_DIR}/${SCRIPT_NAME} >> ${LOG_FILE} 2>&1`;
    }

    function buildLogCommands() {
        return `# Acompanhar em tempo real
tail -f ${LOG_FILE}

# Ver as últimas 50 linhas
tail -n 50 ${LOG_FILE}`;
    }

    function buildUninstallCommands() {
        return `# Remove o agendamento do cron
crontab -l | grep -v '${INSTALL_DIR}/${SCRIPT_NAME}' | crontab -

# Remove os arquivos locais
sudo rm -rf ${INSTALL_DIR}`;
    }

    function renderAll(sub) {
        document.getElementById('script-code').textContent = buildScript(sub);
        document.getElementById('cmd-folder').textContent = buildFolderCommands(sub);
        document.getElementById('cmd-perms').textContent = buildPermsCommands();
        document.getElementById('cmd-test').textContent = buildTestCommands();
        document.getElementById('cmd-cron').textContent = buildCronCommands();
        document.getElementById('cmd-log').textContent = buildLogCommands();
        document.getElementById('cmd-uninstall').textContent = buildUninstallCommands();

        const hint = document.getElementById('step2-hint');
        if (sub) {
            hint.textContent = `Mostrando dados de: ${sub.fqdn}`;
            hint.style.color = 'var(--success-color)';
        } else {
            hint.textContent = 'Selecione um subdomínio na lista acima para gerar o script com seus dados.';
            hint.style.color = '';
        }
    }

    function initCopyButtons() {
        document.getElementById('copy-script-btn').addEventListener('click', (e) => {
            Utils.copyToClipboard(document.getElementById('script-code').textContent, e.currentTarget);
        });
        document.querySelectorAll('.copy-btn[data-copy-target]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = btn.dataset.copyTarget;
                const text = document.getElementById(targetId)?.textContent || '';
                Utils.copyToClipboard(text, e.currentTarget);
            });
        });
    }

    return { renderAll, initCopyButtons };
})();

window.ScriptBuilderModule = ScriptBuilderModule;
