// Arquivo: modules/intranet/intranet-sirconv-convenios.js
// Módulo: Extração de Convênios
// Funcionalidade: Extração automática de convênios (SIRCONV -> GAS) com histórico de execução

import { sendMessageToBackground, getCookie, decodeJwt } from '../../common/utils.js';

export class SirconvConveniosModule {
    constructor(config) {
        this.config = config;
        this.name = 'Extração de Convênios';
        this.iconSVG = config.iconSVG_28 ? config.iconSVG_28.replace('width="28"', 'width="22"').replace('height="28"', 'height="22"') : '';
        this.currentUser = null;
        this.currentUnit = null;
        this.messageListener = null;
    }

    init() {
        console.log('SisPMG+ [SIRCONV Convenios]: Módulo iniciado.');
        
        // Identifica o usuário para gatilhos automáticos
        this.identifyUser();
        
        // Listener para atualizações de logs
        this._setupMessageListener();
    }

    identifyUser() {
        const token = getCookie('tokiuz');
        if (token) {
            const decoded = decodeJwt(token);
            if (decoded) {
                this.currentUser = decoded.g; // Número PM
                this.currentUnit = decoded.u; // Código da Unidade
                
                // Notifica o background para extração automática
                sendMessageToBackground('intranet-user-identified', {
                    userPM: this.currentUser,
                    unitCode: this.currentUnit,
                    system: 'SIRCONV'
                });
            }
        }
    }

    _setupMessageListener() {
        if (this.messageListener) return;
        
        this.messageListener = (event) => {
            if (event.source === window && event.data?.type === 'FROM_SISPMG_BACKGROUND') {
                if (event.data.action === 'sirconv-convenios-logs-updated') {
                    this._updateLogsDisplay(event.data.logs);
                }
            }
        };
        
        window.addEventListener('message', this.messageListener);
    }

    _updateLogsDisplay(logs) {
        const logsArea = document.getElementById('sirconv-convenios-logs-area');
        if (!logsArea) return;
        
        if (!logs || logs.length === 0) {
            logsArea.innerHTML = '<div class="sispmg-sirconv-convenios-log-entry">Sem logs recentes.</div>';
            return;
        }
        
        logsArea.innerHTML = logs.map(log => 
            `<div class="sispmg-sirconv-convenios-log-entry sispmg-sirconv-convenios-log-${log.type || 'info'}">
                <span class="sispmg-sirconv-convenios-log-timestamp">${log.timestamp}</span>
                <span class="sispmg-sirconv-convenios-log-system">${log.system || 'SISTEMA'}:</span>
                <span class="sispmg-sirconv-convenios-log-message">${log.message}</span>
            </div>`
        ).join('');
        
        logsArea.scrollTop = 0;
    }

    // Método chamado pela UI para abrir o modal
    showConfig() {
        this.showSirconvConveniosModal();
    }

    async showSirconvConveniosModal() {
        if (document.getElementById('sispmg-sirconv-convenios-modal-overlay')) return;

        const ui = window.SisPMG_UI;
        if (!ui) return;

        ui.showLoader();
        
        try {
            // Busca logs
            const logsRes = await sendMessageToBackground('sirconv-convenios-get-logs', {});
            const logs = logsRes.logs || [];

            const overlay = document.createElement('div');
            overlay.id = 'sispmg-sirconv-convenios-modal-overlay';
            overlay.className = 'sispmg-sirconv-convenios-modal-overlay';

            overlay.innerHTML = `
            <div id="sispmg-sirconv-convenios-modal-container">
                <div id="sispmg-sirconv-convenios-modal" class="sispmg-plus-modal">
                    <div class="sispmg-menu-header">
                        Extração de Convênios - SIRCONV
                        <button id="sispmg-sirconv-convenios-close-btn" class="sispmg-modal-close-btn">&times;</button>
                    </div>
                    <div class="sispmg-modal-body-content">
                        
                        <!-- Seção de Informações -->
                        <div class="sispmg-sirconv-convenios-form-section">
                            <h4>Informações do Sistema</h4>
                            <div class="sispmg-sirconv-convenios-info">
                                <p><strong>Funcionamento Automático:</strong></p>
                                <p>
                                    ✓ A extração é executada automaticamente <strong>uma vez por dia</strong> por usuário.<br>
                                    ✓ O gatilho é a sua navegação em qualquer página do sistema de convênios.<br>
                                    ✓ Registros existentes são atualizados e novos são inseridos com base no ID único do convênio.
                                </p>
                                <p><strong>Destino dos Dados:</strong></p>
                                <p>
                                    Os dados são enviados para uma planilha Google Sheets pré-configurada pela equipe de desenvolvimento.
                                </p>
                            </div>
                        </div>
                        
                        <!-- Seção de Histórico -->
                        <div class="sispmg-sirconv-convenios-history-section">
                            <div class="sispmg-sirconv-convenios-column-header">
                                <h4>Histórico de Execução</h4>
                                <button id="sirconv-convenios-clear-logs-btn">Limpar</button>
                            </div>
                            <div class="sispmg-sirconv-convenios-log-box" id="sirconv-convenios-logs-area">
                                ${logs.length > 0 ?
                                    logs.map(log => `
                                    <div class="sispmg-sirconv-convenios-log-entry sispmg-sirconv-convenios-log-${log.type || 'info'}">
                                        <span class="sispmg-sirconv-convenios-log-timestamp">${log.timestamp}</span>
                                        <span class="sispmg-sirconv-convenios-log-system">${log.system || 'SISTEMA'}:</span>
                                        <span class="sispmg-sirconv-convenios-log-message">${log.message}</span>
                                    </div>`).join('')
                                    : '<div class="sispmg-sirconv-convenios-log-entry">Sem logs recentes.</div>'
                                }
                            </div>
                        </div>
                    </div>
                    <div class="sispmg-modal-actions">
                        <button id="sirconv-convenios-manual-run" class="sispmg-modal-btn-secondary">Extrair Agora</button>
                        <button id="sispmg-sirconv-convenios-close-footer-btn" class="sispmg-modal-btn-secondary">Fechar</button>
                    </div>
                </div>
            </div>`;

            ui.hideLoader();
            (document.getElementById('sispmg-plus-container') || document.body).appendChild(overlay);

            // Bind events
            this._bindModalEvents();

        } catch (error) {
            ui.hideLoader();
            console.error('SisPMG+ [SIRCONV Convenios]: Erro ao carregar modal', error);
            ui.showNotification?.('Falha ao carregar histórico.', 'error');
        }
    }

    _bindModalEvents() {
        const overlay = document.getElementById('sispmg-sirconv-convenios-modal-overlay');
        if (!overlay) return;

        const closeModal = () => this._closeModal();

        // Botões de fechar
        overlay.querySelector('#sispmg-sirconv-convenios-close-btn').addEventListener('click', closeModal);
        overlay.querySelector('#sispmg-sirconv-convenios-close-footer-btn').addEventListener('click', closeModal);
        
        // Clique fora do modal
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'sispmg-sirconv-convenios-modal-overlay') {
                closeModal();
            }
        });

        // Botão de executar agora
        overlay.querySelector('#sirconv-convenios-manual-run').addEventListener('click', () => this._runManualExtraction());

        // Botão de limpar logs
        overlay.querySelector('#sirconv-convenios-clear-logs-btn').addEventListener('click', () => {
            this._showConfirmationModal(
                'Tem certeza que deseja limpar o histórico?',
                async () => {
                    const response = await sendMessageToBackground('sirconv-convenios-clear-logs', {});
                    if (response.success) {
                        this._updateLogsDisplay(response.logs || []);
                    } else {
                        await this._showInfoModal('Falha ao limpar o histórico.', 'error');
                    }
                }
            );
        });
    }

    async _runManualExtraction() {
        const btn = document.getElementById('sirconv-convenios-manual-run');
        if (!btn) return;
        
        btn.disabled = true;
        btn.textContent = 'Processando...';
        
        try {
            const res = await sendMessageToBackground('sirconv-convenios-manual-run', {});
            
            if (res.success) {
                await this._showInfoModal('Extração manual concluída com sucesso!', 'success');
                const updatedLogs = await sendMessageToBackground('sirconv-convenios-get-logs', {});
                this._updateLogsDisplay(updatedLogs.logs);
            } else {
                throw new Error(res.error || 'Erro desconhecido na extração');
            }
        } catch (error) {
            await this._showInfoModal('Erro na extração manual: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Executar Extração Agora';
        }
    }

    _closeModal() {
        document.getElementById('sispmg-sirconv-convenios-modal-overlay')?.remove();
    }

    // --- Funções de Modal Auxiliares (padrão SIRCONV) ---

    async _showConfirmationModal(message, onConfirm) {
        const overlayId = 'sispmg-confirmation-modal-overlay';
        document.getElementById(overlayId)?.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = overlayId;
        modalOverlay.className = 'sispmg-confirmation-modal-overlay';

        modalOverlay.innerHTML = `
            <div class="sispmg-confirmation-modal-content">
                <p>${message}</p>
                <div class="sispmg-confirmation-modal-actions">
                    <button id="sispmg-confirm-btn" class="sispmg-modal-btn-primary">Confirmar</button>
                    <button id="sispmg-cancel-btn" class="sispmg-modal-btn-secondary">Cancelar</button>
                </div>
            </div>
        `;

        const removeModal = () => modalOverlay.remove();
        const confirmBtn = modalOverlay.querySelector('#sispmg-confirm-btn');
        const cancelBtn = modalOverlay.querySelector('#sispmg-cancel-btn');

        confirmBtn.addEventListener('click', async () => {
            if (typeof onConfirm === 'function') await onConfirm();
            removeModal();
        });

        cancelBtn.addEventListener('click', removeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) removeModal();
        });

        (document.getElementById('sispmg-plus-container') || document.body).appendChild(modalOverlay);
        confirmBtn.focus();
    }

    async _showInfoModal(message, type = 'info') {
        return new Promise((resolve) => {
            const overlayId = 'sispmg-info-modal-overlay';
            document.getElementById(overlayId)?.remove();

            const modalOverlay = document.createElement('div');
            modalOverlay.id = overlayId;
            modalOverlay.className = 'sispmg-confirmation-modal-overlay'; 

            let title = 'Aviso';
            let titleColor = '#007bff';
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
            const okBtn = modalOverlay.querySelector('#sispmg-info-ok-btn');
            okBtn.addEventListener('click', removeModal);
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) removeModal();
            });

            (document.getElementById('sispmg-plus-container') || document.body).appendChild(modalOverlay);
            okBtn.focus();
        });
    }

    destroy() {
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
        }
        this._closeModal();
    }
}

// --- Funções de Interface do Módulo (Padrão Loader) ---

let instance = null;

export function initSirconvConveniosModule(config) {
    if (!instance) {
        instance = new SirconvConveniosModule(config);
        instance.init();
    }

    const ui = window.SisPMG_UI;
    if (ui && typeof ui.registerModule === 'function') {
        ui.registerModule({ 
            name: instance.name, 
            instance: instance 
        });
        console.log('SisPMG+ [SIRCONV Convenios]: Módulo registrado no menu.');
    } else {
        console.warn('SisPMG+ [SIRCONV Convenios]: UI não disponível para registro.');
    }
}

export function destroySirconvConveniosModule() {
    if (instance) {
        instance.destroy();
        instance = null;
        console.log('SisPMG+ [SIRCONV Convenios]: Módulo descarregado.');
    }
}