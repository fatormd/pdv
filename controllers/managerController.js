// --- CONTROLLERS/MANAGERCONTROLLER.JS (VERSÃO HUB - "O GERENTE GERAL") ---

// 1. IMPORTAÇÃO DOS MÓDULOS ("ESPECIALISTAS")
import * as DeliveryMgr from './manager/modules/deliveryManager.js';
// CAMINHO CORRIGIDO E DESCOMENTADO:
import * as ProductMgr from './manager/modules/productManager.js'; 
// import * as FinanceMgr from './manager/modules/financeManager.js';
// import * as TeamMgr from './manager/modules/teamManager.js';

let isInitialized = false;
let managerModal = null; // Referência ao modal principal do HTML

// ==================================================================
//           1. INICIALIZAÇÃO
// ==================================================================

export const initManagerController = () => {
    if (isInitialized) return;
    
    console.log("[ManagerHub] Inicializando Sistema de Gestão Modular...");
    managerModal = document.getElementById('managerModal');

    // Inicializa os módulos que já existem
    try {
        if(DeliveryMgr && DeliveryMgr.init) DeliveryMgr.init();
        
        // MÓDULO PRODUTOS INICIALIZADO:
        if(ProductMgr && ProductMgr.init) ProductMgr.init();

        // Futuras inicializações:
        // if(FinanceMgr) FinanceMgr.init();
    } catch (error) {
        console.error("[ManagerHub] Erro ao inicializar módulos:", error);
    }

    setupGlobalRoutes();
    isInitialized = true;
};

// ==================================================================
//           2. ROTEAMENTO GLOBAL (API DO PAINEL)
// ==================================================================

const setupGlobalRoutes = () => {

    // A. Roteador de Módulos (Cards do Painel Gerencial)
    window.openManagerModule = (moduleName) => {
        console.log(`[ManagerHub] Solicitando módulo: ${moduleName}`);
        
        switch(moduleName) {
            case 'delivery':
                // Delivery geralmente opera no modal de pedidos, não no gerencial
                alert("Configurações de Delivery (Em Breve)");
                break;

            case 'products':
                // CONECTADO CORRETAMENTE:
                if (ProductMgr && ProductMgr.open) {
                    ProductMgr.open();
                } else {
                    console.error("Erro: Módulo ProductMgr não carregado.");
                }
                break;

            case 'finance':
                // Antes: renderFinancialModule()
                // Agora: FinanceMgr.open()
                alert("Módulo FINANCEIRO: Aguardando migração para 'financeManager.js'");
                break;

            case 'team':
                // Antes: renderHRPanel()
                // Agora: TeamMgr.open()
                alert("Módulo RH: Aguardando migração para 'teamManager.js'");
                break;
                
            case 'crm':
                alert("Módulo CRM: Em desenvolvimento.");
                break;

            case 'vouchers':
                // Mantemos compatibilidade temporária se o modal existir no HTML
                const vModal = document.getElementById('voucherManagementModal');
                if(vModal) vModal.style.display = 'flex';
                break;

            case 'sync':
                 // Antes: handleSyncAction()
                 alert("Sincronização: Aguardando migração.");
                 break;

            default:
                console.warn(`[ManagerHub] Módulo desconhecido: ${moduleName}`);
        }
    };

    // B. Roteador de Modos de Pedido (Modal de Cliente - Novo!)
    window.switchOrderMode = (mode) => {
        if (DeliveryMgr && DeliveryMgr.switchTab) {
            DeliveryMgr.switchTab(mode);
        } else {
            console.error("ERRO: deliveryManager.js não foi carregado corretamente.");
        }
    };

    // C. Roteador de Ações Externas (Ex: Chamar Motoboy)
    window.renderExternalRecruitmentModal = (type) => {
        if (type === 'motoboy') {
            if (DeliveryMgr && DeliveryMgr.handleCallMotoboy) {
                DeliveryMgr.handleCallMotoboy();
            }
        } else {
            // RH (Chamar Extra) - Futuro TeamMgr
            alert("Módulo de Recrutamento (RH) em migração.");
        }
    };
    
    // D. Roteador "Legado" (Compatibilidade com botões antigos do HTML)
    window.handleGerencialAction = (action, payload) => {
        if (managerModal) managerModal.style.display = 'none';

        switch (action) {
            case 'openProductHub': 
                window.openManagerModule('products'); 
                break;
            case 'openFinancialModule': 
                window.openManagerModule('finance'); 
                break;
            case 'openHRPanel': 
                window.openManagerModule('team'); 
                break;
            case 'openWooSync': 
                window.openManagerModule('sync'); 
                break;
            case 'openCustomerCRM':
                window.openManagerModule('crm');
                break;
            case 'closeDay':
                alert("Fechamento de Dia: Aguardando 'financeManager.js'");
                break;
            default:
                console.log(`Ação ${action} redirecionada para o Hub.`);
        }
    };

    // E. Autenticação Simples (Senha do Gerente)
    window.openManagerAuthModal = (action) => {
        // Futuramente mover para authManager.js
        const password = prompt("Senha de Gerente:");
        if (password === "1234") { 
             const map = {
                 'openProductHub': 'products',
                 'openFinancialModule': 'finance',
                 'openHRPanel': 'team',
                 'openCustomerCRM': 'crm',
                 'openVoucherManagement': 'vouchers',
                 'openWooSync': 'sync',
                 'openSectorManagement': 'settings'
             };
             
             const module = map[action] || action;
             window.openManagerModule(module);
        } else {
            alert("Acesso Negado.");
        }
    };
};