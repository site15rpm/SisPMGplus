/**
 * Script para Documento Offscreen
 * Objetivo: Realizar parsing de HTML de forma genérica.
 */
browser.runtime.onMessage.addListener(async (request, sender) => {
    // Escuta apenas mensagens direcionadas a 'offscreen'
    if (request.target !== 'offscreen') {
        return;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(request.html, request.parserType || 'text/html');

        switch (request.action) {
            case 'parseDOM': {
                const element = doc.querySelector(request.selector);
                const value = element ? (element.value ?? element.textContent ?? element.innerHTML) : null;
                return { value };
            }

            case 'parseDOMErrorMessages': {
                const errorMsgElement = doc.querySelector('.msg_erro_geral');
                const detailMsgElement = doc.querySelector('.msg_erro_detalhe');
                const infoMsgElement = doc.querySelector('.msg.de.info');

                let errorMessage = errorMsgElement?.textContent.trim() ?? null;
                const detailMessage = detailMsgElement?.textContent.trim() ?? null;
                const infoMessage = infoMsgElement?.textContent.trim() ?? null;

                if (errorMessage && detailMessage) errorMessage += ` (${detailMessage})`;
                return { errorMessage: errorMessage || infoMessage || "Erro/Info não encontrado no HTML." };
            }

            case 'parseDOMForInfoMessage': {
                const infoMsgElement = doc.querySelector('.msg.de.info');
                const infoMessage = infoMsgElement?.textContent.trim() ?? null;
                return { infoMessage };
            }

            case 'parse-unidades-html': {
                try {
                    const table = doc.querySelector("table.t1");
                    if (!table) {
                        return { error: 'Tabela de dados (.t1) não encontrada no HTML retornado.' };
                    }

                    const rows = Array.from(table.querySelectorAll("tbody tr"));
                    const parsedData = [];
                    let hierarchyState = [];

                    for (const row of rows) {
                        const cells = row.querySelectorAll("td");
                        if (cells.length === 0) continue;

                        let unitName = cells[0].textContent.trim().replace(/\s+/g, ' ');
                        if (!unitName) continue;

                        const level = cells[0].querySelectorAll("span.ic").length;
                        hierarchyState = hierarchyState.slice(0, level);
                        hierarchyState[level] = unitName;

                        const uniquePath = [...new Set(hierarchyState.filter(Boolean))];
                        const fullPathString = uniquePath.slice().reverse().join("/");

                        parsedData.push({
                            hierarchyPath: fullPathString,
                            unitName: unitName,
                            code: cells[1]?.textContent?.trim() || "",
                            location: cells[2]?.textContent?.trim() || "",
                            address: cells[4]?.textContent?.trim() || "",
                            cep: cells[5]?.textContent?.trim() || ""
                        });
                    }
                    return { data: parsedData };
                } catch (error) {
                    console.error('[Offscreen] Erro ao parsear HTML de unidades:', error);
                    return { error: `Erro ao parsear HTML: ${error.message}` };
                }
            }

            default:
                return { error: `Ação desconhecida: ${request.action}` };
        }
    } catch (error) {
        console.error("Erro ao fazer parse do HTML no offscreen:", error);
        return { error: error.message };
    }
});