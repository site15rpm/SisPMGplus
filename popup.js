// Arquivo: popup.js
// Lógica para o popup da extensão, agora centralizando todas as configurações.

/**
 * Recarrega todas as abas abertas que correspondem aos sites da PMMG
 * para que as alterações de ativação/desativação de módulos tenham efeito.
 */
async function reloadRelevantTabs() {
    const urlsToReload = ["*://*.policiamilitar.mg.gov.br/*"];
    try {
        const tabs = await browser.tabs.query({ url: urlsToReload });
        for (const tab of tabs) {
            if (tab.id && !tab.discarded) {
                // O await aqui é opcional, pois não precisamos esperar o reload concluir,
                // mas o .catch é uma boa prática para suprimir erros de abas descartadas.
                browser.tabs.reload(tab.id).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Erro ao consultar abas para recarregar:", error);
    }
}

/**
 * Define a visibilidade da seção de submódulos da Intranet com base no estado do módulo principal.
 * @param {boolean} isEnabled - Se o módulo principal da Intranet está ativo.
 */
function toggleIntranetSubmodulesVisibility(isEnabled) {
    const intranetSubmodules = document.getElementById('intranet-submodules');
    if (intranetSubmodules) {
        intranetSubmodules.style.opacity = isEnabled ? '1' : '0.5';
        intranetSubmodules.style.pointerEvents = isEnabled ? 'auto' : 'none';
    }
}

/**
 * Envia uma mensagem genérica para o background script.
 */
function sendMessageToBackground(action, payload) {
    // Retorna a promessa diretamente. O tratamento de erro (catch) deve ser feito pelo chamador.
    return browser.runtime.sendMessage({ action, payload });
}

/**
 * Exibe um modal customizado para confirmações e alertas.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - 'alert' ou 'confirm'.
 * @returns {Promise<boolean>} Resolve para true se confirmado, false se cancelado.
 */
function showModal(message, type = 'alert') {
    return new Promise(resolve => {
        const backdrop = document.getElementById('popup-modal-backdrop');
        const messageEl = document.getElementById('popup-modal-message');
        const confirmBtn = document.getElementById('popup-modal-confirm-btn');
        const cancelBtn = document.getElementById('popup-modal-cancel-btn');

        messageEl.textContent = message;

        confirmBtn.textContent = (type === 'confirm') ? 'Confirmar' : 'OK';
        cancelBtn.style.display = (type === 'confirm') ? 'inline-block' : 'none';

        backdrop.classList.remove('hidden');

        const confirmHandler = () => {
            closeAndResolve(true);
        };
        const cancelHandler = () => {
            closeAndResolve(false);
        };
        
        const closeAndResolve = (result) => {
            backdrop.classList.add('hidden');
            confirmBtn.removeEventListener('click', confirmHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            resolve(result);
        };

        confirmBtn.addEventListener('click', confirmHandler);
        cancelBtn.addEventListener('click', cancelHandler);
    });
}


/**
 * Inicializa o popup.
 */
async function initializePopup() {
    const result = await sendMessageToBackground('getStorage', {
        key: ['terminalModuleEnabled', 'intranetModuleEnabled', 'padmModuleEnabled', 'aniverModuleEnabled', 'sirconvModuleEnabled']
    });

    if (result && result.success) {
        const settings = {
            terminalModuleEnabled: result.value.terminalModuleEnabled ?? true,
            intranetModuleEnabled: result.value.intranetModuleEnabled ?? true,
            padmModuleEnabled: result.value.padmModuleEnabled ?? true,
            aniverModuleEnabled: result.value.aniverModuleEnabled ?? true,
            sirconvModuleEnabled: result.value.sirconvModuleEnabled ?? true,
        };
        for (const key in settings) {
            const checkbox = document.getElementById(key);
            if (checkbox) checkbox.checked = settings[key];
        }
        toggleIntranetSubmodulesVisibility(settings.intranetModuleEnabled);
    }

    document.querySelectorAll('.switch input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (event) => {
            const key = event.target.id;
            const value = event.target.checked;
            sendMessageToBackground('setStorage', { [key]: value }).then(() => {
                reloadRelevantTabs();
            });
            if (key === 'intranetModuleEnabled') {
                toggleIntranetSubmodulesVisibility(value);
            }
        });
    });

    document.getElementById('abastecimentos-settings-btn').addEventListener('click', () => {
        sendMessageToBackground('openSettingsPage', { page: 'modules/abastecimentos/settings.html' });
    });

    document.getElementById('reset-aniver-btn').addEventListener('click', async () => {
        const confirmed = await showModal("Tem certeza que deseja restaurar as configurações do módulo de Aniversariantes?", 'confirm');
        if (confirmed) {
            const keysToRemove = ['birthdaySettings', 'birthdayLastCheck', 'birthdayData', 'userSection', 'userSectionLastCheck'];
            await sendMessageToBackground('removeStorage', { keys: keysToRemove });
            await showModal('Configurações de Aniversariantes restauradas.');
            reloadRelevantTabs();
        }
    });

    document.getElementById('reset-terminal-profiles-btn').addEventListener('click', async () => {
        const confirmed = await showModal("Tem certeza que deseja excluir todos os perfis de usuário do Terminal?", 'confirm');
        if (confirmed) {
            const keysToRemove = ['userProfiles', 'cachedRotinas'];
            await sendMessageToBackground('removeStorage', { keys: keysToRemove });
            await showModal('Perfis de usuário e cache de rotinas do Terminal foram removidos.');
            reloadRelevantTabs();
        }
    });
}

document.addEventListener('DOMContentLoaded', initializePopup);

