// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (Refatorado com Event Delegation) ---
import { getProducts, getCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, goToScreen, setCurrentTable } from "/app.js";
import { arrayUnion, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getTableDocRef, getCustomersCollectionRef } from "/services/firebaseService.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- VARIÁVEIS DE ELEMENTOS (Definidas no DOMContentLoaded) ---
let clientObsModal, clientObsInput, clientSaveObsBtn, clientCancelObsBtn;
let clientSearchProductInput, clientCategoryFiltersContainer, clientMenuItemsGrid;
let clientObsItemName, clientEsperaSwitch;
let clientAssocModal, assocTableInput, assocPhoneInput, assocNameInput, assocSendOrderBtn, assocErrorMsg, assocCancelBtn;

// Estado local
let currentClientSearch = '';
let currentClientCategoryFilter = 'all';
let clientInitialized = false;
let associatedClientDocId = null;

// --- LÓGICA DE MANIPULAÇÃO DE ITENS LOCAIS (Cliente) ---
const _updateLocalItemQuantity = (itemId, noteKey, delta) => {
    let indexToRemove = -1;
    if (delta < 0) {
        for (let i = selectedItems.length - 1; i >= 0; i--) {
            if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
                indexToRemove = i;
                break;
            }
        }
    }

    if (delta > 0) {
        const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
        if (itemToCopy) {
            selectedItems.push({ ...itemToCopy });
        } else {
            const products = getProducts();
            const product = products.find(p => p.id == itemId);
            if (!product) return;
            const newItem = { id: product.id, name: product.name, price: product.price, sector: product.sector || 'cozinha', category: product.category || 'uncategorized', note: noteKey };
            selectedItems.push(newItem);
        }
    } else if (delta < 0 && indexToRemove !== -1) {
        selectedItems.splice(indexToRemove, 1);
    }

    renderClientOrderScreen();
    if (currentTableId) {
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }
};

export const increaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, 1);
export const decreaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, -1);
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;


// Chamado pelo botão + do cardápio do cliente (AGORA VIA EVENT DELEGATION)
export const addClientItemToSelection = (product) => {
    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha',
        category: product.category || 'uncategorized',
        note: ''
    };

    selectedItems.push(newItem);
    renderClientOrderScreen();

    if (currentTableId) {
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    openClientObsModalForGroup(product.id, '');
};


// --- FUNÇÕES DE RENDERIZAÇÃO DE MENU (Cliente - Comentários Removidos do Botão) ---
export const renderClientMenu = () => {
    if (!clientMenuItemsGrid || !clientCategoryFiltersContainer) return;

    const products = getProducts();
    const categories = getCategories();

    // 1. Renderiza Filtros de Categoria
    if (categories.length > 0 && clientCategoryFiltersContainer.innerHTML.trim() === '') {
        clientCategoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentClientCategoryFilter ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-700';
            // Usa as classes dark mode nos filtros também
            const inactiveClasses = 'bg-dark-input text-dark-text border border-dark-border';
            const activeClasses = 'bg-pumpkin text-white border-pumpkin';
            return `<button class="category-btn text-base px-4 py-2 rounded-full font-semibold whitespace-nowrap ${isActive ? activeClasses : inactiveClasses}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }
     // Atualiza o estado ativo dos botões de categoria
     clientCategoryFiltersContainer.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentClientCategoryFilter;
        // Classes Dark Mode
        btn.classList.toggle('bg-pumpkin', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-pumpkin', isActive);
        btn.classList.toggle('bg-dark-input', !isActive);
        btn.classList.toggle('text-dark-text', !isActive);
        btn.classList.toggle('border-dark-border', !isActive);
    });

    // 2. Filtra Produtos
    let filteredProducts = products;
    if (currentClientSearch) {
        const normalizedSearch = currentClientSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentClientCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentClientCategoryFilter);
    }

    // 3. Renderiza Itens do Cardápio (SEM comentários no botão)
    if (filteredProducts.length === 0) {
        clientMenuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-dark-placeholder italic">Nenhum produto encontrado.</div>`;
    } else {
        clientMenuItemsGrid.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-dark-card border border-dark-border p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150">
                <h4 class="font-bold text-base text-dark-text">${product.name}</h4>
                <p class="text-xs text-dark-placeholder">${product.category} (${product.sector})</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-bold text-lg text-pumpkin">${formatCurrency(product.price)}</span>
                    <button class="add-item-btn bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition"
                            data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'>
                        <i class="fas fa-plus text-base pointer-events-none"></i>
                    </button> {/* Comentários removidos daqui */}
                </div>
            </div>
        `).join('');
    }
};


// Função de Renderização da Lista de Pedidos do Cliente
export const renderClientOrderScreen = () => {
    // ... (código inalterado)
    const openOrderList = document.getElementById('openOrderListClient');
    const openItemsCount = document.getElementById('openItemsCountClient');
    const sendBtn = document.getElementById('sendClientOrderBtn');

    if (!openOrderList) return;

    const openItemsCountValue = selectedItems.length;
    if(openItemsCount) openItemsCount.textContent = openItemsCountValue;

    if (sendBtn) {
        sendBtn.disabled = openItemsCountValue === 0;
    }

    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        // Lógica de Agrupamento para exibição
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) {
                acc[key] = { ...item, count: 0 };
            }
            acc[key].count++;
            return acc;
        }, {});

        openOrderList.innerHTML = Object.values(groupedItems).map(group => `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm border border-dark-border"> {/* Estilo dark aplicado */}
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-dark-text">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-indigo-400 hover:text-indigo-300"
                          onclick="window.openClientObsModalForGroup('${group.id}', '${group.note || ''}')">
                        ${group.note ? `(${group.note})` : `(Adicionar Obs.)`}
                    </span>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center hover:bg-red-700 transition duration-150"
                            onclick="window.decreaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Remover um">
                        <i class="fas fa-minus pointer-events-none"></i>
                    </button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center hover:bg-green-700 transition duration-150"
                            onclick="window.increaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Adicionar um">
                        <i class="fas fa-plus pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};


// Abertura do Modal de Observações (Cliente - Apenas Quick Buttons)
export function openClientObsModalForGroup(itemId, noteKey) {
    // ... (código inalterado)
    const products = getProducts();
    const product = products.find(p => p.id == itemId);

    if (!clientObsModal || !product) return;

    clientObsItemName.textContent = product.name;

    const currentNoteCleaned = noteKey.replace(' [EM ESPERA]', '').trim();
    clientObsInput.value = currentNoteCleaned;
    clientObsInput.readOnly = true;
    clientObsInput.placeholder = "Apenas botões rápidos permitidos.";

    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey;

    if (clientEsperaSwitch) clientEsperaSwitch.checked = false;

    clientObsModal.style.display = 'flex';
}
// window.openClientObsModalForGroup = openClientObsModalForGroup; // Já definido globalmente no app.js


// FUNÇÃO PRINCIPAL: Envio de Pedido pelo Cliente (Aciona Modal se necessário)
export const handleClientSendOrder = async () => {
    // ... (código inalterado)
    if (selectedItems.length === 0) {
        alert("Adicione itens ao seu pedido antes de enviar.");
        return;
    }

    if (!currentTableId) {
        if (clientAssocModal) clientAssocModal.style.display = 'flex';
        if(assocErrorMsg) {
             assocErrorMsg.textContent = "Para enviar seu pedido, preencha a mesa e seu contato.";
             assocErrorMsg.classList.remove('text-red-400'); // Corrigido para red-400 (tema dark)
             assocErrorMsg.classList.add('text-dark-placeholder');
             assocErrorMsg.style.display = 'block';
        }
        return;
    }

    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para o Garçom? O garçom deve aprovar o pedido antes de enviá-lo à cozinha.`)) return;

    const btn = document.getElementById('sendClientOrderBtn');
    if (btn) btn.disabled = true;

    try {
        const tableRef = getTableDocRef(currentTableId);

        const requestedOrder = {
            orderId: `req_${Date.now()}`,
            items: selectedItems.map(item => ({...item, requestedAt: Date.now()})),
            requestedAt: Date.now(),
            status: 'pending_waiter',
            clientInfo: {
                 docId: associatedClientDocId,
                 name: currentOrderSnapshot?.clientName || 'Cliente Comanda',
                 phone: associatedClientDocId || 'N/A'
            }
        };

        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(requestedOrder),
            selectedItems: [],
            clientOrderPending: true,
            waiterNotification: { type: 'client_request', timestamp: serverTimestamp() }
        });

        selectedItems.length = 0;
        renderClientOrderScreen();

        alert(`Pedido enviado! Aguarde a confirmação do seu Garçom.`);

    } catch (e) {
        console.error("Erro ao enviar pedido do cliente:", e);
        alert("Falha ao enviar pedido para o Garçom/Firebase.");
    } finally {
        if (btn) btn.disabled = false;
    }
};

// Lógica de Associação e Envio (Chamada pelo Modal)
export const handleClientAssociationAndSend = async () => {
    // ... (código inalterado)
    const tableNumber = assocTableInput?.value.trim();
    const phone = assocPhoneInput?.value.replace(/\D/g, ''); // Apenas números
    const name = assocNameInput?.value.trim() || 'Cliente Comanda';

    if (!tableNumber || tableNumber === '0') {
         assocErrorMsg.textContent = "Número da mesa é obrigatório.";
         assocErrorMsg.style.display = 'block';
         return;
    }
    if (phone.length < 10) { // Telefone com DDD, 10 ou 11 dígitos
         assocErrorMsg.textContent = "Telefone/WhatsApp inválido. Mínimo 10 dígitos.";
         assocErrorMsg.style.display = 'block';
         return;
    }
    assocErrorMsg.style.display = 'none';

    if (assocSendOrderBtn) { assocSendOrderBtn.disabled = true; assocSendOrderBtn.textContent = 'Verificando...'; }

    try {
        const tableRef = getTableDocRef(tableNumber);
        const docSnap = await getDoc(tableRef);

        if (!docSnap.exists() || docSnap.data().status?.toLowerCase() !== 'open') {
            assocErrorMsg.textContent = `Mesa ${tableNumber} não encontrada ou não está aberta.`;
            assocErrorMsg.style.display = 'block';
            if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
            return;
        }

        const customersRef = getCustomersCollectionRef();
        const clientDocId = phone;
        const clientDocRef = doc(customersRef, clientDocId);

        const clientData = {
            name: name,
            phone: phone,
            associatedTable: tableNumber,
            lastVisit: serverTimestamp(),
        };

        await setDoc(clientDocRef, clientData, { merge: true });

        associatedClientDocId = clientDocId;
        setCurrentTable(tableNumber, true); // True para modo cliente (isso inicia o listener)

        if (selectedItems.length > 0) {
            await saveSelectedItemsToFirebase(tableNumber, selectedItems);
        }

        if (clientAssocModal) clientAssocModal.style.display = 'none';

        handleClientSendOrder();

    } catch (error) {
         console.error("[ASSOCIAÇÃO CLIENTE] Erro:", error);
         assocErrorMsg.textContent = `Falha na associação/cadastro: ${error.message}.`;
         assocErrorMsg.style.display = 'block';
    } finally {
        if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
    }
};


// Listener para as Quick-Buttons do Modal de Observação (Cliente)
const handleQuickButtonClient = (e) => {
    // ... (código inalterado)
    const btn = e.target.closest('.quick-obs-btn');
    if (btn && clientObsInput) {
        const obsText = btn.dataset.obs;
        let currentValue = clientObsInput.value.trim();

        if (currentValue && !currentValue.endsWith(',') && currentValue.length > 0) {
            currentValue += ', ';
        } else if (currentValue.endsWith(',')) {
            currentValue += ' ';
        }

        clientObsInput.value = (currentValue + obsText).trim();
    }
};

const handleSaveClientObs = () => {
    // ... (código inalterado)
    const itemId = clientObsModal.dataset.itemId;
    const originalNoteKey = clientObsModal.dataset.originalNoteKey;
    let newNote = clientObsInput.value.trim();

    newNote = newNote.replace(/ \[EM ESPERA\]/gi, '').trim();

    let updated = false;
    let firstUpdateIndex = -1;

    const updatedItems = selectedItems.map((item, index) => {
        if (item.id == itemId && (item.note || '') === originalNoteKey) {
            if (!updated) {
                 firstUpdateIndex = index;
            }
            updated = true;
            return { ...item, note: newNote };
        }
        return item;
    });

    selectedItems.length = 0;
    selectedItems.push(...updatedItems);

    if (updated) {
        clientObsModal.style.display = 'none';
        renderClientOrderScreen();
        if (currentTableId) {
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    } else {
        clientObsModal.style.display = 'none';
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER DO CLIENTE ---
export const initClientOrderController = () => {
    if(clientInitialized) return;

    // Mapeia os elementos
    clientObsModal = document.getElementById('obsModal');
    clientObsItemName = document.getElementById('obsItemName');
    clientObsInput = document.getElementById('obsInput');
    clientSaveObsBtn = document.getElementById('saveObsBtn');
    clientCancelObsBtn = document.getElementById('cancelObsBtn');
    clientEsperaSwitch = document.getElementById('esperaSwitch');

    clientAssocModal = document.getElementById('associationModal');
    assocTableInput = document.getElementById('assocTableNumber');
    assocPhoneInput = document.getElementById('assocPhone');
    assocNameInput = document.getElementById('assocName');
    assocSendOrderBtn = document.getElementById('assocSendOrderBtn');
    assocErrorMsg = document.getElementById('assocErrorMsg');
    assocCancelBtn = document.getElementById('assocCancelBtn');

    clientSearchProductInput = document.getElementById('searchProductInputClient');
    clientCategoryFiltersContainer = document.getElementById('categoryFiltersClient');
    clientMenuItemsGrid = document.getElementById('menuItemsGridClient');

    // Validação de Elementos Essenciais
    if (!clientObsModal || !clientAssocModal || !clientMenuItemsGrid) {
        console.error("[ClientController] Erro Fatal: Elementos críticos (modais, grid de menu) não encontrados.");
        return;
    }

    // Listeners Essenciais
    const sendClientBtn = document.getElementById('sendClientOrderBtn');
    if (sendClientBtn) sendClientBtn.addEventListener('click', handleClientSendOrder);

    if (assocSendOrderBtn) assocSendOrderBtn.addEventListener('click', handleClientAssociationAndSend);
    if (assocCancelBtn) assocCancelBtn.addEventListener('click', () => { if(clientAssocModal) clientAssocModal.style.display = 'none'; });

    if (clientSaveObsBtn) clientSaveObsBtn.addEventListener('click', handleSaveClientObs);
    if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => {
        const itemId = clientObsModal.dataset.itemId;
        const originalNoteKey = clientObsModal.dataset.originalNoteKey;
        const currentNote = clientObsInput.value.trim();

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
                 renderClientOrderScreen();
                 if (currentTableId) saveSelectedItemsToFirebase(currentTableId, selectedItems);
             }
        }
        clientObsModal.style.display = 'none';
    });

    if (clientSearchProductInput) {
        clientSearchProductInput.addEventListener('input', (e) => {
            currentClientSearch = e.target.value;
            renderClientMenu();
        });
    }

    if (clientCategoryFiltersContainer) {
        clientCategoryFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                currentClientCategoryFilter = btn.dataset.category;
                renderClientMenu();
            }
        });
    }

    // Event Delegation para adicionar item
    if (clientMenuItemsGrid) {
        clientMenuItemsGrid.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.add-item-btn');
            if (addBtn) {
                try {
                    const productData = JSON.parse(addBtn.dataset.product.replace(/&#39;/g, "'"));
                    addClientItemToSelection(productData);
                } catch (err) {
                    console.error("Erro ao parsear dados do produto no clique:", err, addBtn.dataset.product);
                }
            }
        });
    }

    const quickObsButtons = document.getElementById('quickObsButtons');
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', handleQuickButtonClient);
    }

    clientInitialized = true;
    console.log("[ClientOrderController] Inicializado.");
};
