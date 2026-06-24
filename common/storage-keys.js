// Arquivo: common/storage-keys.js
// Centraliza todas as chaves de storage utilizadas pela extensão.

export const STORAGE_KEYS = {
    // Abastecimentos
    ABASTECIMENTOS_CONFIG: 'sispmg_abastecimentos_config',
    ABASTECIMENTOS_LOGS: 'sispmg_abastecimentos_logs',
    ABASTECIMENTOS_SCHEDULE: 'sispmg_abastecimentos_schedule',

    // Unidades
    UNIDADES_SETTINGS: 'sispmg_unidades_settings',
    UNIDADES_LOGS: 'sispmg_unidades_logs',
    UNIDADES_LAST_RUN: 'sispmg_unidades_last_run',

    // SICOR
    SICOR_SETTINGS: 'sispmg_sicor_settings',
    SICOR_LOGS: 'sispmg_sicor_logs',
    SICOR_SCHEDULE: 'sispmg_sicor_schedule',
    SICOR_LAST_RUN_DATE: 'sispmg_sicor_last_run_date',
    SICOR_LAST_START_DATE: 'sispmg_sicor_last_start_date',

    // SIRCONV
    SIRCONV_MEUS_CONVENIOS: 'sispmg_sirconv_meus_convenios',
    SIRCONV_OUTROS_CONVENIOS: 'sispmg_sirconv_outros_convenios',
    SIRCONV_LAST_SYNC: 'sispmg_sirconv_last_sync',

    // Terminal
    TERMINAL_PROFILES: 'sispmg_terminal_profiles',
    TERMINAL_THEME: 'sispmg_terminal_theme',
    TERMINAL_CACHED_ROTINAS: 'sispmg_terminal_cached_rotinas',
    TERMINAL_LAST_DIRECTORY: 'sispmg_terminal_last_directory_handle',

    // Aniversariantes
    ANIVER_USER_SECTION: 'sispmg_aniver_user_section',
    ANIVER_USER_SECTION_LAST_CHECK: 'sispmg_aniver_user_section_last_check',
    ANIVER_LAST_CHECK: 'sispmg_aniver_last_check',
    ANIVER_DATA: 'sispmg_aniver_data',
    ANIVER_SETTINGS: 'sispmg_aniver_settings',

    // SIC3
    SIC3_ACCESS_AUTHORIZED: 'sispmg_sic3_access_authorized',
    SIC3_UNIDADES_RPM: 'sispmg_sic3_unidades_rpm',
    SIC3_GAS_API_URL: 'sispmg_sic3_gas_api_url',
    SIC3_APIS_URLS: 'sispmg_sic3_apis_urls',

    // Geral / Outros
    INTRANET_USER: 'sispmg_intranet_user',
    PADM_ENABLED: 'sispmg_padm_enabled',
    ERROS_REPORTADOS_DIA: 'sispmg_erros_reportados_dia',
    MODULOS_AUTORIZADOS: 'sispmg_modulos_autorizados',
    
    // Comunicação
    COMUNICACAO_CONFIRMADOS_LOCAIS: 'sispmg_comunicacao_confirmados_locais'
};

// Mapeamento de chaves legadas para novas chaves padronizadas (usado para migração transparente)
export const LEGACY_KEYS_MAPPING = {
    'app-config': STORAGE_KEYS.ABASTECIMENTOS_CONFIG,
    'execution-logs': STORAGE_KEYS.ABASTECIMENTOS_LOGS,
    'abastecimentos-schedule': STORAGE_KEYS.ABASTECIMENTOS_SCHEDULE,
    'unidadesSettings': STORAGE_KEYS.UNIDADES_SETTINGS,
    'unidadesLogs': STORAGE_KEYS.UNIDADES_LOGS,
    'unidadesLastRun': STORAGE_KEYS.UNIDADES_LAST_RUN,
    'sicorSettings': STORAGE_KEYS.SICOR_SETTINGS,
    'sicorLogs': STORAGE_KEYS.SICOR_LOGS,
    'sicorSchedule': STORAGE_KEYS.SICOR_SCHEDULE,
    'sicorLastSuccessfulRunDate': STORAGE_KEYS.SICOR_LAST_RUN_DATE,
    'sicorLastStartDate': STORAGE_KEYS.SICOR_LAST_START_DATE,
    'sirconv_meus_convenios': STORAGE_KEYS.SIRCONV_MEUS_CONVENIOS,
    'sirconv_outros_convenios': STORAGE_KEYS.SIRCONV_OUTROS_CONVENIOS,
    'sirconv_last_outros_sync': STORAGE_KEYS.SIRCONV_LAST_SYNC,
    'userProfiles': STORAGE_KEYS.TERMINAL_PROFILES,
    'editorTheme': STORAGE_KEYS.TERMINAL_THEME,
    'cachedRotinas': STORAGE_KEYS.TERMINAL_CACHED_ROTINAS,
    'lastDirectoryHandle': STORAGE_KEYS.TERMINAL_LAST_DIRECTORY,
    'userSection': STORAGE_KEYS.ANIVER_USER_SECTION,
    'userSectionLastCheck': STORAGE_KEYS.ANIVER_USER_SECTION_LAST_CHECK,
    'birthdayLastCheck': STORAGE_KEYS.ANIVER_LAST_CHECK,
    'birthdayData': STORAGE_KEYS.ANIVER_DATA,
    'birthdaySettings': STORAGE_KEYS.ANIVER_SETTINGS,
    'sic3_access_authorized': STORAGE_KEYS.SIC3_ACCESS_AUTHORIZED,
    'sic3_unidades_rpm': STORAGE_KEYS.SIC3_UNIDADES_RPM,
    'sic3GasApiUrl': STORAGE_KEYS.SIC3_GAS_API_URL,
    'sic3_apis_urls': STORAGE_KEYS.SIC3_APIS_URLS,
    'intranetUser': STORAGE_KEYS.INTRANET_USER,
    'PAdm+Enabled': STORAGE_KEYS.PADM_ENABLED
};
