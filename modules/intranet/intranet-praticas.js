/**
 * Módulo: Intranet - Avaliação de Práticas Supervisionadas
 * Funcionalidade: Automatiza o preenchimento de avaliações com configurações persistentes.
 */

(function() {
    console.log('SisPMG+: Módulo de Práticas Supervisionadas iniciado.');

    const STORAGE_KEY = 'SisPMG_Praticas_Config';
    
    const QUESTIONS = [
        "Demonstrou interesse/compromisso com a atividade policial-militar?",
        "Demonstrou conhecimento técnico?",
        "Demonstrou respeito aos princípios da hierarquia e disciplina?",
        "Demonstrou compatibilidade com a atividade desenvolvida?"
    ];
    
    const FIELD_COUNT = QUESTIONS.length;

    /**
     * Retorna uma NOVA cópia das configurações padrão.
     * O uso de função previne que o objeto seja alterado por referência na memória.
     */
    function getSafeDefaults() {
        return [
            { stars: "4", text: "Manteve postura proativa e comprometida durante o serviço." },
            { stars: "4", text: "Aplicou corretamente os procedimentos e demonstrou domínio técnico." },
            { stars: "4", text: "Cumpriu normas, acatou orientações e manteve conduta disciplinada." },
            { stars: "4", text: "Adaptou-se bem às demandas e executou as atribuições com eficiência." }
        ];
    }

    function init() {
        setInterval(() => {
            const btnCancelar = document.querySelector('input[value="Cancelar"]');
            
            const interfaceJaExiste = document.getElementById('sispmg-btn-config-praticas');

            if (btnCancelar && !interfaceJaExiste) {
                injectInterface(btnCancelar);
            }
        }, 1000);
    }

    function injectInterface(btnCancelar) {
        const container = btnCancelar.parentElement; 
        if (!container) return;

        // Limpeza preventiva (embora o check no init já evite duplicidade)
        const oldConfig = document.getElementById('sispmg-btn-config-praticas');
        if (oldConfig) oldConfig.remove();
        
        const oldFill = document.getElementById('sispmg-btn-preencher');
        if (oldFill) oldFill.remove();

        const btnConfig = document.createElement('button');
        btnConfig.type = 'button'; 
        btnConfig.textContent = '⚙️ Config';
        btnConfig.className = 'sispmg-btn-action sispmg-btn-config';
        btnConfig.id = 'sispmg-btn-config-praticas';
        btnConfig.onclick = (e) => { e.preventDefault(); openConfigModal(); };

        const btnFill = document.createElement('button');
        btnFill.type = 'button'; 
        btnFill.textContent = 'Auto Preencher';
        btnFill.className = 'sispmg-btn-action sispmg-btn-fill';
        btnFill.id = 'sispmg-btn-preencher';
        btnFill.onclick = (e) => { e.preventDefault(); executeFill(); };
        
        const config = loadConfigSafe();
        if (!config) {
            btnFill.style.display = 'none';
        }

        // Insere no início do container para ficar ao lado/antes dos botões originais
        if (container.firstChild) {
            container.insertBefore(btnConfig, container.firstChild);
            container.insertBefore(btnFill, btnConfig);
        } else {
            container.appendChild(btnFill);
            container.appendChild(btnConfig);
        }
    }

    function loadConfigSafe() {
        try {
            const configStr = localStorage.getItem(STORAGE_KEY);
            if (!configStr) return null;

            let config = JSON.parse(configStr);

            if (typeof config === 'string') {
                config = JSON.parse(config);
            }

            if (Array.isArray(config) && config.length > 0) {
                return config;
            }
        } catch(e) {
            console.error('SisPMG+: Erro ao ler config.', e);
        }
        return null;
    }

    function openConfigModal() {
        const existingModal = document.querySelector('.sispmg-modal-overlay');
        if (existingModal) existingModal.remove();

        let config = loadConfigSafe();

        // Se não houver config salva, gera uma nova a partir da função segura
        if (!config) {
            config = getSafeDefaults();
        }

        const overlay = document.createElement('div');
        overlay.className = 'sispmg-modal-overlay';

        const starLabels = ["", "1 (Péssimo)", "2 (Ruim)", "3 (Regular)", "4 (Bom)", "5 (Ótimo)"];
        
        const STAR_DESCRIPTIONS = {
            "1": "Muito aquém do padrão esperado. Justificativa:",
            "2": "Desenvolve de maneira insatisfatória. Justificativa:",
            "3": "Padrão ainda não satisfatório no critério avaliado. Justificativa:",
            "4": "Dentro do padrão esperado. Justificativa:",
            "5": "Acima do padrão esperado. Justificativa:"
        };

        let fieldsHtml = '';
        for (let i = 0; i < FIELD_COUNT; i++) {
            const item = config[i] || { stars: "4", text: "" };
            
            let radiosHtml = `<div class="sispmg-radios-container">`;
            for (let s = 1; s <= 5; s++) {
                const isChecked = (String(item.stars) === String(s)) ? 'checked' : '';
                radiosHtml += `
                    <label class="sispmg-radio-label">
                        <input type="radio" name="sispmg-stars-${i}" value="${s}" ${isChecked}>
                        ${starLabels[s]}
                    </label>
                `;
            }
            radiosHtml += `</div>`;

            const currentDesc = STAR_DESCRIPTIONS[item.stars] || "";

            fieldsHtml += `
                <div class="sispmg-field-group">
                    <div class="sispmg-question-text">${QUESTIONS[i]}</div>
                    <div class="sispmg-field-column">
                        ${radiosHtml}
                        <div id="sispmg-star-desc-${i}" class="sispmg-star-description">${currentDesc}</div>
                        <textarea class="sispmg-textarea-just" id="sispmg-text-${i}" placeholder="Justificativa...">${item.text || ''}</textarea>
                    </div>
                </div>
            `;
        }

        overlay.innerHTML = `
            <div class="sispmg-modal">
                <div class="sispmg-modal-header">
                    <span>Configuração de Preenchimento - Práticas</span>
                    <button type="button" class="sispmg-modal-close" title="Fechar">&times;</button>
                </div>
                <div class="sispmg-modal-body">
                    ${fieldsHtml}
                </div>
                <div class="sispmg-modal-footer">
                    <button type="button" class="sispmg-btn-action sispmg-btn-modal-secondary" id="sispmg-btn-reset-modal" style="margin-right: auto;">RESTAURAR RESPOSTA PADRÃO</button>
                    <button type="button" class="sispmg-btn-action sispmg-btn-modal-secondary" id="sispmg-btn-cancel-modal">CANCELAR</button>
                    <button type="button" class="sispmg-btn-action sispmg-btn-modal-primary" id="sispmg-btn-save-modal">SALVAR</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const radios = overlay.querySelectorAll('input[type="radio"][name^="sispmg-stars-"]');
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const parts = e.target.name.split('-'); 
                const idx = parts[2];
                const descDiv = document.getElementById(`sispmg-star-desc-${idx}`);
                if (descDiv) {
                    descDiv.textContent = STAR_DESCRIPTIONS[e.target.value] || "";
                }
            });
        });

        const resetToDefault = () => {
            if(!confirm('Deseja restaurar todas as configurações para o padrão original?')) return;
            
            const defConfig = getSafeDefaults();
            
            for(let i=0; i < FIELD_COUNT; i++) {
                const item = defConfig[i];
                
                const targetText = item.text;
                const targetStar = String(item.stars);

                const txt = document.getElementById(`sispmg-text-${i}`);
                if(txt) {
                    txt.value = targetText;
                    txt.dispatchEvent(new Event('input', { bubbles: true }));
                    txt.dispatchEvent(new Event('change', { bubbles: true }));
                    txt.dispatchEvent(new Event('blur', { bubbles: true }));
                }

                const radiosGroup = document.querySelectorAll(`input[name="sispmg-stars-${i}"]`);
                radiosGroup.forEach(radio => {
                    if (radio.value === targetStar) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true })); 
                    } else {
                        radio.checked = false;
                    }
                });
            }
        };

        overlay.querySelector('.sispmg-modal-close').onclick = (e) => { e.preventDefault(); overlay.remove(); };
        overlay.querySelector('#sispmg-btn-cancel-modal').onclick = (e) => { e.preventDefault(); overlay.remove(); };
        overlay.querySelector('#sispmg-btn-save-modal').onclick = (e) => { e.preventDefault(); saveConfigAndClose(overlay); };
        overlay.querySelector('#sispmg-btn-reset-modal').onclick = (e) => { e.preventDefault(); resetToDefault(); };
    }

    function saveConfigAndClose(modalElement) {
        const newConfig = [];
        for (let i = 0; i < FIELD_COUNT; i++) {
            const selectedRadio = modalElement.querySelector(`input[name="sispmg-stars-${i}"]:checked`);
            const starsValue = selectedRadio ? selectedRadio.value : "4"; 

            const textElement = modalElement.querySelector(`#sispmg-text-${i}`);
            
            newConfig.push({ 
                stars: starsValue, 
                text: textElement ? textElement.value : "" 
            });
        }

        try {
            const configStr = JSON.stringify(newConfig);
            localStorage.setItem(STORAGE_KEY, configStr);
            
            const btnFill = document.getElementById('sispmg-btn-preencher');
            if (btnFill) btnFill.style.display = 'inline-block';

            alert('Configurações salvas com sucesso!');
        } catch (e) {
            console.error('SisPMG+: Erro ao salvar no localStorage', e);
            alert('Erro ao salvar configurações.');
        }
        
        modalElement.remove();
    }

    function executeFill() {
        let config = loadConfigSafe();

        if (!config) {
            config = getSafeDefaults();
        }

        const textareas = document.querySelectorAll('textarea[name^="formularioPrincipal:bl_avaliacao:"]');

        config.forEach((item, index) => {
            const starId = `avaliacao_${index}_valor_${item.stars}`;
            const starLink = document.getElementById(starId);
            
            if (starLink) {
                starLink.click();
            }

            if (textareas[index]) {
                const ta = textareas[index];
                ta.value = item.text;
                
                const events = ['input', 'change', 'keyup', 'blur'];
                events.forEach(eventType => {
                    const ev = new Event(eventType, { bubbles: true });
                    ta.dispatchEvent(ev);
                });
            }
        });
        // Feedback visual rápido
        const btn = document.getElementById('sispmg-btn-preencher');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Preenchimento Realizado!';
            setTimeout(() => btn.textContent = originalText, 3000);
        }
    }

    init();

})();