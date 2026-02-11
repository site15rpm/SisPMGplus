// Arquivo: modules/intranet/intranet-agenda.js
// Responsável pela lógica do novo módulo de Agenda da Intranet

// CORREÇÃO: Importa a função de comunicação com o script de conteúdo/background.
import { sendMessageToBackground } from '../../common/utils.js';

export class IntranetAgendaModule {
    constructor() {
        console.log("SisPMG+ [Agenda]: Módulo de Agenda carregado.");
        this.tasks = [];
        this.settings = {};
    }

    async init() {
        // Lógica de inicialização do módulo
        console.log("SisPMG+ [Agenda]: Inicializando o módulo.");
        await this.loadSettings(); // Carrega antes de injetar UI para ter as configs prontas
        this.injectUI();
        await this.loadTasks();
        this.renderTasks();
    }

    injectUI() {
        // Injeta o painel fixo na página
        const panel = document.createElement('div');
        panel.id = 'sispmg-agenda-panel';
        panel.innerHTML = `
            <div id="sispmg-agenda-header">
                <h3>Agenda</h3>
                <button id="sispmg-agenda-add-btn">+</button>
            </div>
            <div id="sispmg-agenda-task-list"></div>
        `;
        document.body.appendChild(panel);

        document.getElementById('sispmg-agenda-add-btn').addEventListener('click', () => this.showTaskModal());
    }

    showTaskModal(task = null) {
        const existingModal = document.getElementById('sispmg-task-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'sispmg-task-modal';
        modal.className = 'sispmg-agenda-modal-container'; // Classe para o container do modal
        modal.innerHTML = `
            <div class="sispmg-modal-content">
                <span class="sispmg-modal-close" id="sispmg-task-modal-close">&times;</span>
                <h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                <input type="datetime-local" id="sispmg-agenda-datetime" value="${task ? new Date(task.dueDate).toISOString().substring(0, 16) : ''}">
                <textarea id="sispmg-agenda-info" placeholder="Descrição da atividade...">${task ? task.info : ''}</textarea>
                <button id="sispmg-agenda-save-btn">Salvar</button>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#sispmg-task-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#sispmg-agenda-save-btn').addEventListener('click', () => {
            this.saveTask(task ? task.id : null);
            modal.remove();
        });
    }

    async saveTask(taskId) {
        const dueDateInput = document.getElementById('sispmg-agenda-datetime');
        const infoInput = document.getElementById('sispmg-agenda-info');

        if (!dueDateInput.value || !infoInput.value) {
            alert("Data/Hora e Descrição são obrigatórios.");
            return;
        }

        const taskData = {
            dueDate: new Date(dueDateInput.value).getTime(),
            info: infoInput.value,
        };

        if (taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                Object.assign(task, taskData);
            }
        } else {
            this.tasks.push({ ...taskData, id: Date.now(), completed: false });
        }

        await this.persistTasks();
        this.renderTasks();
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

            taskElement.innerHTML = `
                <div class="sispmg-task-datetime">${new Date(task.dueDate).toLocaleString('pt-BR')}</div>
                <div class="sispmg-task-info">${task.info}</div>
                <div class="sispmg-task-actions">
                    <button class="sispmg-task-complete-btn">${task.completed ? 'Reabrir' : 'Concluir'}</button>
                    <button class="sispmg-task-edit-btn">Editar</button>
                </div>
            `;
            taskListContainer.appendChild(taskElement);
        });

        taskListContainer.querySelectorAll('.sispmg-task-complete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = parseInt(e.target.closest('.sispmg-agenda-task').dataset.taskId, 10);
                this.toggleTaskComplete(taskId);
            });
        });

        taskListContainer.querySelectorAll('.sispmg-task-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = parseInt(e.target.closest('.sispmg-agenda-task').dataset.taskId, 10);
                const task = this.tasks.find(t => t.id === taskId);
                if (task) this.showTaskModal(task);
            });
        });
    }

    applyTaskColor(element, task) {
        if (task.completed) {
            element.style.borderColor = this.settings.colors.completed;
            return;
        }

        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diffDays < 1) {
            element.style.borderColor = this.settings.colors.expired;
        } else if (diffDays <= this.settings.deadlines.soon) {
            element.style.borderColor = this.settings.colors.soon;
        } else {
            element.style.borderColor = this.settings.colors.far;
        }
    }
    
    sortTasks() {
        this.tasks.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            
            switch(this.settings.sortOrder) {
                case 'desc':
                    return b.dueDate - a.dueDate;
                case 'alpha':
                    return a.info.localeCompare(b.info);
                case 'asc':
                default:
                    return a.dueDate - b.dueDate;
            }
        });
    }

    async toggleTaskComplete(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            await this.persistTasks();
            this.renderTasks();
        }
    }

    // --- Métodos de Configuração (Modal) ---

    async showConfigModal() {
        const existingModal = document.getElementById('sispmg-config-modal');
        if (existingModal) existingModal.remove();

        // Carrega as configurações mais recentes antes de mostrar
        await this.loadSettings();

        const modal = document.createElement('div');
        modal.id = 'sispmg-config-modal';
        modal.className = 'sispmg-agenda-modal-container';
        modal.innerHTML = `
            <div class="sispmg-modal-content">
                <span class="sispmg-modal-close" id="sispmg-config-modal-close">&times;</span>
                <h2>Configurações da Agenda</h2>
                
                <div class="sispmg-form-group">
                    <h3>Cores das Tarefas</h3>
                    <div class="sispmg-color-input">
                        <label>Vencida:</label>
                        <input type="color" id="config-color-expired" value="${this.settings.colors.expired}">
                    </div>
                    <div class="sispmg-color-input">
                        <label>Vence em Breve:</label>
                        <input type="color" id="config-color-soon" value="${this.settings.colors.soon}">
                    </div>
                    <div class="sispmg-color-input">
                        <label>Distante:</label>
                        <input type="color" id="config-color-far" value="${this.settings.colors.far}">
                    </div>
                    <div class="sispmg-color-input">
                        <label>Concluída:</label>
                        <input type="color" id="config-color-completed" value="${this.settings.colors.completed}">
                    </div>
                </div>

                <div class="sispmg-form-group">
                    <h3>Prazos</h3>
                    <div class="sispmg-deadline-input">
                        <label>"Em breve" significa vencer em até:</label>
                        <input type="number" id="config-deadline-soon" min="1" value="${this.settings.deadlines.soon}">
                        <span>dias.</span>
                    </div>
                </div>

                <div class="sispmg-form-group">
                    <h3>Ordenação</h3>
                    <select id="config-sort-order">
                        <option value="asc" ${this.settings.sortOrder === 'asc' ? 'selected' : ''}>Data crescente</option>
                        <option value="desc" ${this.settings.sortOrder === 'desc' ? 'selected' : ''}>Data decrescente</option>
                        <option value="alpha" ${this.settings.sortOrder === 'alpha' ? 'selected' : ''}>Ordem alfabética</option>
                    </select>
                </div>

                <button id="sispmg-agenda-save-settings-btn">Salvar</button>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#sispmg-config-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#sispmg-agenda-save-settings-btn').addEventListener('click', () => {
            this.saveSettings(modal);
            modal.remove();
        });
    }

    async saveSettings(modal) {
        const newSettings = {
            colors: {
                expired: modal.querySelector('#config-color-expired').value,
                soon: modal.querySelector('#config-color-soon').value,
                far: modal.querySelector('#config-color-far').value,
                completed: modal.querySelector('#config-color-completed').value,
            },
            deadlines: {
                soon: parseInt(modal.querySelector('#config-deadline-soon').value, 10),
            },
            sortOrder: modal.querySelector('#config-sort-order').value,
        };

        this.settings = newSettings;
        // CORREÇÃO: Usa o sendMessageToBackground para salvar
        await sendMessageToBackground('setStorage', { sispmg_agenda_settings: newSettings, storageType: 'local' });
        
        // Re-renderiza as tarefas para aplicar as novas configurações
        this.renderTasks(); 
    }

    // --- Métodos de Persistência ---

    async loadTasks() {
        // CORREÇÃO: Usa o sendMessageToBackground para carregar
        const result = await sendMessageToBackground('getStorage', { keys: ['sispmg_agenda_tasks'], storageType: 'local' });
        if (result.success && result.value.sispmg_agenda_tasks) {
            this.tasks = result.value.sispmg_agenda_tasks;
        } else {
            this.tasks = [];
        }
    }

    async persistTasks() {
        // CORREÇÃO: Usa o sendMessageToBackground para salvar
        await sendMessageToBackground('setStorage', { sispmg_agenda_tasks: this.tasks, storageType: 'local' });
    }

    async loadSettings() {
        // CORREÇÃO: Usa o sendMessageToBackground para carregar
        const result = await sendMessageToBackground('getStorage', { keys: ['sispmg_agenda_settings'], storageType: 'local' });
        
        const defaultSettings = {
            colors: { expired: '#ff0000', soon: '#ffff00', far: '#008000', completed: '#808080' },
            deadlines: { soon: 3 },
            sortOrder: 'asc'
        };
        
        if (result.success && result.value.sispmg_agenda_settings) {
            // Merge profundo para evitar que configurações parciais quebrem o módulo
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
