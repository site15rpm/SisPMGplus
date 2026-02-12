// Arquivo: modules/intranet/intranet-agenda.js
// Responsável pela lógica do novo módulo de Agenda da Intranet

import { sendMessageToBackground, getCookie, decodeJwt } from '../../common/utils.js';

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
    }

    async init() {
        // Lógica de inicialização do módulo
        console.log("SisPMG+ [Agenda]: Inicializando o módulo.");
        await this.loadSettings(); // Carrega antes de injetar UI para ter as configs prontas
        
        try {
            const token = getCookie('tokiuz');
            const userData = decodeJwt(token);
            this.userNumber = userData ? String(userData.g) : null;
        } catch (e) {
            this.userNumber = null;
            console.error("SisPMG+ [Agenda]: Falha ao obter número do usuário na inicialização.", e);
        }

        this.injectUI();
        await this.loadTasks();
        this.renderTasks();
    }

    injectUI() {
        const panel = document.createElement('div');
        panel.id = 'sispmg-agenda-panel';
        const isCollapsed = localStorage.getItem('sispmg_agenda_collapsed') === 'true';
        if (isCollapsed) {
            panel.classList.add('collapsed');
        }

        panel.innerHTML = `
            <div id="sispmg-agenda-header">
                <span id="sispmg-agenda-drag-handle" title="Mover painel">::</span>
                <h3>Agenda</h3>
                <button id="sispmg-agenda-add-btn" title="Nova Tarefa"><i class="fa-solid fa-plus"></i></button>
                <button id="sispmg-agenda-collapse-btn" title="Recolher/Expandir">
                    <i class="fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}"></i>
                </button>
            </div>
            <div id="sispmg-agenda-task-list"></div>
        `;
        document.body.appendChild(panel);

        const savedPosition = localStorage.getItem('sispmg_agenda_position');
        if (savedPosition) {
            const { top, left } = JSON.parse(savedPosition);
            panel.style.top = top;
            panel.style.left = left;
        }

        document.getElementById('sispmg-agenda-add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTaskModal();
        });
        document.getElementById('sispmg-agenda-collapse-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse(panel);
        });
        
        this.setupDraggable(panel, document.getElementById('sispmg-agenda-header'));
    }

    toggleCollapse(panel) {
        panel.classList.toggle('collapsed');
        const isCollapsed = panel.classList.contains('collapsed');
        localStorage.setItem('sispmg_agenda_collapsed', isCollapsed.toString());
        
        const icon = panel.querySelector('#sispmg-agenda-collapse-btn i');
        icon.classList.toggle('fa-chevron-left', !isCollapsed);
        icon.classList.toggle('fa-chevron-right', isCollapsed);
    }

    setupDraggable(element, handle) {
        let isDragging = false;
        let offsetX, offsetY;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            element.style.left = `${e.clientX - offsetX}px`;
            element.style.top = `${e.clientY - offsetY}px`;
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            localStorage.setItem('sispmg_agenda_position', JSON.stringify({
                top: element.style.top,
                left: element.style.left
            }));
        };

        handle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            
            isDragging = true;
            const rect = element.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    showTaskModal(task = null) {
        const existingModal = document.getElementById('sispmg-task-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'sispmg-task-modal';
        modal.className = 'sispmg-agenda-modal-container';
        modal.innerHTML = `
            <div class="sispmg-modal-content">
                <span class="sispmg-modal-close" id="sispmg-task-modal-close">&times;</span>
                <h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                <input type="datetime-local" id="sispmg-agenda-datetime" value="${task ? new Date(task['data/hora']).toISOString().substring(0, 16) : ''}">
                <textarea id="sispmg-agenda-assunto" placeholder="Descrição da atividade...">${task ? task.assunto : ''}</textarea>
                <textarea id="sispmg-agenda-abrangencia" placeholder="Regra de abrangência (ex: g:123, t:SGT|CB, p:.*15RPM.*)" rows="1">${task && task.abrangencia ? task.abrangencia : ''}</textarea>
                
                <div class="sispmg-form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                    <input type="checkbox" id="sispmg-agenda-autoconfirmar" ${task && task.autoConfirmar ? 'checked' : ''}>
                    <label for="sispmg-agenda-autoconfirmar">Autoconcluir após</label>
                    <input type="number" id="sispmg-agenda-autoconfirmardias" min="1" value="${task && task.autoConfirmarDias ? task.autoConfirmarDias : '5'}" style="width: 60px;">
                    <label for="sispmg-agenda-autoconfirmardias">dias.</label>
                </div>

                <button id="sispmg-agenda-save-btn">Salvar</button>
            </div>
        `;
        document.body.appendChild(modal);

        const textarea = modal.querySelector('#sispmg-agenda-abrangencia');
        const adjustHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };
        textarea.addEventListener('input', adjustHeight);
        setTimeout(adjustHeight, 0); 

        modal.querySelector('#sispmg-task-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#sispmg-agenda-save-btn').addEventListener('click', () => {
            this.saveTask(task ? task.id : null);
            modal.remove();
        });
    }

    async saveTask(taskId) {
        const dueDateInput = document.getElementById('sispmg-agenda-datetime');
        const assuntoInput = document.getElementById('sispmg-agenda-assunto');
        const abrangenciaInput = document.getElementById('sispmg-agenda-abrangencia');
        const autoConfirmarInput = document.getElementById('sispmg-agenda-autoconfirmar');
        const autoConfirmarDiasInput = document.getElementById('sispmg-agenda-autoconfirmardias');

        if (!dueDateInput.value || !assuntoInput.value) {
            alert("Data/Hora e Assunto são obrigatórios.");
            return;
        }

        if (!this.userNumber) {
            alert("Não foi possível identificar o usuário. Faça login novamente.");
            return;
        }
        
        const eventData = {
            id: taskId || `evt_${Date.now()}`,
            'data/hora': new Date(dueDateInput.value).toISOString(),
            assunto: assuntoInput.value,
            concluida: false,
            autor: this.userNumber,
            abrangencia: abrangenciaInput.value.trim(),
            status: 'ACTIVE',
            autoConfirmar: autoConfirmarInput.checked,
            autoConfirmarDias: autoConfirmarDiasInput.value
        };

        const taskInUI = {
            ...eventData,
            'data/hora': new Date(eventData['data/hora']).getTime(),
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
            }
        });
    }

    renderTasks() {
        const taskListContainer = document.getElementById('sispmg-agenda-task-list');
        if (!taskListContainer) return;
        taskListContainer.innerHTML = '';

        this.sortTasks();

        this.tasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = 'sispmg-agenda-task';
            taskElement.dataset.taskId = task.id;

            this.applyTaskColor(taskElement, task);

            let actionButtons = '';
            if (this.userNumber && task.autor && this.userNumber === task.autor.toString()) {
                actionButtons = `
                    <div class="sispmg-task-actions">
                        <button class="sispmg-task-complete-btn" title="${task.concluida ? 'Reabrir Tarefa' : 'Concluir Tarefa'}">
                            <i class="fa-solid ${task.concluida ? 'fa-arrow-rotate-left' : 'fa-check'}"></i>
                        </button>
                        <button class="sispmg-task-edit-btn" title="Editar Tarefa">
                            <i class="fa-solid fa-pencil"></i>
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
        });

        taskListContainer.querySelectorAll('.sispmg-task-complete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede que o clique acione o drag do painel
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
                this.toggleTaskComplete(taskId);
            });
        });

        taskListContainer.querySelectorAll('.sispmg-task-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede que o clique acione o drag do painel
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
                const task = this.tasks.find(t => t.id.toString() === taskId.toString());
                if (task) this.showTaskModal(task);
            });
        });
    }

    applyTaskColor(element, task) {
        element.classList.remove('blinking-border');

        if (task.concluida) {
            element.style.borderColor = this.settings.colors.completed;
            return;
        }

        const now = new Date();
        const dueDate = new Date(task['data/hora']);
        const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diffDays < 1) {
            element.style.borderColor = this.settings.colors.expired;
            element.classList.add('blinking-border');
        } else if (diffDays <= this.settings.deadlines.soon) {
            element.style.borderColor = this.settings.colors.soon;
        } else {
            element.style.borderColor = this.settings.colors.far;
        }
    }
    
    sortTasks() {
        this.tasks.sort((a, b) => {
            if (a.concluida !== b.concluida) return a.concluida ? 1 : -1;
            
            switch(this.settings.sortOrder) {
                case 'desc':
                    return b['data/hora'] - a['data/hora'];
                case 'alpha':
                    return a.assunto.localeCompare(b.assunto);
                case 'asc':
                default:
                    return a['data/hora'] - b['data/hora'];
            }
        });
    }

    async toggleTaskComplete(taskId) {
        const task = this.tasks.find(t => t.id.toString() === taskId.toString());
        if (task) {
            task.concluida = !task.concluida;
            this.renderTasks();

            const gasUrl = 'https://script.google.com/macros/s/AKfycbyriniVNqgHE206Vzx3_rplOVwSxV2f6HjyAr1zEhmyXoMH_l8AkGLyin1PK4jI0tHe/exec';
            
            sendMessageToBackground('agenda-add-event', {
                gasUrl: gasUrl,
                eventData: {
                    ...task,
                    'data/hora': new Date(task['data/hora']).toISOString(), 
                }
            }).then(response => {
                if (response.success) {
                    console.log(`SisPMG+ [Agenda]: Status da tarefa ${taskId} atualizado em segundo plano.`);
                } else {
                    console.error(`SisPMG+ [Agenda]: Falha ao atualizar status da tarefa ${taskId}.`, response.error);
                    task.concluida = !task.concluida;
                    this.renderTasks();
                    alert('Falha ao atualizar o status da tarefa. A alteração foi desfeita.');
                }
            });
        }
    }

    async loadTasks() {
        const sheetId = '1wtk0NWpyXPm791PPB2ICoto1YnKyYJ4UCs5JxJIRM_U';
        const sheetName = 'agenda';
        
        let userData = { f: [], fl: [], ff: [] };
        try {
            const token = getCookie('tokiuz');
            if (token) {
                const decoded = decodeJwt(token);
                const userFunctions = Array.isArray(decoded.f) ? decoded.f.map(String) : [];
                const userFunctionsL = [];
                const userFunctionsF = [];

                userFunctions.forEach(func => {
                    const parts = func.split('.');
                    if (parts.length > 1) {
                        userFunctionsL.push(parts[0]);
                        userFunctionsF.push(parts.slice(1).join('.'));
                    } else {
                        userFunctionsL.push(func);
                        userFunctionsF.push("");
                    }
                });
                
                userData = {
                    g: String(decoded.g || ''), t: String(decoded.t || ''), e: String(decoded.e || ''),
                    p: String(decoded.p || ''), r: String(decoded.r || ''), u: String(decoded.u || ''),
                    c: String(decoded.c || ''), f: userFunctions, fl: userFunctionsL, ff: userFunctionsF
                };
            }
        } catch (e) {
            console.error('SisPMG+ [Agenda]: Falha ao decodificar tokiuz para regras de abrangência.', e);
            this.tasks = [];
            return;
        }

        const query = `SELECT * WHERE H != 'DELETED'`;
        const response = await sendMessageToBackground('agenda-fetch-data', {
            sheetId: sheetId,
            sheet: sheetName,
            query: query
        });

        if (response.success && Array.isArray(response.data)) {
            const now = new Date().getTime();

            this.tasks = response.data.filter(row => {
                const autor = row[5];
                const abrangencia = row[6] || '';
                
                // O autor sempre vê, ou verifica a regra de abrangência
                const hasAccess = (this.userNumber && this.userNumber === autor.toString()) || checkAbrangencia(abrangencia, userData);
                
                console.log(`%c[Agenda Debug] Task ID: ${row[0]} | Rule: "${abrangencia}" | Author: ${autor} | User: ${this.userNumber} | HasAccess: ${hasAccess}`, 'color: #3498db');
                return hasAccess;

            }).map(row => {
                let concluida = row[4] === 'TRUE' || row[4] === 1;
                const autoConfirmar = row[8] === 'TRUE' || row[8] === 1;
                const autoConfirmarDias = parseInt(row[9], 10);
                const creationTimestamp = new Date(row[1]).getTime();

                if (!concluida && autoConfirmar && autoConfirmarDias > 0) {
                    const deadline = creationTimestamp + (autoConfirmarDias * 24 * 60 * 60 * 1000);
                    if (now >= deadline) {
                        concluida = true;
                    }
                }

                return {
                    id: row[0],
                    timestamp: creationTimestamp,
                    'data/hora': new Date(row[2]).getTime(),
                    assunto: row[3],
                    concluida: concluida,
                    autor: row[5],
                    abrangencia: row[6],
                    status: row[7],
                    autoConfirmar: autoConfirmar,
                    autoConfirmarDias: autoConfirmarDias
                };
            });
        } else {
            console.error("SisPMG+ [Agenda]: Falha ao carregar tarefas da planilha.", response.error);
            this.tasks = [];
        }
    }
    
    // ... restante do arquivo sem alterações ...
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
}
