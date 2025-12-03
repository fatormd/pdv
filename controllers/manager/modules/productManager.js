// --- CONTROLLERS/MANAGER/MODULES/PRODUCTMANAGER.JS (VERSÃO FINAL: FORMATADA & CORRIGIDA) ---

import { 
    db, appId, storage, ref, uploadBytes, getDownloadURL, 
    getSectorsCollectionRef, getCollectionRef 
} from "/services/firebaseService.js"; 

import { 
    collection, query, where, getDocs, orderBy, 
    doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc, addDoc, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading, showToast } from "/utils.js";

// Import com ?v=2 para limpar cache do navegador
import { 
    syncWithWooCommerce, getProducts, getCategories, fetchSalesHistory,
    createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts 
} from "/services/wooCommerceService.js?v=2"; 

const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
let managerModal = null;
let currentTab = 'products';
let ingredientsCache = [];
let suppliersCache = [];
let currentProductComposition = []; 
let productExtensionsCache = {}; 

const COST_GAS_PER_HOUR = 6.00; 
const COST_ENERGY_PER_HOUR = 1.50; 

// --- FUNÇÃO AUXILIAR PARA CORRIGIR O STACKING CONTEXT ---
function getSubModalContainer() {
    let container = document.getElementById('subModalContainer');
    if (!container || container.parentElement.id === 'managerModal') {
        if(container) container.remove();
        container = document.createElement('div');
        container.id = 'subModalContainer';
        container.style.zIndex = '9999'; 
        container.style.position = 'relative';
        document.body.appendChild(container);
    }
    return container;
}

// ==================================================================
//           1. API PÚBLICA & LÓGICA DE UPLOAD
// ==================================================================

export const init = () => {
    console.log("[ProductModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // --- LÓGICA DE UPLOAD BLINDADA (COM VALIDAÇÃO) ---
    window.handleImageUpload = async (input) => {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const preview = document.getElementById('imgPreview');
            const icon = document.getElementById('imgPlaceholderIcon');
            const urlInput = document.getElementById('prodImgUrl');
            const btnSave = document.getElementById('btnSaveProduct');

            // 1. Validar Tipo de Arquivo
            const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                showToast("Formato inválido! Use apenas JPG, PNG ou WEBP.", true);
                input.value = ''; 
                return;
            }

            // 2. Validar Tamanho (Máximo 2MB)
            const maxSize = 2 * 1024 * 1024; // 2MB
            if (file.size > maxSize) {
                showToast("Imagem muito grande! O limite é 2MB.", true);
                input.value = ''; 
                return;
            }

            // Preview imediato
            const reader = new FileReader();
            reader.onload = (e) => {
                if(preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
                if(icon) icon.classList.add('hidden');
            };
            reader.readAsDataURL(file);

            if (!storage) {
                showToast("Erro: Storage não inicializado.", true);
                return;
            }

            if(btnSave) {
                btnSave.disabled = true;
                btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subindo foto...';
            }

            showToast("Enviando para a nuvem...", false);
            
            try {
                // Sanitização do nome
                const ext = file.name.split('.').pop().toLowerCase();
                const cleanName = file.name.split('.')[0]
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-zA-Z0-9]/g, '_')
                    .toLowerCase();

                const fileName = `products/${Date.now()}_${cleanName}.${ext}`;
                const storageRef = ref(storage, fileName);
                
                await uploadBytes(storageRef, file);
                const publicUrl = await getDownloadURL(storageRef);
                
                if(urlInput) {
                    urlInput.value = publicUrl;
                    urlInput.dispatchEvent(new Event('input')); 
                    console.log("LINK GERADO:", publicUrl);
                }
                
                showToast("Upload concluído! Pode salvar.", false);

            } catch (error) {
                console.error("Erro no upload:", error);
                showToast("Erro ao subir imagem: " + error.message, true);
            } finally {
                if(btnSave) {
                    btnSave.disabled = false;
                    btnSave.innerHTML = '<i class="fas fa-save mr-2"></i> Salvar Ficha';
                }
            }
        }
    };
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

export const openSettings = async () => { alert("Configurações de setores em breve."); };

// ==================================================================
//           2. HUB PRINCIPAL
// ==================================================================

async function calculateConsumptionFromHistory(days = 30) {
    const orders = await fetchSalesHistory(days);
    if (!orders || orders.length === 0) return {};

    const salesMap = {};
    orders.forEach(order => {
        order.line_items.forEach(item => {
            const pid = item.product_id.toString();
            salesMap[pid] = (salesMap[pid] || 0) + item.quantity;
        });
    });

    const consumptionMap = {};
    const productsSnap = await getDocs(getColRef('products'));
    const productCompositions = {};
    productsSnap.forEach(doc => {
        productCompositions[doc.id] = doc.data().composition || [];
    });

    Object.entries(salesMap).forEach(([pid, qtySold]) => {
        const composition = productCompositions[pid];
        if (composition) {
            composition.forEach(ing => {
                consumptionMap[ing.id] = (consumptionMap[ing.id] || 0) + (ing.qty * qtySold);
            });
        }
    });

    return consumptionMap;
}

async function fetchProductExtensions() {
    try {
        const snap = await getDocs(getColRef('products'));
        productExtensionsCache = {};
        snap.forEach(doc => {
            productExtensionsCache[doc.id] = doc.data();
        });
    } catch(e) { console.error("Erro cache ext:", e); }
}

async function renderProductHub(activeTab = 'products') {
    if (!managerModal) return;
    
    await fetchIngredients();
    await fetchSuppliers();
    await fetchProductExtensions(); 
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-6xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden">
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div><h3 class="text-xl md:text-2xl font-bold text-white">Gestão de Produtos</h3><p class="text-xs md:text-sm text-gray-400">Cardápio, Estoque e Compras Inteligentes</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none p-2" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex items-center space-x-2 p-3 bg-dark-bg border-b border-gray-700 overflow-x-auto flex-shrink-0 whitespace-nowrap">
                <button id="tab-products" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-hamburger mr-2"></i> Produtos</button>
                <button id="tab-ingredients" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-cubes mr-2"></i> Insumos</button>
                <button id="tab-shoppingList" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-shopping-cart mr-2"></i> Lista de Compras</button>
                <button id="tab-suppliers" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center"><i class="fas fa-truck mr-2"></i> Fornecedores</button>
                <button id="tab-lowestCost" class="hub-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition flex items-center bg-green-900/30 text-green-400 border border-green-600/50 hover:bg-green-900/50"><i class="fas fa-percent mr-2"></i> Menor Custo</button>
            </div>

            <div id="productActionsToolbar" class="flex flex-col md:flex-row items-stretch md:items-center justify-between p-3 bg-dark-bg border-b border-gray-700 gap-3 flex-shrink-0"></div>
            
            <div id="hubContent" class="flex-grow overflow-y-auto p-3 md:p-4 custom-scrollbar bg-dark-bg relative">
                <div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
        <div id="subModalContainer"></div>`;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); managerModal.classList.add('p-0', 'md:p-4');

    document.getElementById('tab-products').onclick = () => switchHubTab('products');
    document.getElementById('tab-ingredients').onclick = () => switchHubTab('ingredients');
    document.getElementById('tab-shoppingList').onclick = () => switchHubTab('shoppingList');
    document.getElementById('tab-suppliers').onclick = () => switchHubTab('suppliers');
    document.getElementById('tab-lowestCost').onclick = () => switchHubTab('lowestCost');

    await switchHubTab(activeTab);
}

async function switchHubTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.hub-tab-btn').forEach(btn => {
        if(btn.id === `tab-${tab}`) { btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300', 'bg-green-900/30', 'text-green-400'); } 
        else if (btn.id === 'tab-lowestCost') { btn.classList.add('bg-green-900/30', 'text-green-400'); btn.classList.remove('bg-indigo-600', 'text-white'); }
        else { btn.classList.remove('bg-indigo-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300'); }
    });

    const contentDiv = document.getElementById('hubContent');
    const toolbarDiv = document.getElementById('productActionsToolbar');
    contentDiv.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    toolbarDiv.innerHTML = '';

    if (tab === 'products') await renderProductListConfig(contentDiv, toolbarDiv);
    else if (tab === 'ingredients') await renderIngredientsScreen(contentDiv, toolbarDiv);
    else if (tab === 'shoppingList') await renderShoppingListScreen(contentDiv, toolbarDiv);
    else if (tab === 'suppliers') await renderSuppliersScreen(contentDiv, toolbarDiv);
    else if (tab === 'lowestCost') await renderLowestCostScreen(contentDiv, toolbarDiv);
}

// ==================================================================
//           3. GESTÃO DE PRODUTOS
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
            <input type="text" id="hubSearchInput" placeholder="Pesquisar..." class="bg-dark-input text-white text-sm py-3 px-3 rounded-lg border border-gray-600 w-full">
            
            <button id="btnConfigInit" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg shadow flex items-center text-sm whitespace-nowrap" title="Gerar/Atualizar Catálogo Base">
                <i class="fas fa-cogs mr-2"></i> Config. Iniciais
            </button>
            
            <button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow flex items-center"><i class="fas fa-plus mr-2"></i> Novo</button>
        </div>`;

    document.getElementById('hubNewProductBtn').onclick = () => renderProductForm(null, contentDiv);
    document.getElementById('btnConfigInit').onclick = configureInitialCatalog; 
    
    let hubCategory = 'all';
    let hubSearch = '';
    let searchTimeout;

    const renderList = async (page = 1) => {
        contentDiv.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>';
        await fetchWooCommerceProducts(page, hubSearch, hubCategory, false);
        await fetchProductExtensions(); // Atualiza cache local
        
        const products = getProducts();
        
        if (products.length === 0) {
            contentDiv.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>';
            return;
        }

        const listHtml = products.map(p => {
            const extData = productExtensionsCache[p.id] || {};
            const displayImage = extData.localImage || (p.image && !p.image.includes('placehold') ? p.image : 'https://placehold.co/50');

            return `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2 border border-gray-700 hover:border-gray-500 transition group">
                <div class="flex items-center space-x-3 overflow-hidden">
                    <div class="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-600 relative">
                        <img src="${displayImage}" class="w-full h-full object-cover">
                    </div>
                    <div class="min-w-0">
                        <h4 class="font-bold text-white text-sm truncate">${p.name}</h4>
                        <div class="flex items-center text-xs space-x-2 mt-1">
                            <span class="text-green-400 font-mono bg-green-900/30 px-1.5 py-0.5 rounded">${formatCurrency(p.price)}</span>
                            ${p.on_sale ? `<span class="text-yellow-400 font-mono bg-yellow-900/30 px-1.5 py-0.5 rounded ml-1 border border-yellow-600/50" title="Em Promoção"><i class="fas fa-tag mr-1"></i>${formatCurrency(p.sale_price)}</span>` : ''}
                            <span class="text-gray-500 ml-2">${p.category || 'Sem Categoria'}</span>
                        </div>
                    </div>
                </div>
                <div class="flex space-x-2 flex-shrink-0">
                    <button class="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-sm btn-edit-prod shadow" data-id="${p.id}" title="Editar / Ficha Técnica"><i class="fas fa-edit"></i></button>
                    <button class="bg-red-600 hover:bg-red-500 text-white p-2 rounded-lg text-sm btn-del-prod shadow" data-id="${p.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
            
        contentDiv.innerHTML = `<div class="pb-20">${listHtml}</div>`;
        
        contentDiv.querySelectorAll('.btn-edit-prod').forEach(btn => 
            btn.onclick = () => { const prod = products.find(p => p.id == btn.dataset.id); renderProductForm(prod, contentDiv); }
        );
        
        contentDiv.querySelectorAll('.btn-del-prod').forEach(btn => 
            btn.onclick = () => handleDeleteProduct(btn.dataset.id)
        );
    };

    document.getElementById('hubCategoryFilter').onchange = (e) => { hubCategory = e.target.value; renderList(1); };
    document.getElementById('hubSearchInput').oninput = (e) => { hubSearch = e.target.value; clearTimeout(searchTimeout); searchTimeout = setTimeout(() => renderList(1), 600); };

    renderList(1);
}

async function handleDeleteProduct(id) {
    if(confirm("Tem certeza que deseja excluir este produto?")) {
        try {
            await deleteWooProduct(id);
            await deleteDoc(doc(getColRef('products'), id.toString()));
            showToast("Produto excluído com sucesso.", false);
            const contentDiv = document.getElementById('hubContent');
            const toolbarDiv = document.getElementById('productActionsToolbar');
            if(contentDiv && toolbarDiv) renderProductListConfig(contentDiv, toolbarDiv);
        } catch(e) {
            console.error(e);
            showToast("Erro ao excluir: " + e.message, true);
        }
    }
}

async function renderProductForm(product = null, container) {
    const isEdit = !!product;
    
    let extendedData = {};
    currentProductComposition = [];
    
    if (isEdit) {
        try {
            const docSnap = await getDoc(doc(getColRef('products'), product.id.toString()));
            if (docSnap.exists()) {
                extendedData = docSnap.data();
                currentProductComposition = extendedData.composition || [];
            }
        } catch (e) { console.error("Erro ao carregar ficha técnica:", e); }
    }

    const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), where('type', '==', 'production'), orderBy('name')));
    const sectors = sectorsSnap.docs.map(d => d.data().name);
    if(sectors.length === 0) sectors.push('Cozinha', 'Bar', 'Copa'); 
    
    const price = product?.price || '';
    const salePrice = product?.sale_price || '';
    const onSale = !!salePrice; 
    
    const prodImage = extendedData.localImage || (product?.image && !product.image.includes('placehold') ? product.image : '');

    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg animate-fade-in">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0">
                <h4 class="text-lg font-bold text-white flex items-center truncate">
                    <i class="fas ${isEdit ? 'fa-edit text-blue-400' : 'fa-plus-circle text-green-400'} mr-2"></i>
                    ${isEdit ? 'Editor & Ficha Técnica' : 'Novo Produto'}
                </h4>
                <button id="btnBackToHub" class="text-gray-400 hover:text-white flex items-center text-sm py-2 px-3 rounded bg-gray-800"><i class="fas fa-arrow-left mr-1"></i> Voltar</button>
            </div>
            
            <div class="flex space-x-1 bg-gray-800 p-1 rounded-lg mb-4">
                <button class="flex-1 py-2 text-sm font-bold rounded-md bg-indigo-600 text-white form-tab-btn" data-tab="geral">Geral</button>
                <button class="flex-1 py-2 text-sm font-bold rounded-md text-gray-400 hover:text-white form-tab-btn" data-tab="ficha">Ficha Técnica</button>
                <button class="flex-1 py-2 text-sm font-bold rounded-md text-gray-400 hover:text-white form-tab-btn" data-tab="preparo">Preparo & Custos</button>
            </div>

            <div class="flex-grow overflow-y-auto custom-scrollbar pr-1 pb-20" id="formTabContainer">
                
                <div id="ft-geral" class="form-tab-content">
                    <div class="space-y-4">
                        
                        <div class="flex gap-4 mb-2 bg-gray-800/50 p-3 rounded border border-gray-700">
                            <div class="w-24 h-24 bg-gray-700 rounded-lg border border-gray-600 flex items-center justify-center overflow-hidden relative group flex-shrink-0">
                                <img id="imgPreview" src="${prodImage}" class="w-full h-full object-cover ${!prodImage ? 'hidden' : ''}">
                                <i class="fas fa-camera text-gray-500 text-2xl ${prodImage ? 'hidden' : ''}" id="imgPlaceholderIcon"></i>
                                <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer" onclick="document.getElementById('prodImgInput').click()">
                                    <i class="fas fa-edit text-white"></i>
                                </div>
                            </div>
                            <div class="flex-grow space-y-2">
                                <label class="block text-xs text-gray-400 uppercase font-bold">Imagem do Produto</label>
                                <div class="flex space-x-2">
                                    <input type="text" id="prodImgUrl" class="input-pdv w-full text-sm" placeholder="Cole a URL da imagem aqui..." value="${prodImage}">
                                    <button class="bg-gray-700 text-white px-3 rounded-lg border border-gray-600 hover:bg-gray-600" onclick="document.getElementById('prodImgInput').click()" title="Carregar do Dispositivo">
                                        <i class="fas fa-paperclip"></i>
                                    </button>
                                    <input type="file" id="prodImgInput" class="hidden" accept="image/*" onchange="window.handleImageUpload(this)">
                                </div>
                                <p class="text-[10px] text-gray-500">Cole o link direto ou use o clipe para anexar (apenas preview).</p>
                            </div>
                        </div>

                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Produto</label><input type="text" id="prodName" class="input-pdv w-full text-lg" value="${product?.name || ''}" required></div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Preço de Venda (R$)</label><input type="number" id="prodPrice" class="input-pdv w-full font-mono text-white font-bold text-lg" step="0.01" value="${price}" required></div>
                            
                            <div class="bg-gray-800 p-2 rounded border border-gray-600">
                                <div class="flex justify-between items-center mb-1">
                                    <label class="block text-[10px] text-gray-400 uppercase font-bold">Promoção</label>
                                    <label class="inline-flex items-center cursor-pointer">
                                        <input type="checkbox" id="checkPromo" class="form-checkbox h-4 w-4 text-yellow-500 bg-gray-700 border-gray-500 rounded focus:ring-0" ${onSale ? 'checked' : ''}>
                                        <span class="ml-2 text-xs text-yellow-400 font-bold">Ativar</span>
                                    </label>
                                </div>
                                <input type="number" id="prodSalePrice" class="input-pdv w-full font-mono text-yellow-400 font-bold" step="0.01" value="${salePrice}" placeholder="0.00" ${!onSale ? 'disabled' : ''}>
                            </div>

                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor KDS</label><select id="prodSector" class="input-pdv w-full">${sectors.map(s => `<option value="${s}" ${product?.sector === s || extendedData?.sector === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
                        </div>

                        <div class="grid grid-cols-2 gap-4 p-3 bg-gray-800/50 rounded border border-gray-700">
                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Grupo (Gestão)</label><input type="text" id="prodGroup" class="input-pdv w-full text-sm" placeholder="Ex: Pratos Principais" value="${extendedData.group || ''}"></div>
                            <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Subgrupo</label><input type="text" id="prodSubgroup" class="input-pdv w-full text-sm" placeholder="Ex: Peixes" value="${extendedData.subgroup || ''}"></div>
                        </div>

                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Status no Cardápio</label><select id="prodStatus" class="input-pdv w-full"><option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Ativo (Visível)</option><option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho (Oculto)</option></select></div>
                    </div>
                </div>

                <div id="ft-ficha" class="form-tab-content hidden">
                    <div class="flex flex-col space-y-3 mb-4 bg-gray-800 p-3 rounded border border-gray-700">
                        <div>
                            <label class="block text-xs text-gray-400 uppercase font-bold">Insumo</label>
                            <select id="ingSelect" class="input-pdv w-full text-sm">
                                <option value="">Selecione...</option>
                                ${ingredientsCache.map(i => `<option value="${i.id}" data-unit="${i.unit}" data-cost="${i.cost}">${i.name} (R$ ${i.cost}/${i.unit})</option>`).join('')}
                            </select>
                        </div>
                        <div class="flex space-x-2">
                            <div class="flex-grow">
                                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Quantidade</label>
                                <input type="number" id="ingQty" placeholder="0.000" class="input-pdv w-full text-sm" step="0.001">
                            </div>
                            <div class="flex items-end">
                                <button id="btnAddIng" class="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg font-bold transition shadow h-[42px]"><i class="fas fa-plus mr-2"></i> Adicionar</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                        <table class="w-full text-left text-sm text-gray-300">
                            <thead class="bg-gray-900 text-xs uppercase font-bold"><tr><th class="p-3">Insumo</th><th class="p-3 text-right">Qtd</th><th class="p-3 text-right">Custo</th><th class="p-3 text-center">Ações</th></tr></thead>
                            <tbody id="compositionTableBody"></tbody>
                        </table>
                    </div>
                    <div class="mt-3 text-right text-sm text-gray-400">Total Insumos: <span id="totalIngredientsCost" class="text-white font-bold font-mono">R$ 0,00</span></div>
                </div>

                <div id="ft-preparo" class="form-tab-content hidden">
                    <div class="space-y-4">
                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Modo de Preparo</label><textarea id="prodPrepMethod" class="input-pdv w-full h-32 text-sm" placeholder="Descreva o passo a passo...">${extendedData.prepMethod || ''}</textarea></div>
                        
                        <div class="bg-gray-800 p-3 rounded-lg border border-gray-700">
                            <h5 class="text-xs font-bold text-pink-400 uppercase mb-3">Custo Operacional (Estimado)</h5>
                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="block text-[10px] text-gray-500 uppercase mb-1">Tempo de Preparo (Min)</label><input type="number" id="prodCookTime" class="input-pdv w-full" value="${extendedData.cookTime || 0}"></div>
                                <div><label class="block text-[10px] text-gray-500 uppercase mb-1">Fonte de Energia</label><select id="prodEnergy" class="input-pdv w-full"><option value="gas" ${extendedData.energyType === 'gas' ? 'selected' : ''}>Gás (Fogão/Forno)</option><option value="electric" ${extendedData.energyType === 'electric' ? 'selected' : ''}>Elétrico (Fritadeira)</option><option value="none" ${!extendedData.energyType || extendedData.energyType === 'none' ? 'selected' : ''}>Nenhum</option></select></div>
                            </div>
                            <p class="text-xs text-gray-500 mt-2 italic">* Adiciona custo ao CMV baseado no tempo.</p>
                        </div>

                        <div class="p-3 bg-gray-900 rounded-lg border border-gray-700 flex justify-between items-center">
                            <span class="text-sm font-bold text-gray-400">CMV Total Estimado</span>
                            <span id="finalCmvDisplay" class="text-xl font-bold text-red-400">R$ 0,00</span>
                        </div>

                        <div class="bg-gray-800 p-3 rounded-lg border border-gray-700 mt-2">
                            <h5 class="text-xs font-bold text-green-400 uppercase mb-3">Precificação & Lucro</h5>
                            <div class="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Margem Alvo (%)</label>
                                    <input type="number" id="prodTargetMargin" class="input-pdv w-full" value="${extendedData.targetMargin || 100}" placeholder="100">
                                </div>
                                <div>
                                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Preço Sugerido</label>
                                    <input type="text" id="prodSuggestedPrice" class="input-pdv w-full bg-gray-700 text-gray-400 cursor-not-allowed" readonly value="R$ 0,00">
                                </div>
                            </div>
                            <div class="p-2 bg-gray-900 rounded border border-gray-700">
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs text-gray-400">Preço Venda Atual:</span>
                                    <span class="text-sm font-bold text-white">${formatCurrency(parseFloat(price) || 0)}</span>
                                </div>
                                <div class="flex justify-between items-center mb-1">
                                    <span class="text-xs text-gray-400">Custo Total (CMV):</span>
                                    <span id="analysisCmvDisplay" class="text-sm font-bold text-red-400">R$ 0,00</span>
                                </div>
                                <div class="border-t border-gray-600 my-1"></div>
                                <div class="flex justify-between items-center">
                                    <span class="text-sm font-bold text-gray-300">Lucro Real:</span>
                                    <span id="analysisProfitDisplay" class="text-lg font-bold text-green-400">R$ 0,00</span>
                                </div>
                                <div class="text-right">
                                    <span id="analysisMarginDisplay" class="text-xs font-mono text-gray-500">(Markup Real: 0%)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="border-t border-gray-700 pt-4 mt-auto flex space-x-3 flex-shrink-0 bg-dark-bg">
                <button type="button" id="btnSaveProduct" class="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center"><i class="fas fa-save mr-2"></i> Salvar Ficha</button>
            </div>
        </div>`;

    const urlInput = document.getElementById('prodImgUrl');
    if (urlInput) {
        urlInput.addEventListener('input', function() {
            const preview = document.getElementById('imgPreview');
            const icon = document.getElementById('imgPlaceholderIcon');
            if (this.value) {
                preview.src = this.value;
                preview.classList.remove('hidden');
                icon.classList.add('hidden');
            } else {
                preview.classList.add('hidden');
                icon.classList.remove('hidden');
            }
        });
    }

    const checkPromo = document.getElementById('checkPromo');
    const inputPromo = document.getElementById('prodSalePrice');
    checkPromo.onchange = () => {
        inputPromo.disabled = !checkPromo.checked;
        if(!checkPromo.checked) inputPromo.value = '';
        else inputPromo.focus();
    };

    const tabs = container.querySelectorAll('.form-tab-btn');
    tabs.forEach(btn => {
        btn.onclick = () => {
            tabs.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('text-gray-400'); });
            btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('text-gray-400');
            container.querySelectorAll('.form-tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`ft-${btn.dataset.tab}`).classList.remove('hidden');
        };
    });

    const renderComposition = () => {
        const tbody = document.getElementById('compositionTableBody');
        let totalIngCost = 0;
        tbody.innerHTML = currentProductComposition.map((item, idx) => {
            const cost = item.cost * item.qty;
            totalIngCost += cost;
            return `
                <tr class="border-b border-gray-700 last:border-0 hover:bg-gray-700/30 transition">
                    <td class="p-3">
                        <span class="block font-bold text-white">${item.name}</span>
                        <span class="text-xs text-gray-500">R$ ${item.cost}/${item.unit}</span>
                    </td>
                    <td class="p-3 text-right font-mono text-yellow-400 font-bold">${item.qty} ${item.unit}</td>
                    <td class="p-3 text-right text-red-300 font-mono text-sm">${formatCurrency(cost)}</td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <button class="text-blue-400 hover:text-blue-300 btn-edit-ing mr-3" data-idx="${idx}" title="Editar Quantidade"><i class="fas fa-edit"></i></button>
                        <button class="text-red-500 hover:text-red-400 btn-rem-ing" data-idx="${idx}" title="Remover"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
        }).join('');
        
        document.getElementById('totalIngredientsCost').textContent = formatCurrency(totalIngCost);
        
        const time = parseFloat(document.getElementById('prodCookTime').value) || 0;
        const energyType = document.getElementById('prodEnergy').value;
        let energyCost = 0;
        if (energyType === 'gas') energyCost = (time / 60) * COST_GAS_PER_HOUR;
        if (energyType === 'electric') energyCost = (time / 60) * COST_ENERGY_PER_HOUR;
        
        const finalCmv = totalIngCost + energyCost;
        document.getElementById('finalCmvDisplay').textContent = formatCurrency(finalCmv);
        
        const targetMargin = parseFloat(document.getElementById('prodTargetMargin').value) || 0;
        const currentPrice = parseFloat(document.getElementById('prodPrice').value) || 0;
        
        const suggested = finalCmv * (1 + (targetMargin / 100));
        document.getElementById('prodSuggestedPrice').value = formatCurrency(suggested);
        
        document.getElementById('analysisCmvDisplay').textContent = formatCurrency(finalCmv);
        const profit = currentPrice - finalCmv;
        const profitEl = document.getElementById('analysisProfitDisplay');
        profitEl.textContent = formatCurrency(profit);
        profitEl.className = `text-lg font-bold ${profit > 0 ? 'text-green-400' : 'text-red-500'}`;
        
        const realMarkup = finalCmv > 0 ? ((profit / finalCmv) * 100).toFixed(1) : 0;
        document.getElementById('analysisMarginDisplay').textContent = `(Markup Real: ${realMarkup}%)`;
        
        container.querySelectorAll('.btn-edit-ing').forEach(btn => {
            btn.onclick = () => {
                const idx = btn.dataset.idx;
                const item = currentProductComposition[idx];
                const newQty = prompt(`Ajustar quantidade de ${item.name} (${item.unit}):`, item.qty);
                if (newQty !== null) {
                    const val = parseFloat(newQty.replace(',', '.'));
                    if (!isNaN(val) && val > 0) { currentProductComposition[idx].qty = val; renderComposition(); } 
                    else if (newQty.trim() !== "") { showToast("Quantidade inválida.", true); }
                }
            };
        });

        container.querySelectorAll('.btn-rem-ing').forEach(btn => {
            btn.onclick = () => {
                currentProductComposition.splice(btn.dataset.idx, 1);
                renderComposition();
            };
        });
    };

    document.getElementById('btnAddIng').onclick = (e) => {
        e.preventDefault();
        const select = document.getElementById('ingSelect');
        const qtyInput = document.getElementById('ingQty');
        const id = select.value;
        const qty = parseFloat(qtyInput.value);
        if (id && qty > 0) {
            const opt = select.selectedOptions[0];
            currentProductComposition.push({
                id: id, name: opt.text.split(' (')[0], unit: opt.dataset.unit, cost: parseFloat(opt.dataset.cost), qty: qty
            });
            qtyInput.value = '';
            renderComposition();
        }
    };

    document.getElementById('prodCookTime').oninput = renderComposition;
    document.getElementById('prodEnergy').onchange = renderComposition;
    document.getElementById('prodTargetMargin').oninput = renderComposition;
    document.getElementById('prodPrice').oninput = renderComposition;

    renderComposition();

    document.getElementById('btnBackToHub').onclick = () => renderProductListConfig(container, document.getElementById('productActionsToolbar'));
    
    document.getElementById('btnSaveProduct').onclick = async () => {
        const btn = document.getElementById('btnSaveProduct');
        toggleLoading(btn, true, 'Salvando...');
        
        try {
            let rawPrice = document.getElementById('prodPrice').value || "0";
            let rawSalePrice = document.getElementById('prodSalePrice').value || "";
            const regularPrice = rawPrice.toString().replace(',', '.');
            const salePrice = document.getElementById('checkPromo').checked && rawSalePrice 
                ? rawSalePrice.toString().replace(',', '.') : ''; 

            let imageUrl = document.getElementById('prodImgUrl').value ? document.getElementById('prodImgUrl').value.trim() : '';
            let imagesArray = [];
            let localImageToSave = null; 
            
            if (imageUrl) {
                if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    imagesArray.push({ src: imageUrl });
                    localImageToSave = imageUrl;
                } else {
                    console.warn("Formato de imagem desconhecido ou inválido para Woo:", imageUrl);
                }
            }

            const basicData = {
                name: document.getElementById('prodName').value,
                regular_price: regularPrice,
                sale_price: salePrice,
                status: document.getElementById('prodStatus').value,
                meta_data: [ { key: 'sector', value: document.getElementById('prodSector').value } ],
                images: imagesArray
            };

            const extendedData = {
                composition: currentProductComposition,
                prepMethod: document.getElementById('prodPrepMethod').value,
                cookTime: parseFloat(document.getElementById('prodCookTime').value) || 0,
                energyType: document.getElementById('prodEnergy').value,
                group: document.getElementById('prodGroup').value,
                subgroup: document.getElementById('prodSubgroup').value,
                sector: document.getElementById('prodSector').value,
                targetMargin: parseFloat(document.getElementById('prodTargetMargin').value) || 0,
                localImage: localImageToSave,
                updatedAt: serverTimestamp()
            };

            let wooId = product?.id;
            
            if(isEdit) { 
                await updateWooProduct(product.id, basicData); 
            } else { 
                const newProd = await createWooProduct(basicData); 
                wooId = newProd.id; 
            }
            
            if (!imageUrl) {
                extendedData.localImage = null;
            }

            await setDoc(doc(getColRef('products'), wooId.toString()), extendedData, { merge: true });

            showToast("Produto salvo com sucesso!", false); 
            renderProductListConfig(container, document.getElementById('productActionsToolbar'));
        } catch(e) { 
            console.error(e); 
            let msg = e.message;
            if(e.code === 'internal' && e.details) msg = JSON.stringify(e.details);
            showToast("Erro ao salvar: " + msg, true); 
        } finally { 
            toggleLoading(btn, false); 
        }
    };
}

// ==================================================================
//           5. CONFIGURAÇÃO INICIAL
// ==================================================================

async function configureInitialCatalog() {
    const btn = document.getElementById('btnConfigInit');
    if(!confirm("Deseja configurar/atualizar Água, Café, Rolha e Salmão com fichas técnicas?")) return;
    toggleLoading(btn, true, 'Configurando...');
    try {
        const sectors = [{ name: 'Copa', type: 'production' }, { name: 'Bar', type: 'production' }, { name: 'Cozinha', type: 'production' }];
        for (const s of sectors) { const q = query(getSectorsCollectionRef(), where('name', '==', s.name)); const snap = await getDocs(q); if(snap.empty) await addDoc(getSectorsCollectionRef(), s); }
        const ingredientsData = [
            { name: 'Café em Grão', cost: 85.00, unit: 'kg', stock: 5, minStock: 1, group: 'Bebidas', costCategory: 'CMV' },
            { name: 'Água Mineral 500ml (Custo)', cost: 1.20, unit: 'un', stock: 100, minStock: 24, group: 'Bebidas', costCategory: 'CMV' },
            { name: 'Açúcar Sachê', cost: 0.10, unit: 'un', stock: 500, minStock: 50, group: 'Mercearia', costCategory: 'CMV' },
            { name: 'Filé de Salmão Fresco', cost: 65.00, unit: 'kg', stock: 5, minStock: 2, group: 'Hortifruti', costCategory: 'CMV' },
            { name: 'Polpa de Maracujá', cost: 18.00, unit: 'kg', stock: 2, minStock: 0.5, group: 'Hortifruti', costCategory: 'CMV' },
            { name: 'Manteiga sem Sal', cost: 45.00, unit: 'kg', stock: 5, minStock: 1, group: 'Laticínios', costCategory: 'CMV' },
            { name: 'Açúcar Refinado', cost: 4.50, unit: 'kg', stock: 10, minStock: 2, group: 'Mercearia', costCategory: 'CMV' }
        ];
        const createdIngs = {}; 
        for (const ing of ingredientsData) { const q = query(getColRef('ingredients'), where('name', '==', ing.name)); const snap = await getDocs(q); if(snap.empty) { const ref = await addDoc(getColRef('ingredients'), ing); createdIngs[ing.name] = ref.id; } else { createdIngs[ing.name] = snap.docs[0].id; } }
        const productsToConfig = [
            { searchName: 'Café', basic: { name: 'Café Expresso', regular_price: "8.00", status: 'publish', meta_data: [{ key: 'sector', value: 'Copa' }] }, extended: { group: 'Cafeteria', subgroup: 'Bebidas Quentes', sector: 'Copa', prepMethod: 'Moer o grão na hora. Extração de 30ml em 25 segundos.', cookTime: 0, energyType: 'electric', composition: [{ id: createdIngs['Café em Grão'], name: 'Café em Grão', qty: 0.007, cost: 85.00, unit: 'kg' }, { id: createdIngs['Açúcar Sachê'], name: 'Açúcar', qty: 1, cost: 0.10, unit: 'un' }] } },
            { searchName: 'Água', basic: { name: 'Água sem Gás 500ml', regular_price: "5.00", status: 'publish', meta_data: [{ key: 'sector', value: 'Copa' }] }, extended: { group: 'Bebidas', subgroup: 'Águas', sector: 'Copa', prepMethod: 'Servir gelada (ou natural) com copo.', cookTime: 0, energyType: 'none', composition: [{ id: createdIngs['Água Mineral 500ml (Custo)'], name: 'Água Mineral', qty: 1, cost: 1.20, unit: 'un' }] } },
            { searchName: 'Rolha', basic: { name: 'Taxa de Rolha', regular_price: "40.00", status: 'publish', meta_data: [{ key: 'sector', value: 'Bar' }] }, extended: { group: 'Serviços', subgroup: 'Taxas', sector: 'Bar', prepMethod: 'Serviço de abertura e taças.', cookTime: 0, energyType: 'none', composition: [] } },
            { searchName: 'Salmão', basic: { name: 'Salmão Grelhado ao Molho de Maracujá', regular_price: "58.00", status: 'publish', meta_data: [{ key: 'sector', value: 'Cozinha' }] }, extended: { group: 'Pratos Principais', subgroup: 'Peixes', sector: 'Cozinha', prepMethod: '1. Temperar o filé com sal e pimenta.\n2. Grelhar em chapa ou frigideira quente com um fio de azeite por 4-5 min de cada lado.\n3. Em uma sauteuse, colocar a polpa de maracujá e o açúcar. Deixar reduzir em fogo baixo.\n4. Finalizar o molho com a manteiga gelada para dar brilho (monter au beurre).\n5. Servir o peixe com o molho por cima.', cookTime: 15, energyType: 'gas', composition: [{ id: createdIngs['Filé de Salmão Fresco'], name: 'Filé de Salmão', qty: 0.220, cost: 65.00, unit: 'kg' }, { id: createdIngs['Polpa de Maracujá'], name: 'Polpa Maracujá', qty: 0.060, cost: 18.00, unit: 'kg' }, { id: createdIngs['Açúcar Refinado'], name: 'Açúcar', qty: 0.020, cost: 4.50, unit: 'kg' }, { id: createdIngs['Manteiga sem Sal'], name: 'Manteiga', qty: 0.010, cost: 45.00, unit: 'kg' }] } }
        ];
        const currentProducts = getProducts(); 
        for (const p of productsToConfig) { const existingProd = currentProducts.find(cp => cp.name.toLowerCase().includes(p.searchName.toLowerCase())); let wooId; if (existingProd) { wooId = existingProd.id; await updateWooProduct(wooId, p.basic); } else { const newProd = await createWooProduct(p.basic); wooId = newProd.id; } if (wooId) { await setDoc(doc(getColRef('products'), wooId.toString()), { ...p.extended, updatedAt: serverTimestamp() }, { merge: true }); } }
        showToast("Catálogo configurado com sucesso!", false); await fetchIngredients(); switchHubTab('products'); 
    } catch (e) { console.error(e); showToast("Erro ao configurar: " + e.message, true); } finally { toggleLoading(btn, false, 'Config. Iniciais'); }
}

// ==================================================================
//           6. GESTÃO DE INSUMOS
// ==================================================================

async function fetchIngredients() { try { const q = query(getColRef('ingredients'), orderBy('name')); const snap = await getDocs(q); ingredientsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); return ingredientsCache; } catch (e) { console.error(e); return []; } }

async function renderIngredientsScreen(container, toolbar) { 
    toolbar.innerHTML = `
        <div class="flex space-x-2 w-full justify-end">
            <button id="btnStockWriteOff" class="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 font-bold py-2 px-4 rounded-lg shadow flex items-center text-sm" title="Abater do estoque baseado nas vendas"><i class="fas fa-level-down-alt mr-2"></i> Baixar Estoque</button>
            <button id="btnNewIngredient" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center ml-2"><i class="fas fa-plus mr-2"></i> Novo</button>
        </div>`;
    
    document.getElementById('btnNewIngredient').onclick = () => renderIngredientForm(null); 
    document.getElementById('btnStockWriteOff').onclick = handleStockWriteOff; 
    
    if (ingredientsCache.length === 0) { 
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><p>Nenhum insumo cadastrado.</p></div>'; 
        return; 
    } 
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
            ${ingredientsCache.map(ing => `
                <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col justify-between group hover:border-gray-600 transition">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h4 class="font-bold text-white text-lg">${ing.name}</h4>
                            <p class="text-xs text-gray-400 uppercase">${ing.group || 'Sem Grupo'} • ${ing.costCategory || 'CMV'}</p>
                        </div>
                        <div class="flex space-x-2">
                            <button class="text-blue-400 hover:text-blue-300 p-1" onclick="window.editIngredient('${ing.id}')"><i class="fas fa-edit"></i></button>
                            <button class="text-red-400 hover:text-red-300 p-1" onclick="window.deleteIngredient('${ing.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="flex justify-between items-end mt-2 pt-2 border-t border-gray-700/50">
                        <div class="text-xs text-gray-500">R$ ${ing.cost.toFixed(2)} / ${ing.unit}</div>
                        <div class="text-right font-mono font-bold ${ing.stock <= (ing.minStock||0) ? 'text-red-500' : 'text-green-400'}">${ing.stock.toFixed(3)} ${ing.unit}</div>
                    </div>
                </div>`).join('')}
        </div>`; 
    
    window.editIngredient = (id) => renderIngredientForm(ingredientsCache.find(i => i.id === id)); 
    window.deleteIngredient = async (id) => { 
        if(confirm("Excluir este insumo?")) { 
            await deleteDoc(doc(getColRef('ingredients'), id)); 
            showToast("Insumo excluído."); 
            await fetchIngredients(); 
            switchHubTab('ingredients'); 
        } 
    }; 
}

async function handleStockWriteOff() { 
    const btn = document.getElementById('btnStockWriteOff'); 
    if(!confirm("Isso irá calcular o consumo dos últimos 30 dias e SUBTRAIR do estoque atual de todos os insumos. Continuar?")) return; 
    toggleLoading(btn, true, 'Calculando...'); 
    try { 
        const consumptionMap = await calculateConsumptionFromHistory(30); 
        const batch = writeBatch(db); 
        let updateCount = 0; 
        Object.entries(consumptionMap).forEach(([ingId, qtyConsumed]) => { 
            const ingRef = doc(getColRef('ingredients'), ingId); 
            batch.update(ingRef, { stock: increment(-qtyConsumed) }); 
            updateCount++; 
        }); 
        if(updateCount > 0) { 
            await batch.commit(); 
            showToast(`Estoque atualizado! ${updateCount} insumos baixados.`, false); 
            await fetchIngredients(); 
            switchHubTab('ingredients'); 
        } else { 
            showToast("Nenhum consumo detectado no período.", true); 
        } 
    } catch (e) { 
        console.error(e); 
        showToast("Erro na baixa de estoque.", true); 
    } finally { 
        toggleLoading(btn, false, 'Baixar Estoque'); 
    } 
}

function renderIngredientForm(ingredient = null) {
    const isEdit = !!ingredient;
    const modalHtml = `
        <div id="ingredientFormModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl m-4">
                <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                    <h3 class="text-xl font-bold text-white">${isEdit ? 'Editar Insumo' : 'Novo Insumo'}</h3>
                    <button onclick="document.getElementById('ingredientFormModal').remove()" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <div class="space-y-3">
                    <div><label class="text-xs text-gray-400 uppercase font-bold">Nome</label><input id="ingName" type="text" class="input-pdv w-full p-2" value="${ingredient?.name || ''}" placeholder="Ex: Leite Integral"></div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-xs text-gray-400 uppercase font-bold">Custo (R$)</label><input id="ingCost" type="number" class="input-pdv w-full p-2" value="${ingredient?.cost || ''}" placeholder="0.00" step="0.01"></div>
                        <div><label class="text-xs text-gray-400 uppercase font-bold">Unidade</label><input id="ingUnit" type="text" class="input-pdv w-full p-2" value="${ingredient?.unit || ''}" placeholder="Un, Kg, L"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                         <div><label class="text-xs text-gray-400 uppercase font-bold">Estoque Atual</label><input id="ingStock" type="number" class="input-pdv w-full p-2" value="${ingredient?.stock || ''}" placeholder="0"></div>
                         <div><label class="text-xs text-gray-400 uppercase font-bold">Estoque Mínimo</label><input id="ingMinStock" type="number" class="input-pdv w-full p-2" value="${ingredient?.minStock || 5}" placeholder="5"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-xs text-gray-400 uppercase font-bold">Grupo/Tipo</label><input id="ingGroup" type="text" class="input-pdv w-full p-2" value="${ingredient?.group || ''}" placeholder="Ex: Laticínios"></div>
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Categ. Custo</label>
                            <select id="ingCostCategory" class="input-pdv w-full p-2">
                                <option value="CMV" ${ingredient?.costCategory === 'CMV' ? 'selected' : ''}>CMV (Padrão)</option>
                                <option value="Limpeza" ${ingredient?.costCategory === 'Limpeza' ? 'selected' : ''}>Limpeza</option>
                                <option value="Embalagem" ${ingredient?.costCategory === 'Embalagem' ? 'selected' : ''}>Embalagem</option>
                                <option value="Desp. Operacional" ${ingredient?.costCategory === 'Desp. Operacional' ? 'selected' : ''}>Operacional</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
                    <button onclick="document.getElementById('ingredientFormModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500">Cancelar</button>
                    <button id="btnSaveIng" class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg">Salvar</button>
                </div>
            </div>
        </div>`;
        
    getSubModalContainer().innerHTML = modalHtml;
    
    document.getElementById('btnSaveIng').onclick = async () => {
        const name = document.getElementById('ingName').value;
        const cost = parseFloat(document.getElementById('ingCost').value) || 0;
        const unit = document.getElementById('ingUnit').value || 'un';
        const stock = parseFloat(document.getElementById('ingStock').value) || 0;
        const minStock = parseFloat(document.getElementById('ingMinStock').value) || 0;
        const group = document.getElementById('ingGroup').value;
        const costCategory = document.getElementById('ingCostCategory').value;
        
        if(!name) return;
        
        const data = { name, cost, stock, unit, minStock, group, costCategory, updatedAt: serverTimestamp() };
        
        if (isEdit) {
            await updateDoc(doc(getColRef('ingredients'), ingredient.id), data);
        } else {
            await addDoc(getColRef('ingredients'), { ...data, createdAt: serverTimestamp() });
        }
        
        document.getElementById('ingredientFormModal').remove();
        showToast("Insumo Salvo!");
        await fetchIngredients();
        switchHubTab('ingredients');
    };
}

// ==================================================================
//           7. LISTA DE COMPRAS & FORNECEDORES
// ==================================================================

async function renderShoppingListScreen(container, toolbar) { 
    toolbar.innerHTML = `
        <div class="flex items-center space-x-2 w-full justify-end">
            <button id="btnCalcHistory" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center text-sm mr-2 whitespace-nowrap"><i class="fas fa-chart-line mr-2"></i> Sugerir</button>
            <button id="btnQuoteSelected" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"><i class="fas fa-file-invoice-dollar mr-2"></i> Cotar</button>
        </div>`; 
    
    document.getElementById('btnCalcHistory').onclick = () => generateShoppingListFromHistory(container); 
    const list = ingredientsCache.filter(i => i.stock <= (i.minStock || 5)); 
    renderShoppingListTable(container, list, "Estoque Baixo"); 
}

async function generateShoppingListFromHistory(container) { 
    const btn = document.getElementById('btnCalcHistory'); 
    toggleLoading(btn, true, 'Analisando...'); 
    try { 
        const consumptionMap = await calculateConsumptionFromHistory(30); 
        const suggestionList = []; 
        ingredientsCache.forEach(ing => { 
            const consumed = consumptionMap[ing.id] || 0; 
            const safetyMargin = consumed * 0.2; 
            const needed = (consumed + safetyMargin) - ing.stock; 
            if (needed > 0) { 
                suggestionList.push({ ...ing, suggestedQty: needed, consumedLastMonth: consumed }); 
            } 
        }); 
        renderShoppingListTable(container, suggestionList, "Sugestão por Vendas", true); 
    } catch(e) { 
        console.error(e); 
        showToast("Erro na análise.", true); 
    } finally { 
        toggleLoading(btn, false, 'Sugerir'); 
    } 
}

function renderShoppingListTable(container, list, title, isHistory = false) { 
    if(list.length === 0) { 
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-green-500"><i class="fas fa-check-circle text-4xl mb-2"></i><p>${title}: Nada a comprar.</p></div>`; 
        return; 
    } 
    const headerExtra = isHistory ? '<th class="p-3 text-right whitespace-nowrap">Consumo</th>' : ''; 
    container.innerHTML = `
        <h4 class="text-white font-bold mb-2 ml-1">${title}</h4>
        <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
            <table class="w-full text-left text-gray-300 min-w-[600px]">
                <thead class="bg-gray-900 text-xs uppercase">
                    <tr>
                        <th class="p-3 w-10"><input type="checkbox" id="selectAllBuy" class="h-4 w-4 bg-gray-700 border-gray-500 rounded" checked></th>
                        <th class="p-3">Item</th>
                        ${headerExtra}
                        <th class="p-3 text-right whitespace-nowrap">Comprar</th>
                        <th class="p-3 text-right whitespace-nowrap">Atual</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                    ${list.map(i => { 
                        const qtyToBuy = isHistory ? i.suggestedQty : ((i.minStock || 5) - i.stock); 
                        return `
                        <tr class="hover:bg-gray-700/50">
                            <td class="p-3"><input type="checkbox" class="buy-check h-4 w-4 bg-gray-700 border-gray-500 rounded" value="${i.id}" checked></td>
                            <td class="p-3 font-bold text-white">${i.name}</td>
                            ${isHistory ? `<td class="p-3 text-right text-gray-400 font-mono">${i.consumedLastMonth.toFixed(2)}</td>` : ''}
                            <td class="p-3 text-right text-yellow-400 font-bold font-mono">${qtyToBuy.toFixed(2)} ${i.unit}</td>
                            <td class="p-3 text-right text-gray-500 font-mono">${i.stock}</td>
                        </tr>`; 
                    }).join('')}
                </tbody>
            </table>
        </div>`; 
    
    const btnQuote = document.getElementById('btnQuoteSelected'); 
    const checkboxes = container.querySelectorAll('.buy-check'); 
    const updateBtnState = () => { 
        const count = container.querySelectorAll('.buy-check:checked').length; 
        if(btnQuote) { 
            btnQuote.disabled = count === 0; 
            btnQuote.innerHTML = `<i class="fas fa-file-invoice-dollar mr-2"></i> Cotar (${count})`; 
        } 
    }; 
    document.getElementById('selectAllBuy').onchange = (e) => { checkboxes.forEach(cb => cb.checked = e.target.checked); updateBtnState(); }; 
    checkboxes.forEach(cb => cb.onchange = updateBtnState); 
    if(btnQuote) btnQuote.onclick = () => { 
        const selectedIds = Array.from(container.querySelectorAll('.buy-check:checked')).map(cb => cb.value); 
        openQuoteModal(selectedIds); 
    }; 
    updateBtnState(); 
}

function openQuoteModal(itemIds) { 
    const modalHtml = `
        <div id="quoteModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl m-4">
                <div class="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                    <h3 class="text-xl font-bold text-white">Solicitar Orçamento</h3>
                    <button onclick="document.getElementById('quoteModal').remove()" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <p class="text-gray-400 text-sm mb-4">Selecione os fornecedores para enviar o pedido de cotação de <b>${itemIds.length} itens</b>.</p>
                <div class="max-h-60 overflow-y-auto custom-scrollbar bg-gray-900 p-3 rounded border border-gray-700 mb-4 space-y-2">
                    ${suppliersCache.length > 0 ? suppliersCache.map(s => `<label class="flex items-center space-x-3 p-2 hover:bg-gray-800 rounded cursor-pointer"><input type="checkbox" class="supplier-check h-5 w-5 text-indigo-600 rounded bg-gray-700 border-gray-500" value="${s.id}"><span class="text-white">${s.name}</span></label>`).join('') : '<p class="text-gray-500 italic">Nenhum fornecedor cadastrado.</p>'}
                </div>
                <div class="flex justify-end space-x-3">
                    <button onclick="document.getElementById('quoteModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg">Cancelar</button>
                    <button id="btnSendQuote" class="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">Enviar Solicitação</button>
                </div>
            </div>
        </div>`; 
    
    getSubModalContainer().innerHTML = modalHtml; 
    
    document.getElementById('btnSendQuote').onclick = async () => { 
        const selectedSuppliers = Array.from(document.querySelectorAll('.supplier-check:checked')).map(cb => cb.value); 
        if(selectedSuppliers.length === 0) { showToast("Selecione ao menos um fornecedor.", true); return; } 
        const btn = document.getElementById('btnSendQuote'); 
        toggleLoading(btn, true, 'Enviando...'); 
        try { 
            const batch = writeBatch(db); 
            const quoteId = `quote_${Date.now()}`; 
            const items = ingredientsCache.filter(i => itemIds.includes(i.id)); 
            for(const supId of selectedSuppliers) { 
                const supplier = suppliersCache.find(s => s.id === supId); 
                const quoteRef = doc(getColRef('quotations')); 
                const pricedItems = items.map(item => { 
                    const variation = (Math.random() * 0.4) - 0.2; 
                    const newPrice = item.cost * (1 + variation); 
                    return { itemId: item.id, name: item.name, qty: (item.minStock || 5) - item.stock, price: parseFloat(newPrice.toFixed(2)) }; 
                }); 
                batch.set(quoteRef, { supplierId: supId, supplierName: supplier.name, items: pricedItems, status: 'received', createdAt: serverTimestamp(), quoteGroupId: quoteId }); 
            } 
            await batch.commit(); 
            document.getElementById('quoteModal').remove(); 
            showToast("Cotações solicitadas!", false); 
            switchHubTab('lowestCost'); 
        } catch(e) { 
            console.error(e); 
            showToast("Erro ao solicitar.", true); 
            toggleLoading(btn, false, 'Enviar'); 
        } 
    }; 
}

async function fetchSuppliers() { try { const q = query(getColRef('suppliers'), orderBy('name')); const snap = await getDocs(q); suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { console.error(e); } }

async function renderSuppliersScreen(container, toolbar) { 
    toolbar.innerHTML = `
        <div class="flex space-x-2 w-full justify-end">
            <button id="btnSeedSuppliers" class="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg shadow text-sm"><i class="fas fa-users mr-2"></i> Gerar Fictícios</button>
            <button onclick="window.openSupplierModal()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow ml-auto"><i class="fas fa-plus mr-2"></i> Novo Fornecedor</button>
        </div>`; 
    
    document.getElementById('btnSeedSuppliers').onclick = generateFictionalSuppliers; 
    
    if (suppliersCache.length === 0) { container.innerHTML = '<p class="text-center text-gray-500 mt-10">Sem fornecedores.</p>'; return; } 
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
            ${suppliersCache.map(d => `
                <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-white">${d.name}</h4>
                        <p class="text-xs text-gray-400">${d.phone || 'Sem telefone'}</p>
                    </div>
                    <div class="text-right">
                        <button class="text-red-400 hover:text-red-300" onclick="alert('Deletar em breve')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`).join('')}
        </div>`; 
    
    injectSupplierModal(); 
}

async function generateFictionalSuppliers() { 
    const btn = document.getElementById('btnSeedSuppliers'); 
    toggleLoading(btn, true, 'Gerando...'); 
    const fakes = [{ name: 'Atacadão do Chef', phone: '(11) 99999-1001' }, { name: 'Hortifruti Fresco', phone: '(11) 98888-2002' }, { name: 'Distribuidora de Bebidas 24h', phone: '(11) 97777-3003' }, { name: 'Embalagens & Cia', phone: '(11) 96666-4004' }, { name: 'Laticínios da Fazenda', phone: '(11) 95555-5005' }]; 
    try { 
        for (const s of fakes) { 
            const exists = suppliersCache.some(sc => sc.name === s.name); 
            if(!exists) await addDoc(getColRef('suppliers'), s); 
        } 
        showToast("Fornecedores gerados!", false); 
        await fetchSuppliers(); 
        switchHubTab('suppliers'); 
    } catch(e) { console.error(e); } finally { toggleLoading(btn, false, 'Gerar Fictícios'); } 
}

function injectSupplierModal() { 
    if(document.getElementById('supplierFormModal')) return; 
    
    const modalHtml = `
        <div id="supplierFormModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] hidden animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl m-4">
                <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                    <h3 class="text-lg font-bold text-white">Novo Fornecedor</h3>
                    <button onclick="document.getElementById('supplierFormModal').style.display='none'" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <input id="supName" type="text" class="input-pdv w-full p-2 mb-3" placeholder="Nome da Empresa">
                <input id="supPhone" type="text" class="input-pdv w-full p-2 mb-3" placeholder="Telefone / WhatsApp">
                <div class="flex justify-end space-x-2 mt-4">
                    <button onclick="document.getElementById('supplierFormModal').style.display='none'" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                    <button onclick="window.saveSupplier()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </div>
        </div>`; 
    
    getSubModalContainer().innerHTML = modalHtml; 
    
    window.openSupplierModal = () => document.getElementById('supplierFormModal').style.display = 'flex'; 
    window.saveSupplier = async () => { 
        const name = document.getElementById('supName').value; 
        const phone = document.getElementById('supPhone').value; 
        if(!name) return; 
        await addDoc(getColRef('suppliers'), { name, phone }); 
        document.getElementById('supplierFormModal').style.display = 'none'; 
        showToast("Fornecedor salvo!"); 
        await fetchSuppliers(); 
        switchHubTab('suppliers'); 
    }; 
}

async function renderLowestCostScreen(container, toolbar) { 
    toolbar.innerHTML = `<div class="text-xs text-gray-400 italic w-full text-right">* Baseado nas últimas cotações recebidas.</div>`; 
    container.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-green-500"></i></div>'; 
    try { 
        const q = query(getColRef('quotations'), where('status', '==', 'received'), orderBy('createdAt', 'desc')); 
        const snap = await getDocs(q); 
        if(snap.empty) { 
            container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-search-dollar text-4xl mb-2"></i><p>Nenhuma cotação recente encontrada. Vá em "Lista de Compras" e solicite um orçamento.</p></div>'; 
            return; 
        } 
        const comparisonMap = {}; 
        snap.forEach(doc => { 
            const quote = doc.data(); 
            quote.items.forEach(item => { 
                if (!comparisonMap[item.itemId]) { comparisonMap[item.itemId] = { name: item.name, prices: [] }; } 
                comparisonMap[item.itemId].prices.push({ supplier: quote.supplierName, price: item.price, date: quote.createdAt }); 
            }); 
        }); 
        let html = `<div class="grid grid-cols-1 gap-4 pb-20">`; 
        Object.values(comparisonMap).forEach(itemData => { 
            const sortedPrices = itemData.prices.sort((a, b) => a.price - b.price); 
            const bestPrice = sortedPrices[0]; 
            html += `<div class="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg"><div class="flex justify-between items-center mb-3 border-b border-gray-600 pb-2"><h3 class="text-lg font-bold text-white">${itemData.name}</h3><span class="bg-green-900 text-green-300 text-xs px-2 py-1 rounded border border-green-700">Melhor: ${bestPrice.supplier}</span></div><div class="space-y-2">${sortedPrices.map((p, index) => { const isBest = index === 0; return `<div class="flex justify-between items-center p-2 rounded ${isBest ? 'bg-green-900/20 border border-green-500/50' : 'bg-dark-input'}"><span class="text-sm text-gray-300">${p.supplier}</span><span class="font-mono font-bold ${isBest ? 'text-green-400 text-base' : 'text-gray-400 text-sm'}">${formatCurrency(p.price)}${isBest ? '<i class="fas fa-trophy ml-2 text-yellow-400"></i>' : ''}</span></div>`; }).join('')}</div></div>`; 
        }); 
        html += `</div>`; 
        container.innerHTML = html; 
    } catch(e) { 
        console.error("Erro comparação:", e); 
        container.innerHTML = `<p class="text-red-400 text-center">Erro ao carregar comparações.</p>`; 
    } 
}
