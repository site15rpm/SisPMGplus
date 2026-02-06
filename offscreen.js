/**
 * Script para Documento Offscreen
 * Objetivo: Realizar parsing de HTML de forma genérica.
 */

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Escuta apenas mensagens direcionadas a 'offscreen'
    if (request.target === 'offscreen') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(request.html, 'text/html');

            if (request.action === 'parseDOM') {
                const element = doc.querySelector(request.selector);
                let value = element ? (element.value ?? element.textContent ?? element.innerHTML) : null;
                sendResponse({ value: value });

            } else if (request.action === 'parseDOMErrorMessages') {
                const errorMsgElement = doc.querySelector('.msg_erro_geral');
                const detailMsgElement = doc.querySelector('.msg_erro_detalhe');
                const infoMsgElement = doc.querySelector('.msg.de.info'); // Corrigido seletor com ponto

                let errorMessage = errorMsgElement?.textContent.trim() ?? null;
                const detailMessage = detailMsgElement?.textContent.trim() ?? null;
                const infoMessage = infoMsgElement?.textContent.trim() ?? null;

                if (errorMessage && detailMessage) errorMessage += ` (${detailMessage})`;
                 // Retorna erro OU info, priorizando erro.
                 sendResponse({ errorMessage: errorMessage || infoMessage || "Erro/Info não encontrado no HTML." });

            } else if (request.action === 'parseDOMForInfoMessage') { // Nova ação para info
                 const infoMsgElement = doc.querySelector('.msg.de.info'); // Corrigido seletor com ponto
                 const infoMessage = infoMsgElement?.textContent.trim() ?? null;
                 sendResponse({ infoMessage: infoMessage });

            } else if (request.action === 'parse-unidades-html') {
                // <-- ADICIONADO: Parser de Unidades -->
                try {
                    // Selecionar tabela de dados (classe t1)
                    const table = doc.querySelector("table.t1");
                    if (!table) {
                        sendResponse({ error: 'Tabela de dados (.t1) não encontrada no HTML retornado.' });
                        return;
                    }

                    const rows = Array.from(table.querySelectorAll("tbody tr"));
                    const parsedData = [];
                    
                    // Estado da hierarquia: índice = nível de indentação, valor = nome da unidade
                    let hierarchyState = [];

                    for (const row of rows) {
                        const cells = row.querySelectorAll("td");
                        if (cells.length === 0) continue; // Pula linhas de cabeçalho

                        const cellUnidade = cells[0];
                        
                        // Extrair nome da unidade limpo
                        let unitName = cellUnidade.textContent.trim();
                        unitName = unitName.replace(/\s+/g, ' ');

                        if (!unitName) continue;

                        // Calcular nível de indentação baseado em spans com classe 'ic'
                        const indentSpans = cellUnidade.querySelectorAll("span.ic");
                        let level = indentSpans.length;

                        // Atualizar estado da hierarquia
                        hierarchyState = hierarchyState.slice(0, level);
                        hierarchyState[level] = unitName;

                        // Construir a "Árvore Reversa"
                        const pathArray = hierarchyState.filter(u => u);
                        
                        // Deduplicação simples
                        const uniquePath = [];
                        pathArray.forEach((u, i) => {
                            if (i === 0 || u !== pathArray[i-1]) {
                                uniquePath.push(u);
                            }
                        });

                        // Reverte para ficar do menor para o maior
                        const fullPathString = uniquePath.slice().reverse().join("/");

                        // Extrair outras colunas
                        // Índices: 0:Unidade, 1:Cod, 2:Localidade, 3:CodLoc, 4:Endereço, 5:CEP
                        const code = cells[1]?.textContent?.trim() || "";
                        const location = cells[2]?.textContent?.trim() || "";
                        const address = cells[4]?.textContent?.trim() || "";
                        const cep = cells[5]?.textContent?.trim() || "";

                        parsedData.push({
                            hierarchyPath: fullPathString,
                            unitName: unitName,
                            code: code,
                            location: location,
                            address: address,
                            cep: cep
                        });
                    }

                    sendResponse({ data: parsedData });
                } catch (error) {
                    console.error('[Offscreen] Erro ao parsear HTML de unidades:', error);
                    sendResponse({ error: `Erro ao parsear HTML: ${error.message}` });
                }
                // <-- FIM DO PARSER DE UNIDADES -->

            } else {
                 sendResponse({ error: `Ação desconhecida: ${request.action}` });
            }

        } catch (error) {
            console.error("Erro ao fazer parse do HTML no offscreen:", error);
            sendResponse({ value: null, errorMessage: null, infoMessage: null, error: error.message });
        }
        return true; // Resposta assíncrona
    }
    return false; // Não lidou com a mensagem
});
