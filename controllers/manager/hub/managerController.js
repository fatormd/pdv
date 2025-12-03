// --- CONTROLLERS/MANAGER/HUB/MANAGERCONTROLLER.JS (COMPLETO & ATUALIZADO) ---

// 1. IMPORTAÇÃO DOS MÓDULOS
import * as DeliveryMgr from '/controllers/manager/modules/deliveryManager.js';
import * as ProductMgr from '/controllers/manager/modules/productManager.js'; 
import * as FinanceMgr from '/controllers/manager/modules/financeManager.js';
import * as TeamMgr from '/controllers/manager/modules/teamManager.js';
import * as SalesMgr from '/controllers/manager/modules/salesManager.js'; 
import * as CrmMgr from '/controllers/manager/modules/crmManager.js'; 
import * as VoucherMgr from '/controllers/manager/modules/voucherManager.js';
import * as ReservationMgr from '/controllers/manager/modules/reservationManager.js';
import * as SettingsMgr from '/controllers/manager/modules/settingsManager.js'; // <--- NOVO IMPORT

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
        if(SalesMgr?.init) SalesMgr.init();
        if(CrmMgr?.init) CrmMgr.init();
        if(VoucherMgr?.init) VoucherMgr.init();
        if(ReservationMgr?.init) ReservationMgr.init();
        if(SettingsMgr?.init) SettingsMgr.init(); // <--- INICIALIZAÇÃO CONFIGURAÇÕES
    } catch (error) {
        console.error("[ManagerHub] Erro ao inicializar módulos:", error);
    }

    setupGlobalRoutes();
    isInitialized = true;
};

const setupGlobalRoutes = () => {
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

                case 'sales': 
                    if(SalesMgr?.open) SalesMgr.open();
                    else throw new Error("Módulo de Vendas não encontrado.");
                    break;

                case 'team':
                    if(TeamMgr?.open) TeamMgr.open();
                    else throw new Error("Módulo RH não encontrado.");
                    break;
                    
                case 'crm':
                    if(CrmMgr?.open) CrmMgr.open(); 
                    else throw new Error("Módulo CRM não encontrado.");
                    break;

                case 'vouchers':
                    if(VoucherMgr?.open) VoucherMgr.open();
                    else throw new Error("Módulo de Vouchers não encontrado.");
                    break;
                
                case 'reservations':
                    if(ReservationMgr?.open) ReservationMgr.open();
                    else throw new Error("Módulo de Reservas não encontrado.");
                    break;

                case 'sync':
                     if(ProductMgr?.sync) ProductMgr.sync(); 
                     else alert("Erro ao sincronizar: Módulo não carregado.");
                     break;

                case 'settings': // <--- ROTA ATUALIZADA PARA O NOVO MÓDULO
                     if(SettingsMgr?.open) SettingsMgr.open();
                     else throw new Error("Módulo de Configurações não encontrado.");
                     break;

                default:
                    console.warn(`[ManagerHub] Módulo desconhecido: ${moduleName}`);
            }
        } catch (e) {
            console.error(e);
            alert(`Erro ao abrir módulo: ${e.message}`);
        }
    };

    // Alias de Compatibilidade (Mantém o funcionamento dos botões antigos)
    window.handleGerencialAction = (action, payload) => {
        const actionMap = {
            'openProductHub': 'products',
            'openProductManagement': 'products',
            'openFinancialModule': 'finance', 
            'openCashManagementReport': 'sales',
            'openHRPanel': 'team',
            'openCustomerCRM': 'crm',
            'openVoucherManagement': 'vouchers',
            'openWooSync': 'sync',
            'openSectorManagement': 'settings' // Agora aponta para o novo SettingsMgr
        };

        const moduleName = actionMap[action] || action;
        window.openManagerModule(moduleName);
    };

    window.switchOrderMode = (mode) => {
        if (DeliveryMgr?.switchTab) DeliveryMgr.switchTab(mode);
    };

    window.renderExternalRecruitmentModal = (type) => {
        if (type === 'motoboy') {
            if(DeliveryMgr?.handleCallMotoboy) DeliveryMgr.handleCallMotoboy();
        } else {
            if(TeamMgr?.open) {
                TeamMgr.open();
                setTimeout(() => window.switchHRTab('team'), 100); 
            }
        }
    };
};