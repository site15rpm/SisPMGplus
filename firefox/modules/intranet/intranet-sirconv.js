// Arquivo: modules/intranet/intranet-sirconv.js
// Lógica para o módulo SIRCONV+ que automatiza o preenchimento de materiais e serviços.

import { sendMessageToBackground, getCookie } from '../../common/utils.js';

export class SirconvModule {
    constructor(config) {
        this.config = config;
        this.iconSVG = config.iconSVG_28.replace('width="28"', 'width="22"').replace('height="28"', 'height="22"');
        this.observer = null;
        this.isProcessing = false;
        this.isCancelled = false;
        this.idbase = '1vYll9MsmEpTyHxhztbVN4SxW27jtK8nXMlEKWSEUHHQ'; // ID da Planilha Google (fixo e público)
    }

    init() {
        console.log('SisPMG+ [SIRCONV]: Módulo ativado.');
        this.startObserver();
        this.checkForPostActionReport();
    }

    startObserver() {
        if (this.observer) this.observer.disconnect();
        this.injectSirconvButtons();
        this.observer = new MutationObserver(() => this.injectSirconvButtons());
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stopObserver() {
        if (this.observer) this.observer.disconnect();
    }

    injectSirconvButtons() {
        // Botão para períodos abertos (inserção)
        document.querySelectorAll('h2 > span').forEach(parentSpan => {
            const addButton = parentSpan.querySelector('a[id^="bntmateriais-"]');
            if (!addButton || parentSpan.querySelector('.sispmg-sirconv-btn')) return;

            const iconButton = document.createElement('button');
            iconButton.className = 'sispmg-sirconv-btn';
            iconButton.title = 'Preencher materiais e serviços via SIC3';
            iconButton.innerHTML = this.iconSVG;
            iconButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.startProcess(addButton); // Passa o botão original para obter o ID
            });
            
            parentSpan.insertBefore(iconButton, addButton);
            addButton.style.display = 'none'; // Oculta o botão original de incluir
        });

        // Botão para períodos liquidados (apenas verificação)
        document.querySelectorAll('h2 a.info2[title="Verifique a situação do convênio"]').forEach(button => {
            const parentSpan = button.parentElement;
            if (parentSpan.querySelector('.sispmg-sirconv-btn')) return;

            const iconButton = document.createElement('button');
            iconButton.className = 'sispmg-sirconv-btn';
            iconButton.title = 'Verificar se dados SIRCONV são idênticos aos do SIC3';
            iconButton.innerHTML = this.iconSVG;
            iconButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.startComparisonProcess(button);
            });
            
            parentSpan.insertBefore(iconButton, button);
            button.style.display = 'none';
        });

        // Oculta o botão de exclusão de item individual em vez de removê-lo.
        // Isso mantém o botão no DOM para que a lógica de exclusão em massa possa encontrá-lo.
        document.querySelectorAll('a.ic.ex[href*="/execucao/delete"]').forEach(deleteButton => {
            deleteButton.style.display = 'none';
        });
    }

    async startProcess(targetButton) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        console.log('SisPMG+ [SIRCONV]: Início do processo de inserção.');

        const cronogramaId = targetButton.id.split('-')[1];
        const detalheDiv = document.getElementById(`detalheCronograma-${cronogramaId}`);
        const convInput = detalheDiv?.querySelector('input[name="conv"]');
        const convenioId = convInput?.value;
        const h1 = detalheDiv?.querySelector('h1');
        const match = h1?.innerText.trim().match(/(\w{3})\s+(\d{4})/);

        if (!cronogramaId || !convenioId || !match) {
            this.isProcessing = false;
            return this.showModal({ title: 'Erro de Extração', message: 'Não foi possível extrair os dados do convênio. Abra o detalhe do mês desejado.' });
        }

        const [, mesAbreviado, ano] = match;
        const mesCompleto = this.mapMonth(mesAbreviado);

        if (!mesCompleto) {
            this.isProcessing = false;
            return this.showModal({ title: 'Erro', message: `Mês abreviado "${mesAbreviado}" não reconhecido.` });
        }

        this.showOverlay('Analisando dados...');
        const token = getCookie('tokiuz');
        
        const planoResponse = await sendMessageToBackground('fetchConvenioPlano', { convenioId, token });
        
        if (!planoResponse.success) {
            this.hideOverlay();
            this.isProcessing = false;
            return this.showModal({ title: 'Erro de Permissão ou API', message: 'Não foi possível carregar o plano do convênio. Verifique suas permissões no SIRCONV. Erro: ' + planoResponse.error });
        }
        
        const planoValido = planoResponse.data.planos.map(p => p.ITEM);

        const query = `SELECT C, D, E, G, H, I, K, L, N WHERE C='${convenioId}' AND D='${ano}' AND E='${mesCompleto.toUpperCase()}'`;
        const dbDataResponse = await sendMessageToBackground('fetchSirconvData', { sheetId: this.idbase, sheet: 'principal', query, bustCache: Date.now() });

        if (!dbDataResponse.success) {
            this.hideOverlay();
            this.isProcessing = false;
            return this.showModal({ title: 'Erro de Comunicação com o SIC3', message: `Não foi possível buscar os dados no SIC3. Ocorreu um erro: ${dbDataResponse.error}` });
        }
        
        if (!dbDataResponse.data || dbDataResponse.data.length === 0) {
            this.hideOverlay();
            this.isProcessing = false;
            return this.showModal({ title: 'Nenhum Dado Encontrado', message: `Nenhum dado encontrado no SIC3 para o convênio ${convenioId} em ${mesCompleto} de ${ano}.` });
        }
        
        const { itemsParaEnviar, itemsNaoInseridos } = this.transformAndValidateData(dbDataResponse.data, planoValido);
        const sirconvItemsNaPagina = this.getSirconvPageData(detalheDiv);
        const comparisonResult = this.compareData(itemsParaEnviar, sirconvItemsNaPagina);

        if (sirconvItemsNaPagina.length > 0 && comparisonResult.areIdentical) {
            this.hideOverlay();
            this.isProcessing = false;
            return this.showModal({ title: 'Informação', message: 'As informações já estão atualizadas no SIRCONV e são idênticas às do SIC3. Nenhuma ação é necessária.' });
        }

        this.hideOverlay();
        
        const preReportMessage = this.createPreReportMessage(itemsParaEnviar, itemsNaoInseridos, sirconvItemsNaPagina, comparisonResult);
        const proceed = await this.showModal({ title: 'Relatório de Pré-Execução', message: preReportMessage, type: 'confirm' });

        if (!proceed) {
            this.isProcessing = false;
            return;
        }
        
        try {
            if (sirconvItemsNaPagina.length > 0) {
                const deleteLinks = Array.from(detalheDiv.querySelectorAll('table.t1 a[href*="/execucao/delete"]'));
                const success = await this.deleteExistingItems(deleteLinks);
                if (!success) {
                   this.isProcessing = false;
                   return this.showModal({ title: 'Erro', message: 'Falha ao excluir os itens existentes. A operação foi cancelada.' });
                }
            }
            
            const sessionReport = {
                itemsParaEnviar, 
                itemsNaoInseridos, 
                totalDb: dbDataResponse.data.length,
                isDeleteOnly: itemsParaEnviar.length === 0 && sirconvItemsNaPagina.length > 0,
                deletedCount: sirconvItemsNaPagina.length
            };
            sessionStorage.setItem('sispmgSirconvReport', JSON.stringify(sessionReport));

            if (itemsParaEnviar.length === 0) {
                if (sirconvItemsNaPagina.length > 0) {
                    location.reload();
                } else {
                    this.isProcessing = false;
                    this.showModal({ title: 'Aviso', message: 'Não há itens válidos para inserir. O processo foi encerrado.' });
                }
                return;
            }
    
            this.sendDataToServer(itemsParaEnviar, cronogramaId);
        } catch (error) {
            this.showModal({ title: 'Erro Inesperado', message: 'Ocorreu um erro inesperado. Verifique o console para mais detalhes.' });
            this.isProcessing = false;
        }
    }

    async startComparisonProcess(targetButton) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        console.log('SisPMG+ [SIRCONV]: Início do processo de verificação.');

        const detalheDiv = targetButton.closest('div[id^="detalheCronograma-"]');
        if (!detalheDiv) {
             this.isProcessing = false;
             return this.showModal({ title: 'Erro', message: 'Não foi possível encontrar o container do cronograma.' });
        }
        
        const convInput = detalheDiv.querySelector('input[name="conv"]');
        const convenioId = convInput?.value;
        const h1 = detalheDiv.querySelector('h1');
        const match = h1?.innerText.trim().match(/(\w{3})\s+(\d{4})/);

        if (!convenioId || !match) {
            this.isProcessing = false;
            return this.showModal({ title: 'Erro de Extração', message: 'Não foi possível extrair os dados do convênio.' });
        }

        const [, mesAbreviado, ano] = match;
        const mesCompleto = this.mapMonth(mesAbreviado);
        
        this.showOverlay('Comparando dados...');

        const planoResponse = await sendMessageToBackground('fetchConvenioPlano', { convenioId, token: getCookie('tokiuz') });
        if (!planoResponse.success) {
            this.hideOverlay(); this.isProcessing = false;
            return this.showModal({ title: 'Erro de Permissão ou API', message: 'Não foi possível carregar o plano do convênio. Erro: ' + planoResponse.error });
        }
        const planoValido = planoResponse.data.planos.map(p => p.ITEM);

        const query = `SELECT C, D, E, G, H, I, K, L, N WHERE C='${convenioId}' AND D='${ano}' AND E='${mesCompleto.toUpperCase()}'`;
        const dbDataResponse = await sendMessageToBackground('fetchSirconvData', { sheetId: this.idbase, sheet: 'principal', query, bustCache: Date.now() });

        if (!dbDataResponse.success) {
            this.hideOverlay(); this.isProcessing = false;
            return this.showModal({ title: 'Erro de Comunicação com o SIC3', message: `Não foi possível buscar os dados no SIC3. Ocorreu um erro: ${dbDataResponse.error}` });
        }

        if (!dbDataResponse.data || dbDataResponse.data.length === 0) {
            this.hideOverlay(); this.isProcessing = false;
            return this.showModal({ title: 'Nenhum Dado Encontrado', message: `Nenhum dado encontrado no SIC3 para o convênio ${convenioId} em ${mesCompleto} de ${ano}.` });
        }

        const { itemsParaEnviar: sic3Validos, itemsNaoInseridos: sic3Invalidos } = this.transformAndValidateData(dbDataResponse.data, planoValido);
        const sirconvItemsNaPagina = this.getSirconvPageData(detalheDiv);
        const comparisonResult = this.compareData(sic3Validos, sirconvItemsNaPagina);
        
        this.hideOverlay();
        this.isProcessing = false;
        
        const reportMessage = this.createComparisonReportMessage(sic3Validos, sic3Invalidos, sirconvItemsNaPagina, comparisonResult);
        this.showModal({ title: 'Relatório de Verificação', message: reportMessage });
    }
    
    async deleteExistingItems(deleteLinks) {
        this.showOverlay(`Excluindo 0 de ${deleteLinks.length} item(ns)...`);
        const statusSpan = document.getElementById('sispmg-overlay-status');
        const token = getCookie('tokiuz');
        const csrfParam = document.querySelector('meta[name="csrf-param"]').content;
        const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

        for (const [index, link] of deleteLinks.entries()) {
             if (statusSpan) {
                statusSpan.textContent = `Excluindo ${index + 1} de ${deleteLinks.length}...`;
            }
            const deleteUrl = new URL(link.href, window.location.origin).toString();
            const response = await sendMessageToBackground('deleteExecucaoItem', { url: deleteUrl, token, csrfParam, csrfToken });
            if (!response.success) {
                this.hideOverlay();
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        this.hideOverlay();
        return true;
    }

    transformDataForComparison(data) {
        return data.map(row => {
            const [, , , , descricao, , , quantidadeL, subtotal] = row.map(cell => cell || "");
            return {
                descricao,
                quantidade: String(quantidadeL).replace(',', '.'),
                valorTotal: String(subtotal).replace('R$', '').trim().replace(/\./g, '').replace(',', '.')
            };
        });
    }
    
    compareData(sic3Items, sirconvItems) {
        const differences = [];
        let compliantCount = 0;
        const normalizeString = (str) => (str || '').trim().replace(/\s+/g, ' ');
        const formatCurrency = (value) => parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formatQuantity = (value) => parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

        const sirconvItemsMap = new Map();
        sirconvItems.forEach(item => {
            sirconvItemsMap.set(normalizeString(item.descricao), item);
        });

        for (const sic3Item of sic3Items) {
            const normalizedDesc = normalizeString(sic3Item.descricao);
            const sirconvItem = sirconvItemsMap.get(normalizedDesc);

            if (!sirconvItem) {
                differences.push(`<li><strong>Item do SIC3 não encontrado no SIRCONV:</strong> ${this.escapeHtml(sic3Item.descricao)}</li>`);
            } else {
                let itemDiffs = [];
                const qtdMatch = parseFloat(sirconvItem.quantidade).toFixed(4) === parseFloat(sic3Item.quantidade).toFixed(4);
                const valorMatch = parseFloat(sirconvItem.valorTotal).toFixed(2) === parseFloat(sic3Item.valorTotal).toFixed(2);

                if (!qtdMatch) {
                    itemDiffs.push(`Quantidade diverge (SIC3: ${formatQuantity(sic3Item.quantidade)}, SIRCONV: ${formatQuantity(sirconvItem.quantidade)})`);
                }
                if (!valorMatch) {
                    itemDiffs.push(`Valor diverge (SIC3: R$ ${formatCurrency(sic3Item.valorTotal)}, SIRCONV: R$ ${formatCurrency(sirconvItem.valorTotal)})`);
                }

                if (itemDiffs.length > 0) {
                    differences.push(`<li><strong>Divergência em "${this.escapeHtml(sic3Item.descricao)}":</strong><br><small>${itemDiffs.join('<br>')}</small></li>`);
                } else {
                    compliantCount++;
                }
                sirconvItemsMap.delete(normalizedDesc);
            }
        }

        for (const sirconvItem of sirconvItemsMap.values()) {
            differences.push(`<li><strong>Item do SIRCONV não encontrado no SIC3:</strong> ${this.escapeHtml(sirconvItem.descricao)}</li>`);
        }
        
        if (sic3Items.length !== sirconvItems.length && differences.length === 0) {
             differences.push(`<li><strong>Contagem de itens diverge:</strong> SIC3 (${sic3Items.length}) vs SIRCONV (${sirconvItems.length})</li>`);
        }

        return {
            areIdentical: differences.length === 0,
            details: `<ul class="sispmg-sirconv-report-list">${differences.join('')}</ul>`,
            compliantCount: compliantCount
        };
    }

    getSirconvPageData(detalheDiv) {
        const items = [];
        const rows = detalheDiv.querySelectorAll('table.t1 tr');
        rows.forEach((row, index) => {
            if (index === 0) return; // Pular cabeçalho
            const cells = row.querySelectorAll('td');
            if (cells.length >= 6) {
                const descricao = cells[1]?.innerText.trim() || '';
                const quantidade = parseFloat(cells[4]?.innerText.trim().replace(',', '.') || '0');
                const valorTotal = parseFloat(cells[5]?.innerText.trim().replace('R$', '').replace(/\./g, '').replace(',', '.') || '0');
                
                if (descricao) {
                    items.push({
                        descricao,
                        quantidade: quantidade.toFixed(4),
                        valorTotal: valorTotal.toFixed(2)
                    });
                }
            }
        });
        return items;
    }

    transformAndValidateData(data, planoValido) {
        const itemsParaEnviar = [];
        const itemsNaoInseridos = [];

        data.forEach(row => {
            const [convenio, ano, mes, codigo, descricao, despesa, data, quantidadeL, subtotal] = row.map(cell => cell || "");
            const itemOriginal = { descricao, valor: subtotal };
            let naturezaItemId = '';
    
            if (String(codigo).toUpperCase().startsWith('O')) {
                naturezaItemId = String(codigo).substring(1).trim();
            } else {
                const despesaMatch = String(despesa).match(/^(\d{4})/);
                if (despesaMatch) {
                    naturezaItemId = '3390' + despesaMatch[1];
                }
            }
            
            if (!naturezaItemId) {
                itemsNaoInseridos.push({ ...itemOriginal, motivo: `Natureza da despesa inválida ou não reconhecida (${despesa}).` });
                return;
            }
    
            if (!planoValido.includes(naturezaItemId)) {
                itemsNaoInseridos.push({ ...itemOriginal, motivo: `Natureza da despesa (${naturezaItemId}) não está no plano do convênio.` });
                return;
            }
            
            itemsParaEnviar.push({
                naturezaItemId,
                quantidade: String(quantidadeL).replace(',', '.'),
                valorTotal: String(subtotal).replace('R$', '').trim().replace(/\./g, '').replace(',', '.'),
                dia: this.formatDate(data),
                descricao
            });
        });
        return { itemsParaEnviar, itemsNaoInseridos };
    }

    formatDate(dateString) {
        try {
            const dateStr = String(dateString);
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            return dateStr;
        } catch (e) {
            return dateString;
        }
    }
    
    async sendDataToServer(items, cronogramaId) {
        this.showOverlay(`Enviando 0 de ${items.length}...`, true);
        const statusSpan = document.getElementById('sispmg-overlay-status');
        const csrfParam = document.querySelector('meta[name="csrf-param"]').content;
        const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
        const token = getCookie('tokiuz');

        for (const [index, item] of items.entries()) {
            if (this.isCancelled) break;
            if (statusSpan) statusSpan.textContent = `Enviando ${index + 1} de ${items.length}: ${item.descricao.substring(0, 20)}...`;

            const payload = {
                [csrfParam]: csrfToken, 'CRONOGRAMA_ID': cronogramaId,
                'NATUREZA_ID': item.naturezaItemId, 'QTD_EXECUCAO': item.quantidade,
                'VALOR_EXECUCAO': item.valorTotal.replace('.', ','),
                'DIA': item.dia, 'DESCRICAO': item.descricao
            };
            
            const response = await sendMessageToBackground('sendSirconvData', { payload, token });

            await new Promise(resolve => setTimeout(resolve, 250));
        }

        this.hideOverlay();
        if (!this.isCancelled) {
            location.reload();
        } else {
            this.isProcessing = false;
        }
        this.isCancelled = false;
    }
    
    checkForPostActionReport() {
        const reportDataJSON = sessionStorage.getItem('sispmgSirconvReport');
        if (!reportDataJSON) return;
        
        sessionStorage.removeItem('sispmgSirconvReport');
        const reportData = JSON.parse(reportDataJSON);

        if (reportData.isDeleteOnly) {
            const message = `Foram excluídos ${reportData.deletedCount} item(ns) com sucesso. Nenhum item válido do SIC3 foi encontrado para inserção.`;
            this.showModal({ title: 'Operação Concluída', message: message });
            return;
        }

        const insertedItemsOnPage = this.getSirconvPageData(document.body);
        let successfullyInserted = [];
        let failedToInsert = [];
        
        reportData.itemsParaEnviar.forEach(sentItem => {
            const found = insertedItemsOnPage.some(pageItem => 
                this.compareData([sentItem], [pageItem]).areIdentical
            );
            if (found) {
                successfullyInserted.push(sentItem);
            } else {
                failedToInsert.push({ ...sentItem, motivo: 'Não encontrado na página após envio. Possível erro interno do servidor.' });
            }
        });

        this.showFinalReport(reportData, successfullyInserted, reportData.itemsNaoInseridos.concat(failedToInsert));
    }
    
    createPreReportMessage(validItems, invalidItems, sirconvItems, comparisonResult) {
        let message = '';
        const parseValue = (item) => parseFloat((item.valorTotal || String(item.valor || '0').replace('R$', '').trim().replace(/\./g, '').replace(',', '.')) || '0');

        if (sirconvItems.length > 0) {
            const totalValueSirconv = sirconvItems.reduce((sum, item) => sum + parseValue(item), 0);
            const divergentCount = sirconvItems.length - comparisonResult.compliantCount;
            const formattedTotal = totalValueSirconv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            message += `Foram encontrados <strong>${sirconvItems.length} itens já lançados</strong> no SIRCONV, totalizando <strong>${formattedTotal}</strong>:<br>`;
            const divergentText = divergentCount > 0 ? `<strong style="color: var(--theme-danger);">${divergentCount} item(ns) divergente(s)</strong>` : 'nenhum item divergente';
            message += `${comparisonResult.compliantCount} itens em conformidade com o SIC3 e ${divergentText}.<br>`;
        }

        const totalValueSic3 = [...validItems, ...invalidItems].reduce((sum, item) => sum + parseValue(item), 0);
        const formattedTotalSic3 = totalValueSic3.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        message += `Foram encontrados <strong>${validItems.length + invalidItems.length}</strong> itens no SIC3, totalizando <strong>${formattedTotalSic3}</strong>:<br>`;
        message += `<strong style="color: green;">${validItems.length} itens são válidos</strong> e estão prontos para serem inseridos.<br>`;
        if (invalidItems.length > 0) {
            message += `<strong style="color: red;">${invalidItems.length} itens são inválidos</strong> e serão ignorados:`;
            message += `<ul class="sispmg-sirconv-report-list">${invalidItems.map(item => `<li><strong>${this.escapeHtml(item.descricao.substring(0, 50))}...</strong><br><small>Motivo: ${this.escapeHtml(item.motivo)}</small></li>`).join('')}</ul>`;
            message += `* Antes de prosseguir com os lançamentos no SIRCONV os itens inválidos devem ser corrigidos no SIC3 e novos Anexos "D" e "Único" devem ser gerados.<br>`;
        }
        
        message += `<br>Deseja prosseguir com a inserção dos itens válidos agora?`;
        
        return message;
    }

    createComparisonReportMessage(validItems, invalidItems, sirconvItems, comparisonResult) {
        let message = '';
        const parseValue = (item) => parseFloat((item.valorTotal || String(item.valor || '0').replace('R$', '').trim().replace(/\./g, '').replace(',', '.')) || '0');

        // Seção para dados do SIRCONV
        if (sirconvItems.length > 0) {
            const totalValueSirconv = sirconvItems.reduce((sum, item) => sum + parseValue(item), 0);
            const divergentCountSirconv = sirconvItems.length - comparisonResult.compliantCount;
            const formattedTotal = totalValueSirconv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            message += `Foram encontrados <strong>${sirconvItems.length} itens já lançados</strong> no SIRCONV, totalizando <strong>${formattedTotal}</strong>:<br>`;
            const divergentText = divergentCountSirconv > 0 ? `<strong style="color: var(--theme-danger);">${divergentCountSirconv} item(ns) divergente(s)</strong>` : 'nenhum item divergente';
            message += `${comparisonResult.compliantCount} itens em conformidade com o SIC3 e ${divergentText}.<br>`;
        } else {
            message += `Nenhum item encontrado no SIRCONV para este período.<br>`;
        }

        // Seção para dados do SIC3
        const totalValueSic3 = [...validItems, ...invalidItems].reduce((sum, item) => sum + parseValue(item), 0);
        const formattedTotalSic3 = totalValueSic3.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        message += `Foram encontrados <strong>${validItems.length + invalidItems.length}</strong> itens no SIC3, totalizando <strong>${formattedTotalSic3}</strong>:<br>`;
        message += `<strong style="color: green;">${validItems.length} itens são válidos</strong>.<br>`;
        
        // Detalhes das divergências agora aqui
        if (!comparisonResult.areIdentical) {
            message += `<h4>Detalhes das Divergências:</h4>${comparisonResult.details}`;
        }
        
        // Itens inválidos
        if (invalidItems.length > 0) {
            message += `<strong style="color: red; display: block; margin-top: 15px;">${invalidItems.length} itens são inválidos</strong>:`;
            message += `<ul class="sispmg-sirconv-report-list">${invalidItems.map(item => `<li><strong>${this.escapeHtml(item.descricao.substring(0, 50))}...</strong><br><small>Motivo: ${this.escapeHtml(item.motivo)}</small></li>`).join('')}</ul>`;
        }
        
        return message;
    }

    showFinalReport(reportData, successItems, failedItems) {
        const totalDb = reportData.totalDb;
        const formatCurrency = (value) => parseFloat(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const parseValue = (item) => parseFloat(item.valorTotal || String(item.valor).replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
        
        const totalValueDb = successItems.concat(failedItems).reduce((sum, item) => sum + parseValue(item), 0);
        const successValue = successItems.reduce((sum, item) => sum + parseValue(item), 0);
        const failedValue = failedItems.reduce((sum, item) => sum + parseValue(item), 0);
        const expectedToInsertCount = reportData.itemsParaEnviar.length;

        let failedItemsHTML = '';
        if (failedItems.length > 0) {
            failedItemsHTML = `<h4>Itens Não Inseridos ou com Falha (${failedItems.length})</h4>
               <ul class="sispmg-sirconv-report-list">${failedItems.map(item => `<li><strong>${this.escapeHtml(item.descricao.substring(0, 50))}...</strong> (${formatCurrency(parseValue(item))})<br><small>Motivo: ${this.escapeHtml(item.motivo)}</small></li>`).join('')}</ul>`;
        }

        let verificationHTML = '';
        if (successItems.length !== expectedToInsertCount) {
            verificationHTML = `<div style="color: var(--theme-danger); font-weight: bold; margin-bottom: 10px;">Atenção: A contagem de itens inseridos (${successItems.length}) é diferente da esperada (${expectedToInsertCount}). Verifique os itens com falha.</div>`;
        } else {
             verificationHTML = `<div style="color: green; font-weight: bold; margin-bottom: 10px;">Verificação concluída: O número de itens inseridos corresponde ao esperado.</div>`;
        }

        const reportHTML = `
            ${verificationHTML}
            <div class="sispmg-sirconv-report-summary">
                <div><span>Total de itens no SIC3:</span><strong>${totalDb}</strong></div>
                <div><span>Itens válidos para inserção:</span><strong>${expectedToInsertCount}</strong></div>
                <div><span>Inseridos com sucesso:</span><strong style="color: green;">${successItems.length} (${formatCurrency(successValue)})</strong></div>
                <div><span>Falharam ou não inseridos:</span><strong style="color: red;">${failedItems.length} (${formatCurrency(failedValue)})</strong></div>
            </div>
            ${failedItemsHTML}`;
        
        this.showModal({ title: 'Relatório Final de Inserção', message: reportHTML, type: 'alert' });
    }

    mapMonth(abbr) {
        const map = { 'Jan': 'Janeiro', 'Fev': 'Fevereiro', 'Mar': 'Março', 'Abr': 'Abril', 'Mai': 'Maio', 'Jun': 'Junho', 'Jul': 'Julho', 'Ago': 'Agosto', 'Set': 'Setembro', 'Out': 'Outubro', 'Nov': 'Novembro', 'Dez': 'Dezembro' };
        return map[abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase()];
    }
    
    showModal({ title, message, type = 'alert' }) {
        return new Promise(resolve => {
            this.removeOverlay();
            const overlay = document.createElement('div');
            overlay.id = 'sispmg-sirconv-overlay';
            overlay.className = 'sispmg-sirconv-modal-backdrop';

            const buttonsHTML = type === 'confirm'
                ? `<button id="sispmg-modal-cancel-btn" class="btn sispmg-btn-secondary">Cancelar</button><button id="sispmg-modal-confirm-btn" class="btn sispmg-btn-primary">Prosseguir</button>`
                : `<button id="sispmg-modal-confirm-btn" class="btn sispmg-btn-primary">OK</button>`;

            overlay.innerHTML = `
                <div class="sispmg-sirconv-modal sispmg-sirconv-modal">
                    <div class="sispmg-sirconv-modal-header"><h3>${title}</h3></div>
                    <div class="sispmg-sirconv-modal-body">${message}</div>
                    <div class="sispmg-sirconv-modal-footer">${buttonsHTML}</div>
                </div>`;
            document.body.appendChild(overlay);

            const closeModal = (result) => {
                this.removeOverlay();
                resolve(result);
            };

            overlay.querySelector('#sispmg-modal-confirm-btn').onclick = () => closeModal(true);
            if (type === 'confirm') {
                overlay.querySelector('#sispmg-modal-cancel-btn').onclick = () => closeModal(false);
            }
        });
    }

    showOverlay(text, showCancel = false) {
        this.removeOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'sispmg-sirconv-overlay';
        overlay.className = 'sispmg-sirconv-modal-backdrop';
        overlay.innerHTML = `
            <div class="sispmg-sirconv-overlay-content">
                <div class="sispmg-spinner"></div>
                <span id="sispmg-overlay-status">${text}</span>
                ${showCancel ? '<button id="sispmg-cancel-btn" class="btn">Cancelar</button>' : ''}
            </div>
        `;
        document.body.appendChild(overlay);
        if (showCancel) {
            overlay.querySelector('#sispmg-cancel-btn').onclick = () => { this.isCancelled = true; };
        }
    }

    hideOverlay() { this.removeOverlay(); }
    removeOverlay() { document.getElementById('sispmg-sirconv-overlay')?.remove(); }
    
    escapeHtml(text) {
        if(typeof text !== 'string') return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

