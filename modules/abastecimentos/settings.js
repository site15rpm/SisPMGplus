document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const saveBtn = document.getElementById('save-settings-btn');
    const extractBtn = document.getElementById('extract-now-btn');
    const statusArea = document.getElementById('status-area');
    const historyLog = document.getElementById('history-log');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    
    const dateModal = document.getElementById('date-modal');
    const cancelDateBtn = document.getElementById('cancel-date-btn');
    const confirmDateBtn = document.getElementById('confirm-date-btn');
    const manualStartDate = document.getElementById('manual-start-date');
    const manualEndDate = document.getElementById('manual-end-date');
    const manualSyncCheckbox = document.getElementById('manual-sync-drive');

    const primeActiveToggle = document.getElementById('prime-active');
    const pocActiveToggle = document.getElementById('poc-active');
    const driveSyncToggle = document.getElementById('drive-sync-active');
    const primeCredsDiv = document.getElementById('prime-creds');
    const pocCredsDiv = document.getElementById('poc-creds');
    const driveSyncCredsDiv = document.getElementById('drive-sync-creds');
    const driveSyncIdInput = document.getElementById('drive-sync-id');

    const autoFrequencySelect = document.getElementById('auto-frequency');
    const autoPeriodSelect = document.getElementById('auto-period');
    const weekdayGroup = document.getElementById('weekday-group');

    const fields = [
        'prime-cliente', 'prime-login', 'prime-password',
        'sgta-login', 'sgta-password',
        'auto-frequency', 'auto-weekday', 'auto-period', 'download-folder',
        'drive-sync-active', 'drive-sync-id',
        'prime-active', 'poc-active',
        'file-native-excel', 'file-unified-csv', 'file-unified-json'
    ];
    
    let initialSettings = {};

    // --- Funções de UI e Validação ---
    const showStatus = (message, type = 'info') => {
        if (!message || message.trim() === '') return;
        statusArea.textContent = message;
        statusArea.className = `status-area status-${type}`;
        statusArea.style.display = 'block';
        setTimeout(() => { statusArea.style.display = 'none'; }, 5000);
    };

    const toggleCredentialFields = (isActive, credsDiv) => {
        credsDiv.querySelectorAll('input, select').forEach(input => input.disabled = !isActive);
        credsDiv.style.opacity = isActive ? '1' : '0.5';
    };

    const toggleWeekdaySelector = () => {
        const isWeekly = autoFrequencySelect.value === 'weekly';
        const isMonthly = autoFrequencySelect.value === 'monthly';
        weekdayGroup.classList.toggle('hidden', !isWeekly);
        autoPeriodSelect.disabled = isMonthly;
        if (isMonthly) {
            autoPeriodSelect.parentElement.style.opacity = '0.5';
        } else {
            autoPeriodSelect.parentElement.style.opacity = '1';
        }
    };
    
    const toggleDriveSyncInput = () => {
        const isActive = driveSyncToggle.checked;
        driveSyncIdInput.disabled = !isActive;
        driveSyncCredsDiv.style.opacity = isActive ? '1' : '0.5';
    };


    const displayLogs = (logs) => {
        if (!logs || logs.length === 0) {
            historyLog.innerHTML = '<div class="log-entry"><span class="timestamp"></span><span class="system log-info">Nenhum registro encontrado.</span></div>';
            return;
        }
        historyLog.innerHTML = logs.map(log => `
            <div class="log-entry log-${log.type}">
                <span class="timestamp">${log.timestamp}</span>
                <span class="system">${log.system}:</span>
                <span class="message">${log.message}</span>
            </div>
        `).join('');
        historyLog.scrollTop = 0;
    };
    
    const validateSettings = (settings, checkAutomation = false) => {
        if (settings['prime-active']) {
            if (!settings['prime-cliente'] || !settings['prime-login'] || !settings['prime-password']) {
                return { valid: false, message: 'Erro: Preencha todas as credenciais do PRIME.' };
            }
        }
        if (settings['poc-active']) {
            if (!settings['sgta-login'] || !settings['sgta-password']) {
                return { valid: false, message: 'Erro: Preencha todas as credenciais do POC.' };
            }
        }
        
        const anyFileSelected = settings['file-native-excel'] || settings['file-unified-csv'] || settings['file-unified-json'];
        if (!anyFileSelected) {
             return { valid: false, message: 'Erro: Selecione pelo menos um formato de arquivo para download.' };
        }

        if (checkAutomation && settings['auto-frequency'] !== 'none' && !anyFileSelected) {
            return { valid: false, message: 'Erro: Para agendar uma extração, selecione pelo menos um formato de arquivo.' };
        }

        if (settings['drive-sync-active']) {
            if (!settings['drive-sync-id']) {
                return { valid: false, message: 'Erro: O ID do Google Apps Script não foi fornecido.' };
            }
            if (!settings['file-unified-csv']) {
                return { valid: false, message: 'Erro: A sincronização com o Google Drive requer que o formato "Unificado (CSV)" esteja habilitado.' };
            }
        }

        return { valid: true };
    };

    const collectSettings = () => {
        const settings = {};
        fields.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                settings[id] = element.type === 'checkbox' ? element.checked : element.value;
            }
        });
        return settings;
    };
    
    const areSettingsDirty = () => {
        const currentSettings = collectSettings();
        for (const key of fields) {
            const initial = initialSettings[key] ?? (document.getElementById(key)?.type === 'checkbox' ? false : '');
            const current = currentSettings[key] ?? (document.getElementById(key)?.type === 'checkbox' ? false : '');
            if(initial !== current) return true;
        }
        return false;
    };

    const updateButtonVisibility = () => {
        if (areSettingsDirty()) {
            saveBtn.style.display = 'block';
            extractBtn.style.display = 'none';
        } else {
            saveBtn.style.display = 'none';
            extractBtn.style.display = 'block';
        }
    };
    
    const loadSettings = () => {
        chrome.runtime.sendMessage({ action: 'getStorage', payload: { key: ['app-config', 'execution-logs'], storageType: 'local' } }, (response) => {
             if (response && response.success) {
                const result = response.value;
                let settings = result['app-config'];

                if (!settings) {
                    settings = collectSettings();
                }

                fields.forEach(id => {
                    const element = document.getElementById(id);
                    if (element && settings.hasOwnProperty(id)) {
                        const value = settings[id];
                        if (element.type === 'checkbox') {
                            element.checked = !!value;
                        } else {
                            element.value = value || '';
                        }
                    }
                });

                toggleCredentialFields(primeActiveToggle.checked, primeCredsDiv);
                toggleCredentialFields(pocActiveToggle.checked, pocCredsDiv);
                toggleDriveSyncInput();
                toggleWeekdaySelector();
                
                initialSettings = collectSettings();
                updateButtonVisibility();
                displayLogs(result['execution-logs']);
            }
        });
    };
    
    const resetExtractionUI = () => {
        extractBtn.disabled = false;
        extractBtn.textContent = 'Extrair Agora';
    };
    
    // --- Event Listeners ---
    document.querySelector('.container').addEventListener('change', updateButtonVisibility);
    document.querySelector('.container').addEventListener('input', updateButtonVisibility);
    
    primeActiveToggle.addEventListener('change', () => toggleCredentialFields(primeActiveToggle.checked, primeCredsDiv));
    pocActiveToggle.addEventListener('change', () => toggleCredentialFields(pocActiveToggle.checked, pocCredsDiv));
    driveSyncToggle.addEventListener('change', toggleDriveSyncInput);
    autoFrequencySelect.addEventListener('change', toggleWeekdaySelector);

    saveBtn.addEventListener('click', async () => {
        const settings = collectSettings();
        const validation = validateSettings(settings, true);
        if (!validation.valid) {
            showStatus(validation.message, 'error');
            return;
        }
        
        saveBtn.disabled = true;
        showStatus('Salvando e validando credenciais...', 'info');
        chrome.runtime.sendMessage({ action: 'saveAndValidateCredentials', settings: settings });
    });

    extractBtn.addEventListener('click', () => {
        const settings = collectSettings();
        const validation = validateSettings(settings);
         if (!validation.valid) {
            showStatus(validation.message, 'error');
            return;
        }
        
        const isPrimeActive = settings['prime-active'];
        const isPocActive = settings['poc-active'];
        if (!isPrimeActive && !isPocActive) {
            showStatus('Erro: Ative e salve as configurações de pelo menos um sistema.', 'error');
            return;
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        
        const y = yesterday.getFullYear();
        const m = String(yesterday.getMonth() + 1).padStart(2, '0');
        const d = String(yesterday.getDate()).padStart(2, '0');
        const yesterdayStr = `${y}-${m}-${d}`;

        manualStartDate.value = yesterdayStr;
        manualEndDate.value = yesterdayStr;

        dateModal.style.display = 'flex';
    });
    
    clearHistoryBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clearLogs' });
    });
    
    cancelDateBtn.addEventListener('click', () => { dateModal.style.display = 'none'; });

    confirmDateBtn.addEventListener('click', () => {
        dateModal.style.display = 'none';
        extractBtn.disabled = true;
        extractBtn.textContent = 'Extraindo...';
        
        chrome.runtime.sendMessage({
            action: 'startManualExtraction',
            startDate: manualStartDate.value,
            endDate: manualEndDate.value,
            manualSync: manualSyncCheckbox.checked
        });
        manualSyncCheckbox.checked = false; // Reset checkbox after use
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'validationComplete') {
            saveBtn.disabled = false;
            const { prime, poc } = message.results;
            let finalMessage = '';
            if (prime) finalMessage += `PRIME: ${prime.message} `;
            if (poc) finalMessage += `| POC: ${poc.message}`;
            const allSuccess = (!prime || prime.success) && (!poc || poc.success);
            showStatus(finalMessage.trim(), allSuccess ? 'success' : 'error');
            if(allSuccess) {
                initialSettings = collectSettings();
                updateButtonVisibility();
            }
        } else if (message.action === 'logsUpdated') {
            displayLogs(message.logs);
        } else if (message.action === 'extractionFinished') {
            resetExtractionUI();
        }
    });

    loadSettings();
});

