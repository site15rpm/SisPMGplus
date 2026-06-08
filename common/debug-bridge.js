/**
 * SisPMG+ Debug Bridge (Main World)
 * Este script roda no contexto da página e envia eventos para o Content Script.
 */
window.sispmgSnapshot = function(label) {
    window.dispatchEvent(new CustomEvent('SISPMG_TRIGGER_SNAPSHOT', { 
        detail: label || 'console' 
    }));
    console.log(`[Debug] Snapshot solicitado: ${label || 'console'}. Aguardando processamento...`);
};
