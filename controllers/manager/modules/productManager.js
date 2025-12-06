// --- CONTROLLERS/MANAGER/MODULES/PRODUCTMANAGER.JS (CONSOLIDADO: 3 ABAS) ---

import { showToast } from "/utils.js";
import { syncWithWooCommerce } from "/services/wooCommerceService.js?v=2";
import * as Store from "./products/store.js";
import * as ProductsTab from "./products/productsTab.js";
import * as IngredientsTab from "./products/ingredientsTab.js";
import * as ProcurementTab from "./products/procurementTab.js";

let managerModal = null;
let currentTab = 'products';

// ==================================================================
//            1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[ProductModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    ProductsTab.setupImageUpload();
};

export const open = async () => {
    await renderProductHub();
};

export const sync = async () => {
    showToast("Sincronizando...", false);
    try {
        await syncWithWooCommerce();
        showToast("Sincronização concluída!", false);
        if(managerModal && managerModal.style.display === 'flex' && currentTab === 'products') {
            switchHubTab('products');
        }
    } catch (e) { console.error(e); showToast("Erro sync.", true); }
};

// ==================================================================
//            2. HUB PRINCIPAL
// ==================================================================

async function renderProductHub(activeTab = 'products') {
    if (!managerModal) return;
    
    await Store.refreshAllCaches();
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3>
                    <p class="text-xs md:text-sm text-gray-400">Cardápio, Estoque e Compras</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button id="tab-products" class="hub-tab-btn flex-1 md:flex-none px-6 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
                    <i class="fas fa-hamburger mr-2"></i> Produtos
                </button>
                <button id="tab-stock" class="hub-tab-btn flex-1 md:flex-none px-6 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
                    <i class="fas fa-boxes mr-2"></i> Estoque
                </button>
                <button id="tab-purchases" class="hub-tab-btn flex-1 md:flex-none px-6 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
                    <i class="fas fa-shopping-cart mr-2"></i> Compras
                </button>
            </div>

            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0 min-h-[60px]"></div>
            
            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative">
                <div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
        <div id="subModalContainer"></div>`;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); managerModal.classList.add('p-0', 'md:p-4');

    document.getElementById('tab-products').onclick = () => switchHubTab('products');
    document.getElementById('tab-stock').onclick = () => switchHubTab('stock');
    document.getElementById('tab-purchases').onclick = () => switchHubTab('purchases');

    await switchHubTab(activeTab);
}

async function switchHubTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.hub-tab-btn').forEach(btn => {
        if(btn.id === `tab-${tab}`) { 
            btn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg'); 
            btn.classList.remove('bg-dark-input', 'text-gray-300'); 
        } 
        else { 
            btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg'); 
            btn.classList.add('bg-dark-input', 'text-gray-300'); 
        }
    });

    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    
    // Limpa a toolbar para evitar botões de outras abas
    toolbarDiv.innerHTML = ''; 
    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';

    if (tab === 'products') await ProductsTab.renderProductListConfig(contentDiv, toolbarDiv);
    else if (tab === 'stock') await IngredientsTab.renderIngredientsScreen(contentDiv, toolbarDiv);
    else if (tab === 'purchases') await ProcurementTab.renderPurchasesDashboard(contentDiv, toolbarDiv);
}