// Arquivo: popup.js
// Lógica para o popup da extensão, centralizando configurações e ferramentas.

/**
 * Recarrega todas as abas abertas que correspondem aos sites da PMMG.
 */
async function reloadRelevantTabs() {
    const urlsToReload = ["*://*.policiamilitar.mg.gov.br/*"];
    try {
        const tabs = await browser.tabs.query({ url: urlsToReload });
        for (const tab of tabs) {
            if (tab.id && !tab.discarded) {
                browser.tabs.reload(tab.id).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Erro ao consultar abas para recarregar:", error);
    }
}

/**
 * Envia uma mensagem genérica para o background script.
 */
function sendMessageToBackground(action, payload) {
    return browser.runtime.sendMessage({ action, payload });
}


/**
 * Exibe um modal customizado para confirmações e alertas.
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

        const confirmHandler = () => closeAndResolve(true);
        const cancelHandler = () => closeAndResolve(false);
        
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
    // Configurações de Abastecimentos
    document.getElementById('abastecimentos-settings-btn').addEventListener('click', () => {
        sendMessageToBackground('openSettingsPage', { page: 'modules/abastecimentos/settings.html' });
    });

    // Módulo SIC3
    document.getElementById('sic3-open-btn').addEventListener('click', () => {
        sendMessageToBackground('openSettingsPage', { page: 'modules/sic3/sic3.html' });
    });

    // Reset de Dados
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
