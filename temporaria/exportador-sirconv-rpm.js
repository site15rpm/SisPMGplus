(async () => {
    console.log("%c[Exportador SisPMG+] Iniciando fluxo independente de extração...", "color: #28a745; font-weight: bold; font-size: 13px;");

    try {
        // 1. Localiza os dados de configuração injetados pela extensão no DOM
        const configElement = document.getElementById('sispmg-config-data');
        if (!configElement) throw new Error("Configuração da extensão não encontrada no DOM.");
        const config = JSON.parse(configElement.textContent);
        
        // 2. Calcula a URL base para os utilitários
        const baseUrl = config.uiModuleUrl.split('/modules/')[0];
        
        // 3. Importa dinamicamente as funções utilitárias necessárias
        console.log("[Exportador SisPMG+] Carregando utilitários...");
        const { rodarTesteConcedentesRPM } = await import(`${baseUrl}/common/busca-concedentes.js`);
        const { obterConveniosDeConcedentes } = await import(`${baseUrl}/common/busca-convenios.js`);

        // 4. Inicia a varredura da RPM
        // rodarTesteConcedentesRPM já possui lógica de UI (loader) integrada
        const concedentes = await rodarTesteConcedentesRPM();

        if (!concedentes || concedentes.length === 0) {
            console.warn("[Exportador SisPMG+] Nenhum concedente localizado na sua RPM.");
            return;
        }

        // 5. Extrai todos os convênios dos concedentes localizados
        console.log(`[Exportador SisPMG+] Extraindo convênios de ${concedentes.length} concedentes...`);
        
        // Se a UI global estiver disponível, usamos o loader para feedback
        const ui = window.uiModuleInstance;
        if (ui) ui.showLoader(`Extraindo convênios de ${concedentes.length} concedentes...`);

        const convenios = await obterConveniosDeConcedentes(concedentes, false, (atual, total, nome) => {
            const msg = `Processando ${atual}/${total}: ${nome}`;
            if (ui) ui.updateLoaderMessage(msg);
            else console.log(`[Exportador] ${msg}`);
        });

        if (ui) ui.hideLoader();

        if (!convenios || convenios.length === 0) {
            console.warn("[Exportador SisPMG+] Nenhum convênio foi extraído.");
            return;
        }

        console.log(`[Exportador SisPMG+] Extração concluída! ${convenios.length} registros obtidos.`);

        // 6. Gera o arquivo JSON e inicia o download
        const dataStr = new Date().toISOString().split('T')[0];
        const blob = new Blob([JSON.stringify(convenios, null, 2)], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = `extração_sirconv_rpm_${dataStr}.json`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        
        // Limpeza
        downloadAnchor.remove();
        URL.revokeObjectURL(url);

        console.log("%c[Exportador SisPMG+] Arquivo baixado com sucesso!", "color: green; font-weight: bold;");
        
    } catch (err) {
        console.error("[Exportador SisPMG+] Erro fatal na rotina:", err);
        if (window.uiModuleInstance) window.uiModuleInstance.hideLoader();
    }
})();
