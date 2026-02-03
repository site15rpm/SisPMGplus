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
            logsArea.innerHTML = '<div class="sispmg-sicor-log-entry">Sem logs recentes.</div>';
            return;
        }
        
        logsArea.innerHTML = logs.map(l => 
            `<div class="sispmg-sicor-log-entry sispmg-sicor-log-${l.type}">[${l.timestamp}] ${l.message}</div>`
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
            overlay.className = 'sispmg-sicor-modal-overlay';

            overlay.innerHTML = `
            <div id="sispmg-sirconv-convenios-modal-container">
                <div id="sispmg-sirconv-convenios-modal" class="sispmg-plus-modal">
                    <div class="sispmg-menu-header">
                        Extração de Convênios - SIRCONV
                        <button id="sispmg-sirconv-convenios-close-btn" class="sispmg-modal-close-btn">&times;</button>
                    </div>
                    <div class="sispmg-modal-body-content">
                        
                        <!-- Seção de Informações -->
                        <div class="sispmg-sicor-form-section" style="margin-bottom: 15px;">
                            <h4>Informações do Sistema</h4>
                            <div class="sispmg-sirconv-convenios-info">
                                <p><strong>Funcionamento Automático:</strong></p>
                                <p style="font-size: 12px; color: #666;">
                                    ✓ Extração executada automaticamente <strong>uma vez por dia</strong><br>
                                    ✓ Acionada quando você navega pelas páginas de convênios<br>
                                    ✓ Registros existentes são atualizados, novos são inseridos<br>
                                    ✓ ID do convênio usado como chave única
                                </p>
                                <p><strong>Destino dos Dados:</strong></p>
                                <p style="font-size: 12px; color: #666;">
                                    Google Sheets configurado automaticamente
                                </p>
                            </div>
                        </div>
                        
                        <!-- Seção de Histórico -->
                        <div class="sispmg-sicor-history-section">
                            <div class="sispmg-sicor-column-header">
                                <h4>Histórico de Execução</h4>
                                <button id="sirconv-convenios-clear-logs-btn">Limpar</button>
                            </div>
                            <div class="sispmg-sicor-log-box" id="sirconv-convenios-logs-area">
                                ${logs.length > 0 ? 
                                    logs.map(l => `<div class="sispmg-sicor-log-entry sispmg-sicor-log-${l.type}">[${l.timestamp}] ${l.message}</div>`).join('') 
                                    : '<div class="sispmg-sicor-log-entry">Sem logs recentes.</div>'}
                            </div>
                        </div>
                    </div>
                    <div class="sispmg-modal-actions">
                        <button id="sirconv-convenios-manual-run" class="sispmg-modal-btn-secondary">Executar Extração Agora</button>
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
        // Botões de fechar
        document.getElementById('sispmg-sirconv-convenios-close-btn')?.addEventListener('click', () => {
            this._closeModal();
        });
        document.getElementById('sispmg-sirconv-convenios-close-footer-btn')?.addEventListener('click', () => {
            this._closeModal();
        });

        // Botão de executar agora
        document.getElementById('sirconv-convenios-manual-run')?.addEventListener('click', async () => {
            await this._runManualExtraction();
        });

        // Botão de limpar logs
        document.getElementById('sirconv-convenios-clear-logs-btn')?.addEventListener('click', async () => {
            if (confirm('Tem certeza que deseja limpar o histórico?')) {
                await sendMessageToBackground('sirconv-convenios-clear-logs', {});
                this._updateLogsDisplay([]);
            }
        });
    }

    async _runManualExtraction() {
        const ui = window.SisPMG_UI;
        const btn = document.getElementById('sirconv-convenios-manual-run');
        
        if (!btn) return;
        
        btn.disabled = true;
        btn.textContent = 'Processando...';
        
        try {
            const res = await sendMessageToBackground('sirconv-convenios-manual-run', {});
            
            if (res.success) {
                ui?.showNotification?.('Extração concluída com sucesso!', 'success');
                // Atualiza logs
                const updatedLogs = await sendMessageToBackground('sirconv-convenios-get-logs', {});
                this._updateLogsDisplay(updatedLogs.logs);
            } else {
                throw new Error(res.error || 'Erro na extração');
            }
        } catch (error) {
            ui?.showNotification?.('Erro: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Executar Extração Agora';
        }
    }

    _closeModal() {
        document.getElementById('sispmg-sirconv-convenios-modal-overlay')?.remove();
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