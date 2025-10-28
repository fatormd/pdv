// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2 - Atualizado com Aprovação Cliente) ---
import { getProducts, getCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, screens } from "/app.js"; 
import { arrayUnion, serverTimestamp, doc, setDoc, updateDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getKdsCollectionRef, getTableDocRef } from "/services/firebaseService.js";
import { goToScreen } from "/app.js"; 


// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
let obsModal, obsItemName, obsInput, saveObsBtn, cancelObsBtn, esperaSwitch;
let searchProductInput, categoryFiltersContainer, menuItemsGrid;
let openOrderList, openItemsCount, sendSelectedItemsBtn;
let quickObsButtons;
let clientPendingOrdersContainer; // NOVO: Container para pedidos pendentes do cliente

// Estado local do módulo
let currentSearch = '';
let currentCategoryFilter = 'all';
let orderInitialized = false;


// --- FUNÇÕES DE AÇÃO GERAL ---

// Função mantida (aumenta item no carrinho do GARÇOM)
export const increaseLocalItemQuantity = (itemId, noteKey) => {
    const itemToCopy = selectedItems.findLast(item =>
        item.id == itemId && (item.note || '') === noteKey
    );

    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy }); // MUTATE (OK)
        renderOrderScreen(currentOrderSnapshot); // Re-renderiza tudo
        saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase
    } else {
        // Se não encontrar, adiciona um novo (caso raro)
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


// Função mantida (diminui item no carrinho do GARÇOM)
export const decreaseLocalItemQuantity = (itemId, noteKey) => {
    let indexToRemove = -1;
    for (let i = selectedItems.length - 1; i >= 0; i--) {
        if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
            indexToRemove = i;
            break;
        }
    }

    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1); // MUTATE (OK)
        renderOrderScreen(currentOrderSnapshot); // Re-renderiza tudo
        saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase
    }
};
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;


// --- FUNÇÕES DE EXIBIÇÃO DE TELA E MODAL ---

export const renderMenu = () => {
    if (!menuItemsGrid || !categoryFiltersContainer) {
        return;
    }

    const products = getProducts();
    const categories = getCategories();

    // 1. Renderiza Filtros de Categoria (se ainda não renderizados)
    if (categories.length > 0 && categoryFiltersContainer.innerHTML.trim() === '') {
        categoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentCategoryFilter ? 'bg-pumpkin text-white' : 'bg-dark-input text-dark-text border border-gray-600';
            return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }
     // Atualiza o estado ativo dos botões de categoria
     categoryFiltersContainer.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentCategoryFilter;
        btn.classList.toggle('bg-pumpkin', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-dark-input', !isActive);
        btn.classList.toggle('text-dark-text', !isActive);
        btn.classList.toggle('border-gray-600', !isActive);
        btn.classList.toggle('border-pumpkin', isActive);
    });


    // 2. Filtra Produtos baseado no estado atual
    let filteredProducts = products;
    if (currentSearch) {
        const normalizedSearch = currentSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentCategoryFilter);
    }

    // 3. Renderiza Itens do Cardápio
    if (filteredProducts.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        menuItemsGrid.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-dark-card border border-gray-700 p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150">
                <h4 class="font-bold text-base text-dark-text">${product.name}</h4>
                <p class="text-xs text-dark-placeholder">${product.category} (${product.sector})</p>
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

// Renderiza a lista de itens selecionados (Carrinho do Garçom)
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

// ==================================================================
//               NOVA FUNÇÃO: RENDERIZAR PEDIDOS PENDENTES DO CLIENTE
// ==================================================================
const _renderPendingClientOrders = (requestedOrders = []) => {
    if (!clientPendingOrdersContainer) return;

    if (!requestedOrders || requestedOrders.length === 0) {
        clientPendingOrdersContainer.innerHTML = ''; // Limpa se não houver pedidos
        clientPendingOrdersContainer.classList.add('hidden'); // Esconde o container
        return;
    }

    clientPendingOrdersContainer.classList.remove('hidden'); // Mostra o container

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

    // Reanexa listeners para os botões de aprovar/rejeitar
    _attachPendingOrderListeners();
};

// ==================================================================
//               FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO (ATUALIZADA)
// ==================================================================
export const renderOrderScreen = (orderSnapshot) => {
    // A lógica de atualização do array 'selectedItems' está no app.js.
    // Esta função RENDERIZA o estado atual + os pedidos pendentes.
    
    _renderSelectedItemsList(); // Renderiza o carrinho do Garçom
    _renderPendingClientOrders(orderSnapshot?.requestedOrders); // Renderiza os pedidos pendentes do cliente
    renderMenu(); // Renderiza o cardápio
};

// ==================================================================
//               NOVAS FUNÇÕES: APROVAR/REJEITAR PEDIDO CLIENTE
// ==================================================================
export const handleApproveClientOrder = async (orderId) => {
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
        return; // Ou apenas rejeita
    }
    
    try {
        const tableRef = getTableDocRef(currentTableId);
        
        // Adiciona os itens aprovados ao carrinho do Garçom (selectedItems)
        // Usa arrayUnion para garantir que não haja duplicatas exatas, 
        // mas permite adicionar itens iguais com notas diferentes ou do mesmo tipo.
        // A lógica de soma será feita no envio para KDS.
        await updateDoc(tableRef, {
            selectedItems: arrayUnion(...itemsToAdd), 
            requestedOrders: arrayRemove(orderToApprove), // Remove o pedido pendente
            // Se não houver mais pedidos pendentes, limpa a flag de alerta
            clientOrderPending: requestedOrders.length > 1, 
            waiterNotification: null // Limpa a notificação (opcional)
        });

        // O listener onSnapshot no app.js atualizará 'selectedItems' localmente
        // e chamará renderOrderScreen para atualizar a UI.
        
        alert(`Pedido do cliente aprovado e ${itemsToAdd.length} item(ns) adicionados ao carrinho.`);

    } catch (e) {
        console.error("Erro ao aprovar pedido do cliente:", e);
        alert("Falha ao aprovar o pedido do cliente.");
    }
};
window.handleApproveClientOrder = handleApproveClientOrder; // Expor globalmente


export const handleRejectClientOrder = async (orderId) => {
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
            requestedOrders: arrayRemove(orderToReject), // Remove o pedido pendente
            // Se não houver mais pedidos pendentes, limpa a flag de alerta
            clientOrderPending: requestedOrders.length > 1, 
            waiterNotification: null // Limpa a notificação (opcional)
        });

        // O listener onSnapshot no app.js atualizará 'requestedOrders' localmente
        // e chamará renderOrderScreen para atualizar a UI.
        
        alert("Pedido do cliente rejeitado.");

    } catch (e) {
        console.error("Erro ao rejeitar pedido do cliente:", e);
        alert("Falha ao rejeitar o pedido do cliente.");
    }
};
window.handleRejectClientOrder = handleRejectClientOrder; // Expor globalmente


// Função auxiliar para reanexar listeners dos botões de aprovação/rejeição
const _attachPendingOrderListeners = () => {
     clientPendingOrdersContainer?.querySelectorAll('.approve-client-order-btn').forEach(btn => {
         const orderId = btn.dataset.orderId;
         // Remove listener antigo e adiciona novo para evitar duplicação
         const newBtn = btn.cloneNode(true);
         btn.parentNode.replaceChild(newBtn, btn);
         newBtn.addEventListener('click', () => handleApproveClientOrder(orderId));
     });
     clientPendingOrdersContainer?.querySelectorAll('.reject-client-order-btn').forEach(btn => {
         const orderId = btn.dataset.orderId;
         // Remove listener antigo e adiciona novo para evitar duplicação
         const newBtn = btn.cloneNode(true);
         btn.parentNode.replaceChild(newBtn, btn);
         newBtn.addEventListener('click', () => handleRejectClientOrder(orderId));
     });
};


// ==================================================================
//               FUNÇÕES RESTANTES (OBS, ADD ITEM, ENVIO KDS)
// ==================================================================

// Abertura do Modal de Observações (Apenas Staff)
export const openObsModalForGroup = (itemId, noteKey) => {
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
    obsModal.dataset.originalNoteKey = noteKey; // Chave original

    esperaSwitch.checked = noteKey.toLowerCase().includes('espera');

    obsInput.readOnly = false;
    obsInput.placeholder = "Ex: Sem cebola, Ponto da carne mal passada...";

    obsModal.style.display = 'flex';
};
window.openObsModalForGroup = openObsModalForGroup; // Expor globalmente


// Adicionar Produto à Lista de Selecionados (chamado pelo botão + no cardápio)
export const addItemToSelection = (product) => {
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

    selectedItems.push(newItem); // MUTATE (OK)

    renderOrderScreen(currentOrderSnapshot); // Atualiza a UI
    saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase

    openObsModalForGroup(product.id, ''); // Abre modal para o item recém-adicionado
};


// Envia Pedidos ao KDS e Resumo (Função de Staff)
export const handleSendSelectedItems = async () => {
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
            sentItems: arrayUnion(...itemsForFirebase), // Adiciona itens enviados
            selectedItems: itemsToHold,                // Atualiza selecionados (só os em espera)
            total: newTotal,                           // ATUALIZA O TOTAL
            lastKdsSentAt: serverTimestamp()           // Atualiza timestamp do último envio
        });
        console.log("[Order] Mesa atualizada com sucesso.");

        // Sucesso: Atualiza o estado local e UI
        selectedItems.length = 0;
        selectedItems.push(...itemsToHold);
        
        renderOrderScreen(currentOrderSnapshot); // Re-renderiza

        alert(`Pedido enviado! ${itemsToHold.length > 0 ? `(${itemsToHold.length} itens retidos em espera)` : ''}`);

    } catch (e) {
        console.error("Erro ao enviar pedido:", e);
        alert("Falha ao enviar pedido ao KDS/Firebase. Tente novamente.");
        // Restaura selectedItems em caso de falha
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
    clientPendingOrdersContainer = document.getElementById('clientPendingOrders'); // NOVO CONTAINER

    // Mapeia elementos do modal OBS
    obsModal = document.getElementById('obsModal');
    obsItemName = document.getElementById('obsItemName');
    obsInput = document.getElementById('obsInput');
    saveObsBtn = document.getElementById('saveObsBtn');
    cancelObsBtn = document.getElementById('cancelObsBtn');
    esperaSwitch = document.getElementById('esperaSwitch');
    quickObsButtons = document.getElementById('quickObsButtons');

    // Validação de elementos essenciais
    if (!searchProductInput || !categoryFiltersContainer || !menuItemsGrid || !openOrderList || !sendSelectedItemsBtn || !obsModal || !clientPendingOrdersContainer) {
         console.error("[OrderController] Erro Fatal: Elementos críticos não encontrados. Abortando inicialização.");
         return; 
    }

    // Listener para busca de produto
    searchProductInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderMenu(); // Re-renderiza o menu com o novo termo de busca
    });

    // Listener para filtros de categoria (delegação de evento)
    categoryFiltersContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (btn) {
            currentCategoryFilter = btn.dataset.category;
            renderMenu(); // Re-renderiza o menu com o novo filtro
        }
    });

    // Listener para botões +/-/obs na lista de itens selecionados (delegação)
    openOrderList.addEventListener('click', (e) => {
        const target = e.target;
        const qtyBtn = target.closest('.qty-btn'); 
        const obsSpan = target.closest('span[data-item-id]'); // Clica na observação

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
            // Cria um novo array temporário com as atualizações
            const updatedItems = selectedItems.map(item => {
                // Atualiza TODAS as ocorrências com a nota original para a nova nota
                if (item.id == itemId && (item.note || '') === originalNoteKey) {
                    updated = true;
                    return { ...item, note: newNote };
                }
                return item;
            });
            
            // Muta o array original 'selectedItems'
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
                 // Se o item foi recém-adicionado (note original vazia) E o usuário não digitou nada
                 // E cancelou, remove o último item adicionado com esse ID
                 let lastIndex = -1;
                 for (let i = selectedItems.length - 1; i >= 0; i--) {
                     if (selectedItems[i].id == itemId && selectedItems[i].note === '') {
                         lastIndex = i;
                         break;
                     }
                 }
                 if (lastIndex > -1) {
                     selectedItems.splice(lastIndex, 1); // MUTATE (OK)
                     console.log("Item recém-adicionado cancelado.");
                 }
            }

            obsModal.style.display = 'none';
            renderOrderScreen(currentOrderSnapshot); // Re-renderiza
            saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva
        });
    }

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
