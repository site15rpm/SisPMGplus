/**
 * Script de Exportação Definitivo SIRCONV (SisPMG+)
 * 
 * Este script utiliza a API de Downloads da extensão para salvar o arquivo 
 * diretamente no seu computador, independente de onde for executado.
 */

(async function exportarDadosSirconvFinal() {
    console.log("%c[SisPMG+] Preparando arquivos para salvamento...", "color: #b3a368; font-weight: bold;");

    chrome.storage.local.get(['sirconv_master_data', 'sirconv_audit_cache'], async (result) => {
        const master = result.sirconv_master_data || {};
        const audit = result.sirconv_audit_cache || {};
        const dataHoje = new Date().toISOString().split('T')[0];

        /**
         * Função para disparar o salvamento via API de Downloads
         */
        const salvarArquivo = async (conteudo, nomeBase) => {
            const nomeArquivo = `${nomeBase}_${dataHoje}.json`;
            const jsonStr = JSON.stringify(conteudo, null, 4);

            try {
                // Converter string para Base64 para garantir compatibilidade total no Service Worker
                const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
                const dataUrl = `data:application/json;base64,${base64}`;

                if (typeof chrome !== 'undefined' && chrome.downloads) {
                    // Usa a API de Downloads (Abre a janela de "Salvar Como")
                    chrome.downloads.download({
                        url: dataUrl,
                        filename: nomeArquivo,
                        saveAs: true
                    }, (downloadId) => {
                        if (chrome.runtime.lastError) {
                            console.error(`Erro no download: ${chrome.runtime.lastError.message}`);
                        } else {
                            console.log(`%c✓ Solicitação de salvamento enviada: ${nomeArquivo}`, "color: #28a745;");
                        }
                    });
                } else {
                    throw new Error("API chrome.downloads não encontrada.");
                }
            } catch (err) {
                console.error(`Falha ao salvar ${nomeArquivo}:`, err);
                // Fallback: Imprime no console se tudo falhar
                console.log("DADOS PARA CÓPIA MANUAL:", conteudo);
            }
        };

        // 1. Exportar Master Data
        if (Object.keys(master).length > 0) {
            await salvarArquivo(master, 'sirconv_master_data');
        } else {
            console.warn("Base Master Data está vazia.");
        }

        // 2. Exportar Audit Cache
        if (Object.keys(audit).length > 0) {
            await salvarArquivo(audit, 'sirconv_audit_cache');
        }
    });
})();
