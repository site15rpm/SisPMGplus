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
                    const container = doc.querySelector('#c');
                    if (!container) {
                        return { error: "Container 'div#c' não encontrado no HTML." };
                    }

                    const parsedData = [];
                    const hierarchyStack = []; 

                    let htmlContent = container.innerHTML;
                    
                    const h2Index = htmlContent.indexOf('</h2>');
                    if (h2Index !== -1) {
                        htmlContent = htmlContent.substring(h2Index + 5);
                    }

                    const lines = htmlContent.split(/<br\s*\/?>/i);

                    lines.forEach(lineHtml => {
                        lineHtml = lineHtml.trim();
                        if (!lineHtml || !lineHtml.includes('<i>')) return;

                        // Nível 1 = 1 span, Nível 2 = 2 spans, etc.
                        const level = (lineHtml.match(/<span class=['"]ic rel join-(middle|bottom)['"]/g) || []).length;
                        if(level === 0) return;

                        const codeMatch = lineHtml.match(/<i>(\d+)<\/i>/);
                        const code = codeMatch ? codeMatch[1] : null;
                        if (!code) return;

                        const tempDiv = doc.createElement('div');
                        // Remove imagens (ícone de telefone) para não interferir na extração de texto
                        tempDiv.innerHTML = lineHtml.replace(/<img[^>]+>/g, '');
                        
                        let name = tempDiv.textContent.replace(/-\s*\d+\s*$/, '').trim();
                        name = name.replace(/\s\s+/g, ' ');

                        if (!name) return;

                        const stackIndex = level - 1;
                        hierarchyStack.length = stackIndex;
                        hierarchyStack[stackIndex] = name;

                        const hierarchyPath = hierarchyStack.join(' / ');
                        
                        parsedData.push({
                            hierarchyPath,
                            unitName: name,
                            code,
                            location: '', 
                            address: '',
                            cep: ''
                        });
                    });

                    if (parsedData.length === 0) {
                        return { 
                            error: 'Nenhuma unidade encontrada na análise do HTML.',
                            html: request.html
                        };
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