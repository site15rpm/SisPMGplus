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
    if (!abrangenciaString) return false;
    const upperString = abrangenciaString.toUpperCase();
    if (upperString === "PMMG" || upperString === "1") return true;

    const allCriteria = abrangenciaString.split(',');
    if (allCriteria.length === 0) return false;

    for (const criterion of allCriteria) {
        const parts = criterion.split(':');
        if (parts.length < 2) continue;

        const key = parts[0].trim().toLowerCase();
        const rules = parts.slice(1).join(':').trim();
        const ruleList = rules.split('|').map(r => r.trim()).filter(r => r);

        if (!userData.hasOwnProperty(key) || ruleList.length === 0) {
            continue;
        }

        const userValue = userData[key];
        let criteriaMet = false;

        if (Array.isArray(userValue)) {
            for (const userItem of userValue) {
                for (const rule of ruleList) {
                    try {
                        if (new RegExp('^' + rule + '$', 'i').test(userItem)) {
                            criteriaMet = true;
                            break;
                        }
                    } catch (e) {
                        if (userItem === rule) criteriaMet = true;
                    }
                }
                if (criteriaMet) break;
            }
        } else if (typeof userValue === 'string') {
            for (const rule of ruleList) {
                try {
                    if (new RegExp('^' + rule + '$', 'i').test(userValue)) {
                        criteriaMet = true;
                        break;
                    }
                } catch (e) {
                    if (userValue === rule) criteriaMet = true;
                }
            }
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

    async init() {
        // Lógica de inicialização do módulo
        console.log("SisPMG+ [Agenda]: Inicializando o módulo.");
        await this.loadSettings(); // Carrega antes de injetar UI para ter as configs prontas
        
        try {
            const token = getCookie('tokiuz');
            this.userData = decodeJwt(token);
            this.userNumber = this.userData ? String(this.userData.g) : null;
        } catch (e) {
            this.userNumber = null;
            console.error("SisPMG+ [Agenda]: Falha ao obter número do usuário na inicialização.", e);
        }

        this.injectUI(); // Panel is created and set to 'collapsed' by default
        await this.loadTasks();
        this.renderTasks();

        // Check localStorage state after rendering
        const isCollapsedFromStorage = localStorage.getItem('sispmg_agenda_collapsed') === 'true';
        if (!isCollapsedFromStorage && this.panel) {
            // If it should NOT be collapsed (i.e., was expanded), expand it smoothly.
            // toggleCollapse will remove the 'collapsed' class and trigger the transition.
            this.toggleCollapse(this.panel);
        }
    }

    injectUI() {
        this.panel = document.createElement('div');
        this.panel.id = 'sispmg-agenda-panel';
        this.panel.classList.add('collapsed'); // Sempre começa recolhido para revelação suave

        // A ordem do HTML é invertida para o painel crescer para cima com flex-direction: column-reverse
        this.panel.innerHTML = `
            <div id="sispmg-agenda-task-list"></div>
            <div id="sispmg-agenda-header">
                <div class="sispmg-agenda-title-group">
                    ${iconSVG_28}
                    <h3>Agenda de Tarefas</h3>
                </div>
                <div class="sispmg-agenda-header-actions">
                    <button id="sispmg-agenda-add-btn" title="Nova Tarefa"><i class="fa-solid fa-plus"></i></button>
                    <button id="sispmg-agenda-collapse-btn" title="Recolher/Expandir">
                        <i class="fa-solid fa-chevron-up"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(this.panel);

        document.getElementById('sispmg-agenda-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTaskModal();
        });
        document.getElementById('sispmg-agenda-collapse-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse(this.panel);
        });
    }

    toggleCollapse(panel) {
        panel.classList.toggle('collapsed');
        const isCollapsed = panel.classList.contains('collapsed');
        localStorage.setItem('sispmg_agenda_collapsed', isCollapsed.toString());
        
        const icon = panel.querySelector('#sispmg-agenda-collapse-btn i');
        icon.classList.toggle('fa-chevron-down', !isCollapsed);
        icon.classList.toggle('fa-chevron-up', isCollapsed);
    }

    showTaskModal(task = null) {
        const existingModal = document.getElementById('sispmg-task-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'sispmg-task-modal';
        modal.className = 'sispmg-agenda-modal-container';

        let dateValue = '';
        let timeValue = '00:00';
        if (task) {
            const taskDate = new Date(task['data/hora']);
            dateValue = taskDate.toISOString().split('T')[0];
            timeValue = taskDate.toTimeString().split(' ')[0].substring(0, 5);
        }

        modal.innerHTML = `
            <div class="sispmg-modal-content">
                <span class="sispmg-modal-close" id="sispmg-task-modal-close">&times;</span>
                <h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                
                <div class="sispmg-datetime-group">
                    <input type="date" id="sispmg-agenda-date" value="${dateValue}">
                    <input type="time" id="sispmg-agenda-time" value="${timeValue}">
                </div>

                <textarea id="sispmg-agenda-assunto" placeholder="Assunto da atividade..." rows="1">${task ? task.assunto : ''}</textarea>
                <textarea id="sispmg-agenda-descricao" placeholder="Detalhes da tarefa... (opcional)" rows="3">${task && task.descricao ? task.descricao : ''}</textarea>
                <textarea id="sispmg-agenda-abrangencia" placeholder="Regra de abrangência (ex: g:123, t:SGT|CB, p:.*15RPM.*)" rows="1">${task && task.abrangencia ? task.abrangencia : ''}</textarea>
                
                <div class="sispmg-form-group">
                    <input type="checkbox" id="sispmg-agenda-autoconfirmar" ${task && task.autoConfirmar ? 'checked' : ''}>
                    <label for="sispmg-agenda-autoconfirmar">Autoconcluir após</label>
                    <input type="number" id="sispmg-agenda-autoconfirmardias" min="1" max="15" value="${task && task.autoConfirmarDias ? task.autoConfirmarDias : '5'}">
                    <label for="sispmg-agenda-autoconfirmardias">dias.</label>
                </div>

                <div class="sispmg-modal-actions">
                    ${task ? `<button id="sispmg-agenda-delete-btn" title="Excluir Tarefa"><i class="fas fa-trash"></i></button>` : ''}
                    <button id="sispmg-agenda-save-btn">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const abrangenciaInput = modal.querySelector('#sispmg-agenda-abrangencia');
        const autoConfirmarCheckbox = modal.querySelector('#sispmg-agenda-autoconfirmar');
        const autoConfirmarDiasInput = modal.querySelector('#sispmg-agenda-autoconfirmardias');

        const handleAbrangenciaChange = () => {
            if (abrangenciaInput.value.trim() !== '') {
                autoConfirmarCheckbox.checked = true;
                autoConfirmarCheckbox.disabled = true;
            } else {
                autoConfirmarCheckbox.disabled = false;
            }
        };

        // Auto-adjust height for all textareas
        [abrangenciaInput, modal.querySelector('#sispmg-agenda-assunto'), modal.querySelector('#sispmg-agenda-descricao')].forEach(textarea => {
            const adjustHeight = () => {
                textarea.style.height = 'auto';
                textarea.style.height = `${textarea.scrollHeight}px`;
            };
            textarea.addEventListener('input', adjustHeight);
            setTimeout(adjustHeight, 0);
        });
        
        abrangenciaInput.addEventListener('input', handleAbrangenciaChange);
        setTimeout(handleAbrangenciaChange, 0);

        autoConfirmarDiasInput.addEventListener('input', () => {
            const value = parseInt(autoConfirmarDiasInput.value, 10);
            if (value > 15) {
                autoConfirmarDiasInput.value = '15';
            } else if (value < 1) {
                if (autoConfirmarDiasInput.value !== '') {
                    autoConfirmarDiasInput.value = '1';
                }
            }
        });

        modal.querySelector('#sispmg-task-modal-close').addEventListener('click', () => modal.remove());
        
        modal.querySelector('#sispmg-agenda-save-btn').addEventListener('click', async () => {
            const success = await this.saveTask(task ? task.id : null);
            if (success) {
                modal.remove();
            }
        });

        if (task) {
            modal.querySelector('#sispmg-agenda-delete-btn').addEventListener('click', () => {
                this.deleteTask(task.id);
                modal.remove();
            });
        }
    }

    async saveTask(taskId) {
        const dateInput = document.getElementById('sispmg-agenda-date');
        const timeInput = document.getElementById('sispmg-agenda-time');
        const assuntoInput = document.getElementById('sispmg-agenda-assunto');
        const descricaoInput = document.getElementById('sispmg-agenda-descricao');
        const abrangenciaInput = document.getElementById('sispmg-agenda-abrangencia');
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

        const timeValue = timeInput.value || '00:00';
        const combinedISO = `${dateInput.value}T${timeValue}:00`;

        const abrangenciaValue = abrangenciaInput.value.trim();
        let autoConfirmarValue = autoConfirmarInput.checked;
        let autoConfirmarDiasValue = parseInt(autoConfirmarDiasInput.value, 10) || 1;

        if (abrangenciaValue !== '') {
            autoConfirmarValue = true;
            if (autoConfirmarDiasValue < 1) {
                autoConfirmarDiasValue = 1;
            }
        }

        if (autoConfirmarDiasValue > 15) {
            autoConfirmarDiasValue = 15;
        }
        
        const eventData = {
            id: taskId || `evt_${Date.now()}`,
            'data/hora': new Date(combinedISO).toISOString(),
            assunto: assuntoInput.value,
            concluida: false,
            autor: taskId ? undefined : this.userNumber, // Envia autor apenas na criação
            abrangencia: abrangenciaValue,
            status: 'ACTIVE',
            autoConfirmar: autoConfirmarValue,
            autoConfirmarDias: autoConfirmarDiasValue,
            descricao: descricaoInput.value,
            editorNumero: this.userNumber // Sempre envia quem está editando
        };

        const taskInUI = {
            ...this.tasks.find(t => t.id === taskId), // Preserva campos não editáveis como 'confirmacoes'
            ...eventData,
            'data/hora': new Date(eventData['data/hora']).getTime(),
            autor: taskId ? this.tasks.find(t => t.id === taskId).autor : this.userNumber // Mantém autor original
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
        const confirmed = await this._showConfirm("Tem certeza que deseja excluir esta tarefa?");
        if (!confirmed) return;

        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            console.error(`SisPMG+ [Agenda]: Tarefa ${taskId} não encontrada para exclusão.`);
            return;
        }

        const originalStatus = task.status;
        task.status = 'DELETED';
        this.renderTasks(); 

        const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
        
        sendMessageToBackground('agenda-add-event', {
            gasUrl: gasUrl,
            eventData: { id: taskId, status: 'DELETED', editorNumero: this.userNumber }
        }).then(response => {
            if (response.success) {
                console.log("SisPMG+ [Agenda]: Tarefa marcada como excluída em segundo plano.");
            } else {
                console.error(`SisPMG+ [Agenda]: Falha ao excluir tarefa em segundo plano.`, response.error);
                this._showAlert("Falha ao sincronizar a exclusão. A tarefa será exibida novamente.");
                task.status = originalStatus;
                this.renderTasks();
            }
        });
    }

    renderTasks() {
        const taskListContainer = document.getElementById('sispmg-agenda-task-list');
        if (!taskListContainer) return;
        taskListContainer.innerHTML = '';

        this.sortTasks();

        this.tasks.filter(task => task.status !== 'DELETED').forEach(task => {
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

            let actionButtons = '';
            if (isAuthor) {
                const titleText = confirmedUsers.length > 0 ? `Ver ${confirmedUsers.length} confirmações` : 'Nenhuma confirmação';
                actionButtons = `
                    <div class="sispmg-task-actions">
                        <button class="sispmg-task-view-confirmations-btn" title="${titleText}">
                            <i class="fa-solid fa-users"></i>
                            <span class="sispmg-confirm-count">${confirmedUsers.length}</span>
                        </button>
                        <button class="sispmg-task-complete-btn" title="${task.concluida ? 'Reabrir Tarefa' : 'Concluir Tarefa'}">
                            <i class="fa-solid ${task.concluida ? 'fa-arrow-rotate-left' : 'fa-check'}"></i>
                        </button>
                        <button class="sispmg-task-edit-btn" title="Editar Tarefa">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                    </div>
                `;
            } else if (checkAbrangencia(task.abrangencia, this.userData)) {
                 actionButtons = `
                    <div class="sispmg-task-actions">
                         <button class="sispmg-task-user-confirm-btn ${isConfirmedByUser ? 'confirmed' : ''}" 
                                 title="${isConfirmedByUser ? 'Tarefa confirmada' : 'Confirmar leitura'}"
                                 ${isConfirmedByUser ? 'disabled' : ''}>
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                `;
            }


            const formattedDate = new Date(task['data/hora']).toLocaleString('pt-BR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });

            taskElement.innerHTML = `
                <div class="sispmg-task-content">
                    <div class="sispmg-task-datetime">${formattedDate}</div>
                    <div class="sispmg-task-info">${task.assunto}</div>
                </div>
                ${actionButtons}
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
    
    addTaskActionListeners(container) {
        container.querySelectorAll('.sispmg-task-view-confirmations-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
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
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
                this.toggleTaskComplete(taskId);
            });
        });

        container.querySelectorAll('.sispmg-task-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
                const task = this.tasks.find(t => t.id.toString() === taskId.toString());
                if (task) this.showTaskModal(task);
            });
        });
        
        container.querySelectorAll('.sispmg-task-user-confirm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.classList.contains('confirmed')) return; // Já confirmado
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
                this.confirmTask(taskId);
            });
        });
    }

    applyTaskColor(element, task) {
        element.classList.remove('blinking-border');
        const category = this.getTaskCategory(task);

        switch (category) {
            case 0: // Vermelho (Expirada)
                element.style.borderColor = this.settings.colors.expired;
                element.classList.add('blinking-border');
                break;
            case 1: // Amarelo (Pendente)
                element.style.borderColor = this.settings.colors.soon;
                break;
            case 2: // Azul (Confirmada)
                element.style.borderColor = '#007bff';
                break;
            case 3: // Verde (Concluída)
                element.style.borderColor = this.settings.colors.far;
                break;
            default:
                element.style.borderColor = this.settings.colors.far;
                break;
        }
    }

    getTaskCategory(task) {
        const isConfirmedByUser = this.userNumber && (task.confirmacoes || '').split('|').includes(this.userNumber);
        const dueDate = new Date(task['data/hora']);
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
        dueDate.setHours(0, 0, 0, 0);

        if (task.concluida) return 3; // Verde
        if (isConfirmedByUser) return 2; // Azul
        if (dueDate < now) return 0; // Vermelho
        return 1; // Amarelo
    }
    
    sortTasks() {
        this.tasks.sort((a, b) => {
            const categoryA = this.getTaskCategory(a);
            const categoryB = this.getTaskCategory(b);

            // 1. Nível de classificação primário: Categoria (Cor)
            if (categoryA !== categoryB) {
                return categoryA - categoryB;
            }

            // 2. Nível de classificação secundário: Data/Hora (mais atual para mais antiga)
            const dateA = a['data/hora'];
            const dateB = b['data/hora'];
            if (dateA !== dateB) {
                return dateB - dateA;
            }

            // 3. Nível de classificação final: Ordem alfabética do assunto
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

        this.renderTasks(); // Re-render to update button state

        const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
        sendMessageToBackground('agenda-confirm-task', {
            gasUrl: gasUrl,
            eventData: { taskId: taskId, userNumber: this.userNumber }
        }).then(response => {
            if (!response.success) {
                console.error("Falha ao sincronizar confirmação.", response.error);
                // Opcional: reverter a confirmação na UI se a chamada falhar
            }
        });
    }

    async toggleTaskComplete(taskId) {
        const task = this.tasks.find(t => t.id.toString() === taskId.toString());
        if (task) {
            const newConcluidaStatus = !task.concluida;
            task.concluida = newConcluidaStatus;
            this.renderTasks();

            const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
            
            sendMessageToBackground('agenda-add-event', {
                gasUrl: gasUrl,
                eventData: {
                    id: task.id, // Apenas o necessário para a atualização
                    concluida: newConcluidaStatus,
                    editorNumero: this.userNumber
                }
            }).then(response => {
                if (response.success) {
                    console.log(`SisPMG+ [Agenda]: Status da tarefa ${taskId} atualizado em segundo plano.`);
                } else {
                    console.error(`SisPMG+ [Agenda]: Falha ao atualizar status da tarefa ${taskId}.`, response.error);
                    task.concluida = !newConcluidaStatus; // Reverte a alteração
                    this.renderTasks();
                    this._showAlert('Falha ao atualizar o status da tarefa. A alteração foi desfeita.');
                }
            });
        }
    }

    async loadTasks() {
        const sheetId = '1wtk0NWpyXPm791PPB2ICoto1YnKyYJ4UCs5JxJIRM_U';
        const sheetName = 'agenda';
        
        const query = `SELECT * WHERE H != 'DELETED'`;
        const response = await sendMessageToBackground('agenda-fetch-data', {
            sheetId: sheetId,
            sheet: sheetName,
            query: query
        });

        if (response.success && Array.isArray(response.data)) {
            const now = new Date().getTime();

            this.tasks = response.data.filter(row => {
                const autor = row[5]; // Coluna F
                const abrangencia = row[6] || ''; // Coluna G
                
                const hasAccess = (this.userNumber && this.userNumber === autor.toString()) || checkAbrangencia(abrangencia, this.userData);
                
                return hasAccess;

            }).map(row => {
                let concluida = row[4] === 'TRUE' || row[4] === 1; // Coluna E
                const autoConfirmar = row[8] === 'TRUE' || row[8] === 1; // Coluna I
                const autoConfirmarDias = parseInt(row[9], 10); // Coluna J
                const creationTimestamp = new Date(row[1]).getTime(); // Coluna B

                if (!concluida && autoConfirmar && autoConfirmarDias > 0) {
                    const deadline = creationTimestamp + (autoConfirmarDias * 24 * 60 * 60 * 1000);
                    if (now >= deadline) {
                        concluida = true;
                    }
                }

                return {
                    id: row[0], // Coluna A
                    timestamp: creationTimestamp,
                    'data/hora': new Date(row[2]).getTime(), // Coluna C
                    assunto: row[3], // Coluna D
                    concluida: concluida,
                    autor: row[5], // Coluna F
                    abrangencia: row[6], // Coluna G
                    status: row[7], // Coluna H
                    autoConfirmar: autoConfirmar,
                    autoConfirmarDias: autoConfirmarDias,
                    descricao: row[10] || '', // Coluna K
                    confirmacoes: row[11] || '' // Coluna L
                };
            });
        } else {
            console.error("SisPMG+ [Agenda]: Falha ao carregar tarefas da planilha.", response.error);
            this.tasks = [];
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

    _showModal(title, message, buttons, options = {}, actionButtonsHTML = '') { // Adicionado actionButtonsHTML
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'sispmg-alert-modal-backdrop';

        let controlButtonsHTML = '';
        buttons.forEach((btn, index) => {
            controlButtonsHTML += `<button id="sispmg-alert-btn-${index}" class="${btn.className}">${btn.text}</button>`;
        });

        modalBackdrop.innerHTML = `
            <div class="sispmg-alert-modal-content ${options.contentClassName || ''}">
                <h4>${title}</h4>
                <p>${message}</p>
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

        // Aplica estilos de tamanho do modal se fornecidos nas opções
        const modalContentElement = modalBackdrop.querySelector('.sispmg-alert-modal-content');
        if (options.maxWidth) {
            modalContentElement.style.maxWidth = options.maxWidth;
        }
        if (options.maxHeight) {
            modalContentElement.style.maxHeight = options.maxHeight;
            modalContentElement.style.overflowY = 'auto'; // Adiciona scroll se exceder max-height
        }

        buttons.forEach((btn, index) => {
            modalBackdrop.querySelector(`#sispmg-alert-btn-${index}`).addEventListener('click', () => {
                if (btn.action) {
                    btn.action();
                }
                modalBackdrop.remove();
            });
        });
        return modalBackdrop; // Retorna o backdrop para anexar listeners aos botões de ação
    }

    _showAlert(message, title = 'Aviso') {
        this._showModal(title, message, [
            { text: 'OK', className: 'sispmg-alert-btn-confirm' }
        ]);
    }

    _showConfirm(message, title = 'Confirmação') {
        return new Promise(resolve => {
            this._showModal(title, message, [
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

        // --- Generate Action Buttons HTML ---
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
        // --- End Generate Action Buttons HTML ---

        const modalBackdrop = this._showModal(
            'Informações Detalhadas',
            contentHTML,
            [{ text: 'OK', className: 'sispmg-alert-btn-confirm' }],
            {
                maxWidth: '450px', // Fixed width for portrait as requested
                maxHeight: '600px', // Fixed height for portrait as requested
                contentClassName: 'sispmg-task-detail-modal'
            },
            actionButtonsHtml // Pass generated action buttons
        );

        // --- Attach Event Listeners to Action Buttons ---
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
                    btn.addEventListener('click', async (e) => { // Added async here
                        e.stopPropagation();
                        const taskId = e.target.closest('button').dataset.taskId;
                        await this.toggleTaskComplete(taskId); // Await the action
                        modalBackdrop.remove(); // Close modal after action
                    });
                });

                container.querySelectorAll('.sispmg-task-edit-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const taskId = e.target.closest('button').dataset.taskId;
                        const modalTask = this.tasks.find(t => t.id.toString() === taskId.toString());
                        if (modalTask) {
                            this.showTaskModal(modalTask);
                            modalBackdrop.remove(); // Close details modal when opening edit modal
                        }
                    });
                });

                container.querySelectorAll('.sispmg-task-user-confirm-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => { // Added async here
                        e.stopPropagation();
                        if (btn.classList.contains('confirmed')) return; // Already confirmed
                        const taskId = e.target.closest('button').dataset.taskId;
                        await this.confirmTask(taskId); // Await the action
                        modalBackdrop.remove(); // Close modal after action
                    });
                });
            }
        }
    }
}