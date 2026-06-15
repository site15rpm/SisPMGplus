// Arquivo: modules/intranet/intranet-agenda-unidades.js
// Lógica de background para buscar unidades para o módulo de Agenda.

import { obterUnidades } from '../../common/busca-unidades.js';

/**
 * Função principal para buscar e processar as unidades para a agenda.
 * @param {string} userRegionCode - O código da região do usuário.
 * @returns {Promise<Array>} Uma lista de objetos de unidade.
 */
export async function fetchUnidadesForAgenda(userRegionCode) {
    if (!userRegionCode) {
        console.warn("SisPMG+ [Agenda/Unidades]: Código da região do usuário não fornecido.");
        return [];
    }

    try {
        const parsedData = await obterUnidades(userRegionCode, true, false);
        
        if (!parsedData || parsedData.length === 0) {
            console.log("SisPMG+ [Agenda/Unidades]: Nenhuma unidade encontrada para a região:", userRegionCode);
            return [];
        }
        
        // Formata os dados para o que a UI da agenda precisa
        const formattedUnits = parsedData.map(unit => ({
            value: unit.codigoSecao,
            label: `${unit.codigoSecao} - ${unit.nomeSecao}`,
            hierarchyPath: unit.hierarquia || '', // Inclui o caminho da hierarquia
            municipio: unit.municipio || '',
            codigoMunicipio: unit.codigoMunicipio || ''
        }));

        return formattedUnits;

    } catch (error) {
        console.error("SisPMG+ [Agenda/Unidades]: Erro ao buscar unidades:", error);
        // Retorna um array vazio em caso de erro para não quebrar a UI
        return [];
    }
}
