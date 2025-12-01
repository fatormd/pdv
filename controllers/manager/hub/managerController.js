// --- CONTROLLERS/MANAGER/HUB/MANAGERCONTROLLER.JS (VERSÃO FINAL COMPLETA) ---

// 1. IMPORTAÇÃO DOS MÓDULOS (CAMINHOS ABSOLUTOS)
import * as DeliveryMgr from '/controllers/manager/modules/deliveryManager.js';
import * as ProductMgr from '/controllers/manager/modules/productManager.js'; 
import * as FinanceMgr from '/controllers/manager/modules/financeManager.js';
import * as TeamMgr from '/controllers/manager/modules/teamManager.js';
import * as SalesMgr from '/controllers/manager/modules/salesManager.js'; // <--- NOVO IMPORT

let isInitialized = false;
let managerModal = null; 

export const initManagerController = () => {
    if (isInitialized) return;
    
    console.log("[ManagerHub] Inicializando Hub de Gestão...");
    managerModal = document.getElementById('managerModal');

    // Inicializa os módulos
    try {
        if(DeliveryMgr?.init) DeliveryMgr.init();
        if(ProductMgr?.init) ProductMgr.init();
        if(FinanceMgr?.init) FinanceMgr.init();
        if(TeamMgr?.init) TeamMgr.init();
        if(SalesMgr?.init) SalesMgr.init(); // <--- INICIALIZAÇÃO VENDAS
    } catch (error) {
        console.error("[ManagerHub] Erro ao inicializar módulos:", error);
    }

    setupGlobalRoutes();
    isInitialized = true;
};

const setupGlobalRoutes = () => {
    // A. Roteador de Módulos (Cards do Painel)
    window.openManagerModule = (moduleName) => {
        console.log(`[ManagerHub] Abrindo: ${moduleName}`);
        
        try {
            switch(moduleName) {
                case 'delivery':
                    alert("Configurações de Delivery (Em Breve)");
                    break;

                case 'products':
                    if(ProductMgr?.open) ProductMgr.open(); 
                    else throw new Error("Módulo de Produtos não encontrado.");
                    break;

                case 'finance':
                    if(FinanceMgr?.open) FinanceMgr.open();
                    else throw new Error("Módulo Financeiro não encontrado.");
                    break;

                case 'sales': // <--- NOVO CASE PARA VENDAS
                    if(SalesMgr?.open) SalesMgr.open();
                    else throw new Error("Módulo de Vendas não encontrado.");
                    break;

                case 'team':
                    if(TeamMgr?.open) TeamMgr.open();
                    else throw new Error("Módulo RH não encontrado.");
                    break;
                    
                case 'crm':
                    // Redireciona para o CRM (ainda dentro de ProductMgr ou SalesMgr dependendo da sua escolha, ou mantenha alerta)
                    if(ProductMgr?.openCRM) ProductMgr.openCRM(); 
                    else alert("Módulo CRM: Em desenvolvimento.");
                    break;

                case 'vouchers':
                    const vModal = document.getElementById('voucherManagementModal');
                    if(vModal) vModal.style.display = 'flex';
                    break;

                case 'sync':
                     if(ProductMgr?.sync) ProductMgr.sync(); 
                     else alert("Erro ao sincronizar: Módulo não carregado.");
                     break;

                case 'settings':
                     if(ProductMgr?.openSettings) ProductMgr.openSettings();
                     else alert("Configurações indisponíveis.");
                     break;

                default:
                    console.warn(`[ManagerHub] Módulo desconhecido: ${moduleName}`);
            }
        } catch (e) {
            console.error(e);
            alert(`Erro ao abrir módulo: ${e.message}`);
        }
    };

    // B. Alias de Compatibilidade (CONECTA O APP.JS AO HUB)
    window.handleGerencialAction = (action, payload) => {
        // Mapeia nomes de ações antigas para os novos módulos
        const actionMap = {
            'openProductHub': 'products',
            'openProductManagement': 'products',
            'openFinancialModule': 'finance', // Mantém financeiro para DRE
            'openCashManagementReport': 'sales', // <--- CORREÇÃO: Aponta para Vendas
            'openHRPanel': 'team',
            'openCustomerCRM': 'crm',
            'openVoucherManagement': 'vouchers',
            'openWooSync': 'sync',
            'openSectorManagement': 'settings'
        };

        const moduleName = actionMap[action] || action;
        window.openManagerModule(moduleName);
    };

    // C. Roteador de Modos de Pedido (Modal Cliente)
    window.switchOrderMode = (mode) => {
        if (DeliveryMgr?.switchTab) DeliveryMgr.switchTab(mode);
    };

    // D. Ações Externas
    window.renderExternalRecruitmentModal = (type) => {
        if (type === 'motoboy') {
            if(DeliveryMgr?.handleCallMotoboy) DeliveryMgr.handleCallMotoboy();
        } else {
            // RH (Chamar Extra)
            if(TeamMgr?.open) {
                TeamMgr.open();
                setTimeout(() => window.switchHRTab('team'), 100); 
            }
        }
    };
};