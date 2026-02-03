/**
 * Módulo: intranet-unidades.js
 * Descrição: Gerencia a interface e interações do modal de configuração de Extração de Unidades.
 * Refatorado para corresponder à estrutura DOM e CSS do Módulo SICOR.
 */
import { sendMessageToBackground } from '../../common/utils.js';

class UnidadesModalHandler {
    constructor() {
        this.name = 'Unidades';
        this.messageListener = null;
    }

    init() {
        console.log('SisPMG+ [Unidades]: Módulo pronto.');
    }

    /** Loga uma mensagem no histórico via background */
    async _logFeedback(message, type = 'info', system = 'FRONTEND') {
        try {
            await sendMessageToBackground('unidades-log-feedback', { message, type, system });
        } catch (e) {
            console.error("SisPMG+ [Unidades]: Falha ao enviar log para background:", e);
        }
    }

    /** Método público para abrir o modal (chamado pelo menu) */
    showConfig() {
        this.renderUnidadesModal();
    }

    /** Renderiza o modal de configuração de Unidades. */
    async renderUnidadesModal() {
        if (document.getElementById('sispmg-unidades-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'sispmg-unidades-modal-overlay';
        overlay.className = 'sispmg-unidades-modal-overlay'; // Estilo definido no CSS global

        // HTML reestruturado para seguir o padrão visual e CSS do SICOR (container, header, body, footer)
        overlay.innerHTML = `
        <div id="sispmg-unidades-modal-container">
            <div id="sispmg-unidades-modal" class="sispmg-plus-modal">
                <div class="sispmg-menu-header">
                    Extração de Unidades e Endereços
                    <button id="sispmg-unidades-close-btn" class="sispmg-modal-close-btn">&times;</button>
                </div>
                <div class="sispmg-modal-body-content">
                    <div class="sispmg-unidades-modal-form-grid">
                        
                        <!-- Coluna 1: Configurações de Extração -->
                        <div class="sispmg-unidades-form-section">
                            <h4>Configurações de Extração</h4>
                            
                            <div class="sispmg-unidades-form-group">
                                <label for="unidades-codigo-unidade">Código da Unidade (cUEOp):</label>
                                <input type="text" id="unidades-codigo-unidade" placeholder="Ex: 6869">
                                <small>Código da unidade raiz para extração</small>
                            </div>

                            <div class="sispmg-unidades-checkbox-group">
                                <label><input type="checkbox" id="unidades-exibir-codigo" checked> Exibir Código</label>
                                <label><input type="checkbox" id="unidades-ver-endereco" checked> Exibir Endereço</label>
                                <label><input type="checkbox" id="unidades-uni-princ"> Apenas Unidade Principal</label>
                            </div>
                        </div>

                        <!-- Coluna 2: Configurações de Automação -->
                        <div class="sispmg-unidades-form-section">
                            <h4>Configurações de Automação</h4>
                            
                            <div class="sispmg-unidades-form-group">
                                <label for="unidades-schedule-frequency">Frequência de Agendamento:</label>
                                <select id="unidades-schedule-frequency">
                                    <option value="none">Nunca</option>
                                    <option value="daily">Diariamente</option>
                                    <option value="weekly">Semanalmente</option>
                                    <option value="monthly">Mensalmente</option>
                                </select>
                                <small>Quando extrair automaticamente</small>
                            </div>
                            
                            <hr>
                            
                            <div class="sispmg-unidades-form-group">
                                <label for="unidades-gas-id">ID Script Google (Sinc. Nuvem):</label>
                                <input type="text" id="unidades-gas-id" placeholder="Cole o ID do script publicado">
                                <small>Deixe em branco para desativar</small>
                            </div>

                            <div class="sispmg-unidades-checkbox-group">
                                <label><input type="checkbox" id="unidades-manter-copia-csv"> Manter cópia CSV nativa</label>
                            </div>
                        </div>

                    </div>
                    
                    <!-- Histórico de Execução (Movido para fora da Grid para corrigir layout) -->
                    <div class="sispmg-unidades-history-section">
                        <h4>Histórico de Execução</h4>
                        <div id="unidades-history-log" class="sispmg-unidades-history-log">
                            <div class="sispmg-unidades-log-entry">Nenhum registro ainda.</div>
                        </div>
                    </div>
                </div>

                <!-- Botões de Ação - Rodapé -->
                <div class="sispmg-modal-actions">
                    <button id="unidades-extract-now-btn" class="sispmg-modal-btn-secondary">
                        Extrair Agora
                    </button>
                    <button id="unidades-save-settings-btn" class="sispmg-modal-btn-primary">
                        Salvar e Agendar
                    </button>
                    <!-- Adicionado botão cancelar para consistência -->
                    <button id="sispmg-unidades-close-footer-btn" class="sispmg-modal-btn-secondary">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
        `;

        // Anexa ao container principal para herdar o escopo de CSS correto
        (document.getElementById('sispmg-plus-container') || document.body).appendChild(overlay);

        // Event Listeners
        this._attachEventListeners();
        
        // Carrega configurações salvas
        await this._loadSettings();

        // Listener para atualização de logs em tempo real
        this.messageListener = (event) => {
            if (event.source === window && event.data?.type === 'FROM_SISPMG_BACKGROUND') {
                if (event.data.action === 'unidades-logs-updated') {
                    this._updateHistoryLog(event.data.logs);
                }
            }
        };
        window.addEventListener('message', this.messageListener);
    }

    _attachEventListeners() {
        // Overlay (referência local)
        const overlay = document.getElementById('sispmg-unidades-modal-overlay');
        if (!overlay) return;

        // Função de fechamento segura
        const closeModal = () => {
            this._closeModal();
        };

        // Fechar modal (X e botão Cancelar)
        overlay.querySelector('#sispmg-unidades-close-btn').addEventListener('click', closeModal);
        overlay.querySelector('#sispmg-unidades-close-footer-btn').addEventListener('click', closeModal);

        // Clique fora do modal fecha (apenas se clicar no overlay background)
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'sispmg-unidades-modal-overlay') {
                closeModal();
            }
        });

        // Salvar configurações
        overlay.querySelector('#unidades-save-settings-btn').addEventListener('click', async () => {
            await this._saveSettings();
        });

        // Extrair agora
        overlay.querySelector('#unidades-extract-now-btn').addEventListener('click', async () => {
            await this._extractNow();
        });
    }

    _closeModal() {
        const overlay = document.getElementById('sispmg-unidades-modal-overlay');
        if (overlay) overlay.remove();
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
        }
    }

    async _loadSettings() {
        try {
            const response = await sendMessageToBackground('unidades-get-settings', {});
            const { settings = {}, logs = [] } = response;

            // Preenche o formulário com os valores salvos
            const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
            const setChk = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };

            setVal('unidades-codigo-unidade', settings.codigoUnidade || '');
            setChk('unidades-exibir-codigo', settings.exibirCodigo ?? true);
            setChk('unidades-ver-endereco', settings.verEndereco ?? true);
            setChk('unidades-uni-princ', settings.uniPrinc ?? false);
            setVal('unidades-schedule-frequency', settings.scheduleFrequency || 'none');
            setVal('unidades-gas-id', settings.gasId || '');
            setChk('unidades-manter-copia-csv', settings.manterCopiaCSV ?? false);

            this._updateHistoryLog(logs);
        } catch (e) {
            console.error("SisPMG+ [Unidades]: Erro ao carregar configurações.", e);
            await this._showInfoModal('Erro ao carregar configurações.', 'error');
        }
    }

    async _saveSettings() {
        try {
            const settings = {
                codigoUnidade: document.getElementById('unidades-codigo-unidade').value.trim(),
                exibirCodigo: document.getElementById('unidades-exibir-codigo').checked,
                verEndereco: document.getElementById('unidades-ver-endereco').checked,
                uniPrinc: document.getElementById('unidades-uni-princ').checked,
                scheduleFrequency: document.getElementById('unidades-schedule-frequency').value,
                gasId: document.getElementById('unidades-gas-id').value.trim(),
                manterCopiaCSV: document.getElementById('unidades-manter-copia-csv').checked
            };

            // Validação básica
            if (!settings.codigoUnidade) {
                await this._showInfoModal('Por favor, informe o código da unidade.', 'error');
                return;
            }

            const response = await sendMessageToBackground('unidades-save-settings', { settings });
            
            if (response.success) {
                await this._showInfoModal('Configurações salvas e agendamento atualizado com sucesso!', 'success');
                await this._logFeedback('Configurações salvas pelo usuário.', 'info');
            } else {
                throw new Error(response.error || 'Erro desconhecido');
            }
        } catch (e) {
            console.error("SisPMG+ [Unidades]: Erro ao salvar configurações.", e);
            await this._showInfoModal('Erro ao salvar configurações: ' + e.message, 'error');
        }
    }

    async _extractNow() {
        try {
            const btn = document.getElementById('unidades-extract-now-btn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Extraindo...';

            await this._logFeedback('Extração manual iniciada pelo usuário.', 'info');

            const response = await sendMessageToBackground('unidades-extract-now', {});
            
            if (response.success) {
                await this._showInfoModal('Extração concluída com sucesso!', 'success');
            } else {
                throw new Error(response.error || 'Erro na extração');
            }
        } catch (e) {
            console.error("SisPMG+ [Unidades]: Erro na extração.", e);
            await this._showInfoModal('Erro na extração: ' + e.message, 'error');
        } finally {
            const btn = document.getElementById('unidades-extract-now-btn');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Extrair Agora'; // Reset texto original
            }
        }
    }

    _updateHistoryLog(logs) {
        const logBox = document.getElementById('unidades-history-log');
        if (!logBox) return;
        
        logBox.innerHTML = (!logs || logs.length === 0)
            ? '<div class="sispmg-unidades-log-entry">Nenhum registro.</div>'
            : logs.map(log => `
                <div class="sispmg-unidades-log-entry sispmg-unidades-log-${log.type}">
                    <span class="sispmg-unidades-log-timestamp">${log.timestamp}</span>
                    <span class="sispmg-unidades-log-system">${log.system}:</span>
                    <span class="sispmg-unidades-log-message">${log.message}</span>
                </div>`).join('');
        logBox.scrollTop = 0;
    }

    async _showInfoModal(message, type = 'info') {
        return new Promise((resolve) => {
            const existingModal = document.getElementById('sispmg-info-modal-overlay');
            if (existingModal) existingModal.remove();

            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'sispmg-info-modal-overlay';
            // Reutiliza o estilo do modal de confirmação (agora padronizado globalmente ou via CSS específico se necessário)
            modalOverlay.className = 'sispmg-confirmation-modal-overlay'; 

            let title = 'Aviso';
            let titleColor = '#b3a368'; // Dourado padrão
            if (type === 'success') {
                title = 'Sucesso';
                titleColor = '#28a745';
            } else if (type === 'error') {
                title = 'Erro';
                titleColor = '#dc3545';
            }

            modalOverlay.innerHTML = `
                <div class="sispmg-confirmation-modal-content">
                    <h3 style="text-align: center; margin-top: 0; color: ${titleColor};">${title}</h3>
                    <p style="text-align: center; margin-bottom: 25px;">${message}</p>
                    <div class="sispmg-confirmation-modal-actions" style="justify-content: center;">
                        <button id="sispmg-info-ok-btn" class="sispmg-modal-btn-primary">OK</button>
                    </div>
                </div>
            `;

            const removeModal = () => {
                modalOverlay.remove();
                resolve();
            };

            modalOverlay.querySelector('#sispmg-info-ok-btn').addEventListener('click', removeModal);
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) removeModal();
            });

            (document.getElementById('sispmg-plus-container') || document.body).appendChild(modalOverlay);
            modalOverlay.querySelector('#sispmg-info-ok-btn').focus();
        });
    }

    destroyUnidadesModule() {
        const overlay = document.getElementById('sispmg-unidades-modal-overlay');
        if (overlay) overlay.remove();
        const infoOverlay = document.getElementById('sispmg-info-modal-overlay');
        if (infoOverlay) infoOverlay.remove();
        if (this.messageListener) window.removeEventListener('message', this.messageListener);
        this.messageListener = null;
        console.log("SisPMG+ [Unidades]: Módulo descarregado.");
    }
}

// Funções de inicialização e destruição exportadas
export function initUnidadesModule() {
    const ui = window.SisPMG_UI;
    const unidadesInstance = new UnidadesModalHandler();
    unidadesInstance.init();
    if (ui?.registerModule) {
        ui.registerModule({ name: unidadesInstance.name, instance: unidadesInstance });
    } else {
        console.error('SisPMG+ [Unidades]: Módulo de UI não encontrado.');
    }
}

export function destroyUnidadesModule() {
    const ui = window.SisPMG_UI;
    if (ui?.getModuleInstance) {
        const instance = ui.getModuleInstance('Unidades');
        if (instance?.destroyUnidadesModule) {
            instance.destroyUnidadesModule();
            ui.unregisterModule('Unidades');
        }
    }
}