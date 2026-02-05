// Arquivo: modules/intranet/intranet-padm.js
// Contém a lógica para o módulo PAdmPMG+ que adiciona a funcionalidade
// de inserção de múltiplos destinatários no Painel Administrativo.

// Importa a função de comunicação com o background script.
import { sendMessageToBackground } from '../../common/utils.js';

export class PAdmModule {
    constructor(config) {
        this.config = config;
        this.iconSVG = config.iconSVG_28;
        this.isProcessing = false;
        this.isCancelled = false;
        this.observer = null; // Usado para observar mudanças no DOM
        this.blockerEventHandler = null; // Armazena a referência do manipulador de eventos de bloqueio
        this.currentFailedNumbers = [];
        this.moduleEnabled = true;
    }

    async init() {
        console.log('SisPMG+ [PAdmPMG+]: Módulo ativado.');
        await this.loadState();
        if (this.moduleEnabled) {
            this.startObserver();
        }
    }

    async loadState() {
        const result = await sendMessageToBackground('getStorage', { key: 'PAdm+Enabled' });
        if (result.success && typeof result.value['PAdm+Enabled'] !== 'undefined') {
            this.moduleEnabled = result.value['PAdm+Enabled'];
        } else {
            this.moduleEnabled = true; // Valor padrão
        }
    }

    async saveState() {
        await sendMessageToBackground('setStorage', { 'PAdm+Enabled': this.moduleEnabled });
    }

    async toggleModule() {
        this.moduleEnabled = !this.moduleEnabled;
        await this.saveState();
        if (this.moduleEnabled) {
            this.startObserver();
        } else {
            this.stopObserver();
            this.removeInjectedButtons();
        }
    }

    removeInjectedButtons() {
        document.querySelectorAll('.sispmg-label-container').forEach(label => {
            const button = label.querySelector('.sispmg-plus-btn');
            const originalText = label.textContent.trim();
            if (button) {
                label.innerHTML = originalText;
                label.classList.remove('sispmg-label-container');
            }
        });
    }

    // --- Funcionalidade de Adicionar Múltiplos ---

    startObserver() {
        if (this.observer) this.observer.disconnect();

        this.injectButtonsIntoForm();

        this.observer = new MutationObserver(() => {
            if (document.querySelector('app-formulario-escrever')) {
                this.injectButtonsIntoForm();
            } else {
                 this.removeInjectedButtons();
            }
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stopObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    injectButtonsIntoForm() {
        if (!this.moduleEnabled) return;
        const form = document.querySelector('app-formulario-escrever');
        if (!form) return;

        const labels = form.querySelectorAll('label');
        labels.forEach(label => {
            const labelText = label.textContent.trim();
            if (labelText === 'Para' || labelText === 'Cópia' || labelText === 'Cco') {
                if (!label.querySelector('.sispmg-plus-btn')) {
                    this.injectMultiAddButton(label);
                }
            }
        });
    }

    injectMultiAddButton(labelElement) {
        const parentDiv = labelElement.parentElement;
        const inputSpan = parentDiv.querySelector('span[contenteditable="true"]');
        if (!inputSpan) return;
        const inputId = inputSpan.id;

        const originalText = labelElement.textContent.trim();
        labelElement.innerHTML = '';

        const button = document.createElement('button');
        button.className = 'sispmg-plus-btn';
        button.title = 'Adicionar múltiplos destinatários';
        button.innerHTML = this.iconSVG;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showMultiAddModal(inputId);
        });
        
        labelElement.appendChild(button);
        labelElement.appendChild(document.createTextNode(originalText)); 
        labelElement.classList.add('sispmg-label-container');
    }

    showMultiAddModal(inputId, previousInput = '') {
        this.closeMultiAddModal();
        document.body.classList.add('sispmg-modal-open');

        const modalHTML = `
            <div id="sispmg-multi-add-modal-backdrop"></div>
            <div id="sispmg-multi-add-modal">
                <div class="sispmg-modal-content">
                    <h3>Adicionar Múltiplos Destinatários</h3>
                    <p>Cole os números PM. A verificação irá destacar os números válidos.</p>
                    <div id="sispmg-editor" contenteditable="true" spellcheck="false">${previousInput}</div>
                </div>
                <div class="sispmg-modal-footer">
                    <div id="sispmg-info-list"></div>
                    <div class="sispmg-modal-actions">
                        <button id="sispmg-cancel-btn" class="sispmg-btn sispmg-btn-secondary">Cancelar</button>
                        <button id="sispmg-action-btn" class="sispmg-btn sispmg-btn-primary">Verificar</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const editor = document.getElementById('sispmg-editor');
        const actionButton = document.getElementById('sispmg-action-btn');
        const infoList = document.getElementById('sispmg-info-list');
        
        let proceedHandler = null; 

        const handleVerification = () => {
            let editorText = editor.innerText || ''; 
    
            const numberCount = (editorText.match(/\d/g) || []).length;
            const letterCount = (editorText.match(/[a-zA-Z]/g) || []).length;
            editor.classList.toggle('sispmg-no-wrap', letterCount > numberCount);

            const result = this.runVerification(editorText);
            
            this.restoreCursorAndScroll(editor, () => { editor.innerHTML = result.highlightedHTML; });

            let feedbackHTML = '';
            if (result.validPMs.length > 0) feedbackHTML += `<span class="sispmg-success">${result.validPMs.length} destinatário(s) válido(s) encontrado(s).</span>`;
            if (result.duplicates.length > 0) feedbackHTML += `<br><span class="sispmg-warning">${result.duplicates.length} número(s) duplicado(s) ignorado(s).</span>`;
            if (result.invalids.length > 0) feedbackHTML += `<br><span class="sispmg-error">${result.invalids.length} número(s) inválido(s) destacado(s).</span>`;
            infoList.innerHTML = feedbackHTML;

            actionButton.textContent = 'Confirmar';
            actionButton.disabled = result.validPMs.length === 0;
            if (proceedHandler) actionButton.removeEventListener('click', proceedHandler);
            actionButton.removeEventListener('click', handleVerification);
            
            proceedHandler = () => {
                this.closeMultiAddModal();
                this.inserirDestinatariosPorNumero(result.validPMs, inputId);
            };
            actionButton.addEventListener('click', proceedHandler);
        };

        const resetState = () => {
            actionButton.textContent = 'Verificar';
            actionButton.disabled = (editor.innerText || '').trim().length === 0;
            infoList.innerHTML = '';
            
            if (proceedHandler) {
                actionButton.removeEventListener('click', proceedHandler);
                proceedHandler = null;
            }
            actionButton.removeEventListener('click', handleVerification);
            actionButton.addEventListener('click', handleVerification);
            
            const text = editor.innerText || '';
            this.restoreCursorAndScroll(editor, () => {
                editor.innerHTML = this.escapeHtml(text).replace(/\n/g, '<br>');
            });
        };

        editor.addEventListener('input', resetState);
        document.getElementById('sispmg-cancel-btn').addEventListener('click', () => this.closeMultiAddModal());

        resetState(); 
    }

    runVerification(text) {
        const seenPMs = new Set();
        const validPMs = new Set();
        const duplicates = [];
        const invalids = [];
        
        const tokens = text.split(/(\d+)/);
        let highlightedHTML = '';
    
        tokens.forEach(token => {
            if (!token) return; 
    
            if (/^\d+$/.test(token)) {
                
                if (token.length < 6) {
                    highlightedHTML += this.escapeHtml(token);
                    return;
                }

                let classification = 'invalid';
                
                if (token.length === 7) {
                    if (this.verificarDigitoVerificador(token)) {
                        if (seenPMs.has(token)) {
                            classification = 'duplicate';
                            duplicates.push(token);
                        } else {
                            classification = 'valid';
                            validPMs.add(token);
                            seenPMs.add(token);
                        }
                    } else {
                        invalids.push(token);
                    }
                } else if (token.length === 6) {
                    const corrected = '0' + token;
                    if (this.verificarDigitoVerificador(corrected)) {
                        if (seenPMs.has(corrected)) {
                            classification = 'duplicate';
                            duplicates.push(corrected);
                        } else {
                            classification = 'valid';
                            validPMs.add(corrected);
                            seenPMs.add(corrected);
                        }
                    } else {
                        invalids.push(token);
                    }
                } else { 
                    invalids.push(token);
                }
                highlightedHTML += `<span class="sispmg-${classification}-number">${this.escapeHtml(token)}</span>`;
    
            } else { 
                highlightedHTML += this.escapeHtml(token).replace(/\n/g, '<br>');
            }
        });
    
        return {
            validPMs: Array.from(validPMs).sort(),
            duplicates,
            invalids: invalids.filter(item => item),
            highlightedHTML
        };
    }
    
    closeMultiAddModal() {
        document.body.classList.remove('sispmg-modal-open');
        this.removeElement('#sispmg-multi-add-modal');
        this.removeElement('#sispmg-multi-add-modal-backdrop');
    }

    showProcessingOverlay(total) {
        this.isProcessing = true;
        this.isCancelled = false;
        document.body.classList.add('sispmg-modal-open');

        const overlayHTML = `
            <div id="sispmg-processing-overlay">
                <div class="sispmg-processing-content">
                    <div class="sispmg-spinner"></div>
                    <span id="sispmg-processing-status">Adicionando 0 de ${total}...</span>
                    <button id="sispmg-cancel-processing-btn" class="sispmg-btn sispmg-btn-secondary">Cancelar</button>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', overlayHTML);

        document.getElementById('sispmg-cancel-processing-btn').addEventListener('click', () => {
            this.isCancelled = true;
        });

        this.blockerEventHandler = (e) => {
            if (e.isTrusted && e.target.id !== 'sispmg-cancel-processing-btn') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };

        ['mousedown', 'mouseup', 'click', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress'].forEach(eventType => {
            window.addEventListener(eventType, this.blockerEventHandler, true);
        });
    }

    hideProcessingOverlay() {
        this.isProcessing = false;
        document.body.classList.remove('sispmg-modal-open');
        this.removeElement('#sispmg-processing-overlay');

        if (this.blockerEventHandler) {
            ['mousedown', 'mouseup', 'click', 'contextmenu', 'wheel', 'keydown', 'keyup', 'keypress'].forEach(eventType => {
                window.removeEventListener(eventType, this.blockerEventHandler, true);
            });
            this.blockerEventHandler = null;
        }
    }
    
    showCompletionModal(total, successCount, failedNumbers, inputId) {
        this.closeMultiAddModal();
        document.body.classList.add('sispmg-modal-open');

        let message = `<p>${successCount} de ${total} destinatários foram adicionados com sucesso.</p>`;
        if (failedNumbers.length > 0) {
            message += `<p>Os seguintes números não puderam ser adicionados:</p>
                        <div class="sispmg-failed-list">${failedNumbers.join(', ')}</div>`;
        }

        const modalHTML = `
            <div id="sispmg-multi-add-modal-backdrop"></div>
            <div id="sispmg-multi-add-modal" class="sispmg-completion-modal">
                <div class="sispmg-modal-content">
                     <h3>Processo Concluído</h3>
                     ${message}
                </div>
                <div class="sispmg-modal-footer">
                     <div id="sispmg-info-list"></div>
                     <div class="sispmg-modal-actions">
                         ${failedNumbers.length > 0 ? '<button id="sispmg-retry-btn" class="sispmg-btn sispmg-btn-secondary">Tentar Novamente</button>' : ''}
                         <button id="sispmg-close-btn" class="sispmg-btn sispmg-btn-primary">Fechar</button>
                     </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('sispmg-close-btn').addEventListener('click', () => this.closeMultiAddModal());
        if (failedNumbers.length > 0) {
            document.getElementById('sispmg-retry-btn').addEventListener('click', () => {
                this.closeMultiAddModal();
                this.inserirDestinatariosPorNumero(failedNumbers, inputId);
            });
        }
    }

    async inserirDestinatariosPorNumero(numerosPolicia, inputId) {
        this.showProcessingOverlay(numerosPolicia.length);
        const statusSpan = document.getElementById('sispmg-processing-status');

        const inputField = document.querySelector(`#${inputId}`);
        if (!inputField) {
            console.error("SisPMG+: Campo de input não encontrado:", inputId);
            this.hideProcessingOverlay();
            this.showCompletionModal(numerosPolicia.length, 0, numerosPolicia, inputId);
            return;
        }

        inputField.focus();
        await this.sleep(250); 

        const contactsComponent = inputField.closest('div.cdk-drop-list').nextElementSibling;
        if (!contactsComponent) {
            console.error("SisPMG+: Componente de contatos adjacente não encontrado.");
            this.hideProcessingOverlay();
            this.showCompletionModal(numerosPolicia.length, 0, numerosPolicia, inputId);
            return;
        }
        const modalId = contactsComponent.getAttribute('idmodal');
        const modalContatos = document.getElementById(modalId);
        if (!modalContatos) {
            console.error("SisPMG+: Modal de busca de contatos não encontrado.");
            this.hideProcessingOverlay();
            this.showCompletionModal(numerosPolicia.length, 0, numerosPolicia, inputId);
            return;
        }
        
        let successCount = 0;
        let failedNumbers = [];

        for (const [index, numero] of numerosPolicia.entries()) {
            if (this.isCancelled) {
                failedNumbers.push(...numerosPolicia.slice(index));
                break;
            }
            if (statusSpan) {
                statusSpan.textContent = `Adicionando ${index + 1} de ${numerosPolicia.length}... (${numero})`;
            }
            
            const existingChipsCount = inputField.parentElement.querySelectorAll('span.op-ex').length;
            
            inputField.focus();
            inputField.textContent = numero;
            inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            inputField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));

            const searchResultSelector = `a.item[title*="(${numero})"]`; 
            const resultadoEncontrado = await this.waitForElement(searchResultSelector, modalContatos, 4000);

            if (resultadoEncontrado) {
                resultadoEncontrado.click();
                
                const chipAdded = await new Promise(resolve => {
                    const startTime = Date.now();
                    const interval = setInterval(() => {
                        const currentChipsCount = inputField.parentElement.querySelectorAll('span.op-ex').length;
                        if (currentChipsCount > existingChipsCount) {
                            clearInterval(interval);
                            resolve(true);
                        } else if (Date.now() - startTime > 2000) {
                            clearInterval(interval);
                            resolve(false);
                        }
                    }, 50);
                });

                if (chipAdded) {
                    successCount++;
                } else {
                    console.warn(`SisPMG+: Chip para o número ${numero} não foi adicionado ao DOM após o clique.`);
                    failedNumbers.push(numero);
                }
            } else {
                console.warn(`SisPMG+: Nenhum resultado encontrado para o número ${numero} no tempo esperado.`);
                inputField.textContent = '';
                inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                failedNumbers.push(numero);
            }

            await this.sleep(150);
        }

        this.hideProcessingOverlay();
        this.showCompletionModal(numerosPolicia.length, successCount, failedNumbers, inputId);
    }
    
    waitForElement(selector, parent, timeout = 3000) {
        return new Promise(resolve => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const element = parent.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 50);
        });
    }

    removeElement(selector) {
        const el = document.querySelector(selector);
        if (el) el.remove();
    }
    
    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    restoreCursorAndScroll(element, callback) {
        const scrollTop = element.scrollTop;
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        let charCount = 0;
        if (range) {
            const preSelectionRange = document.createRange();
            preSelectionRange.selectNodeContents(element);
            preSelectionRange.setEnd(range.startContainer, range.startOffset);
            charCount = preSelectionRange.toString().length;
        }

        callback();

        if (range) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let count = 0;
            let targetNode = null;
            let offset = 0;
            while (targetNode = walker.nextNode()) {
                const len = targetNode.textContent.length;
                if (count + len >= charCount) {
                    offset = charCount - count;
                    break;
                }
                count += len;
            }
            if (targetNode) {
                try {
                    const newRange = document.createRange();
                    newRange.setStart(targetNode, offset);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                } catch(e) { console.error("Falha ao restaurar o cursor:", e)}
            }
        }
        element.scrollTop = scrollTop;
    }

    verificarDigitoVerificador(numero) {
        const numStr = String(numero).replace(/\D/g, "");
        if (numStr.length !== 7 || /^0+$/.test(numStr)) return false;

        if (parseInt(numStr, 10) >= 3000000) {
            return false;
        }

        const digitoVerificador = parseInt(numStr.slice(-1));
        const numeroBase = numStr.slice(0, -1);
        let soma = 0;
        for (let i = 0; i < numeroBase.length; i++) {
            let multiplicacao = (i % 2 === 0 ? 1 : 2) * parseInt(numeroBase[i]);
            if (multiplicacao > 9) multiplicacao -= 9;
            soma += multiplicacao;
        }
        const resultado = soma % 10 === 0 ? 0 : 10 - (soma % 10);
        return resultado === digitoVerificador;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
