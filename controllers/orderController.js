// --- CONTROLLERS/ORDERCONTROLLER.JS (ATUALIZADO com Obs Dinâmicas) ---
import { getProducts, getCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, screens } from "/app.js"; 
// ==== NOVO: Importa getDocs e query ====
import { arrayUnion, serverTimestamp, doc, setDoc, updateDoc, arrayRemove, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// ==== NOVO: Importa a nova referência ====
import { getKdsCollectionRef, getTableDocRef, getQuickObsCollectionRef } from "/services/firebaseService.js";
import { goToScreen } from "/app.js"; 


// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
let obsModal, obsItemName, obsInput, saveObsBtn, cancelObsBtn, esperaSwitch;
let searchProductInput, categoryFiltersContainer, menuItemsGrid;
let openOrderList, openItemsCount, sendSelectedItemsBtn;
let quickObsButtons; // Container dos botões
let clientPendingOrdersContainer; 

// Estado local do módulo
let currentSearch = '';
let currentCategoryFilter = 'all';
let orderInitialized = false;


// --- FUNÇÕES DE AÇÃO GERAL ---

export const increaseLocalItemQuantity = (itemId, noteKey) => {
    // ... (sem alteração)
    const itemToCopy = selectedItems.findLast(item =>
        item.id == itemId && (item.note || '') === noteKey
    );

    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy }); 
        renderOrderScreen(currentOrderSnapshot); 
        saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    } else {
        const products = getProducts();
        const product = products.find(p => p.id == itemId);
        if (product) {
            const newItem = { id: product.id, name: product.name, price: product.price, sector: product.sector || 'cozinha', category: product.category || 'uncategorized', note: noteKey };
            selectedItems.push(newItem);
            renderOrderScreen(currentOrderSnapshot);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }
};
window.increaseLocalItemQuantity = increaseLocalItemQuantity;


export const decreaseLocalItemQuantity = (itemId, noteKey) => {
    // ... (sem alteração)
    let indexToRemove = -1;
    for (let i = selectedItems.length - 1; i >= 0; i--) {
        if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
            indexToRemove = i;
            break;
        }
    }

    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1); 
        renderOrderScreen(currentOrderSnapshot); 
        saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    }
};
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;


// --- FUNÇÕES DE EXIBIÇÃO DE TELA E MODAL ---

export const renderMenu = () => {
    // ... (sem alteração)
    if (!menuItemsGrid || !categoryFiltersContainer) {
        return;
    }

    const products = getProducts();
    const categories = getCategories();

    if (categories.length > 0 && categoryFiltersContainer.innerHTML.trim() === '') {
        categoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentCategoryFilter ? 'bg-pumpkin text-white' : 'bg-dark-input text-dark-text border border-gray-600';
            return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }
     categoryFiltersContainer.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentCategoryFilter;
        btn.classList.toggle('bg-pumpkin', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-dark-input', !isActive);
        btn.classList.toggle('text-dark-text', !isActive);
        btn.classList.toggle('border-gray-600', !isActive);
        btn.classList.toggle('border-pumpkin', isActive);
    });

    let filteredProducts = products;
    if (currentSearch) {
        const normalizedSearch = currentSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentCategoryFilter);
    }

    if (filteredProducts.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        menuItemsGrid.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-dark-card border border-gray-700 p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150 flex flex-col justify-between" style="min-height: 140px;">
                <h4 class="font-bold text-base text-dark-text flex-grow">${product.name}</h4>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-bold text-lg text-pumpkin">${formatCurrency(product.price)}</span>
                    <button class="add-item-btn add-icon-btn bg-green-600 text-white hover:bg-green-700 transition"
                            data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'>
                        <i class="fas fa-plus text-lg"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

const _renderSelectedItemsList = () => {
    // ... (sem alteração)
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
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center text-lg hover:bg-red-700 transition duration-150"
                            data-item-id="${group.id}" data-item-note-key="${group.note || ''}" data-action="decrease">
                        <i class="fas fa-minus pointer-events-none"></i>
                    </button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center text-lg hover:bg-green-700 transition duration-150"
                            data-item-id="${group.id}" data-item-note-key="${group.note || ''}" data-action="increase">
                        <i class="fas fa-plus pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

const _renderPendingClientOrders = (requestedOrders = []) => {
    // ... (sem alteração)
    if (!clientPendingOrdersContainer) return;

    if (!requestedOrders || requestedOrders.length === 0) {
        clientPendingOrdersContainer.innerHTML = ''; 
        clientPendingOrdersContainer.classList.add('hidden'); 
        return;
    }

    clientPendingOrdersContainer.classList.remove('hidden'); 

    clientPendingOrdersContainer.innerHTML = `
        <h3 class="text-lg font-semibold text-yellow-400 mb-2 flex items-center">
            <i class="fas fa-bell mr-2 animate-pulse"></i> Pedidos Pendentes do Cliente
        </h3>
        <div class="space-y-3">
            ${requestedOrders.map((order, index) => `
                <div class="bg-indigo-900 border border-indigo-700 p-3 rounded-lg shadow-md">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-indigo-300">Cliente: ${order.clientInfo?.name || 'Cliente'} (${order.clientInfo?.phone || 'N/A'})</span>
                        <span class="text-xs text-gray-400">${new Date(order.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <ul class="list-disc list-inside space-y-1 pl-2 mb-3">
                        ${order.items.map(item => `
                            <li class="text-base text-white">
                                ${item.name} ${item.note ? `(${item.note})` : ''}
                            </li>
                        `).join('')}
                    </ul>
                    <div class="flex justify-end space-x-2">
                        <button class="reject-client-order-btn px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition text-sm font-semibold" data-order-index="${index}" data-order-id="${order.orderId}">
                            <i class="fas fa-times"></i> Rejeitar
                        </button>
                        <button class="approve-client-order-btn px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm font-semibold" data-order-index="${index}" data-order-id="${order.orderId}">
                            <i class="fas fa-check"></i> Aprovar e Adicionar
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    _attachPendingOrderListeners();
};

export const renderOrderScreen = (orderSnapshot) => {
    // ... (sem alteração)
    _renderSelectedItemsList(); 
    _renderPendingClientOrders(orderSnapshot?.requestedOrders); 
    renderMenu(); 
};

export const handleApproveClientOrder = async (orderId) => {
    // ... (sem alteração)
    if (!currentTableId || !currentOrderSnapshot || !orderId) return;

    const requestedOrders = currentOrderSnapshot.requestedOrders || [];
    const orderToApprove = requestedOrders.find(o => o.orderId === orderId);

    if (!orderToApprove) {
        alert("Erro: Pedido do cliente não encontrado para aprovar.");
        return;
    }

    const itemsToAdd = orderToApprove.items || [];
    if (itemsToAdd.length === 0) {
        alert("Erro: Pedido do cliente está vazio.");
        return; 
    }
    
    try {
        const tableRef = getTableDocRef(currentTableId);
        
        await updateDoc(tableRef, {
            selectedItems: arrayUnion(...itemsToAdd), 
            requestedOrders: arrayRemove(orderToApprove), 
            clientOrderPending: requestedOrders.length > 1, 
            waiterNotification: null 
        });
        
        alert(`Pedido do cliente aprovado e ${itemsToAdd.length} item(ns) adicionados ao carrinho.`);

    } catch (e) {
        console.error("Erro ao aprovar pedido do cliente:", e);
        alert("Falha ao aprovar o pedido do cliente.");
    }
};
window.handleApproveClientOrder = handleApproveClientOrder; 


export const handleRejectClientOrder = async (orderId) => {
    // ... (sem alteração)
    if (!currentTableId || !currentOrderSnapshot || !orderId) return;

    const requestedOrders = currentOrderSnapshot.requestedOrders || [];
    const orderToReject = requestedOrders.find(o => o.orderId === orderId);

    if (!orderToReject) {
        alert("Erro: Pedido do cliente não encontrado para rejeitar.");
        return;
    }
    
    if (!confirm("Tem certeza que deseja rejeitar este pedido do cliente? Os itens não serão adicionados.")) {
        return;
    }

    try {
        const tableRef = getTableDocRef(currentTableId);
        
        await updateDoc(tableRef, {
            requestedOrders: arrayRemove(orderToReject), 
            clientOrderPending: requestedOrders.length > 1, 
            waiterNotification: null 
        });
        
        alert("Pedido do cliente rejeitado.");

    } catch (e) {
        console.error("Erro ao rejeitar pedido do cliente:", e);
        alert("Falha ao rejeitar o pedido do cliente.");
    }
};
window.handleRejectClientOrder = handleRejectClientOrder; 


const _attachPendingOrderListeners = () => {
    // ... (sem alteração)
     clientPendingOrdersContainer?.querySelectorAll('.approve-client-order-btn').forEach(btn => {
         const orderId = btn.dataset.orderId;
         const newBtn = btn.cloneNode(true);
         btn.parentNode.replaceChild(newBtn, btn);
         newBtn.addEventListener('click', () => handleApproveClientOrder(orderId));
     });
     clientPendingOrdersContainer?.querySelectorAll('.reject-client-order-btn').forEach(btn => {
         const orderId = btn.dataset.orderId;
         const newBtn = btn.cloneNode(true);
         btn.parentNode.replaceChild(newBtn, btn);
         newBtn.addEventListener('click', () => handleRejectClientOrder(orderId));
     });
};


// ==================================================================
//               OBSERVAÇÕES RÁPIDAS (NOVAS FUNÇÕES)
// ==================================================================

/**
 * Renderiza os botões de observação rápida no container.
 * @param {HTMLElement} buttonsContainer - O div#quickObsButtons.
 * @param {Array} observations - Array de documentos { text: 'String' } do Firebase.
 */
const renderQuickObsButtons = (buttonsContainer, observations) => {
    if (!buttonsContainer) return;

    if (observations.length === 0) {
        buttonsContainer.innerHTML = '<p class="text-xs text-dark-placeholder italic">Nenhuma obs. rápida cadastrada.</p>';
        return;
    }

    buttonsContainer.innerHTML = observations.map(obs => {
        const obsText = obs.text || 'Erro';
        return `
            <button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input text-dark-text rounded-full hover:bg-gray-600 transition" 
                    data-obs="${obsText}">
                ${obsText}
            </button>
        `;
    }).join('');
};

/**
 * Busca as observações rápidas do Firebase e chama o render.
 * @param {HTMLElement} buttonsContainer - O div#quickObsButtons.
 */
const fetchQuickObservations = async (buttonsContainer) => {
    if (!buttonsContainer) return;
    try {
        const obsCollectionRef = getQuickObsCollectionRef();
        // Ordena por texto (alfabeticamente)
        const q = query(obsCollectionRef, orderBy('text', 'asc')); 
        const querySnapshot = await getDocs(q);
        
        const observations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        renderQuickObsButtons(buttonsContainer, observations);

    } catch (error) {
        console.error("Erro ao buscar observações rápidas:", error);
        if (buttonsContainer) {
            buttonsContainer.innerHTML = '<p class="text-xs text-red-400">Erro ao carregar obs.</p>';
        }
    }
};


// ==================================================================
//               FUNÇÕES RESTANTES (OBS, ADD ITEM, ENVIO KDS)
// ==================================================================

export const openObsModalForGroup = (itemId, noteKey) => {
    // ... (sem alteração)
    const products = getProducts();
    const product = products.find(p => p.id == itemId);

    if (!obsModal || !obsItemName || !obsInput || !esperaSwitch || !product) {
        console.error("Erro: Elementos do modal OBS ou produto não encontrados.");
        return;
    }

    obsItemName.textContent = product.name;
    const esperaTag = ' [EM ESPERA]';
    const currentNoteCleaned = noteKey.replace(esperaTag, '').trim();
    obsInput.value = currentNoteCleaned;

    obsModal.dataset.itemId = itemId;
    obsModal.dataset.originalNoteKey = noteKey; 

    esperaSwitch.checked = noteKey.toLowerCase().includes('espera');

    obsInput.readOnly = false;
    obsInput.placeholder = "Ex: Sem cebola, Ponto da carne mal passada...";

    obsModal.style.display = 'flex';
};
window.openObsModalForGroup = openObsModalForGroup; 


export const addItemToSelection = (product) => {
    // ... (sem alteração)
    if (!currentTableId) {
        alert("Selecione ou abra uma mesa primeiro.");
        return;
    }
    if (!product || !product.id) {
         console.error("Tentativa de adicionar produto inválido:", product);
         return;
    }

    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha',
        category: product.category || 'uncategorized',
        note: ''
    };

    selectedItems.push(newItem); 

    renderOrderScreen(currentOrderSnapshot); 
    saveSelectedItemsToFirebase(currentTableId, selectedItems); 

    openObsModalForGroup(product.id, ''); 
};


export const handleSendSelectedItems = async () => {
    // ... (sem alteração)
    if (!currentTableId || selectedItems.length === 0) return;

    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para a produção?`)) return;

    const itemsToSend = selectedItems.filter(item => !item.note || !item.note.toLowerCase().includes('espera'));
    const itemsToHold = selectedItems.filter(item => item.note && item.note.toLowerCase().includes('espera'));

    if (itemsToSend.length === 0) {
        if (itemsToHold.length > 0) {
             alert("Nenhum item pronto para envio (todos estão marcados como 'Em Espera'). Os itens foram salvos na mesa.");
             saveSelectedItemsToFirebase(currentTableId, itemsToHold);
        } else {
            alert("Nenhum item para enviar.");
        }
        return;
    }

    const itemsToSendValue = itemsToSend.reduce((sum, item) => sum + (item.price || 0), 0);
    const kdsOrderRef = doc(getKdsCollectionRef()); 

    const itemsForFirebase = itemsToSend.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category,
        sector: item.sector,
        note: item.note || '',
        sentAt: Date.now(), 
        orderId: kdsOrderRef.id,
    }));

    try {
        console.log("[Order] Enviando para KDS:", itemsForFirebase);
        // Envio KDS
        await setDoc(kdsOrderRef, {
            orderId: kdsOrderRef.id,
            tableNumber: parseInt(currentTableId),
            sentAt: serverTimestamp(), 
            sectors: itemsForFirebase.reduce((acc, item) => {
                const sector = item.sector || 'cozinha';
                acc[sector] = acc[sector] || [];
                acc[sector].push({ name: item.name, note: item.note, price: item.price });
                return acc;
            }, {}),
            status: 'pending',
        });
        console.log("[Order] KDS enviado com sucesso.");

        // Atualização da Mesa
        const tableRef = getTableDocRef(currentTableId);
        console.log("[Order] Atualizando mesa:", currentTableId);

        const currentTotal = currentOrderSnapshot?.total || 0;
        const newTotal = currentTotal + itemsToSendValue;

        await updateDoc(tableRef, {
            sentItems: arrayUnion(...itemsForFirebase), 
            selectedItems: itemsToHold,                
            total: newTotal,                           
            lastKdsSentAt: serverTimestamp()           
        });
        console.log("[Order] Mesa atualizada com sucesso.");

        selectedItems.length = 0;
        selectedItems.push(...itemsToHold);
        
        renderOrderScreen(currentOrderSnapshot); 

        alert(`Pedido enviado! ${itemsToHold.length > 0 ? `(${itemsToHold.length} itens retidos em espera)` : ''}`);

    } catch (e) {
        console.error("Erro ao enviar pedido:", e);
        alert("Falha ao enviar pedido ao KDS/Firebase. Tente novamente.");
        selectedItems.length = 0;
        selectedItems.push(...itemsToSend, ...itemsToHold);
        renderOrderScreen(currentOrderSnapshot);
    }
};

// Função de inicialização do Controller (chamada pelo app.js)
export const initOrderController = () => {
    if(orderInitialized) return;
    console.log("[OrderController] Inicializando...");

    // Mapeia elementos específicos deste painel
    searchProductInput = document.getElementById('searchProductInput');
    categoryFiltersContainer = document.getElementById('categoryFilters');
    menuItemsGrid = document.getElementById('menuItemsGrid');
    openOrderList = document.getElementById('openOrderList');
    openItemsCount = document.getElementById('openItemsCount');
    sendSelectedItemsBtn = document.getElementById('sendSelectedItemsBtn');
    clientPendingOrdersContainer = document.getElementById('clientPendingOrders'); 

    // Mapeia elementos do modal OBS
    obsModal = document.getElementById('obsModal');
    obsItemName = document.getElementById('obsItemName');
    obsInput = document.getElementById('obsInput');
    saveObsBtn = document.getElementById('saveObsBtn');
    cancelObsBtn = document.getElementById('cancelObsBtn');
    esperaSwitch = document.getElementById('esperaSwitch');
    quickObsButtons = document.getElementById('quickObsButtons');

    // Validação de elementos essenciais
    if (!searchProductInput || !categoryFiltersContainer || !menuItemsGrid || !openOrderList || !sendSelectedItemsBtn || !obsModal || !clientPendingOrdersContainer || !quickObsButtons) { // Adicionado quickObsButtons
         console.error("[OrderController] Erro Fatal: Elementos críticos não encontrados. Abortando inicialização.");
         return; 
    }

    // ==== NOVO: Busca os botões de OBS dinâmicos ====
    fetchQuickObservations(quickObsButtons);

    // Listener para busca de produto
    searchProductInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderMenu(); 
    });

    // Listener para filtros de categoria (delegação de evento)
    categoryFiltersContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (btn) {
            currentCategoryFilter = btn.dataset.category;
            renderMenu(); 
        }
    });

    // Listener para botões +/-/obs na lista de itens selecionados (delegação)
    openOrderList.addEventListener('click', (e) => {
        const target = e.target;
        const qtyBtn = target.closest('.qty-btn'); 
        const obsSpan = target.closest('span[data-item-id]'); 

        if (qtyBtn) {
            const itemId = qtyBtn.dataset.itemId;
            const noteKey = qtyBtn.dataset.itemNoteKey;
            const action = qtyBtn.dataset.action;
            if (action === 'increase') {
                increaseLocalItemQuantity(itemId, noteKey);
            } else if (action === 'decrease') {
                decreaseLocalItemQuantity(itemId, noteKey);
            }
        } else if (obsSpan) {
            const itemId = obsSpan.dataset.itemId;
            const noteKey = obsSpan.dataset.itemNoteKey;
            openObsModalForGroup(itemId, noteKey);
        }
    });

     // Listener para adicionar item (delegação no menuItemsGrid)
     menuItemsGrid.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.add-item-btn');
        if (addBtn && addBtn.dataset.product) {
            try {
                const productData = JSON.parse(addBtn.dataset.product.replace(/&#39;/g, "'"));
                addItemToSelection(productData);
            } catch (err) {
                console.error("Erro ao parsear dados do produto:", err);
            }
        }
    });

    // Listener para botão de enviar pedido
    sendSelectedItemsBtn.addEventListener('click', handleSendSelectedItems);

    // Listeners do Modal OBS
    if (saveObsBtn) {
        saveObsBtn.addEventListener('click', () => {
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey;
            let newNote = obsInput.value.trim();
            const isEsperaActive = esperaSwitch.checked;
            const esperaTag = ' [EM ESPERA]';

            let noteCleaned = newNote.replace(esperaTag, '').trim();
            noteCleaned = noteCleaned.replace(/,?\s*\[EM ESPERA\]/gi, '').trim();

            if (isEsperaActive) {
                newNote = (noteCleaned + esperaTag).trim();
            } else {
                newNote = noteCleaned;
            }

            let updated = false;
            const updatedItems = selectedItems.map(item => {
                if (item.id == itemId && (item.note || '') === originalNoteKey) {
                    updated = true;
                    return { ...item, note: newNote };
                }
                return item;
            });
            
            selectedItems.length = 0; 
            selectedItems.push(...updatedItems);

            if (updated) {
                obsModal.style.display = 'none';
                renderOrderScreen(currentOrderSnapshot);
                saveSelectedItemsToFirebase(currentTableId, selectedItems);
            } else {
                console.warn("Nenhum item encontrado para atualizar a observação.");
                obsModal.style.display = 'none';
            }
        });
    }

    if (cancelObsBtn) {
        cancelObsBtn.addEventListener('click', () => {
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey;
            const currentNote = obsInput.value.trim();

            if (originalNoteKey === '' && currentNote === '') {
                 let lastIndex = -1;
                 for (let i = selectedItems.length - 1; i >= 0; i--) {
                     if (selectedItems[i].id == itemId && selectedItems[i].note === '') {
                         lastIndex = i;
                         break;
                     }
                 }
                 if (lastIndex > -1) {
                     selectedItems.splice(lastIndex, 1); 
                     console.log("Item recém-adicionado cancelado.");
                 }
            }

            obsModal.style.display = 'none';
            renderOrderScreen(currentOrderSnapshot); 
            saveSelectedItemsToFirebase(currentTableId, selectedItems); 
        });
    }

    // ==== ATUALIZADO: O listener agora usa delegação de evento ====
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', (e) => {
             const btn = e.target.closest('.quick-obs-btn');
             if (btn && obsInput && !obsInput.readOnly) {
                 const obsText = btn.dataset.obs;
                 let currentValue = obsInput.value.trim();
                 if (currentValue && !currentValue.endsWith(',') && !currentValue.endsWith(' ')) {
                     currentValue += ', ';
                 } else if (currentValue && (currentValue.endsWith(',') || currentValue.endsWith(' '))) {
                     currentValue += ' ';
                 }
                 obsInput.value = (currentValue + obsText).trim();
             }
        });
    }

    orderInitialized = true;
    console.log("[OrderController] Inicializado.");
};