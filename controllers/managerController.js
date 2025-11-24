// --- CONTROLLERS/MANAGERCONTROLLER.JS ---
// VERSÃO FINAL COMPLETA - MOBILE FIRST & HIERARQUIA

import { 
    db, appId, 
    getVouchersCollectionRef, 
    getQuickObsCollectionRef, 
    getTablesCollectionRef, 
    getCustomersCollectionRef, 
    getSectorsCollectionRef, 
    getSystemStatusDocRef, 
    getFinancialGoalsDocRef 
} from "/services/firebaseService.js";

import { 
    collection, query, where, getDocs, orderBy, Timestamp, 
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js";
import { 
    syncWithWooCommerce, getProducts, getCategories, 
    createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts, 
    createWooCategory, updateWooCategory, deleteWooCategory 
} from "/services/wooCommerceService.js";

// --- VARIÁVEIS DE ESTADO ---
let managerModal; 
let managerAuthCallback;
let voucherManagementModal, voucherListContainer, voucherForm;
let reportDateInput;
let managerControllerInitialized = false;

// --- INICIALIZAÇÃO ---
export const initManagerController = () => {
    if (managerControllerInitialized) return;
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    if (managerModal) {
        managerModal.addEventListener('click', (e) => {
             if (e.target === managerModal) managerModal.style.display = 'none';
        });
    }

    // Vouchers
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    document.getElementById('showVoucherFormBtn')?.addEventListener('click', () => { 
        if(voucherForm) { voucherForm.style.display = 'block'; voucherForm.reset(); }
    });
    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);

    // Relatórios
    reportDateInput = document.getElementById('reportDateInput');
    if (reportDateInput) {
        reportDateInput.valueAsDate = new Date(); 
        reportDateInput.addEventListener('change', loadReports);
    }
    document.getElementById('refreshReportBtn')?.addEventListener('click', loadReports);

    // Listeners das Abas de Relatório
    const tabBtns = document.querySelectorAll('.report-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => { 
                b.classList.remove('bg-indigo-600', 'text-white'); 
                b.classList.add('bg-dark-input', 'text-gray-300'); 
            });
            btn.classList.remove('bg-dark-input', 'text-gray-300'); 
            btn.classList.add('bg-indigo-600', 'text-white');
            
            document.querySelectorAll('.report-content').forEach(c => c.classList.add('hidden'));
            const targetContent = document.getElementById(`tab-${btn.dataset.tab}`);
            if(targetContent) targetContent.classList.remove('hidden');
            
            if (btn.dataset.tab === 'sales') {
                fetchMonthlyPerformance(); 
            }
            loadReports();
        });
    });

    managerControllerInitialized = true;
};

// --- ROTEADOR DE AÇÕES ---
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Ação: ${action}`);
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openWaiterReg': openUserManagementModal(); break;
        
        case 'openProductHub': 
            renderProductHub(payload || 'products'); 
            break;
        case 'openQuickObsManagement': 
            renderProductHub('obs'); 
            break;
        case 'openProductManagement': 
             renderProductHub('products');
             break;

        case 'openVoucherManagement': openVoucherManagementModal(); break;
        case 'openSectorManagement': renderSectorManagementModal(); break;
        case 'openWooSync': syncWithWooCommerce(); break;
        
        case 'openCashManagementReport': openReportPanel('active-shifts'); break;
        case 'openHouse': handleOpenHouse(); break;
        case 'closeDay': handleCloseDay(); break;
        case 'exportCsv': exportSalesToCSV(); break;

        case 'openCustomerCRM': renderCustomerCrmModal(); break;

        case 'openInventoryManagement': renderProductHub('inventory'); break;
        case 'openRecipesManagement': renderProductHub('recipes'); break;

        default: console.warn(`Ação não mapeada: ${action}`);
    }
};


// =================================================================
//           GESTÃO DE PRODUTOS (HUB MOBILE-FIRST)
// =================================================================
const renderProductHub = async (activeTab = 'products') => {
    if (!managerModal) return;
    
    const categories = getCategories();
    let catOptions = '<option value="all">Todas as Categorias</option>';
    if (categories.length > 0) {
        categories.forEach(c => {
            if(c.id !== 'all' && c.id !== 'top10') {
                catOptions += `<option value="${c.id}">${c.name}</option>`;
            }
        });
    }

    // LAYOUT: Fullscreen no mobile (h-full w-full rounded-none), Card no desktop
    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3>
                    <p class="text-xs md:text-sm text-gray-400">Produtos, Ficha, Categorias e Estoque</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>

            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" data-tab="products">
                    <i class="fas fa-box mr-2"></i> Produtos
                </button>
                <button class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center" data-tab="categories">
                    <i class="fas fa-layer-group mr-2"></i> Categorias
                </button>
            </div>

            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0">
                </div>

            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative">
                <div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;
    
    managerModal.style.display = 'flex';
    // Remover padding do container pai no mobile (opcional, mas ajuda no full screen)
    managerModal.classList.remove('p-4');
    managerModal.classList.add('p-0', 'md:p-4');

    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    const tabs = document.querySelectorAll('.hub-tab-btn');

    const switchTab = async (tabName) => {
        tabs.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('bg-indigo-600', 'text-white');
                btn.classList.remove('bg-dark-input', 'text-gray-300', 'hover:bg-gray-700');
            } else {
                btn.classList.remove('bg-indigo-600', 'text-white');
                btn.classList.add('bg-dark-input', 'text-gray-300', 'hover:bg-gray-700');
            }
        });

        contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';

        if (tabName === 'products') {
            // TOOLBAR PRODUTOS
            toolbarDiv.innerHTML = `
                <div class="flex items-center space-x-2 w-full md:w-auto">
                    <select id="hubCategoryFilter" class="bg-gray-700 text-white text-sm py-3 px-3 rounded-lg border border-gray-600 w-full md:w-[200px]">
                        ${catOptions}
                    </select>
                </div>
                <div class="flex items-center space-x-2 w-full md:w-auto">
                    <div class="relative w-full md:w-64">
                        <input type="text" id="hubSearchInput" placeholder="Pesquisar..." class="bg-dark-input text-white text-sm py-3 pl-3 pr-8 rounded-lg border border-gray-600 w-full focus:border-indigo-500">
                        <i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    </div>
                    <button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center whitespace-nowrap">
                        <i class="fas fa-plus mr-2"></i> <span class="hidden md:inline">Novo</span>
                    </button>
                </div>
            `;
            
            document.getElementById('hubNewProductBtn').onclick = () => renderProductForm(null, contentDiv, () => renderProductList(contentDiv, 'all', ''));
            const catSelect = document.getElementById('hubCategoryFilter');
            const searchInput = document.getElementById('hubSearchInput');
            
            catSelect.onchange = (e) => renderProductList(contentDiv, e.target.value, searchInput.value);
            searchInput.oninput = (e) => renderProductList(contentDiv, catSelect.value, e.target.value);
            
            await renderProductList(contentDiv, 'all', '');

        } else if (tabName === 'categories') {
            // TOOLBAR CATEGORIAS
            toolbarDiv.innerHTML = `
                <div class="flex-grow"></div>
                <button id="hubNewRootCatBtn" class="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center">
                    <i class="fas fa-plus mr-2"></i> Nova Categoria
                </button>
            `;
            
            document.getElementById('hubNewRootCatBtn').onclick = () => renderCategoryForm(null, contentDiv, () => renderCategoryManagement(contentDiv));
            await renderCategoryManagement(contentDiv);
        }
    };

    tabs.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    switchTab(activeTab === 'inventory' || activeTab === 'recipes' || activeTab === 'obs' ? 'products' : activeTab);
};

// --- 1. LISTA DE PRODUTOS ---
const renderProductList = async (container, catFilter, searchTerm) => {
    let products = getProducts();
    if (!products || products.length === 0) products = await fetchWooCommerceProducts();

    if (catFilter && catFilter !== 'all') {
        products = products.filter(p => p.categoryId == catFilter);
    }
    if (searchTerm) {
        products = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    const listHtml = products.map(p => `
        <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700 hover:border-gray-500 transition group">
            <div class="flex items-center space-x-3 overflow-hidden">
                <div class="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-600">
                    <img src="${p.image || 'https://placehold.co/50'}" class="w-full h-full object-cover">
                </div>
                <div class="min-w-0">
                    <h4 class="font-bold text-white text-sm truncate">${p.name}</h4>
                    <div class="flex items-center text-xs space-x-2 mt-1">
                        <span class="text-green-400 font-mono bg-green-900/30 px-1.5 py-0.5 rounded">${formatCurrency(p.price)}</span>
                        ${p.status !== 'publish' ? '<span class="text-yellow-500 bg-yellow-900/30 px-1.5 rounded">Oculto</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="flex space-x-2 flex-shrink-0">
                <button class="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-sm btn-edit-prod shadow" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                <button class="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg text-sm btn-del-prod shadow" data-id="${p.id}"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');

    container.innerHTML = `<div class="pb-20">${products.length ? listHtml : '<p class="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>'}</div>`;

    container.querySelectorAll('.btn-edit-prod').forEach(btn => 
        btn.onclick = () => renderProductForm(products.find(p => p.id == btn.dataset.id), container, () => renderProductList(container, catFilter, searchTerm))
    );
    container.querySelectorAll('.btn-del-prod').forEach(btn => 
        btn.onclick = () => handleDeleteProduct(btn.dataset.id, () => renderProductList(container, catFilter, searchTerm))
    );
};

// --- 2. CATEGORIAS ---
const renderCategoryManagement = async (container) => {
    const categories = getCategories();
    
    const buildTreeHtml = (parentId = 0, level = 0) => {
        const children = categories.filter(c => c.parent == parentId && c.id !== 'all' && c.id !== 'top10');
        if (children.length === 0) return '';

        let html = `<div class="space-y-1 ${level > 0 ? 'ml-4 border-l-2 border-gray-700 pl-3 mt-1' : ''}">`;
        
        children.forEach(cat => {
            html += `
                <div class="group">
                    <div class="flex justify-between items-center bg-dark-input hover:bg-gray-700 p-3 rounded border border-gray-700 transition">
                        <div class="flex items-center overflow-hidden">
                            <i class="fas ${level === 0 ? 'fa-folder text-yellow-500' : 'fa-level-up-alt rotate-90 text-gray-500'} mr-2 flex-shrink-0"></i>
                            <span class="text-white font-bold truncate text-sm">${cat.name}</span>
                        </div>
                        <div class="flex space-x-1 flex-shrink-0">
                            <button class="bg-green-700 text-white p-2 rounded btn-add-sub" data-id="${cat.id}" data-name="${cat.name}" title="Sub"><i class="fas fa-plus"></i></button>
                            <button class="bg-blue-600 text-white p-2 rounded btn-edit-cat" data-id="${cat.id}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="bg-red-600 text-white p-2 rounded btn-del-cat" data-id="${cat.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    ${buildTreeHtml(cat.id, level + 1)}
                </div>
            `;
        });
        html += '</div>';
        return html;
    };

    container.innerHTML = `<div class="pb-20">${buildTreeHtml(0, 0)}</div>`;

    container.querySelectorAll('.btn-add-sub').forEach(btn => {
        btn.onclick = () => renderCategoryForm({ parent: btn.dataset.id, parentName: btn.dataset.name }, container, () => renderCategoryManagement(container));
    });
    container.querySelectorAll('.btn-edit-cat').forEach(btn => {
        btn.onclick = () => {
            const cat = categories.find(c => c.id == btn.dataset.id);
            renderCategoryForm(cat, container, () => renderCategoryManagement(container));
        };
    });
    container.querySelectorAll('.btn-del-cat').forEach(btn => {
        btn.onclick = async () => {
            if(confirm("Excluir categoria?")) {
                try { await deleteWooCategory(btn.dataset.id); renderCategoryManagement(container); } 
                catch(e) { alert(e.message); }
            }
        };
    });
};

const renderCategoryForm = (category = null, container, onBack) => {
    const isEdit = category && category.id;
    const parentId = category?.parent || 0;
    const parentName = category?.parentName || (parentId == 0 ? 'Raiz' : getCategories().find(c => c.id == parentId)?.name);

    container.innerHTML = `
        <div class="max-w-md mx-auto bg-dark-input p-6 rounded-xl border border-gray-700 mt-4">
            <h4 class="text-xl font-bold text-white mb-4">${isEdit ? 'Editar Categoria' : 'Nova Subcategoria'}</h4>
            <p class="text-sm text-gray-400 mb-4">Pai: <strong class="text-pumpkin">${parentName}</strong></p>
            
            <form id="catForm" class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Nome</label>
                    <input type="text" id="catName" class="input-pdv w-full p-3" value="${isEdit ? category.name : ''}" required autofocus>
                </div>
                <div class="flex space-x-3 pt-4">
                    <button type="button" id="btnCancelCat" class="flex-1 bg-gray-600 text-white py-3 rounded">Cancelar</button>
                    <button type="submit" class="flex-1 bg-green-600 text-white py-3 rounded font-bold">Salvar</button>
                </div>
            </form>
        </div>
    `;

    container.querySelector('#btnCancelCat').onclick = onBack;
    container.querySelector('#catForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('catName').value.trim();
        if(!name) return;
        try {
            if (isEdit && category.id) await updateWooCategory(category.id, { name });
            else await createWooCategory(name, parentId);
            onBack();
        } catch (err) { alert("Erro: " + err.message); }
    };
};

// --- HELPER: HIERARQUIA ---
const getFormattedCategoryOptions = (categories, selectedId) => {
    let html = '';
    const buildOptions = (parentId = 0, level = 0) => {
        const children = categories.filter(c => c.parent == parentId && c.id !== 'all' && c.id !== 'top10');
        children.forEach(c => {
            const prefix = '&nbsp;&nbsp;'.repeat(level) + (level > 0 ? '↳ ' : '');
            const isSelected = c.id == selectedId ? 'selected' : '';
            html += `<option value="${c.id}" ${isSelected}>${prefix}${c.name}</option>`;
            buildOptions(c.id, level + 1);
        });
    };
    buildOptions(0, 0);
    return html;
};

// --- 3. FORMULÁRIO DE PRODUTO COMPLETO (MOBILE FIRST) ---
const renderProductForm = async (product = null, container, onBack) => {
    const isEdit = !!product;
    const catOptions = getFormattedCategoryOptions(getCategories(), product?.categoryId);
    
    const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), where('type', '==', 'production'), orderBy('name')));
    const sectors = sectorsSnap.docs.map(d => d.data().name);

    // Layout Mobile-First: h-full, sem padding extra, botões grandes
    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0">
                <h4 class="text-lg font-bold text-white flex items-center truncate">
                    <i class="fas ${isEdit ? 'fa-edit text-blue-400' : 'fa-plus-circle text-green-400'} mr-2"></i>
                    ${isEdit ? 'Editar' : 'Novo'}
                </h4>
                <button id="btnBackToHub" class="text-gray-400 hover:text-white flex items-center text-sm py-2 px-3 rounded bg-gray-800">
                    <i class="fas fa-arrow-left mr-1"></i> Voltar
                </button>
            </div>

            <div class="flex space-x-2 mb-4 overflow-x-auto pb-2 flex-shrink-0">
                <button class="form-tab-btn px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-bold whitespace-nowrap" data-target="tab-general">Geral</button>
                <button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-hierarchy">Hierarquia</button>
                <button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-recipe">Ficha/Estoque</button>
                <button class="form-tab-btn px-4 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-bold whitespace-nowrap" data-target="tab-obs">Obs</button>
            </div>

            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 pb-20">
                <form id="productForm" class="space-y-6">
                    
                    <div id="tab-general" class="form-tab-content">
                        <div class="space-y-4">
                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Produto</label><input type="text" id="prodName" class="input-pdv w-full text-lg p-3" value="${product?.name || ''}" required></div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Preço (R$)</label><input type="number" id="prodPrice" class="input-pdv w-full font-mono text-green-400 font-bold text-lg p-3" step="0.01" value="${product?.price || ''}" required></div>
                                <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Promo (R$)</label><input type="number" id="prodRegPrice" class="input-pdv w-full font-mono text-yellow-400 text-lg p-3" step="0.01" value="${product?.regular_price || ''}"></div>
                            </div>

                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Status</label><select id="prodStatus" class="input-pdv w-full p-3"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho</option></select></div>
                            
                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">URL Imagem</label><input type="text" id="prodImg" class="input-pdv w-full text-xs p-3" value="${product?.image || ''}" placeholder="https://..."></div>
                            
                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Descrição</label><textarea id="prodDesc" class="input-pdv w-full text-sm p-3" rows="3">${product?.description || ''}</textarea></div>
                        </div>
                    </div>

                    <div id="tab-hierarchy" class="form-tab-content hidden">
                        <div class="bg-gray-800 p-4 rounded-xl border border-gray-600 space-y-4">
                            <p class="text-sm text-pumpkin font-bold uppercase mb-2">Classificação</p>
                            
                            <div><label class="text-xs text-gray-500 block mb-1">1. Grupo</label><select id="catLvl1" class="input-pdv w-full text-sm p-2"></select></div>
                            <div><label class="text-xs text-gray-500 block mb-1">2. Subgrupo</label><select id="catLvl2" class="input-pdv w-full text-sm p-2" disabled></select></div>
                            <div><label class="text-xs text-gray-500 block mb-1">3. Categoria</label><select id="catLvl3" class="input-pdv w-full text-sm p-2" disabled></select></div>
                            <div><label class="text-xs text-gray-500 block mb-1">4. Variação</label><select id="catLvl4" class="input-pdv w-full text-sm p-2" disabled></select></div>
                            
                            <input type="hidden" id="finalCategoryId" value="${product?.categoryId || ''}">
                            <div class="pt-4 border-t border-gray-600">
                                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor de Produção (KDS)</label>
                                <select id="prodSector" class="input-pdv w-full p-2">${sectors.length > 0 ? sectors.map(s => `<option value="${s}">${s}</option>`).join('') : '<option value="cozinha">Cozinha</option>'}</select>
                            </div>
                        </div>
                    </div>

                    <div id="tab-recipe" class="form-tab-content hidden space-y-6">
                        <div class="bg-gray-800 p-4 rounded-xl border border-gray-600 text-center">
                            <p class="text-gray-400 mb-2 text-sm uppercase font-bold">Estoque Atual</p>
                            <div class="flex items-center justify-center space-x-4">
                                <button type="button" class="w-12 h-12 rounded-lg bg-red-600 text-white text-xl font-bold"><i class="fas fa-minus"></i></button>
                                <input type="number" class="input-pdv text-center text-3xl w-32 font-mono bg-transparent border-b border-gray-500" value="0">
                                <button type="button" class="w-12 h-12 rounded-lg bg-green-600 text-white text-xl font-bold"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>

                        <div class="bg-gray-800 p-4 rounded-xl border border-gray-600">
                            <label class="flex items-center space-x-3 cursor-pointer mb-4"><input type="checkbox" id="isComposite" class="w-6 h-6 rounded bg-dark-input border-gray-500 text-indigo-600"><span class="text-white font-bold">Produto Composto?</span></label>
                            <div class="space-y-2">
                                <h5 class="text-xs font-bold text-gray-500 uppercase">Insumos</h5>
                                <div class="text-sm text-gray-400 italic bg-dark-bg p-3 rounded">Nenhum insumo vinculado.</div>
                                <button type="button" class="text-xs bg-indigo-600 text-white px-3 py-3 rounded w-full font-bold mt-2">Adicionar Insumo (Dev)</button>
                            </div>
                        </div>
                    </div>

                    <div id="tab-obs" class="form-tab-content hidden">
                        <div class="bg-gray-800 p-4 rounded-xl border border-gray-600">
                            <p class="text-sm text-gray-300 mb-3">Obs. específicas deste produto.</p>
                            <div class="flex space-x-2 mb-4"><input type="text" id="newQuickObsInput" placeholder="Nova obs..." class="input-pdv w-full text-sm p-3"><button type="button" id="btnAddQuickObs" class="bg-green-600 text-white px-4 rounded-lg font-bold"><i class="fas fa-plus"></i></button></div>
                            <div id="quickObsListSmall" class="grid grid-cols-2 gap-2"></div>
                        </div>
                    </div>

                </form>
            </div>

            <div class="border-t border-gray-700 pt-4 mt-auto flex space-x-3 flex-shrink-0 bg-dark-bg">
                <button type="button" id="btnCancelForm" class="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition">Cancelar</button>
                <button type="button" id="btnSaveProduct" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center"><i class="fas fa-save mr-2"></i> Salvar</button>
            </div>
        </div>
    `;

    // Lógica de Abas
    const tabBtns = container.querySelectorAll('.form-tab-btn');
    const tabContents = container.querySelectorAll('.form-tab-content');
    tabBtns.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            tabBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-gray-700', 'text-gray-300'); });
            btn.classList.remove('bg-gray-700', 'text-gray-300'); btn.classList.add('bg-indigo-600', 'text-white');
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(btn.dataset.target).classList.remove('hidden');
        };
    });

    // LÓGICA DOS SELECTS HIERÁRQUICOS (CASCATA)
    const allCats = getCategories();
    const selects = [document.getElementById('catLvl1'), document.getElementById('catLvl2'), document.getElementById('catLvl3'), document.getElementById('catLvl4')];
    const finalIdInput = document.getElementById('finalCategoryId');

    // Helper para achar caminho
    const getPath = (id) => {
        let path = []; let curr = allCats.find(c => c.id == id);
        while(curr) { path.unshift(curr.id); curr = allCats.find(c => c.id == curr.parent); }
        return path;
    };
    const currentPath = product?.categoryId ? getPath(product.categoryId) : [];

    const populateSelect = (levelIndex, parentId) => {
        const select = selects[levelIndex];
        select.innerHTML = '<option value="">Selecione...</option>';
        const children = allCats.filter(c => c.parent == parentId && c.id !== 'all' && c.id !== 'top10');
        if (children.length === 0) { select.disabled = true; } 
        else {
            select.disabled = false;
            children.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.name; select.appendChild(opt); });
        }
        for(let i = levelIndex + 1; i < 4; i++) { selects[i].innerHTML = ''; selects[i].disabled = true; }
    };

    selects.forEach((sel, idx) => {
        sel.onchange = () => {
            const selectedVal = sel.value;
            if (selectedVal) {
                finalIdInput.value = selectedVal;
                if (idx < 3) populateSelect(idx + 1, selectedVal);
            } else {
                finalIdInput.value = idx > 0 ? selects[idx-1].value : '';
                for(let i = idx + 1; i < 4; i++) { selects[i].innerHTML = ''; selects[i].disabled = true; }
            }
        };
    });

    // Init Cascata
    populateSelect(0, 0);
    if (currentPath.length > 0) {
        selects[0].value = currentPath[0]; populateSelect(1, currentPath[0]);
        if (currentPath[1]) { selects[1].value = currentPath[1]; populateSelect(2, currentPath[1]); }
        if (currentPath[2]) { selects[2].value = currentPath[2]; populateSelect(3, currentPath[2]); }
        if (currentPath[3]) { selects[3].value = currentPath[3]; }
    }

    // Lógica Mini Obs
    const loadMiniObs = async () => {
        const containerObs = document.getElementById('quickObsListSmall');
        const snap = await getDocs(query(getQuickObsCollectionRef(), orderBy('text')));
        containerObs.innerHTML = snap.docs.map(d => `<div class="flex justify-between items-center bg-dark-bg p-2 rounded border border-gray-600"><span class="text-xs text-gray-300">${d.data().text}</span><button type="button" class="text-red-400 hover:text-white text-xs btn-del-mini-obs" data-id="${d.id}">&times;</button></div>`).join('');
        containerObs.querySelectorAll('.btn-del-mini-obs').forEach(btn => btn.onclick = async () => { if(confirm("Apagar?")) { await deleteDoc(doc(getQuickObsCollectionRef(), btn.dataset.id)); loadMiniObs(); }});
    };
    document.getElementById('btnAddQuickObs').onclick = async () => {
        const val = document.getElementById('newQuickObsInput').value.trim();
        if(val) { await setDoc(doc(getQuickObsCollectionRef(), val.toLowerCase().replace(/[^a-z0-9]/g, '')), { text: val }); document.getElementById('newQuickObsInput').value = ''; loadMiniObs(); }
    };
    loadMiniObs();

    // Salvar
    document.getElementById('btnSaveProduct').onclick = async () => {
        const submitBtn = document.getElementById('btnSaveProduct');
        submitBtn.disabled = true; submitBtn.innerHTML = 'Salvando...';
        const selectedCatId = finalIdInput.value; 
        const data = {
            name: document.getElementById('prodName').value,
            regular_price: document.getElementById('prodRegPrice').value,
            price: document.getElementById('prodPrice').value,
            categories: selectedCatId ? [{ id: parseInt(selectedCatId) }] : [],
            status: document.getElementById('prodStatus').value,
            description: document.getElementById('prodDesc').value,
            images: [{ src: document.getElementById('prodImg').value }],
            meta_data: [ { key: 'sector', value: document.getElementById('prodSector').value }, { key: 'is_composite', value: document.getElementById('isComposite').checked ? 'yes' : 'no' } ]
        };
        try { if(isEdit) await updateWooProduct(product.id, data); else await createWooProduct(data); alert("Salvo!"); if(onBack) onBack(); } 
        catch(e) { alert(e.message); submitBtn.disabled = false; submitBtn.innerHTML = 'Salvar'; }
    };
    document.getElementById('btnBackToHub').onclick = onBack;
    document.getElementById('btnCancelForm').onclick = onBack;
};

const handleDeleteProduct = async (id, callback) => { if(confirm("Excluir?")) { try { await deleteWooProduct(id); if(callback) callback(); } catch(e) { alert(e.message); } } };

// =================================================================
//              OUTROS MÓDULOS (MANTIDOS)
// =================================================================
const openReportPanel = (tabName = 'active-shifts') => {
    const modal = document.getElementById('reportsModal');
    if(modal) { modal.style.display = 'flex'; const btn = document.querySelector(`.report-tab-btn[data-tab="${tabName}"]`); if(btn) btn.click(); else loadReports(); }
};
const loadReports = async () => {
    if (!reportDateInput) return; const dateVal = reportDateInput.value; if(!dateVal) return;
    const startOfDay = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); const endOfDay = Timestamp.fromDate(new Date(dateVal + 'T23:59:59'));
    const dateEl = document.getElementById('salesTodayDate'); if (dateEl) dateEl.textContent = new Date(dateVal).toLocaleDateString('pt-BR');
    try { await Promise.all([ fetchActiveShifts(), fetchClosedShifts(startOfDay, endOfDay), fetchDailySales(startOfDay, endOfDay) ]); } catch (e) { console.error(e); }
};
const fetchActiveShifts = async () => {
    const container = document.getElementById('activeShiftsContainer'); if (!container) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('status', '==', 'open'));
    const snap = await getDocs(q); if (snap.empty) { container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8 italic">Nenhum caixa aberto.</p>'; return; }
    container.innerHTML = snap.docs.map(doc => { const s = doc.data(); const openTime = s.openedAt?.toDate ? s.openedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'; return `<div class="bg-gray-800 border border-green-500/50 rounded-xl p-5 shadow-lg relative flex flex-col"><div class="absolute top-3 right-3"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900 text-green-300 border border-green-700 animate-pulse">Ativo</span></div><div class="flex items-center mb-4"><div class="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl mr-4 border border-gray-600"><i class="fas fa-user-circle text-green-400"></i></div><div><h5 class="text-white font-bold text-lg leading-tight">${s.userName || 'Operador'}</h5><p class="text-xs text-gray-400 mt-1">Aberto às ${openTime}</p></div></div><div class="bg-gray-900/50 rounded-lg p-3 mb-4 border border-gray-700"><div class="flex justify-between text-sm mb-1"><span class="text-gray-400">Fundo Inicial:</span><span class="text-white font-mono font-bold">${formatCurrency(s.initialBalance || 0)}</span></div></div></div>`; }).join('');
};
const fetchClosedShifts = async (start, end) => {
    const container = document.getElementById('closedShiftsContainer'); if (!container) return;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), where('status', '==', 'closed'), where('openedAt', '>=', start), where('openedAt', '<', end), orderBy('openedAt', 'desc'));
    const snap = await getDocs(q); if (snap.empty) { container.innerHTML = '<p class="text-gray-500 text-center py-8 italic">Nenhum caixa fechado.</p>'; return; }
    container.innerHTML = snap.docs.map(doc => { const s = doc.data(); const diff = s.difference || 0; const diffColor = diff < -0.5 ? 'text-red-400' : (diff > 0.5 ? 'text-blue-400' : 'text-green-500'); const openTime = s.openedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); const closeTime = s.closedAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); return `<div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-750 transition"><div class="flex items-center w-full md:w-1/3"><div class="mr-4 text-gray-500 bg-gray-900 h-10 w-10 flex items-center justify-center rounded-full"><i class="fas fa-history"></i></div><div><h4 class="text-white font-bold text-base">${s.userName}</h4><p class="text-xs text-gray-400"><i class="far fa-clock mr-1"></i> ${openTime} - ${closeTime}</p></div></div><div class="flex space-x-2 w-full md:w-2/3 justify-between md:justify-end items-center bg-gray-900/30 p-2 rounded-lg md:bg-transparent md:p-0"><div class="text-right px-2 md:px-4 border-r border-gray-700"><p class="text-[10px] text-gray-500 uppercase tracking-wider">Vendas</p><p class="text-white font-bold text-sm">${formatCurrency(s.reportSalesMoney + s.reportSalesDigital)}</p></div><div class="text-right px-2 md:px-4 border-r border-gray-700"><p class="text-[10px] text-gray-500 uppercase tracking-wider">Quebra</p><p class="${diffColor} font-bold text-sm">${formatCurrency(diff)}</p></div><button onclick="window.openShiftDetails('${doc.id}')" class="ml-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center"><i class="fas fa-list mr-1"></i> Ver Vendas</button></div></div>`; }).join('');
};
window.openShiftDetails = async (shiftId) => {
    const modal = document.getElementById('shiftDetailsModal'); const tableBody = document.getElementById('shiftSalesTableBody'); const header = document.getElementById('shiftDetailsHeader');
    if (!modal || !tableBody) return; modal.style.display = 'flex'; tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Carregando...</td></tr>';
    try { const shiftSnap = await getDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), shiftId)); if (!shiftSnap.exists()) throw new Error("Turno não encontrado."); const shift = shiftSnap.data(); header.textContent = `${shift.userName} | ${shift.openedAt.toDate().toLocaleString()}`; const tablesQ = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', shift.openedAt), where('closedAt', '<=', shift.closedAt), orderBy('closedAt', 'desc')); const snapshot = await getDocs(tablesQ); if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500 italic">Nenhuma venda.</td></tr>'; return; }
        tableBody.innerHTML = snapshot.docs.map(docSnap => { const table = docSnap.data(); let tableTotal = 0; (table.payments || []).forEach(p => { const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(val)) tableTotal += val; }); return `<tr class="hover:bg-gray-700 transition border-b border-gray-800 cursor-pointer" onclick="window.showOrderDetails('${docSnap.id}')"><td class="p-3 text-gray-300">${table.closedAt ? table.closedAt.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}</td><td class="p-3 font-bold text-white">Mesa ${table.tableNumber}</td><td class="p-3 text-gray-400 text-sm">${table.waiterId || table.closedBy || 'Staff'}</td><td class="p-3 text-right text-green-400 font-bold">${formatCurrency(tableTotal)}</td></tr>`; }).join('');
    } catch (e) { tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Erro: ${e.message}</td></tr>`; }
};
const fetchDailySales = async (start, end) => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<', end)); const snapshot = await getDocs(q); let totalSales = 0, totalMoney = 0, totalDigital = 0, count = 0; const productStats = {}; const salesByHour = {}; const salesByWaiter = {};
    snapshot.forEach(docSnap => { const table = docSnap.data(); let tableTotal = 0; count++; (table.payments || []).forEach(p => { const val = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(val)) { tableTotal += val; if (p.method.toLowerCase().includes('dinheiro')) totalMoney += val; else totalDigital += val; } }); totalSales += tableTotal; if (table.sentItems) { table.sentItems.forEach(item => { const id = item.id; if (!productStats[id]) { productStats[id] = { name: item.name, qty: 0 }; } productStats[id].qty += 1; }); } if (table.closedAt) { const hour = table.closedAt.toDate().getHours(); const hourKey = `${hour}h - ${hour+1}h`; salesByHour[hourKey] = (salesByHour[hourKey] || 0) + 1; } const waiter = table.waiterId || table.closedBy || 'Não Identificado'; salesByWaiter[waiter] = (salesByWaiter[waiter] || 0) + tableTotal; });
    document.getElementById('reportTotalSales').textContent = formatCurrency(totalSales); document.getElementById('reportTotalMoney').textContent = formatCurrency(totalMoney); document.getElementById('reportTotalDigital').textContent = formatCurrency(totalDigital); document.getElementById('reportTicketMedio').textContent = formatCurrency(count > 0 ? totalSales / count : 0);
    const topProducts = Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 10); const top10Ids = Object.keys(productStats).sort((a, b) => productStats[b].qty - productStats[a].qty).slice(0, 10); localStorage.setItem('top10_products', JSON.stringify(top10Ids));
    const topListEl = document.getElementById('topProductsList'); if(topListEl) topListEl.innerHTML = topProducts.length ? topProducts.map((p, i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300"><b class="text-pumpkin mr-2">#${i+1}</b> ${p.name}</span><span class="font-mono text-white font-bold">${p.qty}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem dados.</p>';
    let peakHour = '--:--'; let peakCount = 0; Object.entries(salesByHour).forEach(([hour, count]) => { if(count > peakCount) { peakCount = count; peakHour = hour; } }); document.getElementById('peakHourDisplay').textContent = peakHour; document.getElementById('peakHourVolume').textContent = `${peakCount} vendas`;
    const teamListEl = document.getElementById('teamPerformanceList'); if (teamListEl) { const sortedTeam = Object.entries(salesByWaiter).sort(([,a], [,b]) => b - a); teamListEl.innerHTML = sortedTeam.length ? sortedTeam.map(([name, total], i) => `<div class="flex justify-between items-center text-sm border-b border-gray-700 pb-1 last:border-0"><span class="text-gray-300 truncate"><b class="text-blue-400 mr-2">${i+1}.</b> ${name}</span><span class="font-mono text-white font-bold text-xs">${formatCurrency(total)}</span></div>`).join('') : '<p class="text-xs text-gray-500 italic">Sem vendas.</p>'; }
};
const fetchMonthlyPerformance = async () => {
    const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); try { const goalSnap = await getDoc(getFinancialGoalsDocRef()); const meta = goalSnap.exists() ? (goalSnap.data().monthlyGoal || 0) : 0; const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', Timestamp.fromDate(startOfMonth)), where('closedAt', '<=', Timestamp.fromDate(endOfMonth))); const snapshot = await getDocs(q); let totalMonth = 0; snapshot.forEach(doc => { (doc.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if (!isNaN(v)) totalMonth += v; }); }); const percent = meta > 0 ? Math.min(100, (totalMonth / meta) * 100) : 0; const missing = Math.max(0, meta - totalMonth); const projection = now.getDate() > 0 ? (totalMonth / now.getDate()) * endOfMonth.getDate() : 0; document.getElementById('monthSoldDisplay').textContent = formatCurrency(totalMonth); document.getElementById('monthGoalDisplay').textContent = formatCurrency(meta); document.getElementById('monthMissing').textContent = formatCurrency(missing); document.getElementById('monthProjection').textContent = formatCurrency(projection); document.getElementById('monthProgressBar').style.width = `${percent}%`; } catch (e) { console.error(e); }
};
window.setMonthlyGoal = async () => { const newVal = prompt("Defina a Meta de Vendas (R$):"); if (newVal) { const numVal = parseFloat(newVal.replace('.','').replace(',','.')); if (!isNaN(numVal)) { await setDoc(getFinancialGoalsDocRef(), { monthlyGoal: numVal }, { merge: true }); fetchMonthlyPerformance(); } } };
window.runDateComparison = async () => { const dateA = document.getElementById('compDateA').value; const dateB = document.getElementById('compDateB').value; if (!dateA || !dateB) { alert("Selecione datas."); return; } const getDayTotal = async (dateStr) => { const start = Timestamp.fromDate(new Date(dateStr + 'T00:00:00')); const end = Timestamp.fromDate(new Date(dateStr + 'T23:59:59')); const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); const snap = await getDocs(q); let total = 0; snap.forEach(d => { (d.data().payments || []).forEach(p => { const v = parseFloat(p.value.toString().replace(/[^\d,.-]/g,'').replace(',','.')); if(!isNaN(v)) total += v; }); }); return total; }; const [totalA, totalB] = await Promise.all([getDayTotal(dateA), getDayTotal(dateB)]); document.getElementById('compValueA').textContent = formatCurrency(totalA); document.getElementById('compValueB').textContent = formatCurrency(totalB); const diff = totalA > 0 ? ((totalB - totalA) / totalA) * 100 : (totalB > 0 ? 100 : 0); const el = document.getElementById('compDiffValue'); el.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`; el.className = `text-xl font-extrabold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`; document.getElementById('comparisonResult').classList.remove('hidden'); };
const handleOpenHouse = async () => { if (confirm("Abrir Turno?")) { try { await setDoc(getSystemStatusDocRef(), { startAt: serverTimestamp(), status: 'open' }, { merge: true }); alert("Turno Aberto!"); loadReports(); } catch (e) { alert(e.message); } } };
const handleCloseDay = async () => { if (confirm("Encerrar Turno?")) { try { await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'daily_reports'), `daily_${new Date().toISOString().split('T')[0]}`), { closedAt: serverTimestamp() }); alert("Turno Encerrado!"); loadReports(); } catch (e) { alert(e.message); } } };
const exportSalesToCSV = async () => { if (!reportDateInput) return; const dateVal = reportDateInput.value; if(!dateVal) { alert("Selecione data."); return; } const start = Timestamp.fromDate(new Date(dateVal + 'T00:00:00')); const end = Timestamp.fromDate(new Date(dateVal + 'T23:59:59')); const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tables'), where('status', '==', 'closed'), where('closedAt', '>=', start), where('closedAt', '<=', end)); const snapshot = await getDocs(q); if (snapshot.empty) { alert("Sem dados."); return; } let csv = "Data,Mesa,Garcom,Total\r\n"; snapshot.forEach(doc => { const t = doc.data(); csv += `${t.closedAt?.toDate().toLocaleString() || ''},${t.tableNumber},${t.waiterId || 'N/A'},${t.total}\r\n`; }); const link = document.createElement("a"); link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv)); link.setAttribute("download", `vendas_${dateVal}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
const renderSectorManagementModal = async () => { if (!managerModal) return; managerModal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl w-full max-w-lg h-[80vh] flex flex-col"><div class="flex justify-between mb-4"><h3 class="text-xl font-bold text-pumpkin">Setores</h3><button onclick="document.getElementById('managerModal').style.display='none'" class="text-white text-2xl">&times;</button></div><form id="addSectorForm" class="flex space-x-2 mb-4"><input type="text" id="newSectorName" class="input-pdv w-full" required><button type="submit" class="bg-green-600 px-4 rounded font-bold">+</button></form><div id="sectorListContainer" class="flex-grow overflow-y-auto custom-scrollbar space-y-2"></div></div>`; managerModal.style.display = 'flex'; const container = document.getElementById('sectorListContainer'); const snap = await getDocs(query(getSectorsCollectionRef(), orderBy('name'))); container.innerHTML = snap.docs.map(d => `<div class="flex justify-between bg-dark-input p-3 rounded border border-gray-700"><span class="text-white">${d.data().name}</span><button onclick="window.deleteSector('${doc.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`).join(''); document.getElementById('addSectorForm').onsubmit = async (e) => { e.preventDefault(); const val = document.getElementById('newSectorName').value; if(val) { await setDoc(doc(getSectorsCollectionRef(), val.toLowerCase()), { name: val, type: 'service' }); renderSectorManagementModal(); }}; };
const renderCustomerCrmModal = async () => { if (!managerModal) return; managerModal.innerHTML = `<div class="bg-dark-card border border-dark-border p-6 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col"><div class="flex justify-between mb-4"><h3 class="text-2xl font-bold text-indigo-400">CRM</h3><button onclick="document.getElementById('managerModal').style.display='none'" class="text-white text-3xl">&times;</button></div><input type="text" id="crmSearch" class="input-pdv mb-4" placeholder="Buscar..."><div id="crmList" class="flex-grow overflow-y-auto custom-scrollbar"></div></div>`; managerModal.style.display = 'flex'; const container = document.getElementById('crmList'); const snap = await getDocs(query(getCustomersCollectionRef(), limit(50))); container.innerHTML = snap.docs.map(d => `<div class="p-3 border-b border-gray-700 text-white">${d.data().name} - ${d.data().phone}</div>`).join(''); };
const openVoucherManagementModal = async () => { if (!voucherManagementModal) return; managerModal.style.display = 'none'; voucherManagementModal.style.display = 'flex'; await fetchVouchers(); };
const fetchVouchers = async () => { if (!voucherListContainer) return; const snap = await getDocs(query(getVouchersCollectionRef())); voucherListContainer.innerHTML = snap.docs.map(d => `<div class="flex justify-between bg-dark-input p-3 rounded mb-2 text-white"><span>${d.data().name} (${d.data().value} pts)</span><button onclick="window.handleDeleteVoucher('${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`).join(''); };
const handleSaveVoucher = async (e) => { e.preventDefault(); const id = document.getElementById('voucherIdInput').value || doc(getVouchersCollectionRef()).id; await setDoc(doc(getVouchersCollectionRef(), id), { id, name: document.getElementById('voucherNameInput').value, points: parseInt(document.getElementById('voucherPointsInput').value), value: parseFloat(document.getElementById('voucherValueInput').value) }); voucherForm.style.display = 'none'; fetchVouchers(); };
window.handleDeleteVoucher = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(getVouchersCollectionRef(), id)); fetchVouchers(); } };
window.showOrderDetails = async (docId) => { /* Mantida */ };
window.deleteSector = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(getSectorsCollectionRef(), id)); renderSectorManagementModal(); } };