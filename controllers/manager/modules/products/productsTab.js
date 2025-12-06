import { storage, ref, uploadBytes, getDownloadURL, getSectorsCollectionRef } from "/services/firebaseService.js";
import { doc, setDoc, deleteDoc, serverTimestamp, getDoc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, toggleLoading, showToast } from "/utils.js";
// CORREÇÃO: Removido 'getCategories' da importação
import { getProducts, createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCommerceProducts } from "/services/wooCommerceService.js?v=2";
import * as Store from "./store.js";

let currentProductComposition = []; 
const COST_GAS_PER_HOUR = 6.00; 
const COST_ENERGY_PER_HOUR = 1.50;

// ==================================================================
//            1. CONFIGURAÇÃO INICIAL (UPLOAD DE IMAGENS)
// ==================================================================
export function setupImageUpload() {
    window.handleImageUpload = async (input) => {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const preview = document.getElementById('imgPreview');
            const icon = document.getElementById('imgPlaceholderIcon');
            const urlInput = document.getElementById('prodImgUrl');
            const btnSave = document.getElementById('btnSaveProduct');

            // Validação
            const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                showToast("Formato inválido! Use JPG, PNG ou WEBP.", true);
                input.value = ''; return;
            }
            if (file.size > 2 * 1024 * 1024) {
                showToast("Imagem muito grande! Limite de 2MB.", true);
                input.value = ''; return;
            }

            // Preview Imediato
            const reader = new FileReader();
            reader.onload = (e) => {
                if(preview) { preview.src = e.target.result; preview.classList.remove('hidden'); }
                if(icon) icon.classList.add('hidden');
            };
            reader.readAsDataURL(file);

            // Upload
            if(btnSave) { btnSave.disabled = true; btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subindo...'; }
            showToast("Enviando imagem...", false);
            
            try {
                const ext = file.name.split('.').pop().toLowerCase();
                const cleanName = file.name.split('.')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                const fileName = `products/${Date.now()}_${cleanName}.${ext}`;
                const storageRef = ref(storage, fileName);
                
                await uploadBytes(storageRef, file);
                const publicUrl = await getDownloadURL(storageRef);
                
                if(urlInput) { urlInput.value = publicUrl; urlInput.dispatchEvent(new Event('input')); }
                showToast("Imagem carregada!", false);
            } catch (error) {
                console.error("Erro no upload:", error);
                showToast("Erro ao subir imagem: " + error.message, true);
            } finally {
                if(btnSave) { btnSave.disabled = false; btnSave.innerHTML = '<i class="fas fa-save mr-2"></i> Salvar Produto'; }
            }
        }
    };
}

// ==================================================================
//            2. LISTA DE PRODUTOS (GRID RESPONSIVO)
// ==================================================================
export async function renderProductListConfig(contentDiv, toolbarDiv) {
    // CORREÇÃO: Busca de setores do Firebase em vez de categorias do Woo
    let sectorOptions = '<option value="all">Todos os Setores</option>';
    try {
        const q = query(getSectorsCollectionRef(), orderBy('order', 'asc'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(doc => {
            const s = doc.data();
            if (s.isActive !== false) {
                sectorOptions += `<option value="${s.name}">${s.name}</option>`;
            }
        });
        // Fallback se vazio
        if (querySnapshot.empty) {
            sectorOptions += '<option value="Cozinha">Cozinha</option><option value="Bar">Bar</option>';
        }
    } catch (e) {
        console.error("Erro ao buscar setores:", e);
    }
    
    toolbarDiv.innerHTML = `
        <div class="flex flex-col md:flex-row items-center w-full gap-3">
            <div class="flex items-center space-x-2 w-full md:w-auto flex-grow">
                <select id="hubCategoryFilter" class="bg-gray-700 text-white text-sm py-2 px-3 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 w-1/3 md:w-48">
                    ${sectorOptions}
                </select>
                <div class="relative w-2/3 md:w-full">
                    <input type="text" id="hubSearchInput" placeholder="Buscar produto..." class="bg-dark-input text-white text-sm py-2 px-3 pl-9 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 w-full">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
            </div>
            
            <div class="flex items-center space-x-2 flex-shrink-0 ml-auto">
                <button id="btnConfigInit" class="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/30 font-bold py-2 px-3 rounded-lg flex items-center text-xs whitespace-nowrap border border-yellow-600/50" title="Configurações Iniciais">
                    <i class="fas fa-cogs mr-1"></i> Config
                </button>
                <button id="hubNewProductBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center text-sm">
                    <i class="fas fa-plus mr-2"></i> Novo Produto
                </button>
            </div>
        </div>`;

    const btnNew = document.getElementById('hubNewProductBtn');
    if(btnNew) btnNew.onclick = () => renderProductForm(null, contentDiv);
    
    const btnConfig = document.getElementById('btnConfigInit');
    if(btnConfig) btnConfig.onclick = configureInitialCatalog; 
    
    let hubSector = 'all'; // Renomeado de hubCategory para hubSector
    let hubSearch = '';
    let searchTimeout;

    const renderList = async (page = 1) => {
        contentDiv.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>';
        
        // CORREÇÃO: Passamos string vazia no filtro de categoria do Woo, pois filtraremos por setor localmente
        await fetchWooCommerceProducts(page, hubSearch, '', false);
        await Store.fetchProductExtensions();
        
        let products = getProducts();
        
        // CORREÇÃO: Filtro local por Setor
        if (hubSector !== 'all') {
            products = products.filter(p => {
                const extData = Store.productExtensionsCache[p.id] || {};
                const pSector = extData.sector || p.sector || '';
                return pSector.toLowerCase() === hubSector.toLowerCase();
            });
        }
        
        if (products.length === 0) {
            contentDiv.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-500">
                    <i class="fas fa-box-open text-4xl mb-3 opacity-50"></i>
                    <p>Nenhum produto encontrado.</p>
                </div>`;
            return;
        }

        const listHtml = products.map(p => {
            const extData = Store.productExtensionsCache[p.id] || {};
            const displayImage = extData.localImage || (p.image && !p.image.includes('placehold') ? p.image : 'https://placehold.co/150');
            const hasComposition = extData.composition && extData.composition.length > 0;
            
            const alertIcon = !hasComposition ? `<i class="fas fa-exclamation-triangle text-yellow-500 absolute top-1 left-1 bg-black/60 rounded-full p-1 text-[10px]" title="Sem ficha técnica"></i>` : '';
            const statusBadge = p.status === 'draft' ? `<span class="absolute top-1 left-1 bg-gray-600 text-white text-[9px] px-1 py-0.5 rounded shadow">Rascunho</span>` : '';
            const sectorLabel = p.sector || extData.sector || 'Geral';

            return `
            <div class="bg-dark-input rounded-xl border border-gray-700 hover:border-indigo-500 transition group relative overflow-hidden flex flex-col h-full shadow-sm hover:shadow-md cursor-pointer btn-edit-prod" data-id="${p.id}">
                <div class="w-full aspect-square bg-gray-800 relative overflow-hidden">
                    <img src="${displayImage}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80"></div>
                    ${!hasComposition ? alertIcon : statusBadge}
                    
                    <div class="absolute top-1 right-1 flex flex-col space-y-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="bg-white/90 text-indigo-600 hover:bg-white p-1 rounded-full shadow-lg transform hover:scale-110 transition btn-edit-action" data-id="${p.id}" title="Editar"><i class="fas fa-edit text-xs"></i></button>
                        <button class="bg-white/90 text-red-500 hover:bg-white p-1 rounded-full shadow-lg transform hover:scale-110 transition btn-del-prod" data-id="${p.id}" title="Excluir"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </div>
                <div class="p-2 flex flex-col flex-grow justify-between">
                    <div>
                        <h4 class="font-bold text-white text-xs md:text-sm leading-tight mb-1 line-clamp-2">${p.name}</h4>
                        <p class="text-[9px] text-gray-400 uppercase tracking-wide mb-1 truncate">${sectorLabel}</p>
                    </div>
                    <div class="flex items-center justify-between border-t border-gray-700 pt-1 mt-1">
                        <div class="flex flex-col">
                            <div class="flex items-center">
                                ${p.on_sale 
                                    ? `<span class="text-[9px] text-gray-500 line-through mr-1">${formatCurrency(p.price)}</span>
                                       <span class="text-xs font-bold text-yellow-400">${formatCurrency(p.sale_price)}</span>`
                                    : `<span class="text-xs font-bold text-green-400">${formatCurrency(p.price)}</span>`
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        // Grid: 3 colunas base -> aumenta conforme a tela
        contentDiv.innerHTML = `<div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-20">${listHtml}</div>`;
        
        // Listeners
        contentDiv.querySelectorAll('.btn-edit-prod').forEach(card => card.onclick = (e) => { 
            if(e.target.closest('.btn-del-prod') || e.target.closest('.btn-edit-action')) return;
            const prod = products.find(p => p.id == card.dataset.id); 
            renderProductForm(prod, contentDiv); 
        });
        
        contentDiv.querySelectorAll('.btn-edit-action').forEach(btn => btn.onclick = (e) => {
            e.stopPropagation();
            const prod = products.find(p => p.id == btn.dataset.id); 
            renderProductForm(prod, contentDiv); 
        });

        contentDiv.querySelectorAll('.btn-del-prod').forEach(btn => btn.onclick = (e) => { 
            e.stopPropagation();
            handleDeleteProduct(btn.dataset.id); 
        });
    };

    const catFilter = document.getElementById('hubCategoryFilter');
    if(catFilter) catFilter.onchange = (e) => { hubSector = e.target.value; renderList(1); };
    
    const searchInput = document.getElementById('hubSearchInput');
    if(searchInput) searchInput.oninput = (e) => { hubSearch = e.target.value; clearTimeout(searchTimeout); searchTimeout = setTimeout(() => renderList(1), 600); };
    
    renderList(1);
}

// ==================================================================
//            3. FORMULÁRIO DE PRODUTO (NOVO/EDITAR)
// ==================================================================
async function renderProductForm(product = null, container) {
    const isEdit = !!product;
    let extendedData = {};
    currentProductComposition = [];
    
    if (isEdit) {
        try {
            const docSnap = await getDoc(doc(Store.getColRef('products'), product.id.toString()));
            if (docSnap.exists()) {
                extendedData = docSnap.data();
                currentProductComposition = extendedData.composition || [];
            }
        } catch (e) { console.error("Erro ao carregar ficha técnica:", e); }
    }

    // Busca setores do Firebase para preencher o Select
    let sectors = [];
    try {
        const sectorsSnap = await getDocs(query(getSectorsCollectionRef(), orderBy('order', 'asc')));
        sectors = sectorsSnap.docs.map(d => d.data().name);
    } catch(e) { console.error("Erro setores:", e); }
    
    if(sectors.length === 0) sectors.push('Cozinha', 'Bar', 'Copa'); 
    
    const price = product?.price || '';
    const salePrice = product?.sale_price || '';
    const onSale = !!salePrice; 
    const prodImage = extendedData.localImage || (product?.image && !product.image.includes('placehold') ? product.image : '');

    container.innerHTML = `
        <div class="w-full h-full flex flex-col bg-dark-bg animate-fade-in relative">
            
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-700 flex-shrink-0 bg-gray-800 p-3 -mx-3 -mt-3 rounded-t-lg">
                <div class="flex items-center">
                    <button id="btnBackToHub" class="text-gray-400 hover:text-white mr-3 text-lg"><i class="fas fa-arrow-left"></i></button>
                    <h4 class="text-lg font-bold text-white flex items-center">
                        ${isEdit ? '<span class="text-blue-400 mr-2">Editando:</span>' : '<span class="text-green-400 mr-2">Novo:</span>'}
                        <span class="truncate max-w-[200px] md:max-w-md">${product?.name || 'Produto Sem Nome'}</span>
                    </h4>
                </div>
                <div class="flex space-x-2">
                     <span class="text-xs text-gray-500 uppercase font-bold self-center hidden md:block">ID: ${product?.id || 'Novo'}</span>
                </div>
            </div>
            
            <div class="flex space-x-1 bg-gray-800 p-1 rounded-lg mb-4 flex-shrink-0">
                <button class="flex-1 py-2 text-sm font-bold rounded-md bg-indigo-600 text-white form-tab-btn transition" data-tab="geral">
                    <i class="fas fa-info-circle mr-1"></i> Geral
                </button>
                <button class="flex-1 py-2 text-sm font-bold rounded-md text-gray-400 hover:text-white hover:bg-gray-700 form-tab-btn transition" data-tab="ficha">
                    <i class="fas fa-carrot mr-1"></i> Ficha Téc.
                </button>
                <button class="flex-1 py-2 text-sm font-bold rounded-md text-gray-400 hover:text-white hover:bg-gray-700 form-tab-btn transition" data-tab="preparo">
                    <i class="fas fa-fire mr-1"></i> Custos
                </button>
            </div>

            <div class="flex-grow overflow-y-auto custom-scrollbar pb-24" id="formTabContainer">
                
                <div id="ft-geral" class="form-tab-content">
                    <div class="flex flex-col md:flex-row gap-6">
                        <div class="w-full md:w-1/3 flex flex-col items-center">
                            <div class="w-full aspect-square bg-gray-800 rounded-xl border-2 border-dashed border-gray-600 flex items-center justify-center overflow-hidden relative group hover:border-indigo-500 transition">
                                <img id="imgPreview" src="${prodImage}" class="w-full h-full object-cover ${!prodImage ? 'hidden' : ''}">
                                <div id="imgPlaceholderIcon" class="text-center ${prodImage ? 'hidden' : ''}">
                                    <i class="fas fa-camera text-gray-600 text-4xl mb-2"></i>
                                    <p class="text-xs text-gray-500">Clique para enviar</p>
                                </div>
                                <input type="file" id="prodImgInput" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onchange="window.handleImageUpload(this)">
                            </div>
                            <div class="w-full mt-3">
                                <label class="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Ou cole URL externa:</label>
                                <div class="flex">
                                    <input type="text" id="prodImgUrl" class="input-pdv w-full text-xs rounded-r-none border-r-0" placeholder="https://..." value="${prodImage}">
                                    <button class="bg-gray-700 border border-l-0 border-gray-600 rounded-r px-2 text-gray-400"><i class="fas fa-link"></i></button>
                                </div>
                            </div>
                        </div>

                        <div class="w-full md:w-2/3 space-y-4">
                            <div>
                                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Produto</label>
                                <input type="text" id="prodName" class="input-pdv w-full text-lg font-bold" value="${product?.name || ''}" placeholder="Ex: X-Bacon Artesanal" required>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-gray-800 p-3 rounded-lg border border-gray-700">
                                    <label class="block text-xs text-blue-400 uppercase font-bold mb-1">Preço Venda (R$)</label>
                                    <input type="number" id="prodPrice" class="input-pdv w-full font-mono text-2xl font-bold bg-gray-900 border-blue-500/50 focus:border-blue-500 text-white" step="0.01" value="${price}" placeholder="0.00">
                                </div>
                                <div class="bg-gray-800 p-3 rounded-lg border border-gray-700 relative">
                                    <label class="flex items-center text-xs text-yellow-400 uppercase font-bold mb-1 cursor-pointer">
                                        <input type="checkbox" id="checkPromo" class="mr-2 rounded text-yellow-500 bg-gray-700 border-gray-500" ${onSale ? 'checked' : ''}>
                                        Preço Promo
                                    </label>
                                    <input type="number" id="prodSalePrice" class="input-pdv w-full font-mono text-xl font-bold text-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed" step="0.01" value="${salePrice}" placeholder="0.00" ${!onSale ? 'disabled' : ''}>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Setor de Produção</label>
                                    <select id="prodSector" class="input-pdv w-full">
                                        ${sectors.map(s => `<option value="${s}" ${product?.sector === s || extendedData?.sector === s ? 'selected' : ''}>${s}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Visibilidade</label>
                                    <select id="prodStatus" class="input-pdv w-full">
                                        <option value="publish" ${product?.status === 'publish' ? 'selected' : ''}>Publicado (Visível)</option>
                                        <option value="draft" ${product?.status === 'draft' ? 'selected' : ''}>Rascunho (Oculto)</option>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Grupo</label><input type="text" id="prodGroup" class="input-pdv w-full text-sm" placeholder="Ex: Lanches" value="${extendedData.group || ''}"></div>
                                <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Subgrupo</label><input type="text" id="prodSubgroup" class="input-pdv w-full text-sm" placeholder="Ex: Artesanais" value="${extendedData.subgroup || ''}"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="ft-ficha" class="form-tab-content hidden">
                    <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 mb-4">
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-2">Adicionar Insumo à Receita</label>
                        <div class="flex flex-col md:flex-row gap-2">
                            <div class="flex-grow relative">
                                <input type="text" id="ingSearchInput" list="ingDatalist" class="input-pdv w-full" placeholder="Digite para buscar insumo...">
                                <datalist id="ingDatalist">
                                    ${Store.ingredientsCache.map(i => `<option value="${i.name}">${i.unit} - R$ ${i.cost}</option>`).join('')}
                                </datalist>
                                <input type="hidden" id="selectedIngId">
                                <input type="hidden" id="selectedIngCost">
                                <input type="hidden" id="selectedIngUnit">
                            </div>
                            <div class="w-full md:w-32">
                                <input type="number" id="ingQty" placeholder="Qtd" class="input-pdv w-full text-center font-bold" step="0.001">
                            </div>
                            <button id="btnAddIng" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold shadow transition md:w-auto w-full">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>

                    <div class="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden shadow-inner">
                        <table class="w-full text-left text-sm text-gray-300">
                            <thead class="bg-gray-800 text-xs uppercase font-bold text-gray-400">
                                <tr>
                                    <th class="p-3">Insumo</th>
                                    <th class="p-3 text-right">Qtd</th>
                                    <th class="p-3 text-right">Custo</th>
                                    <th class="p-3 text-center">Remover</th>
                                </tr>
                            </thead>
                            <tbody id="compositionTableBody" class="divide-y divide-gray-800"></tbody>
                        </table>
                        <div id="emptyCompositionMsg" class="p-8 text-center text-gray-600 italic hidden">
                            Nenhum insumo adicionado a esta ficha técnica.
                        </div>
                    </div>
                </div>

                <div id="ft-preparo" class="form-tab-content hidden">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Modo de Preparo</label>
                                <textarea id="prodPrepMethod" class="input-pdv w-full h-40 text-sm leading-relaxed" placeholder="Descreva o passo a passo para a cozinha...">${extendedData.prepMethod || ''}</textarea>
                            </div>
                        </div>
                        
                        <div class="space-y-4">
                            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700">
                                <h5 class="text-sm font-bold text-white mb-3 flex items-center"><i class="fas fa-burn text-orange-500 mr-2"></i> Custo Operacional (Estimado)</h5>
                                <div class="grid grid-cols-2 gap-4">
                                    <div><label class="block text-[10px] text-gray-500 uppercase mb-1">Tempo (Min)</label><input type="number" id="prodCookTime" class="input-pdv w-full text-center" value="${extendedData.cookTime || 0}"></div>
                                    <div>
                                        <label class="block text-[10px] text-gray-500 uppercase mb-1">Energia</label>
                                        <select id="prodEnergy" class="input-pdv w-full">
                                            <option value="none" ${!extendedData.energyType ? 'selected' : ''}>Nenhum</option>
                                            <option value="gas" ${extendedData.energyType === 'gas' ? 'selected' : ''}>Gás</option>
                                            <option value="electric" ${extendedData.energyType === 'electric' ? 'selected' : ''}>Elétrica</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-gray-800 p-4 rounded-xl border border-gray-700">
                                <h5 class="text-sm font-bold text-white mb-3 flex items-center"><i class="fas fa-chart-line text-blue-500 mr-2"></i> Precificação Reversa</h5>
                                <div>
                                    <label class="block text-[10px] text-gray-500 uppercase mb-1">Margem Alvo (%)</label>
                                    <div class="flex gap-2">
                                        <input type="number" id="prodTargetMargin" class="input-pdv w-24 text-center" value="${extendedData.targetMargin || 100}">
                                        <div class="flex-grow bg-gray-900 rounded border border-gray-600 flex items-center px-3 text-sm text-gray-400">
                                            Sugestão: <span id="prodSuggestedPrice" class="ml-auto font-bold text-white">R$ 0,00</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <div class="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-3 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
                <div class="flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
                    
                    <div class="flex space-x-2 md:space-x-6 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 justify-center">
                        <div class="text-center min-w-[80px]">
                            <span class="block text-[10px] text-gray-500 uppercase">Custo (CMV)</span>
                            <span id="analysisCmvDisplay" class="block text-sm md:text-xl font-bold text-red-400">R$ 0,00</span>
                        </div>
                        <div class="text-center min-w-[80px] border-l border-gray-700 pl-2 md:pl-6">
                            <span class="block text-[10px] text-gray-500 uppercase">Venda</span>
                            <span id="analysisSaleDisplay" class="block text-sm md:text-xl font-bold text-white">R$ 0,00</span>
                        </div>
                        <div class="text-center min-w-[80px] border-l border-gray-700 pl-2 md:pl-6">
                            <span class="block text-[10px] text-gray-500 uppercase">Lucro</span>
                            <span id="analysisProfitDisplay" class="block text-sm md:text-xl font-bold text-green-400">R$ 0,00</span>
                        </div>
                        <div class="text-center min-w-[60px] pl-2 hidden md:block">
                            <span class="block text-[10px] text-gray-500 uppercase">Margem</span>
                            <span id="analysisMarginDisplay" class="block text-xs font-mono text-gray-400">0%</span>
                        </div>
                    </div>

                    <button type="button" id="btnSaveProduct" class="w-full md:w-auto px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center text-sm uppercase tracking-wide">
                        <i class="fas fa-save mr-2"></i> Salvar Produto
                    </button>
                </div>
            </div>

        </div>`;

    const ingSearchInput = document.getElementById('ingSearchInput');
    const selectedIngId = document.getElementById('selectedIngId');
    const selectedIngCost = document.getElementById('selectedIngCost');
    const selectedIngUnit = document.getElementById('selectedIngUnit');

    if(ingSearchInput) {
        ingSearchInput.oninput = (e) => {
            const val = e.target.value;
            const match = Store.ingredientsCache.find(i => i.name === val);
            if(match) {
                selectedIngId.value = match.id;
                selectedIngCost.value = match.cost;
                selectedIngUnit.value = match.unit;
                document.getElementById('ingQty').focus();
            } else {
                selectedIngId.value = '';
            }
        };
    }

    const urlInput = document.getElementById('prodImgUrl');
    if (urlInput) urlInput.addEventListener('input', function() { document.getElementById('imgPreview').src = this.value; document.getElementById('imgPreview').classList.remove('hidden'); document.getElementById('imgPlaceholderIcon').classList.add('hidden'); });

    const checkPromo = document.getElementById('checkPromo');
    checkPromo.onchange = () => { 
        document.getElementById('prodSalePrice').disabled = !checkPromo.checked; 
        if(!checkPromo.checked) document.getElementById('prodSalePrice').value = ''; 
        else document.getElementById('prodSalePrice').focus();
        renderComposition(); 
    };

    container.querySelectorAll('.form-tab-btn').forEach(btn => btn.onclick = () => {
        container.querySelectorAll('.form-tab-btn').forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('text-gray-400'); });
        btn.classList.add('bg-indigo-600', 'text-white'); btn.classList.remove('text-gray-400');
        container.querySelectorAll('.form-tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`ft-${btn.dataset.tab}`).classList.remove('hidden');
    });

    const renderComposition = () => {
        const tbody = document.getElementById('compositionTableBody');
        const emptyMsg = document.getElementById('emptyCompositionMsg');
        
        if(currentProductComposition.length === 0) {
            tbody.innerHTML = '';
            emptyMsg.classList.remove('hidden');
        } else {
            emptyMsg.classList.add('hidden');
            let totalIngCost = 0;
            
            tbody.innerHTML = currentProductComposition.map((item, idx) => {
                const cost = item.cost * item.qty;
                totalIngCost += cost;
                return `
                    <tr class="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition">
                        <td class="p-3">
                            <span class="block font-bold text-white text-sm">${item.name}</span>
                            <span class="text-[10px] text-gray-500">Unit: R$ ${item.cost}/${item.unit}</span>
                        </td>
                        <td class="p-3 text-right">
                             <input type="number" class="w-16 bg-gray-900 border border-gray-700 rounded text-center text-xs text-yellow-400 font-bold p-1 change-qty-input" data-idx="${idx}" value="${item.qty}" step="0.001">
                             <span class="text-[10px] text-gray-500 ml-1">${item.unit}</span>
                        </td>
                        <td class="p-3 text-right text-gray-400 font-mono text-xs">${formatCurrency(cost)}</td>
                        <td class="p-3 text-center">
                            <button class="text-red-500 hover:text-red-300 btn-rem-ing p-2" data-idx="${idx}"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`;
            }).join('');
        }
        
        const totalIngCost = currentProductComposition.reduce((acc, i) => acc + (i.cost * i.qty), 0);
        const time = parseFloat(document.getElementById('prodCookTime').value) || 0;
        const energyCost = (time / 60) * (document.getElementById('prodEnergy').value === 'gas' ? COST_GAS_PER_HOUR : (document.getElementById('prodEnergy').value === 'electric' ? COST_ENERGY_PER_HOUR : 0));
        const finalCmv = totalIngCost + energyCost;
        
        // Verifica se o elemento existe antes de atualizar
        if(document.getElementById('analysisCmvDisplay')) {
            document.getElementById('analysisCmvDisplay').textContent = formatCurrency(finalCmv);
        }

        const regPrice = parseFloat(document.getElementById('prodPrice').value) || 0;
        const promoPrice = parseFloat(document.getElementById('prodSalePrice').value) || 0;
        const activePrice = (checkPromo.checked && promoPrice > 0) ? promoPrice : regPrice;

        if(document.getElementById('analysisSaleDisplay')) {
            document.getElementById('analysisSaleDisplay').textContent = formatCurrency(activePrice);
        }
        
        const profit = activePrice - finalCmv;
        if(document.getElementById('analysisProfitDisplay')) {
            const profitEl = document.getElementById('analysisProfitDisplay');
            profitEl.textContent = formatCurrency(profit);
            profitEl.className = `block text-sm md:text-xl font-bold ${profit > 0 ? 'text-green-400' : 'text-red-500'}`;
        }

        const markup = finalCmv > 0 ? ((profit / finalCmv) * 100).toFixed(1) : 0;
        if(document.getElementById('analysisMarginDisplay')) {
            document.getElementById('analysisMarginDisplay').textContent = `${markup}%`;
        }
        
        const targetMargin = parseFloat(document.getElementById('prodTargetMargin').value) || 0;
        if(document.getElementById('prodSuggestedPrice')) {
            document.getElementById('prodSuggestedPrice').textContent = formatCurrency(finalCmv * (1 + (targetMargin / 100)));
        }

        container.querySelectorAll('.change-qty-input').forEach(inp => inp.onchange = (e) => {
            const idx = e.target.dataset.idx;
            const val = parseFloat(e.target.value);
            if(val > 0) { currentProductComposition[idx].qty = val; renderComposition(); }
        });
        container.querySelectorAll('.btn-rem-ing').forEach(btn => btn.onclick = () => { currentProductComposition.splice(btn.dataset.idx, 1); renderComposition(); });
    };

    document.getElementById('btnAddIng').onclick = (e) => { 
        e.preventDefault(); 
        const nameVal = document.getElementById('ingSearchInput').value;
        const idVal = document.getElementById('selectedIngId').value;
        const costVal = parseFloat(document.getElementById('selectedIngCost').value);
        const unitVal = document.getElementById('selectedIngUnit').value;
        const qty = parseFloat(document.getElementById('ingQty').value); 
        
        if (nameVal && qty > 0) { 
            if(!idVal) {
                showToast("Selecione um insumo da lista!", true);
                return;
            }
            currentProductComposition.push({ id: idVal, name: nameVal, unit: unitVal, cost: costVal, qty }); 
            document.getElementById('ingSearchInput').value = '';
            document.getElementById('selectedIngId').value = '';
            document.getElementById('ingQty').value = '';
            renderComposition(); 
        }
    };

    document.getElementById('prodCookTime').oninput = renderComposition;
    document.getElementById('prodEnergy').onchange = renderComposition;
    document.getElementById('prodTargetMargin').oninput = renderComposition;
    document.getElementById('prodPrice').oninput = (e) => {
        const p = parseFloat(e.target.value) || 0;
        if(document.getElementById('analysisCmvDisplay')) {
            const cmvText = document.getElementById('analysisCmvDisplay').textContent;
            const cmv = parseFloat(cmvText.replace('R$','').replace(/\./g,'').replace(',','.')) || 0;
            if (cmv > 0 && p > 0) document.getElementById('prodTargetMargin').value = (((p / cmv) - 1) * 100).toFixed(1);
        }
        renderComposition();
    };
    document.getElementById('prodSalePrice').oninput = renderComposition;

    renderComposition(); 

    document.getElementById('btnBackToHub').onclick = () => renderProductListConfig(container, document.getElementById('productActionsToolbar'));
    
    document.getElementById('btnSaveProduct').onclick = async () => {
        const btn = document.getElementById('btnSaveProduct'); toggleLoading(btn, true, 'Salvando...');
        try {
            const basic = { 
                name: document.getElementById('prodName').value, 
                regular_price: document.getElementById('prodPrice').value.replace(',','.'), 
                sale_price: checkPromo.checked ? document.getElementById('prodSalePrice').value.replace(',','.') : '', 
                status: document.getElementById('prodStatus').value, 
                // CORREÇÃO: Salva o setor no metadado do Woo também
                meta_data: [{ key: 'sector', value: document.getElementById('prodSector').value }], 
                images: document.getElementById('prodImgUrl').value ? [{ src: document.getElementById('prodImgUrl').value }] : [] 
            };
            const extended = { 
                composition: currentProductComposition, 
                prepMethod: document.getElementById('prodPrepMethod').value, 
                cookTime: parseFloat(document.getElementById('prodCookTime').value)||0, 
                energyType: document.getElementById('prodEnergy').value, 
                group: document.getElementById('prodGroup').value, 
                subgroup: document.getElementById('prodSubgroup').value, 
                sector: document.getElementById('prodSector').value, 
                targetMargin: parseFloat(document.getElementById('prodTargetMargin').value)||0, 
                localImage: document.getElementById('prodImgUrl').value || null, 
                updatedAt: serverTimestamp() 
            };
            
            const wooId = isEdit ? (await updateWooProduct(product.id, basic)).id : (await createWooProduct(basic)).id;
            await setDoc(doc(Store.getColRef('products'), wooId.toString()), extended, { merge: true });
            
            showToast("Produto salvo com sucesso!", false); 
            renderProductListConfig(container, document.getElementById('productActionsToolbar'));
        } catch(e) { 
            console.error(e); 
            showToast("Erro: " + e.message, true); 
        } finally { 
            toggleLoading(btn, false); 
        }
    };
}

// ==================================================================
//            4. FUNÇÕES AUXILIARES
// ==================================================================
async function handleDeleteProduct(id) {
    if(confirm("Excluir produto?")) {
        try { 
            await deleteWooProduct(id); 
            await deleteDoc(doc(Store.getColRef('products'), id.toString())); 
            showToast("Excluído."); 
            // Atualiza a lista chamando o botão de novo (ou re-renderizando a lista se possível)
            // Para simplificar e garantir atualização sem refatorar tudo, re-abrimos a lista.
            const contentDiv = document.getElementById('hubContent');
            const toolbarDiv = document.getElementById('productActionsToolbar');
            if(contentDiv && toolbarDiv) renderProductListConfig(contentDiv, toolbarDiv);
        } catch(e) { 
            showToast("Erro: " + e.message, true); 
        }
    }
}

async function configureInitialCatalog() {
    if(!confirm("Criar dados demonstrativos?")) return;
    const btn = document.getElementById('btnConfigInit'); toggleLoading(btn, true, 'Config...');
    try { 
        await window.runInitialSetup(); 
        showToast("Dados carregados!"); 
        await Store.refreshAllCaches(); 
        const contentDiv = document.getElementById('hubContent');
        const toolbarDiv = document.getElementById('productActionsToolbar');
        if(contentDiv && toolbarDiv) renderProductListConfig(contentDiv, toolbarDiv);
    } catch(e) { 
        console.error(e); 
    } finally { 
        toggleLoading(btn, false, 'Config. Iniciais'); 
    }
}