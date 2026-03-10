// Arquivo: modules/intranet/intranet-aniver.js
// Contém toda a lógica para buscar, processar e exibir lembretes de aniversariantes.

import { getCookie, decodeJwt, sendMessageToBackground } from '../../common/utils.js';

/**
 * Obtém as configurações de aniversariantes, mesclando os padrões com as salvas pelo usuário.
 * @returns {Promise<object>} As configurações de aniversariantes.
 */
async function getBirthdaySettings() {
    const tokenData = decodeJwt(getCookie('tokiuz')) || {};
    const defaultSettings = {
        daysAhead: 7,
        units: tokenData.u ? [tokenData.u] : [],
        includeSubunits: true,
        includeInactive: false,
        restrictToSection: false,
        bdaySubject: 'Feliz Aniversário!',
        bdayMessage: 'Prezado(a) [NOME],\n\nNesta data especial, desejo a você um feliz aniversário, com muita paz, saúde e sucesso!'
    };

    const result = await sendMessageToBackground('getStorage', { key: ['birthdaySettings'] });
    const storedSettings = result.success && result.value.birthdaySettings ? result.value.birthdaySettings : {};
    
    // Define a unidade padrão do usuário se nenhuma estiver salva
    if ((!storedSettings.units || storedSettings.units.length === 0) && tokenData.u) {
        storedSettings.units = [tokenData.u];
    }
    
    return { ...defaultSettings, ...storedSettings };
}

export class BirthdayModule {
    constructor(config) {
        this.config = config;
        this.uiModule = config.uiModuleInstance; // Referência ao módulo de UI principal
        this.iconSVG_28 = config.iconSVG_28;
    }

    init() {
        console.log('SisPMG+: Módulo de Aniversariantes inicializado.');
        this.checkUserSection();
        this.checkBirthdays();
    }

    async checkUserSection() {
        const result = await sendMessageToBackground('getStorage', { key: ['userSectionLastCheck'] });
        const lastCheck = result.success ? result.value.userSectionLastCheck : null;
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (lastCheck && (Date.now() - parseInt(lastCheck, 10)) < oneWeek) {
            return; // Cache válido
        }
        
        const token = getCookie('tokiuz');
        const tokenData = decodeJwt(token);
        if (!tokenData || !tokenData.g) return;

        const response = await sendMessageToBackground('fetchUserSection', { nrPol: tokenData.g, token });

        if (response && response.success) {
            await sendMessageToBackground('setStorage', { userSection: response.data });
            await sendMessageToBackground('setStorage', { userSectionLastCheck: Date.now() });
        }
    }

    async checkBirthdays() {
        const settings = await getBirthdaySettings();
        
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + settings.daysAhead);
        const todayStr = today.toISOString().split('T')[0];
        
        const storedData = await sendMessageToBackground('getStorage', { key: ['birthdayLastCheck', 'birthdayData'] });
        const lastCheck = storedData.success ? storedData.value.birthdayLastCheck : null;
        let aniversariantes;
        let hasFailed = false; // Flag para rastrear falhas

        if (lastCheck === todayStr && storedData.value.birthdayData !== undefined) {
            aniversariantes = storedData.value.birthdayData || [];
        } else {
            const token = getCookie('tokiuz');
            if (!token) {
                 console.error('SisPMG+ [Aniversariantes]: Token de autenticação não encontrado.');
                 this.processAndNotify(null, { error: true, message: 'Falha de autenticação.' });
                 return;
            }

            try {
                let allBirthdays = [];
                if (settings.units.length === 0) {
                     console.warn("SisPMG+ [Aniversariantes]: Nenhuma unidade configurada para monitorar aniversariantes.");
                     // Não consideramos isso um erro, apenas uma configuração vazia.
                     this.processAndNotify([]);
                     return;
                }

                const monthsToFetch = new Set();
                const currentMonth = today.getMonth() + 1;
                const endMonth = endDate.getMonth() + 1;
                monthsToFetch.add(currentMonth);
                monthsToFetch.add(endMonth);
                
                for (const mes of monthsToFetch) {
                    for (const unidade of settings.units) {
                        const response = await sendMessageToBackground('fetchBirthdays', { mes, unidade, token, incluirSubunidades: settings.includeSubunits });
                        if (response && response.success) {
                            const birthdaysWithMonth = response.data.map(b => ({ ...b, mesAniversario: mes }));
                            allBirthdays.push(...birthdaysWithMonth);
                        } else {
                            hasFailed = true; // Marca que uma falha ocorreu
                            console.warn(`SisPMG+ [Aniversariantes]: Falha ao buscar dados para unidade ${unidade}, mês ${mes}:`, response.error);
                        }
                    }
                }
                
                const uniqueBirthdays = Array.from(new Map(allBirthdays.map(p => [p.nrPol, p])).values());
                aniversariantes = uniqueBirthdays;
                
                // Se a busca não falhou, atualiza o cache
                if (!hasFailed) {
                    await sendMessageToBackground('setStorage', { birthdayLastCheck: todayStr });
                    await sendMessageToBackground('setStorage', { birthdayData: aniversariantes });
                }

            } catch (error) {
                console.error('SisPMG+ [Aniversariantes]: Erro ao buscar aniversariantes:', error);
                this.processAndNotify(null, { error: true, message: 'Erro ao buscar dados.' });
                return;
            }
        }

        // Condição de Erro: Se a busca falhou e não obtivemos nenhum dado
        if (hasFailed && (!aniversariantes || aniversariantes.length === 0)) {
            this.processAndNotify(null, { error: true, message: 'Falha ao carregar os dados.' });
            return;
        }

        if (aniversariantes) {
            let filteredBirthdays = settings.includeInactive ? aniversariantes : aniversariantes.filter(p => p.situacao === "A");

            if (settings.restrictToSection) {
                const sectionResult = await sendMessageToBackground('getStorage', { key: ['userSection'] });
                const userSectionData = sectionResult.success ? sectionResult.value.userSection : {};
                const userSectionName = userSectionData?.sectionName?.trim();
                
                if (userSectionName) {
                    filteredBirthdays = filteredBirthdays.filter(p => p.nomeUnidade && p.nomeUnidade.trim().includes(userSectionName));
                } else {
                    console.warn(`SisPMG+ [Aniversariantes]: A seção do usuário não foi encontrada para aplicar o filtro.`);
                }
            }
            this.processAndNotify(filteredBirthdays);
        }
    }

    async processAndNotify(aniversariantes, errorInfo = null) {
        let listHTML = '';

        // Funções auxiliares movidas para o topo para evitar ReferenceError.
        const openPaForRecipients = async (nrPols, personName = null) => {
            if (!nrPols || nrPols.length === 0) return;
            
            const settings = await getBirthdaySettings();
            let message = settings.bdayMessage || '';
            
            if (personName) {
                const RANKS_TO_KEEP = new Set(['ASP A OF', 'SD 1 CL', 'SD 2 CL', 'SUB TEN', 'TEN CEL', '1 SGT', '1 TEN', '2 SGT', '2 TEN', '3 SGT', 'ALUNO', 'MAJ', 'CAD', 'CAP', 'CEL', 'CB']);
                const ALL_RANKS = ['ASP A OF', 'SD 1 CL', 'SD 2 CL', 'SUB TEN', 'TEN CEL', 'SG1001', 'SG1003', 'SG1005', 'SG1008', 'SG1009', 'SG1010', 'SG1011', 'SG1012', 'SG1013', 'SG1014', 'SG1015', 'SG1016', 'SG1017', 'SG1018', 'SG1019', 'SG1020', 'SG1021', 'SG1022', 'SG1023', 'SG1024', 'SG1025', 'SG1026', 'SG1027', 'SG1028', 'SG1029', 'SG1030', 'SG1031', 'SG1032', 'SG1033', 'SG1035', 'SG1036', 'SG1037', 'SG1038', 'SG1039', 'SG1045', 'SG1046', 'SG1047', 'SG1049', 'SP1001', 'SP1002', 'SP1003', 'SP1004', 'SP1005', 'SP1006', 'SP1007', 'SP1008', 'SP1009', 'SP1011', 'SP1012', 'SP1013', '1 SGT', '1 TEN', '2 SGT', '2 TEN', '3 SGT', 'ALUNO', 'MAJ', 'CAD', 'CAP', 'CEL', 'CB'].map(r => r.toUpperCase());
                
                let rankPrefix = '';
                let nameWithoutRank = personName.toUpperCase();

                for (const rank of ALL_RANKS) {
                    if (nameWithoutRank.startsWith(rank)) {
                        if (nameWithoutRank.length === rank.length || nameWithoutRank[rank.length] === ' ') {
                            rankPrefix = rank;
                            nameWithoutRank = nameWithoutRank.substring(rank.length).trim();
                            break;
                        }
                    }
                }

                let functionalName = '';
                if (rankPrefix) {
                    const warName = nameWithoutRank.split(' ').pop() || '';
                    const capitalizedWarName = warName.charAt(0) + warName.slice(1).toLowerCase();
                    if (RANKS_TO_KEEP.has(rankPrefix)) {
                        const capitalizedRank = rankPrefix.split(' ').map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
                        functionalName = `${capitalizedRank} ${capitalizedWarName}`;
                    } else {
                        functionalName = capitalizedWarName;
                    }
                } else {
                    const firstName = nameWithoutRank.split(' ')[0] || '';
                    functionalName = firstName.charAt(0) + firstName.slice(1).toLowerCase();
                }

                if (!functionalName) functionalName = personName;
                message = message.replace(/\[NOME\]/g, functionalName.trim());
            } else {
                message = message.replace(/Prezado\(a\) \[NOME\],?\s*/, '');
            }

            const payload = {
                recipientsForPA: nrPols,
                birthdayMessagePayload: { subject: settings.bdaySubject, message: message }
            };
            
            console.log('SisPMG+ [Aniversariantes]: Salvando payload para o PA e navegando:', payload);
            await sendMessageToBackground('setStorage', payload);
            window.location.href = 'https://pa.policiamilitar.mg.gov.br/#/escrever';
        };

        const createListItemHTML = (person, isToday = false) => {
            const dateStr = isToday ? '' : `${String(person.diaAniversario).padStart(2, '0')}/${String(person.mesAniversario).padStart(2, '0')} - `;
            const todayClass = isToday ? 'sispmg-birthday-today' : '';
            const letterIcon = isToday 
                ? `<span class="sispmg-bday-letter-icon" data-nrpol="${person.nrPol}" data-nome="${person.nomeCompleto.trim()}" title="Enviar mensagem"><i class="fas fa-envelope"></i></span>`
                : '';

            return `<li class="sispmg-birthday-item">
                        <div class="sispmg-birthday-details">
                            <div class="sispmg-birthday-name ${todayClass}">${dateStr}${person.nomeCompleto.trim()}</div>
                            <div class="sispmg-birthday-unit">${person.nomeUnidade.trim()}</div>
                        </div>
                        ${letterIcon}
                    </li>`;
        };

        if (errorInfo) {
            listHTML = `<div class="sispmg-error-message">${errorInfo.message || 'Ocorreu um erro.'}</div>`;
        } else {
            const settings = await getBirthdaySettings();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const endDate = new Date(today);
            endDate.setDate(today.getDate() + settings.daysAhead);

            const currentYear = today.getFullYear();

            const upcomingBirthdays = aniversariantes.map(person => {
                if (!person.mesAniversario || !person.diaAniversario) return null;

                const birthDateThisYear = new Date(currentYear, person.mesAniversario - 1, person.diaAniversario);
                birthDateThisYear.setHours(0, 0, 0, 0);

                let applicableBirthDate = null;
                
                if (birthDateThisYear < today) {
                    const birthDateNextYear = new Date(currentYear + 1, person.mesAniversario - 1, person.diaAniversario);
                    birthDateNextYear.setHours(0, 0, 0, 0);
                    if (birthDateNextYear >= today && birthDateNextYear <= endDate) {
                        applicableBirthDate = birthDateNextYear;
                    }
                } else {
                     if (birthDateThisYear >= today && birthDateThisYear <= endDate) {
                        applicableBirthDate = birthDateThisYear;
                    }
                }

                if (applicableBirthDate) return { ...person, fullDate: applicableBirthDate };
                return null;
            }).filter(Boolean);

            const deHoje = upcomingBirthdays.filter(p => p.fullDate.getTime() === today.getTime());
            const proximos = upcomingBirthdays.filter(p => p.fullDate.getTime() > today.getTime());

            if (deHoje.length === 0 && proximos.length === 0) {
                listHTML = '<div class="sispmg-no-birthdays">Nenhum aniversário nos próximos dias.</div>';
            } else {
                if (deHoje.length > 0) {
                    listHTML += '<div class="sispmg-birthday-section"><strong>Hoje:</strong><ul>';
                    deHoje.sort((a,b) => a.nomeCompleto.localeCompare(b.nomeCompleto)).forEach(p => { listHTML += createListItemHTML(p, true); });
                    listHTML += '</ul></div>';
                }
                
                if (proximos.length > 0) {
                    if(deHoje.length > 0) listHTML += '<div class="sispmg-birthday-separator"></div>';
                    listHTML += `<div class="sispmg-birthday-section"><strong>Próximos ${settings.daysAhead} dias:</strong><ul>`;
                    proximos.sort((a,b) => {
                        if(a.fullDate.getTime() !== b.fullDate.getTime()) return a.fullDate - b.fullDate;
                        return a.nomeCompleto.localeCompare(b.nomeCompleto);
                    }).forEach(p => { 
                        listHTML += createListItemHTML(p, false); 
                    });
                    listHTML += '</ul></div>';
                }
            }
        }
        
        const notification = document.createElement('div');
        notification.id = 'sispmg-birthday-notification';
        notification.innerHTML = `
            <div class="sispmg-panel-header">
                <div class="sispmg-panel-title-group">
                    ${this.iconSVG_28} <span>Aniversariantes</span>
                </div>
                <div class="sispmg-panel-actions">
                    <button id="sispmg-bday-settings-btn" class="sispmg-btn-icon sispmg-bday-action-btn" title="Configurações de Aniversário"><i class="fas fa-cog"></i></button>
                    <button id="sispmg-bday-letter-btn" class="sispmg-btn-icon sispmg-bday-action-btn sispmg-bday-letter-btn-blue" title="Enviar para todos de hoje"><i class="fas fa-envelope"></i></button>
                    <button id="sispmg-bday-collapse-btn" class="sispmg-btn-icon sispmg-bday-action-btn"><i class="fas fa-chevron-right"></i></button>
                </div>
            </div>
            <div class="sispmg-panel-content-wrapper">${listHTML}</div>
        `;
        
        const container = document.getElementById('sispmg-plus-container') || document.body;
        container.appendChild(notification);
        
        let closeTimeout;
        let handleDocumentClick;
        let isNotificationVisible = false; // Track current visibility state

        const collapseBtn = document.getElementById('sispmg-bday-collapse-btn');
        const collapseIcon = collapseBtn.querySelector('i');

        const toggleNotificationVisibility = (show) => {
            if (show) {
                notification.classList.add('visible');
                collapseIcon.classList.remove('fa-chevron-left');
                collapseIcon.classList.add('fa-chevron-right'); // Right arrow when visible
                isNotificationVisible = true;
            } else {
                notification.classList.remove('visible');
                collapseIcon.classList.remove('fa-chevron-right');
                collapseIcon.classList.add('fa-chevron-left'); // Left arrow when hidden
                isNotificationVisible = false;
            }
        };
        
        handleDocumentClick = (e) => {
            if (!notification.contains(e.target) && isNotificationVisible) {
                clearTimeout(closeTimeout); // Clear any pending auto-hide
                toggleNotificationVisibility(false);
            }
        };

        const startCloseTimer = () => {
            clearTimeout(closeTimeout);
            closeTimeout = setTimeout(() => {
                if (isNotificationVisible) {
                    toggleNotificationVisibility(false);
                }
            }, 15000);
        };
        
        notification.addEventListener('mouseenter', () => clearTimeout(closeTimeout));
        notification.addEventListener('mouseleave', startCloseTimer);

        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearTimeout(closeTimeout); // Clear any pending auto-hide on manual interaction
            toggleNotificationVisibility(!isNotificationVisible);
            if (isNotificationVisible) { // If it just became visible, restart timer
                startCloseTimer();
            }
        });
        
        document.getElementById('sispmg-bday-settings-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showConfigModal();
            clearTimeout(closeTimeout);
            startCloseTimer();
        });

        const letterBtn = document.getElementById('sispmg-bday-letter-btn');
        if (errorInfo || !aniversariantes) {
             letterBtn.style.display = 'none';
        } else {
            const deHoje = aniversariantes
                .map(person => {
                     const today = new Date(); today.setHours(0, 0, 0, 0);
                     const birthDateThisYear = new Date(today.getFullYear(), person.mesAniversario - 1, person.diaAniversario);
                     return birthDateThisYear.getTime() === today.getTime() ? person : null;
                }).filter(Boolean);

            if (deHoje.length > 0) {
                letterBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nrPols = deHoje.map(p => p.nrPol);
                    let nameForMessage = (deHoje.length === 1) ? deHoje[0].nomeCompleto.trim() : null;
                    openPaForRecipients(nrPols, nameForMessage);
                    clearTimeout(closeTimeout);
                    startCloseTimer();
                });
            } else {
                letterBtn.style.display = 'none';
            }
        }

        // Event delegation for individual letter icons
        notification.addEventListener('click', (e) => {
            const icon = e.target.closest('.sispmg-bday-letter-icon');
            if (icon) {
                e.stopPropagation();
                const nrPol = icon.dataset.nrpol;
                const nome = icon.dataset.nome;
                if (nrPol) {
                    openPaForRecipients([nrPol], nome);
                }
                clearTimeout(closeTimeout);
                startCloseTimer();
            }
        });

        // Initial display
        setTimeout(() => {
            toggleNotificationVisibility(true);
            document.addEventListener('click', handleDocumentClick, true);
        }, 100);

        startCloseTimer();
    }
    
    async showConfigModal() {
        if (document.getElementById('sispmg-birthday-config-modal-overlay')) return;

        this.uiModule.showLoader();
        try {
            const unitsResponse = await sendMessageToBackground('fetchUnits', { token: getCookie('tokiuz') });
            const allUnits = unitsResponse.success ? unitsResponse.data.sort((a, b) => a.uniNomeSintese.localeCompare(b.uniNomeSintese)) : [];
            const settings = await getBirthdaySettings();
            
            const sectionResult = await sendMessageToBackground('getStorage', { key: ['userSection'] });
            const userSectionData = sectionResult.success ? sectionResult.value.userSection : {};
            const userSectionName = userSectionData?.sectionName?.trim() || 'Não encontrada';
            const sectionLabel = `Restringir à(ao) ${userSectionName}`;
    
            const overlay = document.createElement('div');
            overlay.id = 'sispmg-birthday-config-modal-overlay';
            overlay.className = 'sispmg-sicor-modal-overlay';

            overlay.innerHTML = `
                <div id="sispmg-birthday-config-modal-container" class="sispmg-sicor-modal-container">
                    <div id="sispmg-birthday-config-modal" class="sispmg-plus-modal">
                        <div class="sispmg-menu-header">
                            Configurar Aniversariantes
                            <button id="sispmg-bday-config-close-btn" class="sispmg-modal-close-btn">&times;</button>
                        </div>
                        <div class="sispmg-modal-body-content">
                            <div id="sispmg-birthday-config-modal-content">
                                <div class="sispmg-config-row days-ahead-container">
                                    <label for="days-ahead-input">Lembrar com antecedência de (dias):</label>
                                    <input type="number" id="days-ahead-input" min="1" max="30" value="${settings.daysAhead}">
                                </div>
                                <div class="sispmg-config-row sispmg-config-toggle">
                                    <span>${sectionLabel}</span>
                                    <label class="sispmg-plus-menu-switch"><input type="checkbox" id="restrict-to-section-toggle" ${settings.restrictToSection ? 'checked' : ''}><span class="sispmg-plus-menu-slider"></span></label>
                                </div>
                                <div class="sispmg-config-row sispmg-config-toggle">
                                    <span>Incluir unidades subordinadas</span>
                                    <label class="sispmg-plus-menu-switch"><input type="checkbox" id="include-subunits-toggle" ${settings.includeSubunits ? 'checked' : ''}><span class="sispmg-plus-menu-slider"></span></label>
                                </div>
                                <div class="sispmg-config-row sispmg-config-toggle">
                                    <span>Mostrar militares inativos</span>
                                    <label class="sispmg-plus-menu-switch"><input type="checkbox" id="include-inactive-toggle" ${settings.includeInactive ? 'checked' : ''}><span class="sispmg-plus-menu-slider"></span></label>
                                </div>
                                <div class="sispmg-unit-selector">
                                    <div class="sispmg-unit-list-container">
                                        <input type="text" id="unit-search-input" placeholder="Pesquisar unidade...">
                                        <ul id="available-units-list"></ul>
                                    </div>
                                    <div class="sispmg-unit-controls">
                                        <button id="add-unit-btn">&rarr;</button>
                                        <button id="remove-unit-btn">&larr;</button>
                                    </div>
                                    <div class="sispmg-unit-list-container">
                                        <label>Unidades Monitoradas</label>
                                        <ul id="selected-units-list"></ul>
                                    </div>
                                </div>
                                <div class="sispmg-config-row sispmg-bday-message-template">
                                    <label for="bday-subject-input">Assunto Padrão da Mensagem:</label>
                                    <input type="text" id="bday-subject-input" value="${settings.bdaySubject || ''}">
                                    <label for="bday-message-input">Texto Padrão da Mensagem (use [NOME] para o nome do militar):</label>
                                    <textarea id="bday-message-input" rows="4">${settings.bdayMessage || ''}</textarea>
                                </div>
                            </div>
                        </div>
                        <div class="sispmg-modal-actions">
                             <button id="sispmg-bday-config-cancel-btn" class="sispmg-modal-btn-secondary">Cancelar</button>
                             <button id="sispmg-bday-config-save-btn" class="sispmg-modal-btn-primary">Salvar</button>
                        </div>
                    </div>
                </div>
            `;
        
            (document.getElementById('sispmg-plus-container') || document.body).appendChild(overlay);
            
            const closeModal = () => overlay.remove();

            overlay.querySelector('#sispmg-bday-config-close-btn').addEventListener('click', closeModal);
            overlay.querySelector('#sispmg-bday-config-cancel-btn').addEventListener('click', closeModal);
            overlay.querySelector('#sispmg-bday-config-save-btn').addEventListener('click', async () => {
                const selectedUnits = Array.from(document.getElementById('selected-units-list').children).map(li => parseInt(li.dataset.value, 10));
                const newSettings = {
                    daysAhead: parseInt(document.getElementById('days-ahead-input').value, 10) || 3,
                    units: selectedUnits,
                    includeSubunits: document.getElementById('include-subunits-toggle').checked,
                    includeInactive: document.getElementById('include-inactive-toggle').checked,
                    restrictToSection: document.getElementById('restrict-to-section-toggle').checked,
                    bdaySubject: document.getElementById('bday-subject-input').value,
                    bdayMessage: document.getElementById('bday-message-input').value
                };
                await sendMessageToBackground('setStorage', { birthdaySettings: newSettings });
                await sendMessageToBackground('removeStorage', { keys: ['birthdayLastCheck', 'birthdayData'] });
                window.location.reload();
            });

            const availableList = overlay.querySelector('#available-units-list');
            const selectedList = overlay.querySelector('#selected-units-list');
            const addBtn = overlay.querySelector('#add-unit-btn');
            const removeBtn = overlay.querySelector('#remove-unit-btn');
            const searchInput = overlay.querySelector('#unit-search-input');
            
            const updateLists = (filter = '') => {
                availableList.innerHTML = '';
                selectedList.innerHTML = '';
                const selectedSet = new Set(settings.units);
                const filterUpper = filter.toUpperCase();

                allUnits.forEach(unit => {
                    const li = document.createElement('li');
                    li.textContent = unit.uniNomeSintese.trim();
                    li.dataset.value = unit.uniCod;
                    li.onclick = (e) => {
                        const list = e.target.parentElement;
                         if (!e.ctrlKey) {
                            list.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                        }
                        li.classList.toggle('selected');
                    };
                    if (selectedSet.has(unit.uniCod)) {
                        selectedList.appendChild(li);
                    } else if (li.textContent.toUpperCase().includes(filterUpper)) {
                        availableList.appendChild(li);
                    }
                });
            };
            
            searchInput.addEventListener('input', () => updateLists(searchInput.value));

            addBtn.onclick = () => {
                availableList.querySelectorAll('.selected').forEach(li => {
                    settings.units.push(parseInt(li.dataset.value, 10));
                });
                updateLists(searchInput.value);
            };

            removeBtn.onclick = () => {
                selectedList.querySelectorAll('.selected').forEach(li => {
                    const index = settings.units.indexOf(parseInt(li.dataset.value, 10));
                    if (index > -1) {
                        settings.units.splice(index, 1);
                    }
                });
                updateLists(searchInput.value);
            };

            updateLists();
        } finally {
            this.uiModule.hideLoader();
        }
    }
}