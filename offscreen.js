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
                        const parserLogs = [];

                        const logParser = (msg) => {
                            parserLogs.push(msg);
                        };

                        const normalizarMunicipio = (str) => {
                            if (!str) return "";
                            return str
                                .toUpperCase()
                                .trim();
                        };

                        logParser("Iniciando análise do HTML de unidades...");

                        // Tenta extrair as informações de município e código padrão do título H2
                        let defaultMunicipio = "";
                        let defaultCodigoMunicipio = "";
                        const h2Element = container.querySelector('h2');
                        if (h2Element) {
                            const h2Text = h2Element.textContent;
                            logParser(`Título H2 da árvore identificado: "${h2Text}"`);
                            
                            // Extrai município do H2, ex: "(Teófilo Otoni)"
                            const matchMuni = h2Text.match(/\(([^)]+)\)/);
                            if (matchMuni) {
                                defaultMunicipio = normalizarMunicipio(matchMuni[1]);
                            }
                            
                            // Extrai o código numérico do H2 (ex: dentro de <i> ou no final)
                            const iElement = h2Element.querySelector('i');
                            if (iElement) {
                                defaultCodigoMunicipio = iElement.textContent.trim();
                            } else {
                                const matchCod = h2Text.match(/-\s*(\d+)\s*$/) || h2Text.match(/\s+(\d+)$/);
                                if (matchCod) {
                                    defaultCodigoMunicipio = matchCod[1];
                                }
                            }
                            logParser(`Configurações base extraídas do H2: defaultMunicipio="${defaultMunicipio}", defaultCodigoMunicipio="${defaultCodigoMunicipio}"`);
                        }

                        // Inicializa a pilha de nível raiz (índice 0) com os valores obtidos do H2
                        if (defaultMunicipio) {
                            municipioStack[0] = defaultMunicipio;
                            codigoMunicipioStack[0] = defaultCodigoMunicipio;
                            logParser(`Pilha inicializada no índice 0 com dados do H2 -> "${defaultMunicipio}" (${defaultCodigoMunicipio})`);
                        }

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
                        logParser(`Quantidade de linhas brutas no HTML: ${lines.length}`);

                        lines.forEach((lineHtml, idx) => {
                            lineHtml = lineHtml.trim();
                            if (!lineHtml || !lineHtml.includes('<i>')) return;

                            // Nível 1 = 1 span, Nível 2 = 2 spans, etc.
                            let level = (lineHtml.match(/<span class=['"]ic rel join-(middle|bottom)['"]/g) || []).length;
                            
                            const codeMatch = lineHtml.match(/<i>(\d+)<\/i>/);
                            const code = codeMatch ? codeMatch[1] : null;
                            if (!code) {
                                logParser(`Linha #${idx}: Ignorada pois não possui código identificador <i>.`);
                                return;
                            }

                            // Correção de herança raiz: Se o nível deu 0 (sem spans de recuo), mas possui código,
                            // tratamos como nível 1 (raiz) para preencher a base da árvore.
                            if (level === 0) {
                                logParser(`Linha #${idx} (código ${code}): Level 0 detectado na raiz. Promovido para Level 1.`);
                                level = 1;
                            }

                            const tempDiv = doc.createElement('div');
                            // Remove imagens (ícone de telefone) para não interferir na extração de texto
                            tempDiv.innerHTML = lineHtml.replace(/<img[^>]+>/g, '');
                            
                            let name = tempDiv.textContent.replace(/-\s*\d+\s*$/, '').trim();
                            name = name.replace(/\s\s+/g, ' ');

                            // Extrai município declarado nesta linha antes de remover os parênteses
                            const extraido = extrairMunicipioUnidade(name);

                            // Remove o nome do município ou código entre parênteses da seção/unidade (remove todos os parênteses)
                            name = name.replace(/\s*\([^)]+\)/g, '').trim();
                            name = name.replace(/\s\s+/g, ' ');

                            if (!name) {
                                logParser(`Linha #${idx} (código ${code}): Ignorada pois o nome textual está vazio após limpeza.`);
                                return;
                            }

                            const stackIndex = level - 1;
                            
                            logParser(`Processando Linha #${idx} (código ${code}): Nome="${name}", Level=${level}, stackIndex=${stackIndex}`);

                            // Ajusta o tamanho dos stacks de controle, preservando os níveis anteriores
                            hierarchyStack.length = stackIndex;
                            municipioStack.length = stackIndex;
                            codigoMunicipioStack.length = stackIndex;

                            hierarchyStack[stackIndex] = name;
                            
                            if (extraido.municipio) {
                                extraido.municipio = normalizarMunicipio(extraido.municipio);
                            }
                            
                            // Correção: Se o município foi extraído textualmente (ex: (Itambacuri)), mas o código numérico do município
                            // está vazio, usamos o próprio código da unidade como fallback para evitar código=""
                            if (extraido.municipio && !extraido.codigoMunicipio) {
                                extraido.codigoMunicipio = code;
                            }
                            logParser(`  > Extração direta de município: municipio="${extraido.municipio}", codigo="${extraido.codigoMunicipio}"`);

                            // Regra de Herança Hierárquica:
                            // Se esta unidade declarar município entre parênteses, utiliza-o.
                            // Caso contrário, herda o município do nível superior da hierarquia (se stackIndex > 0)
                            if (extraido.municipio) {
                                municipioStack[stackIndex] = extraido.municipio;
                                codigoMunicipioStack[stackIndex] = extraido.codigoMunicipio;
                                logParser(`  > Decisão: Utilizou município direto da linha: "${extraido.municipio}" (${extraido.codigoMunicipio})`);
                            } else if (stackIndex > 0 && municipioStack[stackIndex - 1]) {
                                municipioStack[stackIndex] = municipioStack[stackIndex - 1];
                                codigoMunicipioStack[stackIndex] = codigoMunicipioStack[stackIndex - 1];
                                logParser(`  > Decisão: HERDOU município do nível superior (índice ${stackIndex - 1}): "${municipioStack[stackIndex - 1]}" (${codigoMunicipioStack[stackIndex - 1]})`);
                            } else {
                                // Mantém os dados padrões da raiz (H2) obtidos das variáveis locais se for o nível 0 (stackIndex === 0)
                                if (stackIndex === 0 && defaultMunicipio) {
                                    municipioStack[0] = defaultMunicipio;
                                    codigoMunicipioStack[0] = defaultCodigoMunicipio;
                                    logParser(`  > Decisão: Aplicou município padrão obtido do H2 na raiz: "${defaultMunicipio}" (${defaultCodigoMunicipio})`);
                                } else {
                                    municipioStack[stackIndex] = "";
                                    codigoMunicipioStack[stackIndex] = "";
                                    logParser(`  > Decisão: Sem município definido nem disponível para herdar no índice ${stackIndex}.`);
                                }
                            }

                             const hierarchyPath = hierarchyStack.join('/').replace(/\s*\/\s*/g, '/');
                             const unitName = [...hierarchyStack].reverse().join('/').replace(/\s*\/\s*/g, '/');
                             logParser(`  > hierarchyPath resultante: "${hierarchyPath}"`);
                             logParser(`  > unitName resultante (hierarquia inversa): "${unitName}"`);
                             
                             parsedData.push({
                                 hierarquia: hierarchyPath,
                                 nomeSecao: unitName,
                                 codigoSecao: code,
                                 municipio: municipioStack[stackIndex] || "",
                                 codigoMunicipio: codigoMunicipioStack[stackIndex] || ""
                             });
                        });

                        logParser(`Processamento concluído. Unidades válidas parseadas: ${parsedData.length}`);

                        if (parsedData.length === 0) {
                            sendResponse({ 
                                error: 'Nenhuma unidade encontrada na análise do HTML.',
                                html: request.html,
                                parserLogs: parserLogs
                            });
                        } else {
                            sendResponse({ data: parsedData, parserLogs: parserLogs });
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