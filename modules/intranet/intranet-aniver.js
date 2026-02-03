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
        restrictToSection: false
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

        if (lastCheck === todayStr && storedData.value.birthdayData) {
            aniversariantes = storedData.value.birthdayData || [];
        } else {
            const token = getCookie('tokiuz');
            if (!token) {
                 console.error('SisPMG+ [Aniversariantes]: Token de autenticação não encontrado.');
                 return;
            }

            try {
                let allBirthdays = [];
                if (settings.units.length === 0) {
                     console.warn("SisPMG+ [Aniversariantes]: Nenhuma unidade configurada para monitorar aniversariantes.");
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
                            console.warn(`SisPMG+ [Aniversariantes]: Falha ao buscar dados para unidade ${unidade}, mês ${mes}:`, response.error);
                        }
                    }
                }
                
                const uniqueBirthdays = Array.from(new Map(allBirthdays.map(p => [p.nrPol, p])).values());
                aniversariantes = uniqueBirthdays;
                
                await sendMessageToBackground('setStorage', { birthdayLastCheck: todayStr });
                await sendMessageToBackground('setStorage', { birthdayData: aniversariantes });

            } catch (error) {
                console.error('SisPMG+ [Aniversariantes]: Erro ao buscar aniversariantes:', error);
                return;
            }
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

    async processAndNotify(aniversariantes) {
        const settings = await getBirthdaySettings();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const endDate = new Date(today);
        endDate.setDate(today.getDate() + settings.daysAhead + 1);

        const currentYear = today.getFullYear();

        const upcomingBirthdays = aniversariantes.map(person => {
            if (!person.mesAniversario || !person.diaAniversario) return null;

            const birthDateThisYear = new Date(currentYear, person.mesAniversario - 1, person.diaAniversario);
            birthDateThisYear.setHours(0, 0, 0, 0);

            const birthDateNextYear = new Date(currentYear + 1, person.mesAniversario - 1, person.diaAniversario);
            birthDateNextYear.setHours(0, 0, 0, 0);

            let applicableBirthDate = null;
            
            if (birthDateThisYear >= today && birthDateThisYear < endDate) {
                applicableBirthDate = birthDateThisYear;
            } else if (birthDateNextYear >= today && birthDateNextYear < endDate) {
                applicableBirthDate = birthDateNextYear;
            }

            if (applicableBirthDate) {
                return { ...person, fullDate: applicableBirthDate };
            }
            return null;
        }).filter(Boolean);

        const deHoje = upcomingBirthdays.filter(p => p.fullDate.getTime() === today.getTime());
        const proximos = upcomingBirthdays.filter(p => p.fullDate.getTime() > today.getTime());

        if (deHoje.length === 0 && proximos.length === 0) {
            return;
        }
        
        document.getElementById('sispmg-birthday-notification')?.remove();

        const createListItemHTML = (person, isToday = false) => {
            const dateStr = isToday ? '' : `${String(person.diaAniversario).padStart(2, '0')}/${String(person.mesAniversario).padStart(2, '0')} - `;
            const todayClass = isToday ? 'sispmg-birthday-today' : '';
            return `<li class="sispmg-birthday-item">
                        <div class="sispmg-birthday-name ${todayClass}">${dateStr}${person.nomeCompleto.trim()}</div>
                        <div class="sispmg-birthday-unit">${person.nomeUnidade.trim()}</div>
                    </li>`;
        };

        let listHTML = '';
        
        if (deHoje.length > 0) {
            listHTML += '<div class="sispmg-birthday-section"><strong>Hoje:</strong><ul>';
            deHoje.sort((a,b) => a.nomeCompleto.localeCompare(b.nomeCompleto)).forEach(p => { listHTML += createListItemHTML(p, true); });
            listHTML += '</ul></div>';
        }
        
        if (proximos.length > 0) {
            if(deHoje.length > 0) listHTML += '<div class="sispmg-birthday-separator"></div>';
            listHTML += `<div class="sispmg-birthday-section"><strong>Próximos ${settings.daysAhead} dias:</strong><ul>`;
            proximos.sort((a,b) => {
                if(a.fullDate.getTime() !== b.fullDate.getTime()) {
                    return a.fullDate - b.fullDate;
                }
                return a.nomeCompleto.localeCompare(b.nomeCompleto);
            }).forEach(p => { 
                listHTML += createListItemHTML(p, false); 
            });
            listHTML += '</ul></div>';
        }

        const notification = document.createElement('div');
        notification.id = 'sispmg-birthday-notification';
        notification.innerHTML = `
            <button id="sispmg-bday-close-notif" class="sispmg-modal-close-btn">&times;</button>
            <div class="sispmg-birthday-title">${this.iconSVG_28} <span>Lembrete de Aniversário</span></div>
            <div class="sispmg-birthday-content-wrapper">${listHTML}</div>
        `;
        
        const container = document.getElementById('sispmg-plus-container') || document.body;
        container.appendChild(notification);
        
        let closeTimeout;
        let handleDocumentClick;

        const closeAndRemove = () => {
             clearTimeout(closeTimeout);
             document.removeEventListener('click', handleDocumentClick, true);
             notification.classList.remove('visible');
             setTimeout(() => notification.remove(), 500);
        };
        
        handleDocumentClick = (e) => {
            if (!notification.contains(e.target)) {
                closeAndRemove();
            }
        };

        const startCloseTimer = () => {
            clearTimeout(closeTimeout);
            closeTimeout = setTimeout(closeAndRemove, 15000);
        };
        
        document.getElementById('sispmg-bday-close-notif').onclick = (e) => {
            e.stopPropagation();
            closeAndRemove();
        };

        notification.addEventListener('mouseenter', () => clearTimeout(closeTimeout));
        notification.addEventListener('mouseleave', startCloseTimer);

        setTimeout(() => {
            notification.classList.add('visible');
            document.addEventListener('click', handleDocumentClick, true);
        }, 100);

        startCloseTimer();
    }
    
    async showConfigModal() {
        this.uiModule.showLoader();
        try {
            const unitsResponse = await sendMessageToBackground('fetchUnits', { token: getCookie('tokiuz') });
            const allUnits = unitsResponse.success ? unitsResponse.data.sort((a, b) => a.uniNomeSintese.localeCompare(b.uniNomeSintese)) : [];
            const settings = await getBirthdaySettings();
            
            const sectionResult = await sendMessageToBackground('getStorage', { key: ['userSection'] });
            const userSectionData = sectionResult.success ? sectionResult.value.userSection : {};
            const userSectionName = userSectionData?.sectionName?.trim() || 'Não encontrada';
            const sectionLabel = `Restringir à(ao) ${userSectionName}`;
    
            const modalHTML = `
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
                <div class="sispmg-config-row sispmg-unit-selector">
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
            </div>`;
        
            const modal = this.uiModule.createModal('Configurar Aniversariantes', modalHTML, null, [
                { text: 'Cancelar', className: 'sispmg-modal-btn-secondary', action: (m) => m.remove() },
                { text: 'Salvar', className: 'sispmg-modal-btn-primary', action: async (m) => {
                    const selectedUnits = Array.from(document.getElementById('selected-units-list').children).map(li => parseInt(li.dataset.value, 10));
                    const newSettings = {
                        daysAhead: parseInt(document.getElementById('days-ahead-input').value, 10) || 3,
                        units: selectedUnits,
                        includeSubunits: document.getElementById('include-subunits-toggle').checked,
                        includeInactive: document.getElementById('include-inactive-toggle').checked,
                        restrictToSection: document.getElementById('restrict-to-section-toggle').checked
                    };
                    await sendMessageToBackground('setStorage', { birthdaySettings: newSettings });
                    await sendMessageToBackground('removeStorage', { keys: ['birthdayLastCheck', 'birthdayData'] });
                    window.location.reload();
                }}
            ]);

            const availableList = modal.querySelector('#available-units-list');
            const selectedList = modal.querySelector('#selected-units-list');
            const addBtn = modal.querySelector('#add-unit-btn');
            const removeBtn = modal.querySelector('#remove-unit-btn');
            const searchInput = modal.querySelector('#unit-search-input');
            
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

