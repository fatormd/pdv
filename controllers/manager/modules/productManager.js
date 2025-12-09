// --- CONTROLLERS/MANAGER/MODULES/PRODUCTMANAGER.JS ---
import { 
    db, appId, 
    getSectorsCollectionRef, 
    getCollectionRef // Helper genérico se existir, ou criaremos abaixo
} from "/services/firebaseService.js"; 

import { 
    collection, query, where, getDocs, orderBy, 
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch, increment, addDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading } from "/utils.js";
import { 
    syncWithWooCommerce, getProducts, getCategories, 
    createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts, 
    createWooCategory, updateWooCategory, deleteWooCategory 
} from "/services/wooCommerceService.js"; 
import { showToast } from "/app.js"; 

// Helpers Locais
const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
let managerModal = null;
let currentTab = 'products';
let currentComposition = [];
let ingredientsCache = [];
let suppliersCache = [];
let inventoryChecklist = [];

// ==================================================================
//           1. API PÚBLICA DO MÓDULO
// ==================================================================

export const init = () => {
    console.log("[ProductModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // Configura listeners globais de importação XML (se houver input no HTML)
    // window.handleImportXML = handleImportXML; (Exposto sob demanda)
};

export const open = async () => {
    await renderProductHub();
};

export const sync = async () => {
    showToast("Iniciando sincronização com WooCommerce...", false);
    try {
        await syncWithWooCommerce();
        showToast("Sincronização concluída!", false);
        // Se estiver com painel aberto, recarrega
        if(managerModal && managerModal.style.display === 'flex' && currentTab === 'products') {
            switchHubTab('products');
        }
    } catch (e) {
        console.error(e);
        showToast("Erro na sincronização.", true);
    }
};

export const openSettings = async () => {
    renderSectorManagementModal();
};

// ==================================================================
//           2. HUB PRINCIPAL (UI)
// ==================================================================

async function renderProductHub(activeTab = 'products') {
    if (!managerModal) return;
    
    // Carrega dependências iniciais
    await fetchIngredients();
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div><h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3><p class="text-xs md:text-sm text-gray-400">Cardápio, Estoque e Fornecedores</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button id="tab-products" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-hamburger mr-2"></i> Produtos</button>
                <button id="tab-ingredients" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-cubes mr-2"></i> Insumos</button>
                <button id="tab-suppliers" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-truck mr-2"></i> Fornecedores</button>
                <button id="tab-shoppingList" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-shopping-cart mr-2"></i> Compras</button>
                <button id="tab-categories" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-tags mr-2"></i> Categorias</button>
            </div>

            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0"></div>
            
            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative">
                <div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
        
        <div id="subModalContainer"></div>
    `;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    // Bind Tabs
    document.getElementById('tab-products').onclick = () => switchHubTab('products');
    document.getElementById('tab-ingredients').onclick = () => switchHubTab('ingredients');
    document.getElementById('tab-suppliers').onclick = () => switchHubTab('suppliers');
    document.getElementById('tab-shoppingList').onclick = () => switchHubTab('shoppingList');
    document.getElementById('tab-categories').onclick = () => switchHubTab('categories');

    await switchHubTab(activeTab);
}

async function switchHubTab(tab) {
    currentTab = tab;
    
    // Atualiza Visual Tabs
    document.querySelectorAll('.hub-tab-btn').forEach(btn => {
        if(btn.id === `tab-${tab}`) {
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
        }
    });

    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    
    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    toolbarDiv.innerHTML = '';

    if (tab === 'products') await renderProductListConfig(contentDiv, toolbarDiv);
    else if (tab === 'ingredients') await renderIngredientsScreen(contentDiv, toolbarDiv);
    else if (tab === 'suppliers') await renderSuppliersScreen(contentDiv, toolbarDiv);
    else if (tab === 'shoppingList') await renderShoppingListScreen(contentDiv, toolbarDiv);
    else if (tab === 'categories') await renderCategoryManagement(contentDiv);
}

// ==================================================================
//           3. GESTÃO DE PRODUTOS (LISTAGEM E EDIÇÃO)
// ==================================================================

async function renderProductListConfig(contentDiv, toolbarDiv) {
    const categories = getCategories();
    let catOptions = '<option value="all">Todas as Categorias</option>';
    if (categories.length > 0) categories.forEach(c => { if(c.id !== 'all' && c.id !== 'top10') catOptions += `<option value="${c.id}">${c.name}</option>`; });
    
    toolbarDiv.innerHTML = `
        <div class="flex items-center space-x-2 w-full md:w-auto">
            <select id="hubCategoryFilter" class="bg-gray-700 text-white text-sm py-3 px-3 rounded-lg border border-gray-600 w-full md:w-[200px]">${catOptions}</select>
        </div>
        <div class="flex items-center space-x-2 w-full md:w-auto">
            <div class="relative w-full md:w-64">
                <input type="text" id="hubSearchInput" placeholder="Pesquisar..." class="bg-dark-input text-white text-sm py-3 pl-3 pr-8 rounded-lg border border-gray-600 w-full focus:border-indigo-500">
                <i class="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            </div>
            <button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center whitespace-nowrap">
                <i class="fas fa-plus mr-2"></i> <span class="hidden md:inline">Novo</span>
            </button>
        </div>`;

    document.getElementById('hubNewProductBtn').onclick = () => renderProductForm(null, contentDiv);
    
    let hubCategory = 'all';
    let hubSearch = '';
    let searchTimeout;

    const renderList = async (page = 1, append = false) => {
        if (!append) contentDiv.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>';
        
        await fetchWooCommerceProducts(page, hubSearch, hubCategory, append);
        const products = getProducts();
        
        if (products.length === 0 && !append) {
            contentDiv.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>';
            return;
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
            
        contentDiv.innerHTML = `<div class="pb-4">${listHtml}</div>`;
        
        // Re-bind buttons
        contentDiv.querySelectorAll('.btn-edit-prod').forEach(btn => 
            btn.onclick = () => { const prod = products.find(p => p.id == btn.dataset.id); renderProductForm(prod, contentDiv); }
        );
        contentDiv.querySelectorAll('.btn-del-prod').forEach(btn => 
            btn.onclick = () => handleDeleteProduct(btn.dataset.id, () => renderList(1, false))
        );
    };

    document.getElementById('hubCategoryFilter').onchange = (e) => { hubCategory = e.target.value; renderList(1, false); };
    document.getElementById('hubSearchInput').oninput = (e) => { 
        hubSearch = e.target.value; 
        clearTimeout(searchTimeout); 
        searchTimeout = setTimeout(() => renderList(1, false), 600); 
    };

    renderList(1, false);
}

async function renderProductForm(product = null, container) {
    const isEdit = !!product;
    const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), where('type', '==', 'production'), orderBy('name')));
    const sectors = sectorsSnap.docs.map(d => d.data().name);
    currentComposition = product?.composition || [];
    
    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg animate-fade-in">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0">
                <h4 class="text-lg font-bold text-white flex items-center truncate"><i class="fas ${isEdit ? 'fa-edit text-blue-400' : 'fa-plus-circle text-green-400'} mr-2"></i>${isEdit ? 'Editar Produto' : 'Novo Produto'}</h4>
                <button id="btnBackToHub" class="text-gray-400 hover:text-white flex items-center text-sm py-2 px-3 rounded bg-gray-800"><i class="fas fa-arrow-left mr-1"></i> Voltar</button>
            </div>
            
            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 pb-20">
                <form id="productForm" class="space-y-4">
                     <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome</label><input type="text" id="prodName" class="input-pdv w-full text-lg p-3" value="${product?.name || ''}" required></div>
                     <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Preço (R$)</label><input type="number" id="prodPrice" class="input-pdv w-full font-mono text-green-400 font-bold text-lg p-3" step="0.01" value="${product?.price || ''}" required></div>
                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor KDS</label><select id="prodSector" class="input-pdv w-full p-3">${sectors.length > 0 ? sectors.map(s => `<option value="${s}" ${product?.sector === s ? 'selected' : ''}>${s}</option>`).join('') : '<option value="cozinha">Cozinha</option>'}</select></div>
                     </div>
                     <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Status</label><select id="prodStatus" class="input-pdv w-full p-3"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho (Oculto)</option></select></div>
                </form>
            </div>

            <div class="border-t border-gray-700 pt-4 mt-auto flex space-x-3 flex-shrink-0 bg-dark-bg">
                <button type="button" id="btnSaveProduct" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center"><i class="fas fa-save mr-2"></i> Salvar</button>
            </div>
        </div>`;

    document.getElementById('btnBackToHub').onclick = () => renderProductListConfig(container, document.getElementById('productActionsToolbar'));
    
    document.getElementById('btnSaveProduct').onclick = async () => {
        const btn = document.getElementById('btnSaveProduct');
        toggleLoading(btn, true, 'Salvando...');
        
        const data = {
            name: document.getElementById('prodName').value,
            price: document.getElementById('prodPrice').value,
            status: document.getElementById('prodStatus').value,
            meta_data: [ { key: 'sector', value: document.getElementById('prodSector').value } ]
        };

        try { 
            if(isEdit) await updateWooProduct(product.id, data); else await createWooProduct(data); 
            showToast("Produto salvo com sucesso!", false); 
            renderProductListConfig(container, document.getElementById('productActionsToolbar'));
        } catch(e) { 
            showToast(e.message, true); 
        } finally { 
            toggleLoading(btn, false); 
        }
    };
}

async function handleDeleteProduct(id, callback) { 
    if(confirm("Tem certeza que deseja excluir este produto do WooCommerce?")) { 
        try { 
            await deleteWooProduct(id); 
            showToast("Produto excluído.", false); 
            if(callback) callback(); 
        } catch(e) { showToast(e.message, true); } 
    } 
}

// ==================================================================
//           4. GESTÃO DE INSUMOS E FORNECEDORES
// ==================================================================

async function fetchIngredients() {
    try {
        const q = query(getColRef('ingredients'), orderBy('name'));
        const snap = await getDocs(q);
        ingredientsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return ingredientsCache;
    } catch (e) { console.error(e); return []; }
}

async function renderIngredientsScreen(container, toolbar) {
    toolbar.innerHTML = `<button onclick="window.openIngredientModal()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg flex items-center ml-auto"><i class="fas fa-plus mr-2"></i> Novo Insumo</button>`;
    
    if (ingredientsCache.length === 0) { container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><p>Nenhum insumo cadastrado.</p></div>'; return; }
    
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${ingredientsCache.map(ing => `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center group">
            <div><h4 class="font-bold text-white">${ing.name}</h4><p class="text-xs text-gray-400">R$ ${ing.cost.toFixed(2)} / ${ing.unit}</p></div>
            <div class="text-right font-mono font-bold ${ing.stock <= ing.minStock ? 'text-red-500' : 'text-green-400'}">${ing.stock} ${ing.unit}</div>
        </div>`).join('')}</div>`;

    // Injeta Modal de Insumo no DOM se não existir
    injectIngredientModal();
}

function injectIngredientModal() {
    if(document.getElementById('ingredientFormModal')) return;
    const modalHtml = `
        <div id="ingredientFormModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
            <div class="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-600">
                <h3 class="text-lg font-bold text-white mb-4">Novo Insumo</h3>
                <div class="space-y-3">
                    <input id="ingName" type="text" class="input-pdv w-full p-2" placeholder="Nome">
                    <div class="grid grid-cols-2 gap-3">
                        <input id="ingCost" type="number" class="input-pdv w-full p-2" placeholder="Custo (R$)">
                        <input id="ingStock" type="number" class="input-pdv w-full p-2" placeholder="Estoque Inicial">
                    </div>
                </div>
                <div class="flex justify-end space-x-2 mt-6">
                    <button onclick="document.getElementById('ingredientFormModal').style.display='none'" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                    <button onclick="window.saveIngredient()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </div>
        </div>`;
    document.getElementById('subModalContainer').innerHTML = modalHtml;
    
    window.openIngredientModal = () => document.getElementById('ingredientFormModal').style.display = 'flex';
    window.saveIngredient = async () => {
        const name = document.getElementById('ingName').value;
        const cost = parseFloat(document.getElementById('ingCost').value) || 0;
        const stock = parseFloat(document.getElementById('ingStock').value) || 0;
        if(!name) return;
        await addDoc(getColRef('ingredients'), { name, cost, stock, unit: 'un', minStock: 10 });
        document.getElementById('ingredientFormModal').style.display = 'none';
        showToast("Insumo Salvo!");
        await fetchIngredients();
        switchHubTab('ingredients');
    };
}

async function renderSuppliersScreen(container, toolbar) {
    toolbar.innerHTML = `<button class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg ml-auto" onclick="alert('Em breve')">Novo</button>`;
    const q = query(getColRef('suppliers'), orderBy('name'));
    const snap = await getDocs(q);
    
    if (snap.empty) { container.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem fornecedores.</p>'; return; }
    
    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${snap.docs.map(d => `
        <div class="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h4 class="font-bold text-white">${d.data().name}</h4>
            <p class="text-xs text-gray-400">${d.data().phone || ''}</p>
        </div>`).join('')}</div>`;
}

async function renderShoppingListScreen(container, toolbar) {
    toolbar.innerHTML = `<button onclick="window.print()" class="bg-gray-700 text-white px-4 py-2 rounded ml-auto"><i class="fas fa-print"></i></button>`;
    const list = ingredientsCache.filter(i => i.stock <= (i.minStock || 5));
    if(list.length === 0) { container.innerHTML = '<p class="text-center text-green-500 mt-10">Estoque OK.</p>'; return; }
    
    container.innerHTML = `<table class="w-full text-left text-gray-300"><thead class="bg-gray-900 text-xs uppercase"><tr><th class="p-3">Item</th><th class="p-3 text-right">Comprar</th></tr></thead><tbody>${list.map(i => `
        <tr class="border-b border-gray-700"><td class="p-3 font-bold text-white">${i.name}</td><td class="p-3 text-right text-yellow-400">${(i.minStock || 5) - i.stock} ${i.unit}</td></tr>
    `).join('')}</tbody></table>`;
}

async function renderCategoryManagement(container) {
    container.innerHTML = '<p class="text-center text-gray-500 mt-10">Gestão de Categorias (Em manutenção na v2)</p>';
}

async function renderSectorManagementModal() {
    alert("Configuração de Setores será movida para settingsManager.js");
}