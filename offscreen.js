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
                                 nivel: level,
                                 hierarquia: hierarchyPath,
                                 codigoSecao: code,
                                 secao: unitName,
                                 codigoMunicipio: codigoMunicipioStack[stackIndex] || "",
                                 municipio: municipioStack[stackIndex] || ""
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

                case 'parse-concedente-html': {
                    try {
                        const { concedenteId, concedenteNome, includeCPE } = request;
                        const resultados = [];
                        const nReal = doc.querySelector('.barra.item h2')?.textContent.trim() || concedenteNome;
                        
                        // Extrai Razão Social e CNPJ de nReal de forma robusta
                        let cnpj = '';
                        let razaoSocial = nReal.replace(/^CONCEDENTE\s*:\s*/i, '');
                        if (razaoSocial.includes('CNPJ')) {
                            const parts = razaoSocial.split(/-\s*CNPJ\s*:\s*|CNPJ\s*:\s*/i);
                            razaoSocial = parts[0].trim();
                            if (parts[1]) {
                                cnpj = parts[1].trim();
                            }
                        }
                        razaoSocial = razaoSocial.replace(/\s*-\s*$/, '').trim();

                        // Tenta extrair a Razão Social e o CNPJ da div.barra.item.info-convenio
                        const infoConvenio = doc.querySelector('.barra.item.info-convenio');
                        if (infoConvenio) {
                            const colunas = infoConvenio.querySelectorAll('.flex-coluna');
                            colunas.forEach(col => {
                                const labelEl = col.querySelector('.tc');
                                const label = labelEl ? labelEl.textContent.trim().toUpperCase() : '';
                                const valorText = col.textContent.replace(labelEl ? labelEl.textContent : '', '').trim();
                                
                                if (label === 'CNPJ') {
                                    cnpj = valorText;
                                } else if (label === 'RAZÃO SOCIAL' || label === 'RAZAO SOCIAL') {
                                    razaoSocial = valorText;
                                }
                            });
                        }

                        // Se o CNPJ não foi encontrado no título, tenta buscar no corpo do documento
                        if (!cnpj) {
                            const labels = Array.from(doc.querySelectorAll('.tc.menor, td, th, label, div, span'));
                            const cnpjEl = labels.find(el => {
                                const text = el.textContent.trim().toUpperCase();
                                return text === 'CPF/CNPJ' || text === 'CPF / CNPJ' || text === 'CNPJ';
                            });

                            if (cnpjEl) {
                                const flexColuna = cnpjEl.closest('.flex-coluna');
                                if (flexColuna) {
                                    cnpj = flexColuna.textContent.replace(cnpjEl.textContent, '').trim();
                                } else {
                                    const tr = cnpjEl.closest('tr');
                                    if (tr) {
                                        const tds = tr.querySelectorAll('td');
                                        if (tds.length > 0) {
                                            cnpj = tds[tds.length - 1].textContent.trim();
                                        }
                                    }
                                    if (!cnpj && cnpjEl.nextElementSibling) {
                                        cnpj = cnpjEl.nextElementSibling.textContent.trim();
                                    }
                                }
                            }
                        }

                        const targetH = Array.from(doc.querySelectorAll('h2')).find(h => h.textContent.includes('Convênios firmados'));
                        
                        if (targetH?.parentElement) {
                            const items = targetH.parentElement.querySelectorAll('a.item.flex-linha');
                            for (const item of items) {
                                const lIdM = item.href.match(/id=(\d+)/);
                                if (!lIdM) continue;
                                
                                let cod = lIdM[1], face = '', val = '0', uni = '-', vigFim = '-', st = 'S', dtIni = '-', prep = '-';
                                const statusTexto = item.querySelector('.flex-coluna.tam-g .ne')?.textContent.trim() || '';
                                const isInactive = statusTexto.toLowerCase().includes('cancelado') || statusTexto.toLowerCase().includes('finalizado');
                                if (isInactive) st = 'N';
                                
                                item.querySelectorAll('.flex-coluna').forEach(col => {
                                    const lblEl = col.querySelector('.tc.menor');
                                    const lbl = lblEl?.textContent.trim() || '';
                                    const v = col.textContent.replace(lbl, '').trim();
                                    
                                    if (lbl.includes('Código') && !cod) {
                                        cod = v;
                                    } else if (lbl.includes('face')) {
                                        face = v;
                                    } else if (lbl.includes('Preposto')) {
                                        prep = v;
                                    } else if (lbl.includes('Valor')) {
                                        val = v;
                                    } else if (lbl.includes('Unidade')) {
                                        uni = v;
                                    } else if (lbl.includes('Término') || lbl.includes('Vigência') || lbl.includes('Fim')) {
                                        if (v.includes(' a ')) {
                                            const partes = v.split(' a ');
                                            dtIni = partes[0].trim();
                                            vigFim = partes[1].trim();
                                        } else if (v.match(/\d{2}\/\d{2}\/\d{4}/)) {
                                            vigFim = v;
                                        }
                                    } else if (lbl.includes('Início') || lbl.includes('Começo')) {
                                        dtIni = v;
                                    }
                                });
                                
                                if (!includeCPE && uni.toUpperCase().includes('CPE')) continue;
                                
                                const cleanVal = parseFloat(val.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
                                
                                const parseDateLocal = (d) => { 
                                    if (!d || d === '-') return null; 
                                    const p = d.split(' ')[0].split(/[\/-]/); 
                                    return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]); 
                                };
                                const vencido = (vigFim !== '-' && parseDateLocal(vigFim) < new Date() ? '1' : '0');
                                
                                resultados.push({
                                    ID: String(cod),
                                    NUMERO_FACE: face || '-',
                                    PREPOSTO: prep || '-',
                                    CONCEDENTE: razaoSocial,
                                    CONCEDENTE_ID: String(concedenteId),
                                    UNI_NOME_PRINCIPAL: uni,
                                    DTINICIAL: dtIni,
                                    DTFINAL: vigFim,
                                    VALOR_ESTIMADO: cleanVal,
                                    ATIVO: st,
                                    STATUS_TEXTO: statusTexto,
                                    VENCIDO: vencido,
                                    CNPJ: cnpj,
                                    RAZAO_SOCIAL: razaoSocial
                                });
                            }
                        }
                        sendResponse({ data: resultados });
                    } catch (err) {
                        sendResponse({ error: err.message });
                    }
                    break;
                }

                case 'parse-concedentes-links': {
                    try {
                        const links = doc.querySelectorAll('a[href*="concedente/view?id="]');
                        const concedentes = [];
                        links.forEach(l => {
                            const m = l.href.match(/id=(\d+)/);
                            if (m) {
                                concedentes.push({ id: m[1], nome: l.textContent.trim() });
                            }
                        });
                        sendResponse({ data: concedentes });
                    } catch (err) {
                        sendResponse({ error: err.message });
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