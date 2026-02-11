// Arquivo: modules/intranet/intranet-agenda.js
// Responsável pela lógica do novo módulo de Agenda da Intranet

export class IntranetAgendaModule {
    constructor() {
        console.log("SisPMG+ [Agenda]: Módulo de Agenda carregado.");
        this.tasks = [];
        this.settings = {};
    }

    async init() {
        // Lógica de inicialização do módulo
        console.log("SisPMG+ [Agenda]: Inicializando o módulo.");
        this.injectUI();
        await this.loadSettings();
        await this.loadTasks();
        this.renderTasks();
    }

    injectUI() {
        // Injeta o painel fixo na página
        console.log("SisPMG+ [Agenda]: Injetando UI.");
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

        // Adiciona o listener para o botão de adicionar
        document.getElementById('sispmg-agenda-add-btn').addEventListener('click', () => {
            this.showTaskModal();
        });
    }

    showTaskModal(task = null) {
        // Remove modal existente, se houver
        const existingModal = document.getElementById('sispmg-agenda-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Cria e injeta o modal
        const modal = document.createElement('div');
        modal.id = 'sispmg-agenda-modal';
        modal.innerHTML = `
            <div class="sispmg-modal-content">
                <span id="sispmg-agenda-modal-close">&times;</span>
                <h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                <input type="datetime-local" id="sispmg-agenda-datetime" value="${task ? new Date(task.dueDate).toISOString().substring(0, 16) : ''}">
                <textarea id="sispmg-agenda-info" placeholder="Descrição da atividade...">${task ? task.info : ''}</textarea>
                <button id="sispmg-agenda-save-btn">Salvar</button>
            </div>
        `;
        document.body.appendChild(modal);

        // Listeners do modal
        document.getElementById('sispmg-agenda-modal-close').addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('sispmg-agenda-save-btn').addEventListener('click', () => {
            this.saveTask(task ? task.id : null);
            modal.remove();
        });
    }

    async saveTask(taskId) {
        const dueDate = document.getElementById('sispmg-agenda-datetime').value;
        const info = document.getElementById('sispmg-agenda-info').value;

        if (!dueDate || !info) {
            alert("Data/Hora e Descrição são obrigatórios.");
            return;
        }

        if (taskId) {
            // Edita a tarefa existente
            const task = this.tasks.find(t => t.id === taskId);
            if(task) {
                task.dueDate = new Date(dueDate).getTime();
                task.info = info;
            }
        } else {
            // Cria uma nova tarefa
            const newTask = {
                id: Date.now(),
                dueDate: new Date(dueDate).getTime(),
                info: info,
                completed: false
            };
            this.tasks.push(newTask);
        }

        await this.persistTasks();
        this.renderTasks();
    }

    renderTasks() {
        // Renderiza a lista de tarefas no painel
        console.log("SisPMG+ [Agenda]: Renderizando tarefas.");
        const taskListContainer = document.getElementById('sispmg-agenda-task-list');
        taskListContainer.innerHTML = ''; // Limpa a lista

        // Ordena as tarefas
        this.sortTasks();

        this.tasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = 'sispmg-agenda-task';
            taskElement.dataset.taskId = task.id;

            // Define a cor baseada na data de vencimento
            this.applyTaskColor(taskElement, task);

            taskElement.innerHTML = `
                <div class="sispmg-task-datetime">${new Date(task.dueDate).toLocaleString('pt-BR')}</div>
                <div class="sispmg-task-info">${task.info}</div>
                <div class="sispmg-task-actions">
                    <button class="sispmg-task-complete-btn">${task.completed ? 'Reabrir' : 'Concluir'}</button>
                </div>
            `;
            
            taskListContainer.appendChild(taskElement);
        });

        // Adiciona listeners aos botões de concluir
        document.querySelectorAll('.sispmg-task-complete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.closest('.sispmg-agenda-task').dataset.taskId;
                this.toggleTaskComplete(parseInt(taskId));
            });
        });
    }

    applyTaskColor(element, task) {
        if (task.completed) {
            element.style.borderColor = '#808080'; // Cor padrão para concluída
            return;
        }

        const now = new Date();
        const dueDate = new Date(task.dueDate);
        const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diffDays < 1) {
            element.style.borderColor = 'red'; // Vencido ou vence hoje
        } else if (diffDays <= 3) {
            element.style.borderColor = 'yellow'; // Vence em 1-3 dias
        } else {
            element.style.borderColor = 'green'; // Vence em 4+ dias
        }
    }
    
    sortTasks() {
        this.tasks.sort((a, b) => {
            // Concluídas sempre vão para o final
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            // Ordena por data de vencimento
            return a.dueDate - b.dueDate;
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

    async loadTasks() {
        const { sispmg_agenda_tasks } = await browser.storage.local.get('sispmg_agenda_tasks');
        this.tasks = sispmg_agenda_tasks || [];
        console.log("SisPMG+ [Agenda]: Tarefas carregadas.", this.tasks);
    }

    async persistTasks() {
        await browser.storage.local.set({ sispmg_agenda_tasks: this.tasks });
        console.log("SisPMG+ [Agenda]: Tarefas salvas no armazenamento.");
    }

    async loadSettings() {
        const { sispmg_agenda_settings } = await browser.storage.local.get('sispmg_agenda_settings');
        // Padrões
        const defaultSettings = {
            colors: {
                expired: 'red',
                soon: 'yellow',
                far: 'green',
                completed: '#808080'
            },
            deadlines: {
                soon: 3, // dias
            },
            sortOrder: 'asc' // asc, desc, alpha
        };
        this.settings = Object.assign(defaultSettings, sispmg_agenda_settings);
        console.log("SisPMG+ [Agenda]: Configurações carregadas.", this.settings);
    }
}
