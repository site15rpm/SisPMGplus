// Arquivo: modules/terminal/terminal-file-system.js
// Contém as funções de interação com o sistema de arquivos local.

export function initFileSystem(prototype) {
    async function getFileHandleRecursive(dirHandle, path, options = {}) {
        const parts = path.split('/').filter(p => p);
        const fileName = parts.pop();
        if (!fileName) throw new Error("Caminho do arquivo inválido.");
        
        let currentDir = dirHandle;
        for (const part of parts) {
            currentDir = await currentDir.getDirectoryHandle(part, options);
        }
        return await currentDir.getFileHandle(fileName, options);
    }

    prototype.getDirectoryHandle = async function(forceNew = false) {
        await this._checkRotinaState();
        if (!this.directoryHandle || forceNew) {
            try {
                this.directoryHandle = await window.showDirectoryPicker();
                await this.setStorage({ 'lastDirectoryHandle': this.directoryHandle });
            } catch (err) {
                this.exibirNotificacao("Acesso ao diretório foi negado.", false);
                return null;
            }
        }
        return this.directoryHandle;
    };

    prototype.criarArquivo = async function(path, content) {
        await this._checkRotinaState();
        const handle = await this.getDirectoryHandle();
        if (!handle) return;
        try {
            const fileHandle = await getFileHandleRecursive(handle, path, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            this.exibirNotificacao(`Arquivo "${path}" salvo com sucesso.`, true);
        } catch (e) {
            this.exibirNotificacao(`Erro ao salvar arquivo: ${e.message}`, false);
        }
    };

    prototype.lerArquivo = async function(path) {
        await this._checkRotinaState();
        let handle = await this.getDirectoryHandle();
        if (!handle) return null;
        try {
            const fileHandle = await getFileHandleRecursive(handle, path, { create: false });
            const file = await fileHandle.getFile();
            return await file.text();
        } catch (e) {
            if (e.name === 'NotFoundError') {
                const force = await new Promise(resolve => this.createConfirmationModal("Arquivo não encontrado", `O arquivo "${path}" não foi encontrado no diretório selecionado. Deseja selecionar um novo diretório?`, () => resolve(true), () => resolve(false)));
                if(force) {
                    handle = await this.getDirectoryHandle(true);
                    if(handle) return this.lerArquivo(path);
                }
            } else {
                 this.exibirNotificacao(`Erro ao ler arquivo: ${e.message}`, false);
            }
            return null;
        }
    };

    prototype.anexarNoArquivo = async function(path, contentToAppend) {
        await this._checkRotinaState();
        const handle = await this.getDirectoryHandle();
        if (!handle) return;
        try {
            let existingContent = '';
            try {
                const fileHandleRead = await getFileHandleRecursive(handle, path, { create: false });
                const file = await fileHandleRead.getFile();
                existingContent = await file.text();
            } catch (readError) {
                if (readError.name !== 'NotFoundError') throw readError;
            }
            
            const newContent = existingContent + contentToAppend;
            
            const fileHandleWrite = await getFileHandleRecursive(handle, path, { create: true });
            const writable = await fileHandleWrite.createWritable({ keepExistingData: false });
            await writable.write(newContent);
            await writable.close();
            
            this.exibirNotificacao(`Conteúdo anexado em "${path}".`, true);

        } catch (e) {
            this.exibirNotificacao(`Erro ao anexar/criar arquivo: ${e.message}`, false);
        }
    };

    prototype.excluirArquivo = async function(path) {
        await this._checkRotinaState();
        let handle = await this.getDirectoryHandle();
        if (!handle) return;
        try {
            const parts = path.split('/').filter(p => p);
            const fileName = parts.pop();
            let currentDir = handle;
            for (const part of parts) {
                currentDir = await currentDir.getDirectoryHandle(part);
            }
            await currentDir.removeEntry(fileName);
            this.exibirNotificacao(`Arquivo "${path}" excluído.`, true);
        } catch (e) {
             if (e.name === 'NotFoundError') {
                const force = await new Promise(resolve => this.createConfirmationModal("Arquivo não encontrado", `O arquivo "${path}" não foi encontrado para exclusão. Deseja selecionar um novo diretório para tentar novamente?`, () => resolve(true), () => resolve(false)));
                if(force) {
                    handle = await this.getDirectoryHandle(true);
                    if(handle) return this.excluirArquivo(path); 
                }
            } else {
                this.exibirNotificacao(`Erro ao excluir: ${e.message}`, false);
            }
        }
    };

    prototype.criarModal = async function(config) {
        await this._checkRotinaState();
        return new Promise(resolve => {
            let modalHTML = `<form id="interactive-modal-form">`;
            (config.elements || []).forEach(el => {
                modalHTML += `<div class="form-group">`;
                switch (el.type) {
                    case 'title': modalHTML += `<h4>${el.text}</h4>`; break;
                    case 'text': modalHTML += `<p>${el.text}</p>`; break;
                    case 'input': modalHTML += `<label for="${el.id}">${el.label}</label><input type="text" id="${el.id}" name="${el.id}" value="${el.defaultValue || ''}" class="modal-text-input">`; break;
                    case 'checkbox': modalHTML += `<div class="checkbox-container"><input type="checkbox" id="${el.id}" name="${el.id}" ${el.checked ? 'checked' : ''}><label for="${el.id}">${el.label}</label></div>`; break;
                    case 'select':
                        modalHTML += `<label for="${el.id}">${el.label}</label><select id="${el.id}" name="${el.id}">`;
                        (el.options || []).forEach(opt => { modalHTML += `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.text}</option>`; });
                        modalHTML += `</select>`;
                        break;
                }
                modalHTML += `</div>`;
            });
            modalHTML += `</form>`;

            const buttons = (config.buttons || []).map(btn => ({
                text: btn.text,
                className: btn.className || (btn.action === 'confirm' ? 'rotina-modal-save-btn' : 'rotina-modal-cancel-btn'),
                action: (modal) => {
                    const resultData = {};
                    config.elements.forEach(el => {
                        if (el.id) {
                            const input = modal.querySelector(`#${el.id}`);
                            if (input) resultData[el.id] = el.type === 'checkbox' ? input.checked : input.value;
                        }
                    });
                    this.closeModalAndFocus(modal);
                    resolve(btn.action === 'cancel' ? null : { action: btn.action, formData: resultData });
                }
            }));
            
            const modalOptions = {
                modalClass: config.modalClass || '',
                style: config.style || {}
            };

            const modalInstance = this.createModal(config.title || 'Interação Necessária', modalHTML, null, buttons, modalOptions);

            // Previne o reload da página ao pressionar Enter em um campo de input
            const form = modalInstance.querySelector('#interactive-modal-form');
            if(form) {
                form.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
                        e.preventDefault();
                        // Opcional: Clicar no botão de confirmação se ele existir
                        const confirmButton = modalInstance.querySelector('.rotina-modal-save-btn');
                        if(confirmButton) confirmButton.click();
                    }
                });
            }
        });
    };
}

