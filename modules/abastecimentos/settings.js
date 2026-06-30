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

    const exibirPrePromptAbastecimento = (sistema, origins) => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'sispmg-permission-modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(13, 17, 23, 0.75);
                backdrop-filter: blur(4px);
                z-index: 25000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 12px;
                width: 90%;
                max-width: 440px;
                padding: 24px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
                color: #f1f5f9;
                text-align: center;
                animation: sispmgFadeIn 0.3s ease;
            `;

            const styleEl = document.createElement('style');
            styleEl.textContent = `
                @keyframes sispmgFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `;
            document.head.appendChild(styleEl);

            const nomeSistema = sistema === 'PRIME' ? 'PRIME' : 'POC (Netfrota)';
            const siteExemplo = sistema === 'PRIME' ? 'primebeneficios.com.br' : 'sgta.netfrota.com.br';

            modal.innerHTML = `
                <div style="font-size: 42px; margin-bottom: 12px;">⛽</div>
                <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 10px 0; color: #b3a368; letter-spacing: 0.5px;">Permissão de Acesso ao ${nomeSistema}</h3>
                <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin: 0 0 20px 0; text-align: left;">
                    Para sincronizar e baixar os relatórios de abastecimento diretamente do sistema ${nomeSistema} (${siteExemplo}), o SisPMG+ precisa realizar consultas externas seguras.<br><br>
                    Clique em <strong>Autorizar Acesso</strong> e confirme a permissão na próxima janela de segurança do navegador.
                </p>
                <button id="sispmg-modal-grant-btn" style="
                    background: linear-gradient(135deg, #574e2d 0%, #b3a368 100%);
                    color: #0f172a;
                    border: none;
                    padding: 12px 24px;
                    font-size: 14.5px;
                    font-weight: 700;
                    border-radius: 8px;
                    cursor: pointer;
                    width: 100%;
                    box-shadow: 0 4px 12px rgba(179, 163, 104, 0.2);
                    transition: all 0.2s ease;
                    letter-spacing: 0.3px;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 16px rgba(179, 163, 104, 0.35)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(179, 163, 104, 0.2)'">Autorizar Acesso</button>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            document.getElementById('sispmg-modal-grant-btn').addEventListener('click', async () => {
                overlay.remove();
                styleEl.remove();
                
                try {
                    const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
                    const granted = await new Promise(resolve => {
                        api.permissions.request({ origins }, resolve);
                    });
                    resolve(granted);
                } catch (e) {
                    console.warn('[Abastecimentos] Erro ao abrir prompt nativo:', e);
                    resolve(false);
                }
            });
        });
    };

    const garantirPermissoesAbastecimento = async (sistema, origins) => {
        const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
        if (!api || !api.permissions) return true;

        const hasPermission = await new Promise(resolve => {
            api.permissions.contains({ origins }, resolve);
        });
        if (hasPermission) return true;

        return await exibirPrePromptAbastecimento(sistema, origins);
    };

    const verificarPermissoesAbastecimentoSalvas = async (settings) => {
        const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
        if (!api || !api.permissions) return;

        const needsPrime = settings['prime-active'];
        const needsPoc = settings['poc-active'];
        
        let missingPrime = false;
        let missingPoc = false;

        if (needsPrime) {
            const origins = ["https://primebeneficios.com.br/*", "https://sistema-customizado.primebeneficios.com.br/*"];
            const ok = await new Promise(resolve => api.permissions.contains({ origins }, resolve));
            if (!ok) missingPrime = true;
        }

        if (needsPoc) {
            const origins = ["http://sgta.netfrota.com.br/*"];
            const ok = await new Promise(resolve => api.permissions.contains({ origins }, resolve));
            if (!ok) missingPoc = true;
        }

        if (missingPrime || missingPoc) {
            const container = document.querySelector('.container');
            if (container) {
                const banner = document.createElement('div');
                banner.id = 'sispmg-abastecimento-permission-banner';
                banner.style.cssText = `
                    background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
                    color: #fef2f2;
                    border-left: 5px solid #ef4444;
                    padding: 15px 20px;
                    margin-bottom: 20px;
                    border-radius: 8px;
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 13.5px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                `;
                
                let msg = '<strong>Permissão de Host Necessária:</strong> Para que a automação funcione, autorize o acesso aos portais de abastecimento ativados.';
                if (missingPrime && !missingPoc) msg = '<strong>Permissão de Host Necessária:</strong> Autorize o acesso aos portais do PRIME para realizar a extração.';
                if (!missingPrime && missingPoc) msg = '<strong>Permissão de Host Necessária:</strong> Autorize o acesso ao portal do POC (Netfrota) para realizar a extração.';

                banner.innerHTML = `
                    <div style="flex: 1; margin-right: 15px;">${msg}</div>
                    <button id="sispmg-grant-abastecimento-btn" style="
                        background: #fef2f2;
                        color: #991b1b;
                        border: none;
                        padding: 8px 16px;
                        font-weight: 700;
                        border-radius: 4px;
                        cursor: pointer;
                        white-space: nowrap;
                        transition: all 0.2s ease;
                    ">Autorizar Acesso</button>
                `;
                container.insertBefore(banner, container.firstChild);

                document.getElementById('sispmg-grant-abastecimento-btn').addEventListener('click', async () => {
                    const toGrant = [];
                    if (missingPrime) {
                        toGrant.push("https://primebeneficios.com.br/*", "https://sistema-customizado.primebeneficios.com.br/*");
                    }
                    if (missingPoc) {
                        toGrant.push("http://sgta.netfrota.com.br/*");
                    }

                    try {
                        const granted = await new Promise(resolve => {
                            api.permissions.request({ origins: toGrant }, resolve);
                        });
                        if (granted) {
                            banner.remove();
                            alert("Acesso aos portais de abastecimento autorizado com sucesso!");
                            location.reload();
                        } else {
                            alert("SisPMG+: A permissão não foi concedida. A automação pode não funcionar.");
                        }
                    } catch (e) {
                        console.error("[Abastecimentos] Erro ao solicitar permissões via banner:", e);
                    }
                });
            }
        }
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
    
    const loadSettings = async () => {
        const response = await browser.runtime.sendMessage({ action: 'getStorage', payload: { keys: ['app-config', 'execution-logs'], storageType: 'local' } });
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
            
            const oldBanner = document.getElementById('sispmg-abastecimento-permission-banner');
            if (oldBanner) oldBanner.remove();

            displayLogs(result['execution-logs']);

            await verificarPermissoesAbastecimentoSalvas(settings);
        }
    };
    
    const resetExtractionUI = () => {
        extractBtn.disabled = false;
        extractBtn.textContent = 'Extrair Agora';
    };
    
    // --- Event Listeners ---
    document.querySelector('.container').addEventListener('change', updateButtonVisibility);
    document.querySelector('.container').addEventListener('input', updateButtonVisibility);
    
    primeActiveToggle.addEventListener('change', async () => {
        if (primeActiveToggle.checked) {
            const origins = ["https://primebeneficios.com.br/*", "https://sistema-customizado.primebeneficios.com.br/*"];
            const temPermissao = await garantirPermissoesAbastecimento('PRIME', origins);
            if (!temPermissao) {
                primeActiveToggle.checked = false;
                toggleCredentialFields(false, primeCredsDiv);
                return;
            }
        }
        toggleCredentialFields(primeActiveToggle.checked, primeCredsDiv);
    });
    pocActiveToggle.addEventListener('change', async () => {
        if (pocActiveToggle.checked) {
            const origins = ["http://sgta.netfrota.com.br/*"];
            const temPermissao = await garantirPermissoesAbastecimento('POC', origins);
            if (!temPermissao) {
                pocActiveToggle.checked = false;
                toggleCredentialFields(false, pocCredsDiv);
                return;
            }
        }
        toggleCredentialFields(pocActiveToggle.checked, pocCredsDiv);
    });
    driveSyncToggle.addEventListener('change', toggleDriveSyncInput);
    autoFrequencySelect.addEventListener('change', toggleWeekdaySelector);

    saveBtn.addEventListener('click', async () => {
        const settings = collectSettings();
        const validation = validateSettings(settings, true);
        if (!validation.valid) {
            showStatus(validation.message, 'error');
            return;
        }

        // Garante as permissões necessárias com base no que está ativo
        if (settings['prime-active']) {
            const origins = ["https://primebeneficios.com.br/*", "https://sistema-customizado.primebeneficios.com.br/*"];
            const ok = await garantirPermissoesAbastecimento('PRIME', origins);
            if (!ok) {
                showStatus('Erro: Permissão de host necessária para o PRIME não concedida.', 'error');
                return;
            }
        }
        if (settings['poc-active']) {
            const origins = ["http://sgta.netfrota.com.br/*"];
            const ok = await garantirPermissoesAbastecimento('POC', origins);
            if (!ok) {
                showStatus('Erro: Permissão de host necessária para o POC não concedida.', 'error');
                return;
            }
        }
        
        saveBtn.disabled = true;
        showStatus('Salvando e validando credenciais...', 'info');
        browser.runtime.sendMessage({ action: 'saveAndValidateCredentials', settings: settings });
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
        browser.runtime.sendMessage({ action: 'clearLogs' });
    });
    
    cancelDateBtn.addEventListener('click', () => { dateModal.style.display = 'none'; });

    confirmDateBtn.addEventListener('click', async () => {
        const settings = collectSettings();
        // Garante as permissões antes de rodar
        if (settings['prime-active']) {
            const origins = ["https://primebeneficios.com.br/*", "https://sistema-customizado.primebeneficios.com.br/*"];
            const ok = await garantirPermissoesAbastecimento('PRIME', origins);
            if (!ok) {
                alert('SisPMG+: Permissão de host para o PRIME é necessária para a extração.');
                return;
            }
        }
        if (settings['poc-active']) {
            const origins = ["http://sgta.netfrota.com.br/*"];
            const ok = await garantirPermissoesAbastecimento('POC', origins);
            if (!ok) {
                alert('SisPMG+: Permissão de host para o POC é necessária para a extração.');
                return;
            }
        }

        dateModal.style.display = 'none';
        extractBtn.disabled = true;
        extractBtn.textContent = 'Extraindo...';
        
        browser.runtime.sendMessage({
            action: 'startManualExtraction',
            startDate: manualStartDate.value,
            endDate: manualEndDate.value,
            manualSync: manualSyncCheckbox.checked
        });
        manualSyncCheckbox.checked = false; // Reset checkbox after use
    });

    browser.runtime.onMessage.addListener((message) => {
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


