// --- CONTROLLERS/MANAGER/MODULES/PRODUCTMANAGER.JS (VERSÃO FINAL: HIERARQUIA & CONFIG) ---

import { showToast, toggleLoading } from "/utils.js";
import { syncWithWooCommerce } from "/services/wooCommerceService.js?v=2";
import { setDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as Store from "./products/store.js";
import * as ProductsTab from "./products/productsTab.js";
import * as IngredientsTab from "./products/ingredientsTab.js";
import * as ProcurementTab from "./products/procurementTab.js";
import * as StructureTab from "./products/structureTab.js"; // NOVO

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
            
            <div class="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div class="flex items-center">
                    <div class="mr-4">
                        <h3 class="text-xl md:text-2xl font-bold text-white">Gestão Operacional</h3>
                        <p class="text-xs md:text-sm text-gray-400">Recursos e Estrutura</p>
                    </div>
                </div>
                <div class="flex items-center space-x-3">
                    <button id="btnStoreSettings" class="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition" title="Configurações da Loja">
                        <i class="fas fa-cog text-xl"></i>
                    </button>
                    <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
                </div>
            </div>
            
            <div class="flex items-center space-x-1 p-2 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button id="tab-products" class="hub-tab-btn flex-1 md:flex-none px-4 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
                    <i class="fas fa-hamburger mr-2"></i> Produtos
                </button>
                <button id="tab-stock" class="hub-tab-btn flex-1 md:flex-none px-4 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
                    <i class="fas fa-boxes mr-2"></i> Estoque
                </button>
                <button id="tab-structure" class="hub-tab-btn flex-1 md:flex-none px-4 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
                    <i class="fas fa-network-wired mr-2"></i> Setores
                </button>
                <button id="tab-purchases" class="hub-tab-btn flex-1 md:flex-none px-4 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center">
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
    document.getElementById('tab-structure').onclick = () => switchHubTab('structure');
    document.getElementById('tab-purchases').onclick = () => switchHubTab('purchases');
    document.getElementById('btnStoreSettings').onclick = openStoreSettingsModal;

    await switchHubTab(activeTab);
}

async function switchHubTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.hub-tab-btn').forEach(btn => {
        const isActive = btn.id === `tab-${tab}`;
        btn.className = `hub-tab-btn flex-1 md:flex-none px-4 py-3 rounded-lg font-bold text-sm transition flex items-center justify-center ${
            isActive ? 'bg-indigo-600 text-white shadow-lg transform scale-105' : 'bg-dark-input text-gray-400 hover:bg-gray-700'
        }`;
    });

    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    
    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500 animate-pulse"><i class="fas fa-circle-notch fa-spin mr-2"></i> Carregando...</div>';
    toolbarDiv.innerHTML = '';

    if (tab === 'products') await ProductsTab.renderProductListConfig(contentDiv, toolbarDiv);
    else if (tab === 'stock') await IngredientsTab.renderIngredientsScreen(contentDiv, toolbarDiv);
    else if (tab === 'structure') await StructureTab.renderStructureScreen(contentDiv, toolbarDiv);
    else if (tab === 'purchases') await ProcurementTab.renderPurchasesDashboard(contentDiv, toolbarDiv);
}

// --- MODAL DE CONFIGURAÇÃO DA LOJA (SUBSTITUTO DA ABA ANTIGA) ---
async function openStoreSettingsModal() {
    let data = {};
    try {
        const snap = await getDoc(Store.getSettingsRef('store_info'));
        if (snap.exists()) data = snap.data();
    } catch (e) { console.log("Config vazia", e); }

    const html = `
        <div id="storeSettingsModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 rounded-xl w-full max-w-lg shadow-2xl p-6">
                <div class="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <h3 class="text-xl font-bold text-white"><i class="fas fa-store mr-2 text-yellow-500"></i>Configuração da Loja</h3>
                    <button onclick="document.getElementById('storeSettingsModal').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Estabelecimento</label>
                        <input type="text" id="confStoreName" class="input-pdv w-full" value="${data.name || ''}" placeholder="Ex: Minha Loja">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Telefone / WhatsApp</label>
                        <input type="text" id="confStorePhone" class="input-pdv w-full" value="${data.phone || ''}">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Endereço (Rodapé do Cupom)</label>
                        <input type="text" id="confStoreAddress" class="input-pdv w-full" value="${data.address || ''}">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Logo URL</label>
                        <input type="text" id="confStoreLogo" class="input-pdv w-full" value="${data.logo || ''}">
                    </div>
                </div>

                <div class="flex justify-end mt-6 pt-4 border-t border-gray-700">
                    <button id="btnSaveStoreConf" class="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow transition">Salvar Configurações</button>
                </div>
            </div>
        </div>
    `;
    
    Store.getSubModalContainer().innerHTML = html;

    document.getElementById('btnSaveStoreConf').onclick = async () => {
        const btn = document.getElementById('btnSaveStoreConf');
        toggleLoading(btn, true, 'Salvando...');
        try {
            const payload = {
                name: document.getElementById('confStoreName').value,
                phone: document.getElementById('confStorePhone').value,
                address: document.getElementById('confStoreAddress').value,
                logo: document.getElementById('confStoreLogo').value,
                updatedAt: serverTimestamp()
            };
            await setDoc(Store.getSettingsRef('store_info'), payload, { merge: true });
            showToast("Loja configurada!");
            document.getElementById('storeSettingsModal').remove();
        } catch(e) { console.error(e); showToast("Erro.", true); } 
        finally { toggleLoading(btn, false); }
    };
}