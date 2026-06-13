/**
 * Script para Documento Offscreen
 * Objetivo: Realizar parsing de HTML de forma genérica.
 */
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Escuta apenas mensagens direcionadas a 'offscreen'
    if (request.target !== 'offscreen') {
        return;
    }

    const processRequest = async () => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(request.html, request.parserType || 'text/html');

            switch (request.action) {
                case 'parseDOM': {
                    const element = doc.querySelector(request.selector);
                    const value = element ? (element.value ?? element.textContent ?? element.innerHTML) : null;
                    sendResponse({ value });
                    break;
                }

                case 'parseDOMErrorMessages': {
                    const errorMsgElement = doc.querySelector('.msg_erro_geral');
                    const detailMsgElement = doc.querySelector('.msg_erro_detalhe');
                    const infoMsgElement = doc.querySelector('.msg.de.info');

                    let errorMessage = errorMsgElement?.textContent.trim() ?? null;
                    const detailMessage = detailMsgElement?.textContent.trim() ?? null;
                    const infoMessage = infoMsgElement?.textContent.trim() ?? null;

                    if (errorMessage && detailMessage) errorMessage += ` (${detailMessage})`;
                    sendResponse({ errorMessage: errorMessage || infoMessage || "Erro/Info não encontrado no HTML." });
                    break;
                }

                case 'parseDOMForInfoMessage': {
                    const infoMsgElement = doc.querySelector('.msg.de.info');
                    const infoMessage = infoMsgElement?.textContent.trim() ?? null;
                    sendResponse({ infoMessage });
                    break;
                }

                case 'parse-unidades-html': {
                    try {
                        const container = doc.querySelector('#c');
                        if (!container) {
                            sendResponse({ error: "Container 'div#c' não encontrado no HTML." });
                            return;
                        }

                        const parsedData = [];
                        const hierarchyStack = []; 
                        const municipioStack = [];
                        const codigoMunicipioStack = [];

                        // Função auxiliar interna para extrair o município e seu código com base nos parênteses
                        const extrairMunicipioUnidade = (unitName) => {
                            let municipio = "";
                            let codigoMunicipio = "";
                            
                            // Tenta encontrar conteúdo entre parênteses, ex: "(TEÓFILO OTONI)" ou "(3003)"
                            const matchParenteses = unitName.match(/\(([^)]+)\)/);
                            if (matchParenteses) {
                                const conteudo = matchParenteses[1].trim();
                                
                                // Se for puramente numérico, é o código do município (ex: (3003))
                                if (/^\d+$/.test(conteudo)) {
                                    codigoMunicipio = conteudo;
                                    // O nome do município geralmente está antes do parênteses
                                    let antes = unitName.split(matchParenteses[0])[0].trim();
                                    // Se possuir " - ", o município costuma estar após o hífen
                                    if (antes.includes(' - ')) {
                                        municipio = antes.split(' - ').slice(-1)[0].trim();
                                    } else {
                                        municipio = antes;
                                    }
                                } else {
                                    // Se for textual, o próprio conteúdo entre parênteses é o nome do município (ex: (BONFIM))
                                    municipio = conteudo;
                                    codigoMunicipio = "";
                                }
                            }
                            return { municipio, codigoMunicipio };
                        };

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
                            
                            // Ajusta o tamanho dos stacks de controle
                            hierarchyStack.length = stackIndex;
                            municipioStack.length = stackIndex;
                            codigoMunicipioStack.length = stackIndex;

                            hierarchyStack[stackIndex] = name;

                            // Extrai município declarado nesta linha
                            const extraido = extrairMunicipioUnidade(name);

                            // Regra de Herança Hierárquica:
                            // Se esta unidade declarar município entre parênteses, utiliza-o.
                            // Caso contrário, herda o município do nível superior da hierarquia (se stackIndex > 0)
                            if (extraido.municipio) {
                                municipioStack[stackIndex] = extraido.municipio;
                                codigoMunicipioStack[stackIndex] = extraido.codigoMunicipio;
                            } else if (stackIndex > 0 && municipioStack[stackIndex - 1]) {
                                municipioStack[stackIndex] = municipioStack[stackIndex - 1];
                                codigoMunicipioStack[stackIndex] = codigoMunicipioStack[stackIndex - 1];
                            } else {
                                municipioStack[stackIndex] = "";
                                codigoMunicipioStack[stackIndex] = "";
                            }

                            const hierarchyPath = hierarchyStack.join(' / ');
                            
                            parsedData.push({
                                hierarchyPath,
                                unitName: name,
                                code,
                                municipio: municipioStack[stackIndex] || "",
                                codigoMunicipio: codigoMunicipioStack[stackIndex] || "",
                                location: '', 
                                address: '',
                                cep: ''
                            });
                        });

                        if (parsedData.length === 0) {
                            sendResponse({ 
                                error: 'Nenhuma unidade encontrada na análise do HTML.',
                                html: request.html
                            });
                        } else {
                            sendResponse({ data: parsedData });
                        }

                    } catch (error) {
                        console.error('[Offscreen] Erro ao parsear HTML de unidades:', error);
                        sendResponse({ error: `Erro ao parsear HTML: ${error.message}` });
                    }
                    break;
                }

                default:
                    sendResponse({ error: `Ação desconhecida: ${request.action}` });
            }
        } catch (error) {
            console.error("Erro ao fazer parse do HTML no offscreen:", error);
            sendResponse({ error: error.message });
        }
    };

    processRequest();
    return true; // Mantém o canal de mensagem aberto para resposta assíncrona
});