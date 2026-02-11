// Arquivo: modules/intranet/agenda-settings.js

document.addEventListener('DOMContentLoaded', () => {
    const colorExpiredPicker = document.getElementById('color-expired-picker');
    const colorExpiredText = document.getElementById('color-expired-text');
    const colorSoonPicker = document.getElementById('color-soon-picker');
    const colorSoonText = document.getElementById('color-soon-text');
    const colorFarPicker = document.getElementById('color-far-picker');
    const colorFarText = document.getElementById('color-far-text');
    const colorCompletedPicker = document.getElementById('color-completed-picker');
    const colorCompletedText = document.getElementById('color-completed-text');
    const deadlineSoon = document.getElementById('deadline-soon');
    const sortOrder = document.getElementById('sort-order');
    const saveButton = document.getElementById('save-settings');
    const statusMessage = document.getElementById('status-message');

    // --- Funções de Sincronização Picker <-> Texto ---
    const setupColorSync = (picker, text) => {
        picker.addEventListener('input', () => text.value = picker.value);
        text.addEventListener('input', () => {
            if (/^#[0-9A-F]{6}$/i.test(text.value)) {
                picker.value = text.value;
            }
        });
    };

    setupColorSync(colorExpiredPicker, colorExpiredText);
    setupColorSync(colorSoonPicker, colorSoonText);
    setupColorSync(colorFarPicker, colorFarText);
    setupColorSync(colorCompletedPicker, colorCompletedText);

    // --- Carregar e Salvar Configurações ---

    const loadSettings = async () => {
        const { sispmg_agenda_settings } = await browser.storage.local.get('sispmg_agenda_settings');

        const defaults = {
            colors: { expired: '#ff0000', soon: '#ffff00', far: '#008000', completed: '#808080' },
            deadlines: { soon: 3 },
            sortOrder: 'asc'
        };

        const settings = Object.assign({}, defaults, sispmg_agenda_settings);
        
        // Cores
        colorExpiredPicker.value = settings.colors.expired;
        colorExpiredText.value = settings.colors.expired;
        colorSoonPicker.value = settings.colors.soon;
        colorSoonText.value = settings.colors.soon;
        colorFarPicker.value = settings.colors.far;
        colorFarText.value = settings.colors.far;
        colorCompletedPicker.value = settings.colors.completed;
        colorCompletedText.value = settings.colors.completed;

        // Prazos
        deadlineSoon.value = settings.deadlines.soon;

        // Ordem
        sortOrder.value = settings.sortOrder;
    };

    const saveSettings = async () => {
        const newSettings = {
            colors: {
                expired: colorExpiredPicker.value,
                soon: colorSoonPicker.value,
                far: colorFarPicker.value,
                completed: colorCompletedPicker.value
            },
            deadlines: {
                soon: parseInt(deadlineSoon.value, 10)
            },
            sortOrder: sortOrder.value
        };

        try {
            await browser.storage.local.set({ sispmg_agenda_settings: newSettings });
            statusMessage.textContent = 'Configurações salvas com sucesso!';
            statusMessage.style.color = 'green';
        } catch (error) {
            statusMessage.textContent = 'Erro ao salvar as configurações.';
            statusMessage.style.color = 'red';
            console.error("SisPMG+ [Agenda Settings]:", error);
        }

        setTimeout(() => statusMessage.textContent = '', 3000);
    };

    saveButton.addEventListener('click', saveSettings);

    // Carrega as configurações iniciais ao abrir a página
    loadSettings();
});
