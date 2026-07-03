// ============================================================
//  APP — inicialização geral
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    AccountModule.render();
    SubdomainsModule.initRegisterForm();
    ScriptBuilderModule.initCopyButtons();

    // Renderiza o script/comandos sempre que a seleção mudar
    SubdomainsModule.onSelect((sub) => {
        ScriptBuilderModule.renderAll(sub);
    });

    // Estado inicial (sem seleção)
    ScriptBuilderModule.renderAll(null);

    // Se já houver sessão salva, carrega a lista de subdomínios
    if (AuthModule.isLoggedIn()) {
        SubdomainsModule.refresh();
    }
});
