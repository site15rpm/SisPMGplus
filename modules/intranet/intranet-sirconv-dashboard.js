// Funções e lógica para o dashboard de convênios SIRCONV

export class SirconvDashboardModule {
    constructor(config) {
        this.config = config;
        this.ui = window.SisPMG_UI;
        console.log("SirconvDashboardModule: Instância da UI recebida:", this.ui);
    }

    init() {
        if (this.ui) {
            this.ui.registerModule({ name: 'SIRCONV Dashboard', instance: this });
            console.log("SirconvDashboardModule: Módulo registrado na UI.");
        } else {
            console.error("SirconvDashboardModule: A instância da UI não foi encontrada. O módulo não será registrado.");
        }
    }

    showDashboard() {
        console.log("SirconvDashboardModule: showDashboard() chamado.");
        const content = `
            <div style="padding: 10px;">
                <h2>Dashboard de Convênios</h2>
                <p>Este módulo está em desenvolvimento.</p>
                <p>Em breve, você poderá ver análises detalhadas sobre os convênios.</p>
            </div>
        `;

        if (this.ui && typeof this.ui.createModal === 'function') {
            console.log("SirconvDashboardModule: Instância da UI e createModal encontrados. Tentando criar modal...");
            try {
                this.ui.createModal('Dashboard de Convênios', content);
                console.log("SirconvDashboardModule: createModal() chamado com sucesso.");
            } catch (e) {
                console.error("SirconvDashboardModule: Erro ao chamar createModal():", e);
                alert('Ocorreu um erro ao tentar abrir o dashboard.');
            }
        } else {
            console.error("SirconvDashboardModule: this.ui ou this.ui.createModal não está disponível.");
            alert('Dashboard de convênios em construção (UI indisponível)!');
        }

        this.fetchConveniosData();
    }

    async fetchConveniosData() {
        console.log("Iniciando busca de dados dos convênios...");
        // Futuramente, usar a lógica de extrator-convenios.js para buscar os dados da API
        // Ex: /lite/convenio/web/convenio/get-convenio-detalhes?id=CONVENIO_ID
    }
}
