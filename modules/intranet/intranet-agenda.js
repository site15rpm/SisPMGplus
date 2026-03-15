// Arquivo: modules/intranet/intranet-agenda.js
// Responsável pela lógica do novo módulo de Agenda da Intranet

import { sendMessageToBackground, getCookie, decodeJwt } from '../../common/utils.js';
import { iconSVG_28 } from '../../common/icon.js';

/**
 * Verifica se o usuário atende aos critérios de abrangência.
 * Copiado de intranet-ui.js para uso local.
 * @param {string} abrangenciaString - A string de regras (ex: "g:123|456, t:SGT").
 * @param {object} userData - O objeto com os dados do usuário do token.
 * @returns {boolean} - True se o usuário tiver acesso, false caso contrário.
 */
function checkAbrangencia(abrangenciaString, userData) {
    if (!abrangenciaString) {
        return false;
    }
    const upperString = abrangenciaString.toUpperCase();
    if (upperString === "PMMG" || upperString === "1") {
        return true;
    }

    const allCriteria = abrangenciaString.split(',');
    if (allCriteria.length === 0) return false;

    for (const criterion of allCriteria) {
        const parts = criterion.split(':');
        if (parts.length < 2) continue;

        const key = parts[0].trim().toLowerCase();
        const rules = parts.slice(1).join(':').trim();
        const ruleList = rules.split('|').map(r => r.trim()).filter(r => r);

        const userValue = userData.hasOwnProperty(key) ? userData[key] : undefined;


        if (userValue === undefined || ruleList.length === 0) {
            continue;
        }

        let criteriaMet = false;
        // Garante que todos os valores a serem testados sejam strings para uma comparação consistente.
        const valuesToTest = Array.isArray(userValue) ? userValue.map(String) : [String(userValue)];

        for (const value of valuesToTest) {
            for (const rule of ruleList) {
                try {
                    // Compara usando Regex para flexibilidade
                    if (new RegExp('^' + rule + '$', 'i').test(value)) {
                        criteriaMet = true;
                        break;
                    }
                } catch (e) {
                    // Fallback para comparação estrita caso a regex seja inválida
                    if (value === rule) {
                        criteriaMet = true;
                        break;
                    }
                }
            }
            if (criteriaMet) break;
        }
        
        if (criteriaMet) {
            return true;
        }
    }
    
    return false;
}


export class IntranetAgendaModule {
    constructor() {
        console.log("SisPMG+ [Agenda]: Módulo de Agenda carregado.");
        this.tasks = [];
        this.settings = {};
        this.userNumber = null;
        this.userData = {};
    }

    async init(loadUI = true) {
        console.log("SisPMG+ [Agenda]: Inicializando o módulo.");
        try {
            await this.loadSettings();
            
            const token = getCookie('tokiuz');
            if (token) {
                this.userData = decodeJwt(token);
                this.userNumber = this.userData ? String(this.userData.g) : null;
            } else {
                throw new Error("Token 'tokiuz' não encontrado.");
            }

            if (loadUI) {
                this.injectUI();
                await this.loadTasks();
                this.renderTasks();

                if (this.panel) {
                    this.toggleCollapse(this.panel, false);
                }
            }
            
            this.observeMessages();
        } catch (e) {
            console.error("SisPMG+ [Agenda]: Ocorreu um erro crítico durante a inicialização do módulo de Agenda.", e);
            this.loadError = { message: `Erro na inicialização: ${e.message}` };
            if (loadUI && !this.panel) {
                this.injectUI(); // Injeta a UI para mostrar a mensagem de erro.
            }
            if (this.panel) {
                this.renderTasks(); // renderTasks irá mostrar a mensagem de erro.
            }
        }
    }

    observeMessages() {
        if (document.querySelector('app-ler-mensagem')) {
            this.injectAgendaButtonInMessageView();
        }

        this.messageObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && (node.tagName === 'APP-LER-MENSAGEM' || node.querySelector('app-ler-mensagem'))) {
                            this.injectAgendaButtonInMessageView();
                        }
                    }
                }
            }
        });

        this.messageObserver.observe(document.body, { childList: true, subtree: true });
    }

    injectAgendaButtonInMessageView() {
        setTimeout(() => {
            const allMessages = document.querySelectorAll('app-item-leitura-mensagem');
            
            allMessages.forEach(message => {
                const protocolElement = message.querySelector('p.tc span.de.direita');
                if (!protocolElement) {
                    return;
                }

                const protocolText = protocolElement.textContent.trim();

                if (protocolElement.querySelector('.sispmg-agenda-from-message-btn')) {
                    return;
                }

                const agendaBtn = document.createElement('a');
                agendaBtn.className = 'sispmg-agenda-from-message-btn';
                agendaBtn.title = 'Agendar Tarefa a partir desta Mensagem';
                
                agendaBtn.style.display = 'inline-flex';
                agendaBtn.style.alignItems = 'center';
                agendaBtn.style.verticalAlign = 'middle';
                agendaBtn.style.marginRight = '8px';
                agendaBtn.style.cursor = 'pointer';

                const svgNode = new DOMParser().parseFromString(iconSVG_28, "image/svg+xml").documentElement;
                svgNode.style.width = '20px';
                svgNode.style.height = '20px';
                svgNode.style.display = 'block';
                agendaBtn.appendChild(svgNode);
                
                agendaBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const subjectElement = document.querySelector('#barra-fixa h2 strong.rel');
                    let subjectText = 'Assunto da Conversa';
                    if (subjectElement) {
                        const subjectClone = subjectElement.cloneNode(true);
                        const marker = subjectClone.querySelector('a.marc-ex');
                        if (marker) marker.remove();
                        subjectText = subjectClone.innerText.trim();
                    }
                    
                    const messageBodyElement = message.querySelector('pre');
                    const messageBodyText = messageBodyElement ? messageBodyElement.innerText.trim() : 'Corpo da mensagem não encontrado.';
                    
                    const dateElement = message.querySelector('.dataMensagem');
                    let messageDateTime = 'Data/Hora não encontrada';
                    if (dateElement) {
                        const dateClone = dateElement.cloneNode(true);
                        const relativeTime = dateClone.querySelector('.no-mobile');
                        if (relativeTime) relativeTime.remove();
                        const optionsBtn = dateClone.querySelector('.ic.opc');
                        if (optionsBtn) optionsBtn.remove();
                        messageDateTime = dateClone.textContent.trim();
                    }

                    const description = `Referência: ${protocolText}\nData/Hora da Mensagem: ${messageDateTime}\n\n---\n\n${messageBodyText}`;
                    
                    this.showTaskModal({
                        assunto: subjectText,
                        descricao: description
                    });
                });

                protocolElement.prepend(agendaBtn);
            });
        }, 500);
    }

    injectUI() {
        this.panel = document.createElement('div');
        this.panel.id = 'sispmg-agenda-panel';

        this.panel.innerHTML = `
            <div class="sispmg-panel-header">
                <div class="sispmg-panel-title-group">
                    ${iconSVG_28}
                    <span>Agenda de Tarefas</span>
                </div>
                <div class="sispmg-panel-actions">
                    <button id="sispmg-agenda-info-btn" title="Informações e Arquivo"><i class="fa-solid fa-info-circle"></i></button>
                    <button id="sispmg-agenda-add-btn" title="Nova Tarefa"><i class="fa-solid fa-plus"></i></button>
                    <button id="sispmg-agenda-collapse-btn" title="Recolher/Expandir">
                        <i class="fa-solid fa-chevron-up"></i>
                    </button>
                </div>
            </div>
            <div id="sispmg-agenda-task-list" class="sispmg-panel-content-wrapper">
                <div class="sispmg-loading-indicator">Carregando tarefas...</div>
            </div>
        `;
        const container = document.getElementById('sispmg-plus-container') || document.body;
        container.appendChild(this.panel);

        document.getElementById('sispmg-agenda-info-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showColorInfoModal();
        });
        document.getElementById('sispmg-agenda-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTaskModal();
        });
        document.getElementById('sispmg-agenda-collapse-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse(this.panel);
        });
    }

    getArchivedTasksHTML() {
        const archivedTasks = this.tasks.filter(task => {
            const isConfirmedByUser = this.userNumber && (task.confirmacoes || '').split('|').includes(this.userNumber);
            const isAuthor = this.userNumber && task.autor && this.userNumber === String(task.autor);
            
            // Aparece no arquivo se: Está concluída (para todos) OU foi confirmada por mim e não sou o autor
            return task.concluida || (isConfirmedByUser && !isAuthor);
        });

        let html = '';
        if (archivedTasks.length === 0) {
            html = `<div style="text-align: center; color: #777; font-size: 13px; padding: 10px;">Nenhuma tarefa arquivada.</div>`;
        } else {
            archivedTasks.sort((a, b) => b['data/hora'] - a['data/hora']).forEach(task => {
                const isAuthor = this.userNumber && task.autor && this.userNumber === String(task.autor);
                const confirmedUsers = (task.confirmacoes || '').split('|').filter(u => u);
                const isConfirmedByUser = this.userNumber && confirmedUsers.includes(this.userNumber);

                let actionButtonsHTML = '';
                if (isAuthor) {
                    const titleText = confirmedUsers.length > 0 ? `Ver ${confirmedUsers.length} confirmações` : 'Nenhuma confirmação';
                    actionButtonsHTML = `
                        <button class="sispmg-task-view-confirmations-btn" data-task-id="${task.id}" title="${titleText}">
                            <i class="fa-solid fa-users"></i>
                            <span class="sispmg-confirm-count">${confirmedUsers.length}</span>
                        </button>
                        <button class="sispmg-task-complete-btn" data-task-id="${task.id}" title="${task.concluida ? 'Reabrir Tarefa' : 'Concluir Tarefa'}">
                            <i class="fa-solid ${task.concluida ? 'fa-arrow-rotate-left' : 'fa-check'}"></i>
                        </button>
                        <button class="sispmg-task-edit-btn" data-task-id="${task.id}" title="Editar Tarefa">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                    `;
                } else if (checkAbrangencia(task.abrangencia, this.userData)) {
                     actionButtonsHTML = `
                        <button class="sispmg-task-user-confirm-btn ${isConfirmedByUser ? 'confirmed' : ''}"
                                 data-task-id="${task.id}"
                                 title="${isConfirmedByUser ? 'Tarefa confirmada' : 'Confirmar leitura'}"
                                 ${isConfirmedByUser ? 'disabled' : ''}>
                            <i class="fa-solid fa-check"></i>
                        </button>
                    `;
                }

                const formattedDate = new Date(task['data/hora']).toLocaleString('pt-BR', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });

                const category = this.getTaskCategory(task);
                let borderColor = this.settings.colors.far; 
                if (category === 4) borderColor = '#007bff'; 
                if (category === 5) borderColor = this.settings.colors.far; 

                html += `
                    <div class="sispmg-agenda-task archived-task" data-task-id="${task.id}" style="border-left-color: ${borderColor} !important; margin-bottom: 8px;">
                        <div class="sispmg-task-content">
                            <div class="sispmg-task-header">
                                <div class="sispmg-task-datetime">${formattedDate}</div>
                                <div class="sispmg-task-actions-wrapper">${actionButtonsHTML}</div>
                            </div>
                            <div class="sispmg-task-info">${task.assunto}</div>
                        </div>
                    </div>
                `;
            });
        }
        return html;
    }

    showColorInfoModal() {
        const legendHTML = `
            <div class="sispmg-agenda-legend-container">
                <div class="sispmg-agenda-legend-item">
                    <div class="blinking-border sispmg-agenda-legend-indicator" style="border-left-color: ${this.settings.colors.expired} !important;"></div>
                    Vencidas ou vence hoje.
                </div>
                <div class="sispmg-agenda-legend-item">
                    <div class="sispmg-agenda-legend-indicator" style="border-left-color: ${this.settings.colors.expired} !important;"></div>
                    Vence amanhã.
                </div>
                <div class="sispmg-agenda-legend-item">
                    <div class="sispmg-agenda-legend-indicator" style="border-left-color: orange !important;"></div>
                    Vence em 2 ou 3 dias.
                </div>
                <div class="sispmg-agenda-legend-item">
                    <div class="sispmg-agenda-legend-indicator" style="border-left-color: ${this.settings.colors.soon} !important;"></div>
                    Vence em mais de 3 dias.
                </div>
                <div class="sispmg-agenda-legend-item">
                    <div class="sispmg-agenda-legend-indicator" style="border-left-color: #007bff !important;"></div>
                    Tarefa compartilhada confirmada por você.
                </div>
                <div class="sispmg-agenda-legend-item sispmg-agenda-legend-item-last">
                    <div class="sispmg-agenda-legend-indicator" style="border-left-color: ${this.settings.colors.far} !important;"></div>
                    Tarefa concluída.
                </div>
            </div>
            
            <div class="sispmg-archived-tasks-section">
                <h4 style="margin-top: 20px; border-bottom: 1px solid var(--agenda-border); padding-bottom: 5px; color: var(--agenda-header-text);">Tarefas Arquivadas (Concluídas/Confirmadas)</h4>
                <div class="sispmg-archived-list">
                    ${this.getArchivedTasksHTML()}
                </div>
            </div>
        `;
        
        const modalBackdrop = this._showModal('Agenda - Informações e Histórico', legendHTML, [{ text: 'Fechar', className: 'sispmg-alert-btn-confirm' }]);
        
        if (modalBackdrop) {
            modalBackdrop.classList.add('sispmg-info-modal-marker'); // Marker for re-rendering
            this.addTaskActionListeners(modalBackdrop, true);
            
            modalBackdrop.querySelectorAll('.archived-task .sispmg-task-content').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    const taskId = e.target.closest('.archived-task').dataset.taskId;
                    const taskToShow = this.tasks.find(t => t.id === taskId);
                    if (taskToShow && taskToShow.descricao) {
                        this._showTaskDetailsModal(taskToShow);
                    }
                });
            });
        }
    }

    toggleCollapse(panel, forceState = null) {
        const icon = panel.querySelector('#sispmg-agenda-collapse-btn i');
        let isCollapsed = panel.classList.contains('collapsed');

        if (forceState !== null) {
            isCollapsed = forceState;
        } else {
            isCollapsed = !isCollapsed;
        }
        
        if (isCollapsed) {
            panel.classList.add('collapsed');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            panel.classList.remove('collapsed');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }

    showTaskModal(task = null) {
        const existingModal = document.getElementById('sispmg-task-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'sispmg-task-modal';
        modal.className = 'sispmg-agenda-modal-container';

        let dateValue = '';
        let timeValue = '00:00';
        if (task && task['data/hora']) {
            const taskDate = new Date(task['data/hora']);
            if (!isNaN(taskDate)) {
                dateValue = taskDate.toISOString().split('T')[0];
                timeValue = taskDate.toTimeString().split(' ')[0].substring(0, 5);
            }
        }

        const isAuto = task && task.autoConfirmarDias !== '' && task.autoConfirmarDias > 0;
        const dias = isAuto ? task.autoConfirmarDias : '5';

        modal.innerHTML = `
            <div class="sispmg-modal-content">
                <h2 style="font-size: 1.2em; margin-top: 0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--agenda-border); text-align: center;">${task && task.id ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                
                <div class="sispmg-datetime-group">
                    <input type="date" id="sispmg-agenda-date" value="${dateValue}">
                    <input type="time" id="sispmg-agenda-time" value="${timeValue}">
                </div>

                <textarea id="sispmg-agenda-assunto" style="margin-bottom: 15px !important;" placeholder="Assunto da tarefa..." rows="1">${task && task.assunto ? task.assunto : ''}</textarea>
                <textarea id="sispmg-agenda-descricao" placeholder="Descrição da tarefa... (opcional)" rows="3">${task && task.descricao ? task.descricao : ''}</textarea>
                
                <div id="sispmg-agenda-abrangencia-builder">
                    <button type="button" id="sispmg-add-abrangencia-rule-btn" class="sispmg-btn-add-rule"><i class="fa-solid fa-plus"></i> Adicionar Regra de Abrangência</button>
                    <div id="sispmg-abrangencia-rules-container"></div>
                </div>
                
                <div class="sispmg-form-group">
                    <input type="checkbox" id="sispmg-agenda-autoconfirmar" ${isAuto ? 'checked' : ''}>
                    <label for="sispmg-agenda-autoconfirmar">Autoconcluir após</label>
                    <input type="number" id="sispmg-agenda-autoconfirmardias" min="1" max="15" value="${dias}">
                    <label for="sispmg-agenda-autoconfirmardias">dias.</label>
                </div>

                <div class="sispmg-modal-actions">
                    ${task && task.id ? `<button id="sispmg-agenda-delete-btn" title="Excluir Definitivamente"><i class="fas fa-trash"></i></button>` : ''}
                    <button id="sispmg-agenda-cancel-btn" class="sispmg-agenda-btn">Cancelar</button>
                    <button id="sispmg-agenda-save-btn" class="sispmg-agenda-btn">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const modalContent = modal.querySelector('.sispmg-modal-content');
        modalContent.style.maxHeight = '90vh';
        modalContent.style.overflowY = 'auto';

        const autoConfirmarDiasInput = modal.querySelector('#sispmg-agenda-autoconfirmardias');

        this.initializeAbrangenciaBuilder(modal, task ? task.abrangencia : null);

        // Ajuste de altura para textareas de assunto e descrição
        [modal.querySelector('#sispmg-agenda-assunto'), modal.querySelector('#sispmg-agenda-descricao')].forEach(textarea => {
            const adjustHeight = () => {
                if (!textarea) return;
                textarea.style.height = 'auto';
                textarea.style.height = `${textarea.scrollHeight}px`;
            };
            textarea.addEventListener('input', adjustHeight);
            setTimeout(adjustHeight, 0); // Ajusta a altura inicial
        });

        autoConfirmarDiasInput.addEventListener('input', () => {
            const value = parseInt(autoConfirmarDiasInput.value, 10);
            if (value > 15) autoConfirmarDiasInput.value = '15';
            else if (value < 1 && autoConfirmarDiasInput.value !== '') autoConfirmarDiasInput.value = '1';
        });

        modal.querySelector('#sispmg-agenda-cancel-btn').addEventListener('click', () => modal.remove());

        modal.querySelector('#sispmg-agenda-save-btn').addEventListener('click', async () => {
            const success = await this.saveTask(task ? task.id : null);
            if (success) modal.remove();
        });

        if (task && task.id) {
            modal.querySelector('#sispmg-agenda-delete-btn').addEventListener('click', () => {
                this.deleteTask(task.id);
                modal.remove();
            });
        }
    }

    async initializeAbrangenciaBuilder(modal, abrangenciaString) {
        const container = modal.querySelector('#sispmg-abrangencia-rules-container');
        const addRuleBtn = modal.querySelector('#sispmg-add-abrangencia-rule-btn');
        const autoConfirmarCheckbox = modal.querySelector('#sispmg-agenda-autoconfirmar');
        let unitsCache = null;

        const ruleTypes = {
            'g': 'Nº Funcional',
            'c': 'Unidade',
        };

        const updateAutoConfirmState = () => {
            const hasRules = container.children.length > 0;
            autoConfirmarCheckbox.checked = hasRules;
            autoConfirmarCheckbox.disabled = hasRules;
        };

        const addRule = async (type = 'g', values = ['']) => {
            const ruleId = `rule-${Date.now()}-${Math.random()}`;
            const ruleRow = document.createElement('div');
            ruleRow.className = 'sispmg-abrangencia-rule-row';
            ruleRow.dataset.ruleId = ruleId;

            const typeSelect = document.createElement('select');
            typeSelect.className = 'sispmg-abrangencia-type';
            for (const key in ruleTypes) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = ruleTypes[key];
                if (key === type) option.selected = true;
                typeSelect.appendChild(option);
            }

            const valuesContainer = document.createElement('div');
            valuesContainer.className = 'sispmg-abrangencia-values';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'sispmg-abrangencia-remove-btn';
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.title = 'Remover Regra';

            ruleRow.appendChild(typeSelect);
            ruleRow.appendChild(valuesContainer);
            ruleRow.appendChild(removeBtn);
            container.prepend(ruleRow);

            await updateValueInput(typeSelect, values);
            updateAutoConfirmState();
        };

        const updateValueInput = async (typeSelect, values) => {
            const ruleRow = typeSelect.closest('.sispmg-abrangencia-rule-row');
            const valuesContainer = ruleRow.querySelector('.sispmg-abrangencia-values');
            valuesContainer.innerHTML = ''; // Limpa o container

            const selectedType = typeSelect.value;

            if (selectedType === 'c') {
                if (!unitsCache) {
                    valuesContainer.innerHTML = '<span>Carregando unidades...</span>';
                    const response = await sendMessageToBackground('agenda-fetch-unidades', { userRegionCode: this.userData?.e });
                    unitsCache = response.success ? response.data : [];
                    if (!response.success) {
                        valuesContainer.innerHTML = '<span style="color: red;">Falha ao carregar.</span>';
                        return;
                    }
                }

                valuesContainer.innerHTML = ''; // Limpa o "Carregando..."
                
                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.placeholder = 'Pesquisar unidade...';
                searchInput.className = 'sispmg-abrangencia-unit-search';
                
                const selectContainer = document.createElement('div');
                selectContainer.className = 'sispmg-abrangencia-unit-select-container';

                const renderOptions = (filter = '') => {
                    selectContainer.innerHTML = '';
                    const filteredUnits = unitsCache.filter(unit => unit.label.toLowerCase().includes(filter.toLowerCase()));
                    
                    filteredUnits.forEach(unit => {
                        const optionDiv = document.createElement('div');
                        optionDiv.className = 'sispmg-abrangencia-unit-option';
                        optionDiv.dataset.value = unit.value;

                        // Adiciona indentação baseada na profundidade da hierarquia
                        const hierarchyDepth = (unit.hierarchyPath.match(/[/\\.]/g) || []).length;
                        optionDiv.style.paddingLeft = `${8 + hierarchyDepth * 15}px`;

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = values.includes(unit.value);
                        
                        optionDiv.appendChild(checkbox);
                        optionDiv.append(` ${unit.label}`);
                        selectContainer.appendChild(optionDiv);
                    });
                };

                searchInput.addEventListener('input', () => renderOptions(searchInput.value));
                valuesContainer.appendChild(searchInput);
                valuesContainer.appendChild(selectContainer);
                renderOptions();

            } else {
                const valueInput = document.createElement('input');
                valueInput.type = 'text';
                valueInput.className = 'sispmg-abrangencia-value';
                valueInput.placeholder = 'Números separados por |';
                valueInput.value = values.join('|');
                valuesContainer.appendChild(valueInput);
            }
        };
        
        addRuleBtn.addEventListener('click', () => addRule());

        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('sispmg-abrangencia-remove-btn')) {
                e.target.closest('.sispmg-abrangencia-rule-row').remove();
                updateAutoConfirmState();
            }
        });
        
        container.addEventListener('change', async (e) => {
            if (e.target.classList.contains('sispmg-abrangencia-type')) {
                await updateValueInput(e.target, ['']);
            }
        });

        let hiddenRules = [];

        // Parse a string de abrangência existente para popular a UI
        if (abrangenciaString) {
            const rules = abrangenciaString.split(',');
            for (const rule of rules) {
                const [type, ...valuesPart] = rule.split(':');
                const trimmedType = type.trim();

                if (trimmedType && valuesPart.length > 0) {
                    if (Object.prototype.hasOwnProperty.call(ruleTypes, trimmedType)) {
                        const values = valuesPart.join(':').split('|');
                        await addRule(trimmedType, values);
                    } else {
                        hiddenRules.push(rule); // Armazena a regra oculta
                    }
                }
            }
        }

        modal.dataset.hiddenRules = JSON.stringify(hiddenRules);

        updateAutoConfirmState();
    }

    async saveTask(taskId) {
        const dateInput = document.getElementById('sispmg-agenda-date');
        const timeInput = document.getElementById('sispmg-agenda-time');
        const assuntoInput = document.getElementById('sispmg-agenda-assunto');
        const descricaoInput = document.getElementById('sispmg-agenda-descricao');
        const autoConfirmarInput = document.getElementById('sispmg-agenda-autoconfirmar');
        const autoConfirmarDiasInput = document.getElementById('sispmg-agenda-autoconfirmardias');

        if (!dateInput.value || !assuntoInput.value) {
            this._showAlert("Data e Assunto são obrigatórios.");
            return false;
        }

        if (!this.userNumber) {
            this._showAlert("Não foi possível identificar o usuário. Faça login novamente.");
            return false;
        }
        
        const rulesContainer = document.getElementById('sispmg-abrangencia-rules-container');
        const ruleRows = rulesContainer.querySelectorAll('.sispmg-abrangencia-rule-row');
        const abrangenciaMap = new Map();

        ruleRows.forEach(row => {
            const type = row.querySelector('.sispmg-abrangencia-type').value;
            let values = [];

            if (type === 'c') {
                const selectedOptions = row.querySelectorAll('.sispmg-abrangencia-unit-option input:checked');
                selectedOptions.forEach(opt => values.push(opt.closest('.sispmg-abrangencia-unit-option').dataset.value));
            } else {
                const valueInput = row.querySelector('.sispmg-abrangencia-value');
                if (valueInput && valueInput.value) {
                    values = valueInput.value.split(/\||,|;/).map(v => v.trim()).filter(Boolean);
                }
            }
            
            if (values.length > 0) {
                if (abrangenciaMap.has(type)) {
                    abrangenciaMap.get(type).push(...values);
                } else {
                    abrangenciaMap.set(type, values);
                }
            }
        });

        const abrangenciaFromUI = Array.from(abrangenciaMap.entries())
            .map(([type, values]) => `${type}:${[...new Set(values)].join('|')}`)
            .join(',');

        const modal = document.getElementById('sispmg-task-modal');
        const hiddenRules = modal?.dataset.hiddenRules ? JSON.parse(modal.dataset.hiddenRules) : [];
        const hiddenRulesString = hiddenRules.join(',');

        const abrangenciaValue = [abrangenciaFromUI, hiddenRulesString].filter(Boolean).join(',');

        const timeValue = timeInput.value || '00:00';
        const dataHoraString = `${dateInput.value}T${timeValue}:00`;
        
        let autoConfirmarDiasValue = '';

        if (abrangenciaValue !== '' || autoConfirmarInput.checked) {
            autoConfirmarDiasValue = parseInt(autoConfirmarDiasInput.value, 10);
            autoConfirmarDiasValue = isNaN(autoConfirmarDiasValue) || autoConfirmarDiasValue < 1 ? 5 : autoConfirmarDiasValue;
            if (autoConfirmarDiasValue > 15) autoConfirmarDiasValue = 15;
        }

        // Busca a tarefa atual no array local para validar o estado anterior
        const task = taskId ? this.tasks.find(t => t.id === taskId) : null;

        // Se a tarefa já estava concluída manualmente (0) e a pessoa só editou o texto, mantém o 0.
        // A menos que ela tenha marcado a caixa de autoconfirmar expressamente.
        if (task && task.concluida && task.autoConfirmarDias === 0 && !autoConfirmarInput.checked) {
            autoConfirmarDiasValue = 0;
        }
        
        const eventData = {
            id: taskId || `evt_${Date.now()}`,
            'data/hora': dataHoraString,
            assunto: assuntoInput.value,
            autor: taskId ? undefined : this.userNumber,
            abrangencia: abrangenciaValue,
            status: 'ACTIVE',
            autoConfirmarDias: autoConfirmarDiasValue,
            descricao: descricaoInput.value,
            editorNumero: this.userNumber
        };

        let isConcluida = false;
        if (autoConfirmarDiasValue === 0) {
            isConcluida = true;
        } else if (autoConfirmarDiasValue !== '') {
            const due = new Date(dataHoraString);
            due.setHours(0,0,0,0);
            const limit = due.setDate(due.getDate() + autoConfirmarDiasValue);
            const hj = new Date();
            hj.setHours(0,0,0,0);
            if (hj.getTime() >= limit) isConcluida = true;
        }

        const taskInUI = {
            ...this.tasks.find(t => t.id === taskId),
            ...eventData,
            'data/hora': new Date(eventData['data/hora']).getTime(),
            concluida: isConcluida,
            autor: taskId ? this.tasks.find(t => t.id === taskId).autor : this.userNumber
        };

        const existingTaskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (existingTaskIndex !== -1) {
            this.tasks[existingTaskIndex] = taskInUI;
        } else {
            this.tasks.push(taskInUI);
        }
        this.renderTasks();

        const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec'; 
        
        sendMessageToBackground('agenda-add-event', {
            gasUrl: gasUrl,
            eventData: eventData
        }).then(response => {
            if (response.success) {
                console.log("SisPMG+ [Agenda]: Evento salvo com sucesso em segundo plano.");
            } else {
                console.error(`SisPMG+ [Agenda]: Falha ao salvar evento em segundo plano.`, response.error);
                this._showAlert(`Falha ao salvar: ${response.error}`);
            }
        });

        return true;
    }

    async deleteTask(taskId) {
        const confirmed = await this._showConfirm("Tem certeza que deseja excluir permanentemente esta tarefa?");
        if (!confirmed) return;

        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            console.error(`SisPMG+ [Agenda]: Tarefa ${taskId} não encontrada para exclusão.`);
            return;
        }
        
        const task = this.tasks[taskIndex];

        // Atualização Otimista: Remove fisicamente do array local em vez de mudar o status
        this.tasks.splice(taskIndex, 1);
        this.renderTasks(); 

        const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
        
        sendMessageToBackground('agenda-add-event', {
            gasUrl: gasUrl,
            eventData: { id: taskId, status: 'DELETED', editorNumero: this.userNumber }
        }).then(response => {
            if (response.success) {
                console.log("SisPMG+ [Agenda]: Tarefa excluída permanentemente.");
            } else {
                console.error(`SisPMG+ [Agenda]: Falha ao excluir tarefa em segundo plano.`, response.error);
                this._showAlert("Falha ao sincronizar a exclusão. A tarefa será exibida novamente.");
                // Reverte a remoção em caso de erro
                this.tasks.push(task);
                this.renderTasks();
            }
        });
    }

    renderTasks() {
        const taskListContainer = document.getElementById('sispmg-agenda-task-list');
        if (!taskListContainer) return;
        taskListContainer.innerHTML = '';

        if (this.loadError) {
            taskListContainer.innerHTML = `<div class="sispmg-error-message">${this.loadError.message}</div>`;
            return;
        }

        this.sortTasks();

        // Lógica de Filtragem do Painel Principal
        const activeTasks = this.tasks.filter(task => {
            // Regra 4: Concluída sai do painel para TODOS
            if (task.concluida) return false; 
            
            const isAuthor = this.userNumber && task.autor && this.userNumber === String(task.autor);
            const confirmedUsers = (task.confirmacoes || '').split('|').filter(u => u);
            const isConfirmedByUser = this.userNumber && confirmedUsers.includes(this.userNumber);
            
            // Regra 3: Se confirmei e NÃO sou o autor, sai do painel principal (vai pro arquivo)
            if (isConfirmedByUser && !isAuthor) return false;
            
            return true;
        });

        if (activeTasks.length === 0) {
            taskListContainer.innerHTML = '<div class="sispmg-no-tasks">Nenhuma tarefa pendente agendada.</div>';
        } else {
            activeTasks.forEach(task => {
                const taskElement = document.createElement('div');
                taskElement.className = 'sispmg-agenda-task';
                taskElement.dataset.taskId = task.id;
                if (task.descricao) {
                    taskElement.classList.add('has-description');
                }

                this.applyTaskColor(taskElement, task);

                const isAuthor = this.userNumber && task.autor && this.userNumber === String(task.autor);
                const confirmedUsers = (task.confirmacoes || '').split('|').filter(u => u);
                const isConfirmedByUser = this.userNumber && confirmedUsers.includes(this.userNumber);

                let actionButtonsHTML = '';
                if (isAuthor) {
                    const titleText = confirmedUsers.length > 0 ? `Ver ${confirmedUsers.length} confirmações` : 'Nenhuma confirmação';
                    actionButtonsHTML = `
                        <button class="sispmg-task-view-confirmations-btn" data-task-id="${task.id}" title="${titleText}">
                            <i class="fa-solid fa-users"></i>
                            <span class="sispmg-confirm-count">${confirmedUsers.length}</span>
                        </button>
                        <button class="sispmg-task-complete-btn" data-task-id="${task.id}" title="${task.concluida ? 'Reabrir Tarefa' : 'Concluir Tarefa'}">
                            <i class="fa-solid ${task.concluida ? 'fa-arrow-rotate-left' : 'fa-check'}"></i>
                        </button>
                        <button class="sispmg-task-edit-btn" data-task-id="${task.id}" title="Editar Tarefa">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                    `;
                } else if (checkAbrangencia(task.abrangencia, this.userData)) {
                     actionButtonsHTML = `
                        <button class="sispmg-task-user-confirm-btn ${isConfirmedByUser ? 'confirmed' : ''}"
                                 data-task-id="${task.id}"
                                 title="${isConfirmedByUser ? 'Tarefa confirmada' : 'Confirmar leitura'}"
                                 ${isConfirmedByUser ? 'disabled' : ''}>
                            <i class="fa-solid fa-check"></i>
                        </button>
                    `;
                }
                
                const formattedDate = new Date(task['data/hora']).toLocaleString('pt-BR', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
    
                taskElement.innerHTML = `
                    <div class="sispmg-task-content">
                        <div class="sispmg-task-header">
                            <div class="sispmg-task-datetime">${formattedDate}</div>
                            <div class="sispmg-task-actions-wrapper">${actionButtonsHTML}</div>
                        </div>
                        <div class="sispmg-task-info">${task.assunto}</div>
                    </div>
                `;            
                taskListContainer.appendChild(taskElement);

                taskElement.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    
                    const taskToShow = this.tasks.find(t => t.id === task.id);
                    if (taskToShow && taskToShow.descricao) {
                        this._showTaskDetailsModal(taskToShow);
                    }
                });
            });

            this.addTaskActionListeners(taskListContainer);
        }

        // Se o modal de Informações estiver aberto, atualiza a lista de arquivo também
        const archivedListContainer = document.querySelector('.sispmg-archived-list');
        if (archivedListContainer) {
            archivedListContainer.innerHTML = this.getArchivedTasksHTML();
            this.addTaskActionListeners(archivedListContainer, true);
            
            // Re-bind click events for modal descriptions
            archivedListContainer.querySelectorAll('.archived-task .sispmg-task-content').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    const taskId = e.target.closest('.archived-task').dataset.taskId;
                    const taskToShow = this.tasks.find(t => t.id === taskId);
                    if (taskToShow && taskToShow.descricao) {
                        this._showTaskDetailsModal(taskToShow);
                    }
                });
            });
        }
    }
    
    addTaskActionListeners(container, isModal = false) {
        container.querySelectorAll('.sispmg-task-view-confirmations-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId || e.target.dataset.taskId;
                const task = this.tasks.find(t => t.id === taskId);
                if (task) {
                    const confirmedUsers = (task.confirmacoes || '').split('|').filter(u => u);
                    const message = confirmedUsers.length > 0 
                        ? `Confirmado por:<br>${confirmedUsers.join(', ')}` 
                        : 'Nenhuma confirmação registrada para esta tarefa.';
                    this._showAlert(message, 'Lista de Confirmações');
                }
            });
        });

        container.querySelectorAll('.sispmg-task-complete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId || e.target.dataset.taskId;
                this.toggleTaskComplete(taskId);
            });
        });

        container.querySelectorAll('.sispmg-task-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId || e.target.dataset.taskId;
                const task = this.tasks.find(t => t.id.toString() === taskId.toString());
                if (task) {
                    if(isModal) {
                        const modalBackdrop = container.closest('.sispmg-alert-modal-backdrop');
                        if(modalBackdrop) modalBackdrop.remove();
                    }
                    this.showTaskModal(task);
                }
            });
        });
        
        container.querySelectorAll('.sispmg-task-user-confirm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.classList.contains('confirmed')) return; // Já confirmado
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId || e.target.dataset.taskId;
                this.confirmTask(taskId);
            });
        });
    }

    applyTaskColor(element, task) {
        element.classList.remove('blinking-border');
        const category = this.getTaskCategory(task);

        switch (category) {
            case 0: // Vermelho (Expirada / Hoje) - Piscando
                element.style.borderColor = this.settings.colors.expired;
                element.classList.add('blinking-border');
                break;
            case 1: // Vermelho (Amanhã) - Fixo
                element.style.borderColor = this.settings.colors.expired;
                break;
            case 2: // Laranja (Faltam 2 a 3 dias)
                element.style.borderColor = 'orange';
                break;
            case 3: // Amarelo (Pendente > 3 dias)
                element.style.borderColor = this.settings.colors.soon;
                break;
            case 4: // Azul (Confirmada)
                element.style.borderColor = '#007bff';
                break;
            case 5: // Verde (Concluída)
                element.style.borderColor = this.settings.colors.far;
                break;
            default:
                element.style.borderColor = this.settings.colors.far;
                break;
        }
    }

    getTaskCategory(task) {
        if (task.concluida) return 5; // Verde
        const isConfirmedByUser = this.userNumber && (task.confirmacoes || '').split('|').includes(this.userNumber);
        if (isConfirmedByUser) return 4; // Azul

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDay = new Date(task['data/hora']);
        dueDay.setHours(0, 0, 0, 0);

        // Vermelho Piscando: Vencidas (dias passados) OU vencendo hoje
        if (dueDay.getTime() <= today.getTime()) {
            return 0;
        }

        // Calcula a diferença de dias
        const diffTime = dueDay.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Vermelho Fixo: Vencendo amanhã (1 dia)
        if (diffDays === 1) {
            return 1;
        }

        // Laranja: Vencendo em 2 ou 3 dias
        if (diffDays === 2 || diffDays === 3) {
            return 2;
        }

        // Amarelo: Todas as outras tarefas futuras (> 3 dias)
        return 3;
    }
    
    sortTasks() {
        this.tasks.sort((a, b) => {
            const categoryA = this.getTaskCategory(a);
            const categoryB = this.getTaskCategory(b);

            if (categoryA !== categoryB) {
                return categoryA - categoryB;
            }

            const dateA = a['data/hora'];
            const dateB = b['data/hora'];
            if (dateA !== dateB) {
                return dateB - dateA;
            }

            return a.assunto.localeCompare(b.assunto);
        });
    }

    async confirmTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task || !this.userNumber) return;

        const confirmedUsers = (task.confirmacoes || '').split('|').filter(u => u);
        if (!confirmedUsers.includes(this.userNumber)) {
            confirmedUsers.push(this.userNumber);
            task.confirmacoes = confirmedUsers.join('|');
        }

        this.renderTasks();

        const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
        sendMessageToBackground('agenda-confirm-task', {
            gasUrl: gasUrl,
            eventData: { taskId: taskId, userNumber: this.userNumber }
        }).then(response => {
            if (!response.success) {
                console.error("Falha ao sincronizar confirmação.", response.error);
            }
        });
    }

    async toggleTaskComplete(taskId) {
        const task = this.tasks.find(t => t.id.toString() === taskId.toString());
        if (task) {
            const newConcluidaStatus = !task.concluida;
            const newDiasValue = newConcluidaStatus ? 0 : ''; 

            task.concluida = newConcluidaStatus;
            task.autoConfirmarDias = newDiasValue;
            this.renderTasks();

            const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
            
            sendMessageToBackground('agenda-add-event', {
                gasUrl: gasUrl,
                eventData: {
                    id: task.id,
                    autoConfirmarDias: newDiasValue,
                    editorNumero: this.userNumber
                }
            }).then(response => {
                if (response.success) {
                    console.log(`SisPMG+ [Agenda]: Status da tarefa ${taskId} atualizado em segundo plano.`);
                } else {
                    console.error(`SisPMG+ [Agenda]: Falha ao atualizar status da tarefa ${taskId}.`, response.error);
                    task.concluida = !newConcluidaStatus;
                    task.autoConfirmarDias = !newConcluidaStatus ? 0 : ''; // Reverte 
                    this.renderTasks();
                    this._showAlert('Falha ao atualizar o status da tarefa. A alteração foi desfeita.');
                }
            });
        }
    }

    async loadTasks() {
        this.loadError = null; // Reseta o estado de erro
        const sheetId = '1wtk0NWpyXPm791PPB2ICoto1YnKyYJ4UCs5JxJIRM_U';
        const sheetName = 'agenda';
        
        // Seleciona todas as tarefas válidas (ID não nulo). As excluídas já foram removidas fisicamente do banco.
        const query = `SELECT * WHERE A IS NOT NULL`;
        const response = await sendMessageToBackground('agenda-fetch-data', {
            sheetId: sheetId,
            sheet: sheetName,
            query: query
        });

        if (response.success && Array.isArray(response.data)) {
            const now = new Date().getTime();

            this.tasks = response.data.filter(row => {
                const autor = row[4];
                const abrangencia = row[5] || '';
                
                const hasAccess = (this.userNumber && this.userNumber === autor.toString()) || checkAbrangencia(abrangencia, this.userData);
                
                return hasAccess;

            }).map(row => {
                const autoConfirmarDiasRaw = row[7]; // Coluna H (índice 7) é a AutoConfirmarDias
                let autoConfirmarDias = '';
                let concluida = false;

                if (autoConfirmarDiasRaw === 0 || autoConfirmarDiasRaw === "0") {
                    autoConfirmarDias = 0;
                    concluida = true;
                } else if (autoConfirmarDiasRaw !== '' && autoConfirmarDiasRaw !== null && !isNaN(parseInt(autoConfirmarDiasRaw, 10))) {
                    autoConfirmarDias = parseInt(autoConfirmarDiasRaw, 10);
                    
                    const dueDateTimestamp = new Date(row[2]).getTime();
                    const dueDate = new Date(dueDateTimestamp);
                    dueDate.setHours(0, 0, 0, 0); 
                    const deadline = dueDate.setDate(dueDate.getDate() + autoConfirmarDias);

                    const today = new Date();
                    today.setHours(0, 0, 0, 0); 

                    if (today.getTime() >= deadline) {
                        concluida = true;
                    }
                }

                return {
                    id: row[0],
                    timestamp: new Date(row[1]).getTime(),
                    'data/hora': new Date(row[2]).getTime(),
                    assunto: row[3],
                    concluida: concluida,
                    autor: row[4],
                    abrangencia: row[5],
                    status: row[6],
                    autoConfirmarDias: autoConfirmarDias,
                    descricao: row[8] || '',
                    confirmacoes: row[9] || ''
                };
            });
        } else {
            console.error("SisPMG+ [Agenda]: Falha ao carregar tarefas da planilha. Resposta inválida do background.", response?.error);
            this.tasks = [];
            this.loadError = { message: 'Falha ao carregar as tarefas.' }; // Define o estado de erro
        }
    }
    
    async persistTasks() {
        console.warn("SisPMG+ [Agenda]: persistTasks não tem mais efeito. As tarefas são salvas individualmente.");
    }
    
    async loadSettings() {
        const result = await sendMessageToBackground('getStorage', { keys: ['sispmg_agenda_settings'], storageType: 'local' });
        
        const defaultSettings = {
            colors: { expired: '#ff0000', soon: '#ffff00', far: '#008000', completed: '#808080' },
            deadlines: { soon: 3 },
            sortOrder: 'asc'
        };
        
        if (result.success && result.value.sispmg_agenda_settings) {
            const savedSettings = result.value.sispmg_agenda_settings;
            this.settings = {
                ...defaultSettings,
                ...savedSettings,
                colors: { ...defaultSettings.colors, ...savedSettings.colors },
                deadlines: { ...defaultSettings.deadlines, ...savedSettings.deadlines },
            };
        } else {
            this.settings = defaultSettings;
        }
    }

    _showModal(title, message, buttons, options = {}, actionButtonsHTML = '') {
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'sispmg-alert-modal-backdrop';

        let controlButtonsHTML = '';
        buttons.forEach((btn, index) => {
            controlButtonsHTML += `<button id="sispmg-alert-btn-${index}" class="${btn.className}">${btn.text}</button>`;
        });

        modalBackdrop.innerHTML = `
            <div class="sispmg-alert-modal-content ${options.contentClassName || ''}">
                <h4>${title}</h4>
                <div class="sispmg-modal-body-content">${message}</div>
                <div class="sispmg-modal-footer">
                    <div class="sispmg-modal-action-buttons">
                        ${actionButtonsHTML}
                    </div>
                    <div class="sispmg-alert-modal-actions">
                        ${controlButtonsHTML}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalBackdrop);

        const modalContentElement = modalBackdrop.querySelector('.sispmg-alert-modal-content');
        if (options.maxWidth) {
            modalContentElement.style.maxWidth = options.maxWidth;
        }
        if (options.maxHeight) {
            modalContentElement.style.maxHeight = options.maxHeight;
            modalContentElement.style.overflowY = 'auto';
        }

        buttons.forEach((btn, index) => {
            modalBackdrop.querySelector(`#sispmg-alert-btn-${index}`).addEventListener('click', () => {
                if (btn.action) {
                    btn.action();
                }
                modalBackdrop.remove();
            });
        });
        return modalBackdrop;
    }

    _showAlert(message, title = 'Aviso') {
        return this._showModal(title, `<p>${message}</p>`, [
            { text: 'OK', className: 'sispmg-alert-btn-confirm' }
        ]);
    }

    _showConfirm(message, title = 'Confirmação') {
        return new Promise(resolve => {
            this._showModal(title, `<p>${message}</p>`, [
                {
                    text: 'Cancelar',
                    className: 'sispmg-alert-btn-cancel',
                    action: () => resolve(false)
                },
                {
                    text: 'Confirmar',
                    className: 'sispmg-alert-btn-confirm',
                    action: () => resolve(true)
                }
            ]);
        });
    }

    _showTaskDetailsModal(task) {
        if (!task) return;

        const formattedDate = new Date(task['data/hora']).toLocaleString('pt-BR', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        const contentHTML = `
            <div class="sispmg-task-detail-header">
                <span class="sispmg-task-detail-date">${formattedDate}</span>
                <h4 class="sispmg-task-detail-title">${task.assunto}</h4>
            </div>
            ${task.descricao ? `<div class="sispmg-task-detail-description-box">${task.descricao}</div>` : ''}
        `;

        let actionButtonsHtml = '';
        const isAuthor = this.userNumber && task.autor && this.userNumber === String(task.autor);
        const confirmedUsers = (task.confirmacoes || '').split('|').filter(u => u);
        const isConfirmedByUser = this.userNumber && confirmedUsers.includes(this.userNumber);

        if (isAuthor) {
            const titleText = confirmedUsers.length > 0 ? `Ver ${confirmedUsers.length} confirmações` : 'Nenhuma confirmação';
            actionButtonsHtml = `
                <button class="sispmg-task-view-confirmations-btn sispmg-task-action-btn" data-task-id="${task.id}" title="${titleText}">
                    <i class="fa-solid fa-users"></i>
                    <span class="sispmg-confirm-count">${confirmedUsers.length}</span>
                </button>
                <button class="sispmg-task-complete-btn sispmg-task-action-btn" data-task-id="${task.id}" title="${task.concluida ? 'Reabrir Tarefa' : 'Concluir Tarefa'}">
                    <i class="fa-solid ${task.concluida ? 'fa-arrow-rotate-left' : 'fa-check'}"></i>
                </button>
                <button class="sispmg-task-edit-btn sispmg-task-action-btn" data-task-id="${task.id}" title="Editar Tarefa">
                    <i class="fa-solid fa-edit"></i>
                </button>
            `;
        } else if (checkAbrangencia(task.abrangencia, this.userData)) {
             actionButtonsHtml = `
                <button class="sispmg-task-user-confirm-btn sispmg-task-action-btn ${isConfirmedByUser ? 'confirmed' : ''}"
                        data-task-id="${task.id}"
                        title="${isConfirmedByUser ? 'Tarefa confirmada' : 'Confirmar leitura'}"
                        ${isConfirmedByUser ? 'disabled' : ''}>
                    <i class="fa-solid fa-check"></i>
                </button>
            `;
        }

        const modalBackdrop = this._showModal(
            'Informações Detalhadas',
            contentHTML,
            [{ text: 'OK', className: 'sispmg-alert-btn-confirm' }],
            {
                maxWidth: '450px',
                maxHeight: '600px',
                contentClassName: 'sispmg-task-detail-modal'
            },
            actionButtonsHtml
        );

        if (modalBackdrop) {
            const container = modalBackdrop.querySelector('.sispmg-modal-action-buttons');
            if (container) {
                container.querySelectorAll('.sispmg-task-view-confirmations-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const taskId = e.target.closest('button').dataset.taskId;
                        const modalTask = this.tasks.find(t => t.id === taskId);
                        if (modalTask) {
                            const confirmedUsers = (modalTask.confirmacoes || '').split('|').filter(u => u);
                            const message = confirmedUsers.length > 0
                                ? `Confirmado por:<br>${confirmedUsers.join(', ')}`
                                : 'Nenhuma confirmação registrada para esta tarefa.';
                            this._showAlert(message, 'Lista de Confirmações');
                        }
                    });
                });

                container.querySelectorAll('.sispmg-task-complete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const taskId = e.target.closest('button').dataset.taskId;
                        await this.toggleTaskComplete(taskId);
                        modalBackdrop.remove();
                    });
                });

                container.querySelectorAll('.sispmg-task-edit-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const taskId = e.target.closest('button').dataset.taskId;
                        const modalTask = this.tasks.find(t => t.id.toString() === taskId.toString());
                        if (modalTask) {
                            this.showTaskModal(modalTask);
                            modalBackdrop.remove();
                        }
                    });
                });

                container.querySelectorAll('.sispmg-task-user-confirm-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (btn.classList.contains('confirmed')) return;
                        const taskId = e.target.closest('button').dataset.taskId;
                        await this.confirmTask(taskId);
                        modalBackdrop.remove();
                    });
                });
            }
        }
    }
}