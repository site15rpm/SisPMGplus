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

        // Busca todas as chaves solicitadas
        const rawResult = await storage.get(requestedKeys);

        // Verifica migração transparente para cada chave solicitada
        for (const key of requestedKeys) {
            if (rawResult[key] !== undefined) {
                result[key] = rawResult[key];
                continue;
            }

            // Caso contrário, procura se existe uma chave antiga equivalente para migração
            const legacyKey = Object.keys(LEGACY_KEYS_MAPPING).find(
                (lk) => LEGACY_KEYS_MAPPING[lk] === key
            );

            if (legacyKey) {
                const legacyResult = await storage.get(legacyKey);
                if (legacyResult[legacyKey] !== undefined) {
                    const legacyValue = legacyResult[legacyKey];
                    // Grava o valor na nova chave padronizada
                    await storage.set({ [key]: legacyValue });
                    // Remove a chave antiga obsoleta
                    await storage.remove(legacyKey);
                    // Atualiza o objeto de retorno
                    result[key] = legacyValue;
                    console.log(`SisPMG+ [StorageManager]: Chave legada '${legacyKey}' migrada com sucesso para '${key}'.`);
                }
            }
        }

        return isArray ? result : result[keys];
    },

    async set(data, storageType = 'local') {
        const storage = getStorageArea(storageType);
        const finalData = {};
        for (const key in data) {
            const finalKey = LEGACY_KEYS_MAPPING[key] || key;
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
            return LEGACY_KEYS_MAPPING[key] || key;
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
