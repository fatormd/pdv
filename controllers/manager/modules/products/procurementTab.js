import { addDoc, doc, writeBatch, serverTimestamp, query, where, orderBy, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from "/services/firebaseService.js";
import { showToast, toggleLoading, formatCurrency } from "/utils.js";
import * as Store from "./store.js";

// Estado Local
let currentSubTab = 'list'; // 'list' (Necessidades) | 'suppliers' | 'quotes'
let currentGroupFilter = 'all';
let currentSupplierCategory = 'all';
let currentSupplierSearch = '';

// ==================================================================
//            1. DASHBOARD DE COMPRAS (HUB)
// ==================================================================

export function renderPurchasesDashboard(container, toolbar) {
    // 1. Renderiza a Navegação Secundária na Toolbar
    const navHtml = `
        <div class="flex items-center bg-gray-900 rounded-lg p-1 space-x-1 mr-4 overflow-x-auto flex-shrink-0">
            <button class="sub-tab-btn px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition flex items-center ${currentSubTab === 'list' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}" data-tab="list">
                <i class="fas fa-list-ul mr-2"></i> Necessidades
            </button>
            <button class="sub-tab-btn px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition flex items-center ${currentSubTab === 'suppliers' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}" data-tab="suppliers">
                <i class="fas fa-truck mr-2"></i> Fornecedores
            </button>
            <button class="sub-tab-btn px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition flex items-center ${currentSubTab === 'quotes' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}" data-tab="quotes">
                <i class="fas fa-tags mr-2"></i> Menor Custo
            </button>
        </div>
        
        <div id="subTabTools" class="flex-grow flex items-center justify-end space-x-2"></div>
    `;
    
    toolbar.innerHTML = navHtml;
    
    // Listeners de Navegação
    toolbar.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.onclick = () => {
            currentSubTab = btn.dataset.tab;
            renderPurchasesDashboard(container, toolbar); // Re-renderiza para atualizar visual e conteúdo
        };
    });

    // 2. Renderiza o Conteúdo da Sub-aba Ativa
    const toolsContainer = toolbar.querySelector('#subTabTools');
    
    if (currentSubTab === 'list') renderShoppingListScreen(container, toolsContainer);
    else if (currentSubTab === 'suppliers') renderSuppliersScreen(container, toolsContainer);
    else if (currentSubTab === 'quotes') renderLowestCostScreen(container, toolsContainer);
}

// ==================================================================
//            2. SUB-ABA: LISTA DE NECESSIDADES
// ==================================================================

function renderShoppingListScreen(container, toolsContainer) {
    // Filtros de Grupo na Toolbar
    let groupOptions = '<option value="all">Todos os Grupos</option>';
    if (Store.groupsCache.length > 0) {
        groupOptions += Store.groupsCache.map(g => {
            const gId = g.name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return `<option value="${gId}" ${currentGroupFilter === gId ? 'selected' : ''}>${g.name}</option>`;
        }).join('');
    }

    toolsContainer.innerHTML = `
        <select id="shoppingGroupFilter" class="bg-gray-700 text-white text-xs py-1.5 px-2 rounded border border-gray-600 focus:outline-none focus:border-indigo-500 w-32 mr-2">
            ${groupOptions}
        </select>
        <button id="btnCalcHistory" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded text-xs shadow flex items-center whitespace-nowrap">
            <i class="fas fa-magic mr-1"></i> Sugestão IA
        </button>
    `;
    
    document.getElementById('shoppingGroupFilter').onchange = (e) => { 
        currentGroupFilter = e.target.value; 
        renderShoppingListScreen(container, toolsContainer); 
    };
    document.getElementById('btnCalcHistory').onclick = () => generateShoppingListFromHistory(container); 

    // Lógica de Dados (Itens com Estoque Baixo)
    let lowStockItems = Store.ingredientsCache.filter(i => i.stock <= (i.minStock || 5));
    if (currentGroupFilter !== 'all') {
        lowStockItems = lowStockItems.filter(i => i.group === currentGroupFilter);
    }
    
    const itemsByGroup = {};
    lowStockItems.forEach(item => {
        const gKey = item.group || 'sem_grupo';
        if (!itemsByGroup[gKey]) itemsByGroup[gKey] = [];
        itemsByGroup[gKey].push(item);
    });

    let displayGroups = [...Store.groupsCache];
    if (itemsByGroup['sem_grupo']) displayGroups.push({ name: 'Outros / Geral', id: 'sem_grupo_id', isVirtual: true });

    // Renderiza Grid
    if (lowStockItems.length === 0) {
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-green-500"><i class="fas fa-check-circle text-5xl mb-4"></i><h3 class="text-xl font-bold">Estoque em dia!</h3><p class="text-gray-400 mt-2">Nenhum item crítico para compra.</p></div>`;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
            ${displayGroups.map(g => {
                const gKey = g.isVirtual ? 'sem_grupo' : g.name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const items = itemsByGroup[gKey] || [];
                if (items.length === 0) return '';

                return `
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 hover:border-indigo-500 hover:bg-gray-750 transition cursor-pointer group-card relative overflow-hidden group" data-group-key="${gKey}" data-group-name="${g.name}">
                    <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition"><i class="fas fa-shopping-basket text-6xl text-white"></i></div>
                    <div class="relative z-10">
                        <h4 class="font-bold text-white text-lg truncate mb-1">${g.name}</h4>
                        <div class="flex items-center space-x-2 mb-3"><span class="bg-red-900/50 text-red-300 text-xs px-2 py-1 rounded border border-red-800 font-bold">${items.length} itens</span></div>
                        <p class="text-xs text-gray-400">Clique para ver lista</p>
                    </div>
                </div>`;
            }).join('')}
        </div>`;

    container.querySelectorAll('.group-card').forEach(card => {
        card.onclick = () => {
            const items = itemsByGroup[card.dataset.groupKey] || [];
            openGroupItemsModal(card.dataset.groupName, items);
        };
    });
}

// ==================================================================
//            3. SUB-ABA: FORNECEDORES
// ==================================================================

function renderSuppliersScreen(container, toolsContainer) {
    const uniqueCategories = [...new Set(Store.suppliersCache.map(s => s.category).filter(c => c))].sort();
    const catOptions = `<option value="all">Todas</option>` + uniqueCategories.map(c => `<option value="${c}" ${currentSupplierCategory === c ? 'selected' : ''}>${c}</option>`).join('');

    toolsContainer.innerHTML = `
        <select id="supCategoryFilter" class="bg-gray-700 text-white text-xs py-1.5 px-2 rounded border border-gray-600 w-24 md:w-32 mr-2">${catOptions}</select>
        <input type="text" id="supSearchInput" value="${currentSupplierSearch}" placeholder="Buscar..." class="bg-dark-input text-white text-xs py-1.5 px-2 rounded border border-gray-600 w-24 md:w-32 mr-2">
        <button onclick="window.openSupplierModal()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded text-xs shadow"><i class="fas fa-plus"></i></button>
    `;
    
    document.getElementById('supCategoryFilter').onchange = (e) => { 
        currentSupplierCategory = e.target.value; 
        renderSuppliersScreen(container, toolsContainer); 
    };
    document.getElementById('supSearchInput').oninput = (e) => { 
        currentSupplierSearch = e.target.value; 
        renderSupplierGrid(container, filterSuppliers()); 
    };

    renderSupplierGrid(container, filterSuppliers());
    injectSupplierModal();
}

function filterSuppliers() {
    return Store.suppliersCache.filter(s => {
        const matchCat = currentSupplierCategory === 'all' || s.category === currentSupplierCategory;
        const matchName = !currentSupplierSearch || s.name.toLowerCase().includes(currentSupplierSearch.toLowerCase());
        return matchCat && matchName;
    });
}

function renderSupplierGrid(container, list) {
    if (list.length === 0) { 
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><p>Nenhum fornecedor encontrado.</p></div>'; 
        return; 
    }
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
            ${list.map(d => `
                <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center hover:border-gray-500 transition group">
                    <div>
                        <h4 class="font-bold text-white text-lg">${d.name}</h4>
                        <div class="flex items-center space-x-2 mt-1">
                            ${d.category ? `<span class="bg-indigo-900/50 text-indigo-300 text-[10px] px-2 py-0.5 rounded border border-indigo-800 uppercase font-bold">${d.category}</span>` : ''}
                            <span class="text-xs text-gray-400"><i class="fas fa-phone-alt mr-1 text-gray-600"></i> ${d.phone || '-'}</span>
                        </div>
                    </div>
                    <div class="text-right opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="text-red-400 hover:text-red-300 p-2" onclick="window.deleteSupplier('${d.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`).join('')}
        </div>`;
        
    window.deleteSupplier = async (id) => {
        if(confirm("Excluir fornecedor?")) {
            await deleteDoc(doc(Store.getColRef('suppliers'), id));
            showToast("Fornecedor excluído.");
            await Store.fetchSuppliers();
            // Atualiza a tela recarregando a aba atual
            const toolbar = document.getElementById('productActionsToolbar');
            if(toolbar) toolbar.querySelector('[data-tab="suppliers"]').click();
        }
    };
}

// ==================================================================
//            4. SUB-ABA: MENOR CUSTO
// ==================================================================

async function renderLowestCostScreen(container, toolsContainer) {
    toolsContainer.innerHTML = `<span class="text-xs text-gray-500 italic hidden md:inline">* Baseado nas últimas cotações.</span>`;
    container.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-green-500"></i></div>';
    
    try {
        const snap = await getDocs(query(Store.getColRef('price_quotations'), where('status', '==', 'received'), orderBy('createdAt', 'desc')));
        if(snap.empty) { 
            container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-search-dollar text-4xl mb-4"></i><p>Nenhuma cotação recebida.</p></div>'; 
            return; 
        }
        
        const map = {}; 
        snap.forEach(d => d.data().items.forEach(i => { 
            if(!map[i.itemId]) map[i.itemId] = { name: i.name, prices: [] }; 
            map[i.itemId].prices.push({ supplier: d.data().supplierName, price: i.price }); 
        }));
        
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                ${Object.values(map).map(item => { 
                    const sorted = item.prices.sort((a,b)=>a.price-b.price);
                    const best = sorted[0]; 
                    return `
                    <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-lg">
                        <div class="flex justify-between items-center mb-3 border-b border-gray-600 pb-2">
                            <h3 class="text-sm font-bold text-white">${item.name}</h3>
                            <span class="bg-green-900 text-green-300 text-[10px] px-2 py-1 rounded">Melhor: ${best.supplier}</span>
                        </div>
                        <div class="space-y-1">
                            ${sorted.map((p,i) => `<div class="flex justify-between p-1.5 rounded ${i===0?'bg-green-900/20 border border-green-500/50':'bg-dark-input'}"><span class="text-xs text-gray-300">${p.supplier}</span><span class="font-mono font-bold ${i===0?'text-green-400':'text-gray-400'} text-xs">${formatCurrency(p.price)}</span></div>`).join('')}
                        </div>
                    </div>`; 
                }).join('')}
            </div>`;
    } catch(e) { container.innerHTML = `<p class="text-red-400 text-center mt-10">${e.message}</p>`; }
}

// ==================================================================
//            5. MODALS E HELPERS
// ==================================================================

function openGroupItemsModal(groupName, items, isHistory = false) {
    items.sort((a, b) => a.name.localeCompare(b.name));
    Store.getSubModalContainer().innerHTML = `
        <div id="groupItemsModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[95] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                <div class="flex justify-between items-center p-5 border-b border-gray-700 bg-gray-800 rounded-t-xl shrink-0">
                    <div><h3 class="text-xl font-bold text-white flex items-center"><i class="fas fa-shopping-cart mr-3 text-indigo-400"></i> ${groupName}</h3></div>
                    <button onclick="document.getElementById('groupItemsModal').remove()" class="text-gray-400 hover:text-white text-2xl leading-none px-2">&times;</button>
                </div>
                <div class="flex-grow overflow-y-auto custom-scrollbar p-0">
                    <table class="w-full text-left text-gray-300">
                        <thead class="bg-gray-900 text-xs uppercase sticky top-0 z-10 shadow-sm">
                            <tr><th class="p-4 w-10 text-center"><input type="checkbox" id="selectAllGroup" class="h-4 w-4 bg-gray-700 border-gray-500 rounded cursor-pointer" checked></th><th class="p-4">Item</th><th class="p-4 text-right">Comprar</th><th class="p-4 text-right">Estoque</th></tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700 bg-dark-bg/50">
                            ${items.map(i => {
                                const qtyToBuy = isHistory ? i.suggestedQty : ((i.minStock || 5) - i.stock);
                                return `<tr class="hover:bg-gray-700/30 transition group-row cursor-pointer" onclick="document.getElementById('cb_${i.id}').click()"><td class="p-4 text-center" onclick="event.stopPropagation()"><input type="checkbox" id="cb_${i.id}" class="buy-check h-5 w-5 bg-gray-700 border-gray-500 rounded cursor-pointer text-indigo-500 focus:ring-0" value="${i.id}" checked></td><td class="p-4"><span class="block font-bold text-white text-base">${i.name}</span><span class="text-xs text-gray-500">Mín: ${i.minStock || 5} ${i.unit}</span></td><td class="p-4 text-right text-yellow-400 font-bold font-mono">${(qtyToBuy > 0 ? qtyToBuy : 0).toFixed(2)} ${i.unit}</td><td class="p-4 text-right text-gray-500 font-mono">${parseFloat(i.stock).toFixed(2)}</td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="p-4 border-t border-gray-700 bg-gray-800 rounded-b-xl flex justify-between items-center shrink-0">
                    <span class="text-xs text-gray-500 ml-2" id="selectedCountDisplay">0 selecionados</span>
                    <div class="flex space-x-3">
                        <button onclick="document.getElementById('groupItemsModal').remove()" class="px-5 py-2.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition font-medium">Voltar</button>
                        <button id="btnQuoteGroup" class="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition shadow-lg flex items-center disabled:opacity-50 disabled:cursor-not-allowed"><i class="fas fa-file-invoice-dollar mr-2"></i> Cotar Selecionados</button>
                    </div>
                </div>
            </div>
        </div>`;

    const modal = document.getElementById('groupItemsModal');
    const checkboxes = modal.querySelectorAll('.buy-check');
    const btnQuote = document.getElementById('btnQuoteGroup');
    const countDisplay = document.getElementById('selectedCountDisplay');
    const selectAll = document.getElementById('selectAllGroup');

    const updateState = () => {
        const count = modal.querySelectorAll('.buy-check:checked').length;
        btnQuote.disabled = count === 0;
        countDisplay.textContent = `${count} selecionados`;
        if(count === 0) selectAll.checked = false; else if(count === checkboxes.length) selectAll.checked = true;
    };

    selectAll.onchange = (e) => { checkboxes.forEach(cb => cb.checked = e.target.checked); updateState(); };
    checkboxes.forEach(cb => cb.onchange = updateState);
    updateState();

    btnQuote.onclick = () => {
        const selectedIds = Array.from(modal.querySelectorAll('.buy-check:checked')).map(cb => cb.value);
        openQuoteModal(selectedIds);
    };
}

function openQuoteModal(ids) {
    const itemsToQuote = Store.ingredientsCache.filter(i => ids.includes(i.id));
    Store.getSubModalContainer().innerHTML = `
        <div id="quoteModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[95] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-lg shadow-2xl relative">
                <button onclick="document.getElementById('quoteModal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
                <h3 class="text-xl font-bold text-white mb-2">Solicitar Orçamento</h3>
                <p class="text-gray-400 text-sm mb-4">Selecione os fornecedores para cotar <b>${itemsToQuote.length} itens</b>.</p>
                <div class="max-h-60 overflow-y-auto bg-gray-900 p-3 rounded border border-gray-700 mb-6 space-y-2 custom-scrollbar">
                    ${Store.suppliersCache.length > 0 ? Store.suppliersCache.map(s => `
                        <label class="flex items-center space-x-3 p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition border border-transparent hover:border-gray-600">
                            <input type="checkbox" class="supplier-check h-5 w-5 bg-gray-700 border-gray-500 rounded text-indigo-500 focus:ring-0" value="${s.id}">
                            <span class="text-white font-medium">${s.name} <span class="text-xs text-gray-500 ml-1">(${s.category || 'Geral'})</span></span>
                        </label>`).join('') : '<p class="text-gray-500 italic text-center p-4">Nenhum fornecedor cadastrado.</p>'}
                </div>
                <div class="flex justify-end space-x-3 pt-2 border-t border-gray-700">
                    <button onclick="document.getElementById('quoteModal').remove()" class="px-5 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Cancelar</button>
                    <button id="btnSendQuote" class="px-5 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg disabled:opacity-50">Enviar Solicitação</button>
                </div>
            </div>
        </div>`;
    
    document.getElementById('btnSendQuote').onclick = async () => {
        const sups = Array.from(document.querySelectorAll('.supplier-check:checked')).map(cb => cb.value);
        if(sups.length === 0) return showToast("Selecione fornecedor", true);
        const btn = document.getElementById('btnSendQuote'); toggleLoading(btn, true, 'Enviando...');
        try {
            const batch = writeBatch(db); const qId = `quote_${Date.now()}`;
            sups.forEach(sId => {
                const supplier = Store.suppliersCache.find(s => s.id === sId);
                const quoteRef = doc(Store.getColRef('price_quotations'));
                batch.set(quoteRef, { supplierId: sId, supplierName: supplier.name, items: itemsToQuote.map(i => ({ itemId: i.id, name: i.name, qty: (i.minStock||5)-i.stock > 0 ? (i.minStock||5)-i.stock : 0, price: parseFloat((i.cost*(1+(Math.random()*0.4)-0.2)).toFixed(2)) })), status: 'received', createdAt: serverTimestamp(), quoteGroupId: qId });
            });
            await batch.commit(); document.getElementById('quoteModal').remove(); showToast("Solicitações enviadas!", false);
        } catch(e) { console.error(e); showToast("Erro.", true); } finally { if(btn) toggleLoading(btn, false, 'Enviar'); }
    };
}

function injectSupplierModal() {
    window.openSupplierModal = () => {
        Store.getSubModalContainer().innerHTML = `<div id="supplierFormModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] animate-fade-in p-4"><div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-md shadow-2xl relative"><button onclick="document.getElementById('supplierFormModal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button><h3 class="text-lg font-bold text-white mb-4">Novo Fornecedor</h3><div class="space-y-3"><input id="supName" type="text" class="input-pdv w-full p-2" placeholder="Nome"><input id="supCategory" type="text" class="input-pdv w-full p-2" placeholder="Categoria (Bebidas, Carnes...)" list="catList"><datalist id="catList">${[...new Set(Store.suppliersCache.map(s => s.category).filter(Boolean))].map(c => `<option value="${c}">`).join('')}</datalist><input id="supPhone" type="text" class="input-pdv w-full p-2" placeholder="Telefone"></div><div class="flex justify-end space-x-2 mt-6 border-t border-gray-700 pt-4"><button onclick="window.saveSupplier()" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button></div></div></div>`;
    };
    window.saveSupplier = async () => {
        const name = document.getElementById('supName').value; const phone = document.getElementById('supPhone').value; const category = document.getElementById('supCategory').value;
        if(name) { 
            await addDoc(Store.getColRef('suppliers'), { name, phone, category }); 
            document.getElementById('supplierFormModal').remove(); 
            showToast("Fornecedor salvo!"); 
            await Store.fetchSuppliers(); 
            const toolbar = document.getElementById('productActionsToolbar'); 
            if(toolbar) toolbar.querySelector('[data-tab="suppliers"]').click();
        }
    };
}