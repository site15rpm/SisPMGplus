/**
 * Módulo: intranet-sicor.js
 * Descrição: Gerencia a interface e interações do modal de configuração do SICOR.
 */
import { sendMessageToBackground } from '../../common/utils.js';

// Constante para a chave de armazenamento da data inicial
const SICOR_START_DATE_KEY = 'sicorLastStartDate';

class SicorModalHandler {
    constructor() {
        this.name = 'SICOR';
        this.messageListener = null; // Para armazenar a referência do listener
        this.isLoadingUnits = false; // Flag para evitar múltiplas chamadas
        this.userTimezone = 'America/Sao_Paulo'; // Fuso horário do Brasil
        // Padrão é TRAVADO (isDateLocked = true), atualizando para dia anterior
        this.isDateLocked = true; 

        this.tiposEnvolvidoLista = [
            'Acidentado', 'Acusado', 'Anônimo', 'Autor', 'Autor da notícia',
            'Comunicado', 'Comunicante', 'Condutor', 'Conduzido', 'Defensor',
            'Indicado', 'Indiciado', 'Investigado', 'Não Identificado',
            'Ofendido/Recla', 'Outro', 'Querelado', 'Querelante', 'Relator',
            'Reu', 'Sindicado', 'Testemunha', 'Vítima'
        ];
    }

    init() {
        console.log('SisPMG+ [SICOR]: Módulo pronto.');
    }

    /** Loga uma mensagem no histórico via background */
    async _logFeedback(message, type = 'info', system = 'FRONTEND') {
         try {
             // A atualização do log virá pela mensagem do background
             await sendMessageToBackground('sicor-log-feedback', { message, type, system });
         } catch (e) {
             console.error("SisPMG+ [SICOR]: Falha ao enviar log para background:", e);
         }
     }


    /** Obtém a data atual no fuso horário especificado. */
    _getCurrentDateInTimezone() {
        const now = new Date();
        const zonedTime = now.toLocaleString("en-US", { timeZone: this.userTimezone });
        return new Date(zonedTime);
    }

    /** Formata um objeto Date para YYYY-MM-DD. */
    _formatDate(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
             const today = new Date();
             return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    /** Renderiza o modal de configuração do SICOR. */
    async renderSicorModal() {
        if (document.getElementById('sispmg-sicor-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'sispmg-sicor-modal-overlay';
        overlay.className = 'sispmg-sicor-modal-overlay';

        // Ajuste: Grid de 2 colunas, histórico fora do grid
        overlay.innerHTML = `
        <div id="sispmg-sicor-modal-container">
            <div id="sispmg-sicor-modal" class="sispmg-plus-modal">
                <div class="sispmg-menu-header">
                    Configurações do Módulo SICOR
                    <button id="sispmg-sicor-close-btn" class="sispmg-modal-close-btn">&times;</button>
                </div>
                <div class="sispmg-modal-body-content">
                    <div class="sispmg-sicor-modal-form-grid">
                        
                        <!-- Coluna 1: Configurações de Extração -->
                        <div class="sispmg-sicor-form-section">
                            <h4>Configurações de Extração</h4>
                            <div class="sispmg-sicor-form-group sispmg-sicor-date-group">
                                <div>
                                    <label for="sicor-data-ini">Data Inicial:</label>
                                    <input type="date" id="sicor-data-ini">
                                    <small>Data fixa (manual)</small>
                                </div>
                                <div>
                                    <label for="sicor-data-fim">Data Final:</label>
                                    <div class="sispmg-sicor-date-input-wrapper">
                                        <input type="date" id="sicor-data-fim">
                                        <button type="button" id="sicor-toggle-date-lock-btn" class="sispmg-sicor-date-lock-btn" title="Travar/Destravar data final">
                                            <svg id="sicor-lock-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                                <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM5 8h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>
                                            </svg>
                                            <svg id="sicor-unlock-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="display: none;">
                                                <path d="M11 1a2 2 0 0 0-2 2v4H6V3a2 2 0 0 1 2-2zM6 3a3 3 0 0 1 6 0v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3V3zM5 8h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>
                                            </svg>
                                        </button>
                                    </div>
                                    <small id="sicor-data-fim-helper">Dia anterior (automático)</small>
                                </div>
                            </div>
                            <hr>
                             <div class="sispmg-sicor-form-group" id="sicor-unit-container">
                                <label for="sicor-unidade-select">Unidade:</label>
                                <p id="sicor-unit-loading-msg" style="font-size: 12px; color: #666;">Carregando unidades...</p>
                                <select id="sicor-unidade-select" style="display: none;"></select>
                                <input type="text" id="sicor-unidade-id" placeholder="Ex: 9970" style="display: none;">
                                <small id="sicor-unidade-helper"></small>
                            </div>
                            <div class="sispmg-sicor-checkbox-group sispmg-sicor-checkbox-group-inline">
                                <label><input type="checkbox" id="sicor-incluir-subordinadas" checked> Incluir unidades subordinadas</label>
                                <label><input type="checkbox" id="sicor-trazer-envolvidos" checked> Trazer envolvidos</label>
                            </div>
                             <hr>
                            <div class="sispmg-sicor-form-group">
                                <label>Período Baseado em:</label>
                                <div class="sispmg-sicor-radio-group sispmg-sicor-radio-group-inline">
                                    <label><input type="radio" name="sicor-periodo-tipo" value="DATA_FATO" checked> Fato</label>
                                    <label><input type="radio" name="sicor-periodo-tipo" value="DATA_INSTAURACAO"> Instauração</label>
                                    <label><input type="radio" name="sicor-periodo-tipo" value="DATA_SOLUCAO"> Solução</label>
                                </div>
                            </div>
                        </div>

                        <!-- Coluna 2: Configurações de Automação -->
                        <div class="sispmg-sicor-form-section">
                            <h4>Configurações de Automação</h4>
                             <div class="sispmg-sicor-form-group">
                                <label for="sicor-schedule-frequency">Frequência de Agendamento:</label>
                                <select id="sicor-schedule-frequency">
                                    <option value="none">Nunca</option>
                                    <option value="daily">Diariamente</option>
                                    <option value="weekly">Semanalmente</option>
                                    <option value="monthly">Mensalmente</option>
                                </select>
                                <small>Clique para selecionar</small>
                             </div>
                             <hr>
                             <div class="sispmg-sicor-form-group">
                                 <label for="sicor-gas-id">ID Script Google (Sinc. Nuvem):</label>
                                 <input type="text" id="sicor-gas-id" placeholder="Cole o ID do script publicado">
                                 <small>Deixe em branco para desativar</small>
                             </div>
                            <div class="sispmg-sicor-checkbox-group sispmg-sicor-checkbox-group-inline">
                                <label><input type="checkbox" id="sicor-manter-copia-xls"> Manter cópia XLS nativo</label>
                                <label><input type="checkbox" id="sicor-manter-copia-csv"> Manter cópia CSV tratado</label>
                            </div>
                            <hr>
                            <div class="sispmg-sicor-form-group">
                                <label>Filtrar Tipo Envolvido (para CSV tratado):</label>
                                <div id="sicor-tipo-envolvido-filter">
                                    <!-- Checkboxes serão inseridos aqui pelo JS -->
                                </div>
                            </div>
                        </div>
                    </div>
                     <div class="sispmg-sicor-history-section">
                         <div class="sispmg-sicor-column-header">
                             <h4>Histórico de Execução</h4>
                             <button id="sicor-clear-history-btn">Limpar</button>
                         </div>
                         <div class="sispmg-sicor-log-box" id="sicor-history-log"></div>
                     </div>
                 </div>
                <div class="sispmg-modal-actions">
                    <button id="sicor-extract-now-btn" class="sispmg-modal-btn-secondary">Extrair Agora</button>
                    <button id="sicor-save-settings-btn" class="sispmg-modal-btn-primary">Salvar e Agendar</button>
                    <button id="sispmg-sicor-close-footer-btn" class="sispmg-modal-btn-secondary">Cancelar</button>
                </div>
            </div>
        </div>`;

        (document.getElementById('sispmg-plus-container') || document.body).appendChild(overlay);

        this._renderTipoEnvolvidoCheckboxes(); // Renderiza os checkboxes
        this._bindModalEvents();
        await this._loadSettingsAndUnits();
    }

    _renderTipoEnvolvidoCheckboxes() {
        const container = document.getElementById('sicor-tipo-envolvido-filter');
        if (!container) return;

        // Botão "Selecionar Todos"
        const selectAllLabel = document.createElement('label');
        selectAllLabel.className = 'sicor-tipo-select-all';
        selectAllLabel.innerHTML = `<input type="checkbox" id="sicor-tipo-envolvido-select-all" checked> <b>Selecionar Todos</b>`;
        container.appendChild(selectAllLabel);

        this.tiposEnvolvidoLista.forEach(tipo => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" class="sicor-tipo-envolvido-chk" value="${tipo}" checked> ${tipo}`;
            container.appendChild(label);
        });

        // Lógica do "Selecionar Todos"
        document.getElementById('sicor-tipo-envolvido-select-all').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            container.querySelectorAll('.sicor-tipo-envolvido-chk').forEach(chk => {
                chk.checked = isChecked;
            });
        });

        // Lógica para desmarcar o "Selecionar Todos" se um item for desmarcado
        container.addEventListener('change', (e) => {
            if (e.target.classList.contains('sicor-tipo-envolvido-chk') && !e.target.checked) {
                document.getElementById('sicor-tipo-envolvido-select-all').checked = false;
            } else if (e.target.classList.contains('sicor-tipo-envolvido-chk')) {
                // Verifica se todos estão marcados
                const allChecked = Array.from(container.querySelectorAll('.sicor-tipo-envolvido-chk')).every(chk => chk.checked);
                document.getElementById('sicor-tipo-envolvido-select-all').checked = allChecked;
            }
        });
    }

    _bindModalEvents() {
        const overlay = document.getElementById('sispmg-sicor-modal-overlay');
        if (!overlay) return;
        const closeModal = () => { if (overlay?.parentNode) { overlay.remove(); if (this.messageListener) window.removeEventListener('message', this.messageListener); this.messageListener = null; } };
        overlay.querySelector('#sispmg-sicor-close-btn').addEventListener('click', closeModal);
        overlay.querySelector('#sispmg-sicor-close-footer-btn').addEventListener('click', closeModal);
        overlay.querySelector('#sicor-extract-now-btn').addEventListener('click', this._handleExtractNow.bind(this));
        overlay.querySelector('#sicor-save-settings-btn').addEventListener('click', this._handleSaveSettings.bind(this));
        overlay.querySelector('#sicor-clear-history-btn').addEventListener('click', this._handleClearLogs.bind(this));
        
        // Adiciona listener para o novo botão de trava
        overlay.querySelector('#sicor-toggle-date-lock-btn').addEventListener('click', this._toggleDateLock.bind(this));


        // Listener para logs do background
        this.messageListener = (event) => {
            if (event.source === window && event.data?.type === 'FROM_SISPMG_BACKGROUND' && event.data.action === 'sicor-logs-updated') {
                this._updateHistoryLog(event.data.logs);
            }
        };
        window.addEventListener('message', this.messageListener);
    }

    _getSettingsFromForm() {
        const unitSelect = document.getElementById('sicor-unidade-select');
        let unidadeId = '', unitName = '', unidadeValue = '';
        if (unitSelect?.style.display !== 'none' && unitSelect?.selectedIndex > -1) {
            unidadeValue = unitSelect.options[unitSelect.selectedIndex].value;
            unidadeId = unidadeValue.match(/id = (\d+)/)?.[1] || '';
            unitName = unidadeValue.match(/nome sintese: ([^"]+)/)?.[1] || '';
        } else {
            const unitIdInput = document.getElementById('sicor-unidade-id');
            unidadeId = unitIdInput?.style.display !== 'none' ? (unitIdInput.value || '') : '';
        }
        return {
            gasId: document.getElementById('sicor-gas-id')?.value.trim() ?? '',
            manterCopiaXls: document.getElementById('sicor-manter-copia-xls')?.checked ?? true,
            manterCopiaCsv: document.getElementById('sicor-manter-copia-csv')?.checked ?? true,
            dataIni: document.getElementById('sicor-data-ini')?.value ?? '',
            dataFim: document.getElementById('sicor-data-fim')?.value ?? '',
            unidadeId, unitName, unidadeValue,
            incluirSubordinadas: document.getElementById('sicor-incluir-subordinadas')?.checked ?? true,
            trazerEnvolvidos: document.getElementById('sicor-trazer-envolvidos')?.checked ?? true,
            periodoTipo: document.querySelector('input[name="sicor-periodo-tipo"]:checked')?.value ?? 'DATA_FATO',
            scheduleFrequency: document.getElementById('sicor-schedule-frequency')?.value ?? 'none',
            tiposEnvolvidoSelecionados: Array.from(document.querySelectorAll('.sicor-tipo-envolvido-chk:checked')).map(chk => chk.value),
            isDateLocked: this.isDateLocked, // Salva o estado da trava
        };
    }

    /** Alterna o estado de trava da data final */
    _toggleDateLock(e) {
        if (e) e.preventDefault();
        this.isDateLocked = !this.isDateLocked; // Inverte o estado
        const dateInput = document.getElementById('sicor-data-fim');

        if (this.isDateLocked) {
            // Se TRAVOU, define para 'dia anterior'
            const today = this._getCurrentDateInTimezone();
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            dateInput.value = this._formatDate(yesterday);
        } else {
            // Se DESTRAVOU, não faz nada com o valor (mantém o que estava)
            // O usuário agora pode editar e salvará esse valor fixo.
        }
        // Atualiza a UI (ícone, estado disabled e texto auxiliar)
        this._updateDateLockUI();
    }

    /** Atualiza a UI do botão de trava e do input de data */
    _updateDateLockUI() {
        const dateInput = document.getElementById('sicor-data-fim');
        const lockIcon = document.getElementById('sicor-lock-icon');
        const unlockIcon = document.getElementById('sicor-unlock-icon');
        const helperText = document.getElementById('sicor-data-fim-helper');

        if (!dateInput || !lockIcon || !unlockIcon || !helperText) return;

        if (this.isDateLocked) {
            // TRAVADO
            dateInput.disabled = true;
            lockIcon.style.display = 'block';
            unlockIcon.style.display = 'none';
            helperText.textContent = 'Dia anterior (automático)';
        } else {
            // DESTRAVADO
            dateInput.disabled = false;
            lockIcon.style.display = 'none';
            unlockIcon.style.display = 'block';
            helperText.textContent = 'Data fixa (manual)';
        }
    }


    _isDateRangeMultiYear(startDateStr, endDateStr) {
        try {
            const startYear = new Date(startDateStr + 'T00:00:00Z').getUTCFullYear();
            const endYear = new Date(endDateStr + 'T00:00:00Z').getUTCFullYear();
            return !isNaN(startYear) && !isNaN(endYear) && startYear !== endYear;
        } catch { return false; }
    }

    async _handleExtractNow() {
        const settings = this._getSettingsFromForm();
        if (!settings.dataIni || !settings.dataFim) return await this._logFeedback('Datas são obrigatórias.', 'error');
        if (!settings.unidadeId) return await this._logFeedback('Unidade é obrigatória.', 'error');
        if (settings.tiposEnvolvidoSelecionados.length === 0) return await this._logFeedback('Selecione pelo menos um Tipo Envolvido.', 'error');

        const btn = document.getElementById('sicor-extract-now-btn');
        btn.disabled = true; btn.textContent = 'Extraindo...';
        await this._logFeedback('Iniciando extração manual...', 'info');

        const response = await sendMessageToBackground('sicor-extract-now', { settings });

        btn.disabled = false; btn.textContent = 'Extrair Agora';
    }

    async _handleSaveSettings() {
        const settings = this._getSettingsFromForm();
        if (!settings.unidadeId) {
            await this._showInfoModal('Unidade é obrigatória para salvar.', 'error'); // Modificado
            return;
        }
        if (settings.tiposEnvolvidoSelecionados.length === 0) {
            await this._showInfoModal('Selecione pelo menos um Tipo Envolvido para salvar.', 'error'); // Modificado
            return;
        }

        await sendMessageToBackground('setStorage', { [SICOR_START_DATE_KEY]: settings.dataIni, storageType: 'local' });
        const response = await sendMessageToBackground('sicor-save-settings', { settings });

        // --- Início da Modificação: Adiciona modal de feedback ---
        if (response?.success) {
            await this._showInfoModal('Configurações salvas e agendamento atualizado com sucesso!', 'success');
        } else {
            await this._showInfoModal(`Falha ao salvar: ${response?.error || 'Erro desconhecido.'}`, 'error');
        }
        // --- Fim da Modificação ---
    }

    async _handleClearLogs() {
        await this._showConfirmationModal(
            'Limpar histórico de execuções do SICOR?',
            async () => {
                await sendMessageToBackground('sicor-clear-logs');
            }
        );
        (document.getElementById('sispmg-plus-container') || document.body).appendChild(modalOverlay);
    }

    async _loadSettingsAndUnits() {
        const unitSelect = document.getElementById('sicor-unidade-select');
        const unitIdInput = document.getElementById('sicor-unidade-id');
        const loadingMsg = document.getElementById('sicor-unit-loading-msg');
        const helperMsg = document.getElementById('sicor-unidade-helper');

        const settingsResponse = await sendMessageToBackground('sicor-get-settings');
        const settings = settingsResponse?.settings || {};
        const logs = settingsResponse?.logs || [];
        await this._populateFormFields(settings, logs);

        if (this.isLoadingUnits) return;
        this.isLoadingUnits = true;
        loadingMsg.textContent = 'Carregando unidades...'; loadingMsg.style.display = 'block';
        unitSelect.style.display = 'none'; unitIdInput.style.display = 'none'; helperMsg.textContent = '';

        try {
            const unitResponse = await sendMessageToBackground('sicor-fetch-units');
            if (unitResponse?.success && unitResponse.selectOptionsHTML) {
                unitSelect.innerHTML = unitResponse.selectOptionsHTML;
                unitSelect.style.display = 'block'; unitIdInput.style.display = 'none'; helperMsg.textContent = 'Clique para selecionar.';
                if (settings.unidadeValue) {
                    unitSelect.value = settings.unidadeValue;
                    if (unitSelect.value !== settings.unidadeValue) helperMsg.textContent = 'Salva não encontrada. Selecione.';
                } else if (settings.unidadeId) {
                     const opt = Array.from(unitSelect.options).find(o => o.value.includes(`id = ${settings.unidadeId}`));
                     if (opt) unitSelect.value = opt.value; else helperMsg.textContent = 'ID salvo não encontrado. Selecione.';
                }
            } else { throw new Error(unitResponse?.error || 'Erro ao carregar unidades.'); }
        } catch (error) {
            unitSelect.style.display = 'none'; unitIdInput.style.display = 'block';
            unitIdInput.value = settings.unidadeId || '';
            helperMsg.textContent = `Erro: ${error.message}. Insira código manual.`;
            await this._logFeedback(`Falha ao carregar unidades: ${error.message}`, 'error', 'SISTEMA');
        } finally {
            loadingMsg.style.display = 'none';
            this.isLoadingUnits = false;
        }
    }

    async _populateFormFields(settings, logs) {
        // Carrega o estado da trava ANTES de definir as datas
        // Se 'isDateLocked' for undefined (config antiga), assume true (travado)
        this.isDateLocked = settings.isDateLocked ?? true;

        const today = this._getCurrentDateInTimezone();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
        const resp = await sendMessageToBackground('getStorage', { key: [SICOR_START_DATE_KEY], storageType: 'local' });
        const lastStartDate = resp?.success ? resp.value[SICOR_START_DATE_KEY] : null;

        document.getElementById('sicor-data-ini').value = lastStartDate || this._formatDate(firstDayOfYear);
        
        // Define a data final com base no estado da trava
        let dateFimToSet;
        if (this.isDateLocked) {
            // Se TRAVADO, força 'dia anterior'
            dateFimToSet = this._formatDate(yesterday);
        } else {
            // Se DESTRAVADO, usa data salva (fixa), ou 'dia anterior' se não houver data salva
            dateFimToSet = settings.dataFim || this._formatDate(yesterday);
        }
        document.getElementById('sicor-data-fim').value = dateFimToSet;
        
        // Atualiza a UI da trava (desabilita o campo se necessário)
        this._updateDateLockUI();

        document.getElementById('sicor-gas-id').value = settings.gasId || '';

        const manterCopiaAntigo = settings.manterCopia;
        document.getElementById('sicor-manter-copia-xls').checked = settings.manterCopiaXls ?? manterCopiaAntigo ?? true;
        document.getElementById('sicor-manter-copia-csv').checked = settings.manterCopiaCsv ?? manterCopiaAntigo ?? true;

        document.getElementById('sicor-incluir-subordinadas').checked = settings.incluirSubordinadas ?? true;
        document.getElementById('sicor-trazer-envolvidos').checked = settings.trazerEnvolvidos ?? true;
        document.getElementById('sicor-schedule-frequency').value = settings.scheduleFrequency || 'none';
        const periodoRadio = document.querySelector(`input[name="sicor-periodo-tipo"][value="${settings.periodoTipo || 'DATA_FATO'}"]`);
        if(periodoRadio) periodoRadio.checked = true;

        if (settings.tiposEnvolvidoSelecionados && Array.isArray(settings.tiposEnvolvidoSelecionados)) {
            const allCheckboxes = document.querySelectorAll('.sicor-tipo-envolvido-chk');
            let allChecked = true;
            allCheckboxes.forEach(chk => {
                chk.checked = settings.tiposEnvolvidoSelecionados.includes(chk.value);
                if (!chk.checked) allChecked = false;
            });
            document.getElementById('sicor-tipo-envolvido-select-all').checked = allChecked;
        }

        this._updateHistoryLog(logs);
    }

    _updateHistoryLog(logs) {
        const logBox = document.getElementById('sicor-history-log');
        if (!logBox) return;
        logBox.innerHTML = (!logs || logs.length === 0)
            ? '<div class="sispmg-sicor-log-entry">Nenhum registro.</div>'
            : logs.map(log => `
                <div class="sispmg-sicor-log-entry sispmg-sicor-log-${log.type}">
                    <span class="sispmg-sicor-log-timestamp">${log.timestamp}</span>
                    <span class="sispmg-sicor-log-system">${log.system}:</span>
                    <span class="sispmg-sicor-log-message">${log.message}</span>
                </div>`).join('');
        logBox.scrollTop = 0;
    }

     async _showConfirmationModal(message, onConfirm) {
        const existingModal = document.getElementById('sispmg-confirmation-modal-overlay');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'sispmg-confirmation-modal-overlay';
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

        modalOverlay.querySelector('#sispmg-confirm-btn').addEventListener('click', async () => {
            if (onConfirm && typeof onConfirm === 'function') {
                await onConfirm();
            }
            removeModal();
        });

        modalOverlay.querySelector('#sispmg-cancel-btn').addEventListener('click', removeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) removeModal();
        });

        (document.getElementById('sispmg-plus-container') || document.body).appendChild(modalOverlay);
    }

    async _showInfoModal(message, type = 'info') {
        return new Promise((resolve) => {
            const existingModal = document.getElementById('sispmg-info-modal-overlay');
            if (existingModal) existingModal.remove();

            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'sispmg-info-modal-overlay';
            // Reutiliza o estilo do modal de confirmação
            modalOverlay.className = 'sispmg-confirmation-modal-overlay'; 

            let title = 'Aviso';
            let titleColor = '#007bff'; // Azul padrão (info)
            if (type === 'success') {
                title = 'Sucesso';
                titleColor = '#28a745'; // Verde
            } else if (type === 'error') {
                title = 'Erro';
                titleColor = '#dc3545'; // Vermelho
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
                resolve(); // Resolve a promise quando o modal é fechado
            };

            // Adiciona listener ao botão OK
            modalOverlay.querySelector('#sispmg-info-ok-btn').addEventListener('click', removeModal);
            
            // Adiciona listener para fechar clicando fora (opcional, mas bom UX)
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) removeModal();
            });

            (document.getElementById('sispmg-plus-container') || document.body).appendChild(modalOverlay);

            // Foca no botão OK para acessibilidade
             modalOverlay.querySelector('#sispmg-info-ok-btn').focus();
        });
    }

    destroySicorModule() {
        const overlay = document.getElementById('sispmg-sicor-modal-overlay');
        if (overlay) overlay.remove();
        const confirmOverlay = document.getElementById('sispmg-confirmation-modal-overlay');
        if (confirmOverlay) confirmOverlay.remove();
        if (this.messageListener) window.removeEventListener('message', this.messageListener);
        this.messageListener = null;
        console.log("SisPMG+ [SICOR]: Módulo descarregado.");
    }

}

// Funções de inicialização e destruição exportadas
export function initSicorModule() {
    const ui = window.SisPMG_UI; const sicorInstance = new SicorModalHandler(); sicorInstance.init();
    if (ui?.registerModule) ui.registerModule({ name: sicorInstance.name, instance: sicorInstance });
    else console.error('SisPMG+ [SICOR]: Módulo de UI não encontrado.');
}
export function destroySicorModule() {
     const ui = window.SisPMG_UI;
     if (ui?.getModuleInstance) {
         const instance = ui.getModuleInstance('SICOR');
         if (instance?.destroySicorModule) { instance.destroySicorModule(); ui.unregisterModule('SICOR'); }
     }
}

