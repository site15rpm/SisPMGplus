// Arquivo: common/storage-manager.js
// Wrapper centralizado para leitura, gravação e remoção do storage do navegador.
// Implementa migração transparente automática de chaves legadas.

import { STORAGE_KEYS, LEGACY_KEYS_MAPPING } from './storage-keys.js';

// Retorna a API de storage adequada (browser ou chrome)
function getStorageArea(type = 'local') {
    if (typeof browser !== 'undefined' && browser.storage) {
        return type === 'sync' ? browser.storage.sync : browser.storage.local;
    } else if (typeof chrome !== 'undefined' && chrome.storage) {
        return type === 'sync' ? chrome.storage.sync : chrome.storage.local;
    }
    throw new Error('API de storage do navegador não disponível.');
}

export const StorageManager = {
    /**
     * Obtém um ou mais valores do storage.
     * Caso o valor solicitado sob a nova chave padronizada não exista, 
     * verifica-se a existência da chave legada antiga para migração automática.
     * 
     * @param {string|string[]|null} keys Chave(s) a buscar. Se null, busca tudo.
     * @param {string} storageType Tipo de storage ('local' ou 'sync').
     * @returns {Promise<any>} Valor da chave, ou objeto com chaves/valores.
     */
    async get(keys, storageType = 'local') {
        const storage = getStorageArea(storageType);
        
        // Se keys for null ou undefined, retorna tudo diretamente
        if (keys === null || keys === undefined) {
            return await storage.get(null);
        }

        const isArray = Array.isArray(keys);
        const requestedKeys = isArray ? keys : [keys];
        const result = {};

        for (const key of requestedKeys) {
            // Determina qual é a chave real de armazenamento (nova chave padronizada)
            let storageKey = LEGACY_KEYS_MAPPING[key] || key;
            if (key.startsWith('sic3_ids_cache_') || key.startsWith('sic3_backup_')) {
                storageKey = 'sispmg_' + key;
            }

            // Busca o valor da chave real de armazenamento
            let rawResult = await storage.get(storageKey);
            let value = rawResult[storageKey];

            // Se não encontrou o valor na chave nova, verifica se existe no storage sob a chave legada antiga
            if (value === undefined) {
                // Caso o chamador tenha pedido a chave nova mas os dados ainda estejam na chave antiga
                let legacyKey = null;
                if (storageKey.startsWith('sispmg_sic3_ids_cache_') || storageKey.startsWith('sispmg_sic3_backup_')) {
                    legacyKey = storageKey.replace('sispmg_', '');
                } else {
                    legacyKey = Object.keys(LEGACY_KEYS_MAPPING).find(
                        (lk) => LEGACY_KEYS_MAPPING[lk] === storageKey
                    );
                }

                if (legacyKey && legacyKey !== storageKey) {
                    const legacyResult = await storage.get(legacyKey);
                    if (legacyResult[legacyKey] !== undefined) {
                        value = legacyResult[legacyKey];
                        // Migra para a nova chave
                        await storage.set({ [storageKey]: value });
                        // Remove a chave antiga
                        await storage.remove(legacyKey);
                        console.log(`SisPMG+ [StorageManager]: Chave legada '${legacyKey}' migrada com sucesso para '${storageKey}'.`);
                    }
                }
            }

            // Retorna o valor sob a chave que o chamador solicitou
            if (value !== undefined) {
                result[key] = value;
            }
        }

        return isArray ? result : result[keys];
    },

    async set(data, storageType = 'local') {
        const storage = getStorageArea(storageType);
        const finalData = {};
        for (const key in data) {
            let finalKey = LEGACY_KEYS_MAPPING[key] || key;
            if (key.startsWith('sic3_ids_cache_') || key.startsWith('sic3_backup_')) {
                finalKey = 'sispmg_' + key;
            }
            finalData[finalKey] = data[key];
        }
        await storage.set(finalData);
    },

    /**
     * Remove chaves do storage.
     * 
     * @param {string|string[]} keys Chave(s) a remover.
     * @param {string} storageType Tipo de storage ('local' ou 'sync').
     * @returns {Promise<void>}
     */
    async remove(keys, storageType = 'local') {
        const storage = getStorageArea(storageType);
        const keysToRemove = Array.isArray(keys) ? keys : [keys];
        const finalKeysToRemove = keysToRemove.map(key => {
            let finalKey = LEGACY_KEYS_MAPPING[key] || key;
            if (key.startsWith('sic3_ids_cache_') || key.startsWith('sic3_backup_')) {
                finalKey = 'sispmg_' + key;
            }
            return finalKey;
        });
        await storage.remove(finalKeysToRemove);
    },

    /**
     * Executa uma varredura completa no storage local migrando todas as chaves
     * legadas restantes e apagando-as, além de limpar chaves dinâmicas órfãs.
     */
    async runGarbageCollector() {
        try {
            const storage = getStorageArea('local');
            const allData = await storage.get(null);
            const legacyKeysFound = [];
            const newValuesToSet = {};
            const keysToRemove = [];

            // 1. Migração de chaves legadas raiz
            for (const legacyKey in LEGACY_KEYS_MAPPING) {
                if (allData[legacyKey] !== undefined) {
                    const newKey = LEGACY_KEYS_MAPPING[legacyKey];
                    // Só migra se a nova chave ainda não tiver dados persistidos
                    if (allData[newKey] === undefined && newValuesToSet[newKey] === undefined) {
                        newValuesToSet[newKey] = allData[legacyKey];
                        console.log(`SisPMG+ [GC]: Enfileirada migração de '${legacyKey}' para '${newKey}'.`);
                    }
                    keysToRemove.push(legacyKey);
                    legacyKeysFound.push(legacyKey);
                }
            }

            // 1.1 Migração de chaves dinâmicas legadas e credenciais do SIC3
            for (const key in allData) {
                if (key.startsWith('sic3_ids_cache_')) {
                    const newKey = 'sispmg_' + key;
                    if (allData[newKey] === undefined && newValuesToSet[newKey] === undefined) {
                        newValuesToSet[newKey] = allData[key];
                        console.log(`SisPMG+ [GC]: Enfileirada migração de cache dinâmico '${key}' para '${newKey}'.`);
                    }
                    keysToRemove.push(key);
                } else if (key.startsWith('sic3_backup_')) {
                    const newKey = 'sispmg_' + key;
                    if (allData[newKey] === undefined && newValuesToSet[newKey] === undefined) {
                        newValuesToSet[newKey] = allData[key];
                        console.log(`SisPMG+ [GC]: Enfileirada migração de backup dinâmico '${key}' para '${newKey}'.`);
                    }
                    keysToRemove.push(key);
                }
            }

            // 2. Migração de chaves dinâmicas órfãs de confirmação local (confirmado_local_*)
            const confirmadosDictKey = STORAGE_KEYS.COMUNICACAO_CONFIRMADOS_LOCAIS;
            let confirmadosLocais = allData[confirmadosDictKey] || {};
            let confirmadosModificados = false;

            for (const key in allData) {
                if (key.startsWith('confirmado_local_')) {
                    const index = key.replace('confirmado_local_', '');
                    if (index && !isNaN(index)) {
                        confirmadosLocais[index] = true;
                        confirmadosModificados = true;
                    }
                    keysToRemove.push(key);
                }
            }

            if (confirmadosModificados) {
                newValuesToSet[confirmadosDictKey] = confirmadosLocais;
                console.log(`SisPMG+ [GC]: Migradas chaves dinâmicas 'confirmado_local_*' para dicionário único.`);
            }

            // 3. Aplica gravação das novas chaves
            if (Object.keys(newValuesToSet).length > 0) {
                await storage.set(newValuesToSet);
            }

            // 4. Remove chaves obsoletas do storage local
            if (keysToRemove.length > 0) {
                const uniqueKeysToRemove = [...new Set(keysToRemove)];
                await storage.remove(uniqueKeysToRemove);
                console.log(`SisPMG+ [GC]: Limpeza concluída. Removidas ${uniqueKeysToRemove.length} chaves obsoletas.`);
            }
        } catch (e) {
            console.error('SisPMG+ [GC]: Falha ao executar o Garbage Collector do storage:', e);
        }
    }
};
