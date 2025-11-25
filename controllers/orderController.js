// --- CONTROLLERS/ORDERCONTROLLER.JS (VERSÃO FINAL - MENSAGENS DE ERRO CLARAS) ---

import { getProducts, getCategories, fetchWooCommerceProducts } from "/services/wooCommerceService.js"; 
import { formatCurrency, formatElapsedTime, maskPhoneNumber, toggleLoading } from "/utils.js";
import { saveSelectedItemsToFirebase, getTableDocRef, getKdsCollectionRef, getQuickObsCollectionRef } from "/services/firebaseService.js";
import { currentTableId, selectedItems, currentOrderSnapshot, showToast, userId } from "/app.js"; 
import { arrayUnion, serverTimestamp, doc, setDoc, updateDoc, arrayRemove, getDocs, query, orderBy, getDoc, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { goToScreen } from "/app.js"; 

// --- VARIÁVEIS DE ELEMENTOS ---
let obsModal, obsItemName, obsInput, saveObsBtn, cancelObsBtn, esperaSwitch;
let searchProductInput, categoryFiltersContainer, menuItemsGrid;
let openOrderList, openItemsCount, sendSelectedItemsBtn;
let quickObsButtons, clientPendingOrdersContainer;
let loadMoreProductsBtn;

// --- ESTADO LOCAL ---
let currentSearch = '';
let currentCategoryFilter = 'all';
let currentPage = 1;
let searchTimeout = null;
let orderInitialized = false;


// ==================================================================
//               RENDERIZAÇÃO DO CARDÁPIO
// ==================================================================

export const renderMenu = (append = false) => {
    if (!menuItemsGrid || !categoryFiltersContainer) return;

    const categories = getCategories();
    if (categoryFiltersContainer.innerHTML.trim() === '' || !append) {
        categoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentCategoryFilter ? 'bg-pumpkin text-white' : 'bg-dark-input text-dark-text border border-gray-600';
            return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }

    const products = getProducts();
    if (!append) menuItemsGrid.innerHTML = '';

    if (products.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-gray-500 italic">Nenhum produto encontrado.</div>`;
        removeLoadMoreButton();
        return;
    }

    let displayProducts = products;
    if (currentCategoryFilter === 'top10') {
        const top10Ids = JSON.parse(localStorage.getItem('top10_products') || '[]');
        displayProducts = products.filter(p => top10Ids.includes(p.id.toString()));
        displayProducts.sort((a, b) => top10Ids.indexOf(a.id.toString()) - top10Ids.indexOf(b.id.toString()));
    }

    const itemsHtml = displayProducts.map((product, index) => {
        let badge = '';
        if (currentCategoryFilter === 'top10' && index < 3) {
            const colors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];
            badge = `<i class="fas fa-medal ${colors[index]} absolute top-2 right-2 text-xl drop-shadow-md"></i>`;
        }
        const productJson = JSON.stringify(product).replace(/'/g, '&#39;');

        return `
        <div class="product-card bg-dark-card border border-gray-700 p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150 flex flex-col justify-between relative" style="min-height: 140px;">
            ${badge}
            <h4 class="font-bold text-base text-dark-text flex-grow pr-6">${product.name}</h4>
            <div class="flex justify-between items-center mt-2">
                <span class="font-bold text-lg text-pumpkin">${formatCurrency(product.price)}</span>
                <button class="add-item-btn bg-green-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-green-700 transition shadow-lg"
                        data-product='${productJson}'>
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    if (append) {
        removeLoadMoreButton();
        menuItemsGrid.insertAdjacentHTML('beforeend', itemsHtml);
    } else {
        menuItemsGrid.innerHTML = itemsHtml;
    }

    if (currentCategoryFilter !== 'top10') {
        renderLoadMoreButton();
    }
};

const renderLoadMoreButton = () => {
    removeLoadMoreButton();
    loadMoreProductsBtn = document.createElement('button');
    loadMoreProductsBtn.id = 'loadMoreProductsBtn';
    loadMoreProductsBtn.className = 'col-span-full mt-4 py-3 bg-dark-input border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition font-semibold';
    loadMoreProductsBtn.innerHTML = 'Carregar Mais Produtos';
    loadMoreProductsBtn.onclick = handleLoadMore;
    menuItemsGrid.appendChild(loadMoreProductsBtn);
};

const removeLoadMoreButton = () => {
    const existingBtn = document.getElementById('loadMoreProductsBtn');
    if (existingBtn) existingBtn.remove();
};

const handleLoadMore = async () => {
    currentPage++;
    const btn = document.getElementById('loadMoreProductsBtn');
    toggleLoading(btn, true, 'Carregando...');
    const newItems = await fetchWooCommerceProducts(currentPage, currentSearch, currentCategoryFilter, true);
    if (newItems.length === 0) {
        showToast("Não há mais produtos.", false);
        if(btn) btn.style.display = 'none';
    } else {
        renderMenu(true);
    }
};

const handleSearch = (e) => {
    const term = e.target.value;
    currentSearch = term;
    currentPage = 1; 
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        menuItemsGrid.innerHTML = '<div class="col-span-full text-center py-10"><i class="fas fa-spinner fa-spin text-pumpkin text-3xl"></i><p class="text-gray-500 mt-2">Buscando...</p></div>';
        await fetchWooCommerceProducts(1, currentSearch, currentCategoryFilter, false);
        renderMenu(false);
    }, 600); 
};

const handleCategoryClick = async (e) => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    document.querySelectorAll('.category-btn').forEach(b => {
        b.classList.remove('bg-pumpkin', 'text-white', 'border-pumpkin');
        b.classList.add('bg-dark-input', 'text-dark-text', 'border-gray-600');
    });
    btn.classList.remove('bg-dark-input', 'text-dark-text', 'border-gray-600');
    btn.classList.add('bg-pumpkin', 'text-white', 'border-pumpkin');
    currentCategoryFilter = btn.dataset.category;
    currentPage = 1;
    menuItemsGrid.innerHTML = '<div class="col-span-full text-center py-10"><i class="fas fa-spinner fa-spin text-pumpkin text-3xl"></i></div>';
    await fetchWooCommerceProducts(1, currentSearch, currentCategoryFilter, false);
    renderMenu(false);
};

// ==================================================================
//               GESTÃO DE ITENS SELECIONADOS
// ==================================================================

const _renderSelectedItemsList = () => {
    if (!openOrderList || !openItemsCount || !sendSelectedItemsBtn) return;
    const openItemsCountValue = selectedItems.length;
    openItemsCount.textContent = openItemsCountValue;
    sendSelectedItemsBtn.disabled = openItemsCountValue === 0;
    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) acc[key] = { ...item, count: 0 };
            acc[key].count++;
            return acc;
        }, {});
        openOrderList.innerHTML = Object.values(groupedItems).map(group => `
            <div class="flex justify-between items-center bg-dark-input border border-gray-600 p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-dark-text">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-indigo-300 hover:text-indigo-200" data-item-id="${group.id}" data-item-note-key="${group.note || ''}">
                        ${group.note ? `<span class="text-yellow-400">(${group.note.replace(' [EM ESPERA]', '')})</span>${group.note.includes('[EM ESPERA]') ? ' <i class="fas fa-pause-circle text-yellow-400"></i>' : ''}` : `(Adicionar Obs.)`}
                    </span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center text-lg hover:bg-red-700 transition duration-150" data-item-id="${group.id}" data-item-note-key="${group.note || ''}" data-action="decrease"><i class="fas fa-minus pointer-events-none"></i></button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center text-lg hover:bg-green-700 transition duration-150" data-item-id="${group.id}" data-item-note-key="${group.note || ''}" data-action="increase"><i class="fas fa-plus pointer-events-none"></i></button>
                </div>
            </div>
        `).join('');
    }
};

export const increaseLocalItemQuantity = (itemId, noteKey) => {
    const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy }); 
        renderOrderScreen(currentOrderSnapshot); 
        saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    }
};
window.increaseLocalItemQuantity = increaseLocalItemQuantity;

export const decreaseLocalItemQuantity = (itemId, noteKey) => {
    let indexToRemove = -1;
    for (let i = selectedItems.length - 1; i >= 0; i--) {
        if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
            indexToRemove = i; break;
        }
    }
    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1); 
        renderOrderScreen(currentOrderSnapshot); 
        saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    }
};
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;

export const addItemToSelection = (product) => {
    if (!currentTableId) { showToast("Selecione ou abra uma mesa primeiro.", true); return; }
    if (!product || !product.id) return;
    selectedItems.push({
        id: product.id, name: product.name, price: product.price,
        sector: product.sector || 'cozinha', category: product.category || 'uncategorized', note: ''
    });
    renderOrderScreen(currentOrderSnapshot); 
    saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    openObsModalForGroup(product.id, '');
};
window.addItemToSelection = addItemToSelection;

// ==================================================================
//               GESTÃO DE PEDIDOS DE CLIENTES
// ==================================================================

const _renderPendingClientOrders = (requestedOrders = []) => {
    if (!clientPendingOrdersContainer) return;
    if (!requestedOrders || requestedOrders.length === 0) {
        clientPendingOrdersContainer.innerHTML = ''; 
        clientPendingOrdersContainer.classList.add('hidden'); 
        return;
    }
    clientPendingOrdersContainer.classList.remove('hidden'); 
    clientPendingOrdersContainer.innerHTML = `
        <h3 class="text-lg font-semibold text-yellow-400 mb-2 flex items-center"><i class="fas fa-bell mr-2 animate-pulse"></i> Pedidos Pendentes</h3>
        <div class="space-y-3">
            ${requestedOrders.map((order, index) => {
                const maskedPhone = maskPhoneNumber(order.clientInfo?.phone) || 'N/A'; 
                return `
                <div class="bg-indigo-900 border border-indigo-700 p-3 rounded-lg shadow-md">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-indigo-300">${order.clientInfo?.name || 'Cliente'} (${maskedPhone})</span>
                        <span class="text-xs text-gray-400">${new Date(order.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <ul class="list-disc list-inside space-y-1 pl-2 mb-3">${order.items.map(item => `<li class="text-base text-white">${item.name} ${item.note ? `(${item.note})` : ''}</li>`).join('')}</ul>
                    <div class="flex justify-end space-x-2">
                        <button class="reject-client-order-btn px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-semibold" data-order-id="${order.orderId}">Rejeitar</button>
                        <button class="approve-client-order-btn px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-semibold" data-order-id="${order.orderId}">Aprovar</button>
                    </div>
                </div>
            `}).join('')}
        </div>`;
    clientPendingOrdersContainer.querySelectorAll('.approve-client-order-btn').forEach(btn => btn.onclick = () => handleApproveClientOrder(btn.dataset.orderId));
    clientPendingOrdersContainer.querySelectorAll('.reject-client-order-btn').forEach(btn => btn.onclick = () => handleRejectClientOrder(btn.dataset.orderId));
};

export const handleApproveClientOrder = async (orderId) => {
    if (!currentTableId || !currentOrderSnapshot) return;
    const orderToApprove = currentOrderSnapshot.requestedOrders?.find(o => o.orderId === orderId);
    if (!orderToApprove) return;
    try {
        const enrichedItems = orderToApprove.items.map(i => ({
            ...i, addedBy: orderToApprove.clientInfo?.name || 'Cliente', originTable: currentTableId
        }));
        const tableRef = getTableDocRef(currentTableId);
        await updateDoc(tableRef, {
            selectedItems: arrayUnion(...enrichedItems), 
            requestedOrders: arrayRemove(orderToApprove), 
            clientOrderPending: (currentOrderSnapshot.requestedOrders.length - 1) > 0, 
            waiterNotification: null 
        });
        showToast("Pedido do cliente aprovado!", false);
    } catch (e) { showToast("Erro ao aprovar pedido.", true); }
};
window.handleApproveClientOrder = handleApproveClientOrder;

export const handleRejectClientOrder = async (orderId) => {
    if (!currentTableId || !currentOrderSnapshot) return;
    const orderToReject = currentOrderSnapshot.requestedOrders?.find(o => o.orderId === orderId);
    if (!orderToReject) return;
    if (!confirm("Rejeitar este pedido?")) return;
    try {
        const tableRef = getTableDocRef(currentTableId);
        await updateDoc(tableRef, {
            requestedOrders: arrayRemove(orderToReject), 
            clientOrderPending: (currentOrderSnapshot.requestedOrders.length - 1) > 0, 
            waiterNotification: null 
        });
        showToast("Pedido rejeitado.", false);
    } catch (e) { showToast("Erro ao rejeitar.", true); }
};
window.handleRejectClientOrder = handleRejectClientOrder;


// ==================================================================
//               ENVIO PARA COZINHA (KDS) & REDIRECIONAMENTO
// ==================================================================

export const handleSendSelectedItems = async () => {
    if (!currentTableId || selectedItems.length === 0) return;

    const sendBtn = document.getElementById('sendSelectedItemsBtn');
    if (!confirm(`Enviar ${selectedItems.length} item(ns) para produção?`)) return;

    toggleLoading(sendBtn, true, 'Enviando...');

    const itemsToSend = selectedItems.filter(item => !item.note || !item.note.toLowerCase().includes('espera'));
    const itemsToHold = selectedItems.filter(item => item.note && item.note.toLowerCase().includes('espera'));

    if (itemsToSend.length === 0) {
        if (itemsToHold.length > 0) {
             showToast("Itens em espera salvos.", false);
             saveSelectedItemsToFirebase(currentTableId, itemsToHold);
        } else {
             showToast("Nada para enviar.", true);
        }
        toggleLoading(sendBtn, false);
        return;
    }

    // LÓGICA DE REDIRECIONAMENTO E VALIDAÇÃO DE VÍNCULO
    const isMerged = currentOrderSnapshot.status === 'merged';
    const targetTableId = isMerged ? currentOrderSnapshot.masterTable : currentTableId;
    const displayTableId = isMerged ? `${currentOrderSnapshot.masterTable} (Mestra)` : currentTableId;

    const itemsToSendValue = itemsToSend.reduce((sum, item) => sum + (item.price || 0), 0);
    const kdsOrderRef = doc(getKdsCollectionRef()); 

    const itemsForFirebase = itemsToSend.map(item => ({
        id: item.id, name: item.name, price: item.price,
        category: item.category, sector: item.sector, note: item.note || '',
        sentAt: Date.now(), orderId: kdsOrderRef.id,
        addedBy: userId || 'Staff', originTable: currentTableId
    }));

    try {
        const targetTableRef = getTableDocRef(targetTableId);
        
        // 1. VERIFICA SE O DESTINO EXISTE (Proteção contra Mestra Fechada)
        const targetSnap = await getDoc(targetTableRef);
        
        if (!targetSnap.exists()) {
            if (isMerged) {
                // ERRO ESPECÍFICO DE VÍNCULO QUEBRADO
                throw new Error(`VÍNCULO QUEBRADO: A Mesa Mestra (${targetTableId}) foi fechada. Desfaça o agrupamento.`);
            } else {
                throw new Error(`A Mesa ${targetTableId} não foi encontrada ou foi fechada.`);
            }
        }

        const currentTotal = targetSnap.data().total || 0;
        const newTotal = currentTotal + itemsToSendValue;

        // 2. Envia para KDS
        await setDoc(kdsOrderRef, {
            orderId: kdsOrderRef.id,
            tableNumber: parseInt(targetTableId),
            subTable: isMerged ? currentTableId : null,
            sentAt: serverTimestamp(), 
            sectors: itemsForFirebase.reduce((acc, item) => {
                const sector = item.sector || 'cozinha';
                acc[sector] = acc[sector] || [];
                acc[sector].push({ name: item.name, note: item.note, price: item.price, origin: isMerged ? `Mesa ${currentTableId}` : '' });
                return acc;
            }, {}),
            status: 'pending',
        });

        // 3. Atualiza Mesa Destino
        await updateDoc(targetTableRef, {
            sentItems: arrayUnion(...itemsForFirebase), 
            total: newTotal,                      
            lastKdsSentAt: serverTimestamp()          
        });

        // 4. Limpa mesa atual (com proteção para evitar erro em mesa merged excluída)
        if (currentTableId !== targetTableId) {
            // Se for mesa filha, verifica se ela ainda existe antes de limpar
            const currentRef = getTableDocRef(currentTableId);
            const currentSnap = await getDoc(currentRef);
            if (currentSnap.exists()) {
                await updateDoc(currentRef, { selectedItems: itemsToHold });
            }
        } else {
            await updateDoc(getTableDocRef(currentTableId), { selectedItems: itemsToHold });
        }

        selectedItems.length = 0;
        selectedItems.push(...itemsToHold);
        renderOrderScreen(currentOrderSnapshot); 
        showToast(`Pedido enviado para Mesa ${displayTableId}!`, false);

    } catch (e) {
        console.error("Erro KDS:", e);
        // Mensagem amigável no Toast
        showToast(e.message, true); 
        
        // Em caso de erro, salva localmente na mesa atual (Fallback de segurança)
        // Para não perder o pedido se a mestra falhar
        if (isMerged) {
             try {
                 await updateDoc(getTableDocRef(currentTableId), { selectedItems: itemsToSend.concat(itemsToHold) });
                 showToast("Pedido salvo localmente (Vínculo Falhou).", true);
             } catch (err) { console.error("Falha no fallback:", err); }
        }

    } finally {
        toggleLoading(sendBtn, false);
    }
};


// ==================================================================
//               OBSERVAÇÕES E INIT
// ==================================================================

export const openObsModalForGroup = (itemId, noteKey) => {
    const products = getProducts();
    const product = products.find(p => p.id == itemId) || selectedItems.find(i => i.id == itemId);
    if (!obsModal || !obsItemName || !obsInput || !esperaSwitch) return;
    obsItemName.textContent = product ? product.name : 'Item';
    const esperaTag = ' [EM ESPERA]';
    const currentNoteCleaned = noteKey.replace(esperaTag, '').trim();
    obsInput.value = currentNoteCleaned;
    obsModal.dataset.itemId = itemId;
    obsModal.dataset.originalNoteKey = noteKey; 
    esperaSwitch.checked = noteKey.toLowerCase().includes('espera');
    obsModal.style.display = 'flex';
    obsInput.focus();
};
window.openObsModalForGroup = openObsModalForGroup; 

const renderQuickObsButtons = (buttonsContainer, observations) => {
    if (!buttonsContainer) return;
    if (observations.length === 0) {
        buttonsContainer.innerHTML = '<p class="text-xs text-dark-placeholder italic">Nenhuma obs cadastrada.</p>';
        return;
    }
    buttonsContainer.innerHTML = observations.map(obs => `
        <button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input text-dark-text rounded-full hover:bg-gray-600 transition" data-obs="${obs.text}">${obs.text}</button>
    `).join('');
};

const fetchQuickObservations = async (buttonsContainer) => {
    if (!buttonsContainer) return;
    try {
        const q = query(getQuickObsCollectionRef(), orderBy('text', 'asc')); 
        const querySnapshot = await getDocs(q);
        renderQuickObsButtons(buttonsContainer, querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) { console.error("Erro Obs:", error); }
};

export const renderOrderScreen = (orderSnapshot) => {
    _renderSelectedItemsList(); 
    _renderPendingClientOrders(orderSnapshot?.requestedOrders); 
    renderMenu(false); 
};

export const initOrderController = () => {
    if(orderInitialized) return;
    console.log("[OrderController] Inicializando...");

    searchProductInput = document.getElementById('searchProductInput');
    categoryFiltersContainer = document.getElementById('categoryFilters');
    menuItemsGrid = document.getElementById('menuItemsGrid');
    openOrderList = document.getElementById('openOrderList');
    openItemsCount = document.getElementById('openItemsCount');
    sendSelectedItemsBtn = document.getElementById('sendSelectedItemsBtn');
    clientPendingOrdersContainer = document.getElementById('clientPendingOrders'); 
    obsModal = document.getElementById('obsModal');
    obsItemName = document.getElementById('obsItemName');
    obsInput = document.getElementById('obsInput');
    saveObsBtn = document.getElementById('saveObsBtn');
    cancelObsBtn = document.getElementById('cancelObsBtn');
    esperaSwitch = document.getElementById('esperaSwitch');
    quickObsButtons = document.getElementById('quickObsButtons');

    if (!menuItemsGrid || !openOrderList || !obsModal) return;

    fetchQuickObservations(quickObsButtons);

    if (searchProductInput) searchProductInput.addEventListener('input', handleSearch);
    if (categoryFiltersContainer) categoryFiltersContainer.addEventListener('click', handleCategoryClick);
    if (sendSelectedItemsBtn) sendSelectedItemsBtn.addEventListener('click', handleSendSelectedItems);

    menuItemsGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-item-btn');
        if (btn && btn.dataset.product) {
            try { addItemToSelection(JSON.parse(btn.dataset.product.replace(/&#39;/g, "'"))); } catch(e) { console.error(e); }
        }
    });

    openOrderList.addEventListener('click', (e) => {
        const target = e.target;
        const qtyBtn = target.closest('.qty-btn'); 
        const obsSpan = target.closest('span[data-item-id]'); 
        if (qtyBtn) {
            const { itemId, itemNoteKey, action } = qtyBtn.dataset;
            if (action === 'increase') increaseLocalItemQuantity(itemId, itemNoteKey);
            else decreaseLocalItemQuantity(itemId, itemNoteKey);
        } else if (obsSpan) openObsModalForGroup(obsSpan.dataset.itemId, obsSpan.dataset.itemNoteKey);
    });

    if (saveObsBtn) {
        saveObsBtn.addEventListener('click', () => {
            const { itemId, originalNoteKey } = obsModal.dataset;
            let newNote = obsInput.value.trim();
            const esperaTag = ' [EM ESPERA]';
            newNote = newNote.replace(esperaTag, '').replace(/,?\s*\[EM ESPERA\]/gi, '').trim();
            if (esperaSwitch.checked) newNote += esperaTag;

            let updated = false;
            const updatedItems = selectedItems.map(item => {
                if (item.id == itemId && (item.note || '') === originalNoteKey) {
                    updated = true;
                    return { ...item, note: newNote };
                }
                return item;
            });
            
            if (updated) {
                selectedItems.length = 0;
                selectedItems.push(...updatedItems);
                renderOrderScreen(currentOrderSnapshot);
                saveSelectedItemsToFirebase(currentTableId, selectedItems);
            }
            obsModal.style.display = 'none';
        });
    }

    if (cancelObsBtn) cancelObsBtn.addEventListener('click', () => obsModal.style.display = 'none');

    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', (e) => {
             const btn = e.target.closest('.quick-obs-btn');
             if (btn && obsInput) {
                 const val = obsInput.value.trim();
                 obsInput.value = val ? `${val}, ${btn.dataset.obs}` : btn.dataset.obs;
             }
         });
    }

    orderInitialized = true;
    console.log("[OrderController] Inicializado.");
};