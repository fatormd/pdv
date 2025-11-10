// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (ATUALIZADO com Obs Dinâmicas) ---

// Importa funções necessárias dos serviços e do app principal
import { getProducts, getCategories, fetchWooCommerceProducts, fetchWooCommerceCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, goToScreen, setCurrentTable } from "/app.js";
// ==== NOVO: Importa getDocs e query ====
import { arrayUnion, serverTimestamp, updateDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// ==== NOVO: Importa a nova referência ====
import { getTableDocRef, getCustomersCollectionRef, getQuickObsCollectionRef } from "/services/firebaseService.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- VARIÁVEIS DE ELEMENTOS ---
let clientObsModal, clientObsInput, clientSaveObsBtn, clientCancelObsBtn;
let clientSearchProductInput, clientCategoryFiltersContainer, clientMenuItemsGrid;
let clientObsItemName, clientEsperaSwitch; 
let clientAssocModal, assocTableInput, assocPhoneInput, assocNameInput, assocSendOrderBtn, assocErrorMsg, assocCancelBtn; 
let clientProductInfoModal, infoProductName, infoProductDescription, infoProductImage, infoProductPrice, infoProductImageLink; 

// --- ESTADO LOCAL DO MÓDULO ---
let currentClientSearch = '';
let currentClientCategoryFilter = 'all';
let clientInitialized = false; 
let associatedClientDocId = null; 

// --- LÓGICA DE MANIPULAÇÃO DE ITENS LOCAIS (Cliente) ---
const _updateLocalItemQuantity = (itemId, noteKey, delta) => {
    // ... (sem alteração)
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
            if (!product) {
                console.error(`Produto com ID ${itemId} não encontrado para adicionar.`);
                return; 
            }
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

export const addClientItemToSelection = (product) => {
    // ... (sem alteração)
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
    
    openClientObsModalForGroup(product.id, '', true);
};


// --- FUNÇÕES DE RENDERIZAÇÃO DE MENU (Cliente) ---
export const renderClientMenu = () => {
    // ... (sem alteração)
    console.log("[Client] renderClientMenu CALLED");
    if (!clientMenuItemsGrid || !clientCategoryFiltersContainer) {
        console.error("[Client] renderClientMenu ABORTED - Grid or Filters container not found.");
        return;
    }

    const products = getProducts(); 
    const categories = getCategories(); 
    console.log(`[Client] renderClientMenu - Products: ${products.length}, Categories: ${categories.length}`);

    if (categories.length > 0) {
        const categoryButtonsHTML = categories.map(cat => {
            const isActive = cat.slug === currentClientCategoryFilter; 
            const inactiveClasses = 'bg-dark-input text-dark-text border border-dark-border';
            const activeClasses = 'bg-pumpkin text-white border-pumpkin';
            return `<button class="category-btn text-base px-4 py-2 rounded-full font-semibold whitespace-nowrap ${isActive ? activeClasses : inactiveClasses}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
        clientCategoryFiltersContainer.innerHTML = categoryButtonsHTML;
    } else {
        clientCategoryFiltersContainer.innerHTML = '';
        console.warn("[Client] Nenhuma categoria encontrada para renderizar filtros.");
    }

    let filteredProducts = products;
    if (currentClientSearch) { 
        const normalizedSearch = currentClientSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentClientCategoryFilter !== 'all') { 
        filteredProducts = filteredProducts.filter(p => p.category === currentClientCategoryFilter);
    }

    if (filteredProducts.length === 0) {
        // Esta é a linha que está aparecendo
        clientMenuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-dark-placeholder italic">Nenhum produto encontrado com os filtros atuais.</div>`;
    } else {
        
        // ===== INÍCIO DA ATUALIZAÇÃO (Alinhamento Simples) =====
        // Remove 'auto-rows-fr' para deixar a altura automática, mas mantém gap-4
        clientMenuItemsGrid.className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto custom-scrollbar pb-4";
        // ===== FIM DA ATUALIZAÇÃO =====
        
        clientMenuItemsGrid.innerHTML = filteredProducts.map(product => {
            const productDataString = JSON.stringify(product).replace(/'/g, '&#39;');

            return `
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md overflow-hidden flex flex-col mb-1">

                <img src="${product.image}" alt="${product.name}" class="w-full h-56 md:h-64 object-cover cursor-pointer info-img-trigger" data-product='${productDataString}'>

                <div class="p-3 flex flex-col flex-grow">

                    <h4 class="font-bold text-base text-dark-text mb-2 flex-grow cursor-pointer info-name-trigger" data-product='${productDataString}'>${product.name}</h4>

                    <div class="flex justify-between items-center mt-auto mb-3">
                        <span class="font-bold text-base text-pumpkin">${formatCurrency(product.price)}</span>
                        <button class="add-item-btn bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition w-9 h-9 flex items-center justify-center"
                                data-product='${productDataString}' title="Adicionar ao Pedido">
                            <i class="fas fa-plus text-base pointer-events-none"></i>
                        </button>
                    </div>

                    <button class="info-btn w-full bg-indigo-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-indigo-700 transition"
                            data-product='${productDataString}'>
                        <i class="fas fa-info-circle mr-1"></i> Descrição
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }
    console.log("[Client] renderClientMenu FINISHED rendering.");
};


export const renderClientOrderScreen = () => {
    // ... (sem alteração)
    const openOrderList = document.getElementById('openOrderListClient'); 
    const openItemsCount = document.getElementById('openItemsCountClient'); 
    const sendBtn = document.getElementById('sendClientOrderBtn'); 

    if (!openOrderList) {
        console.error("Elemento openOrderListClient não encontrado.");
        return; 
    }

    const openItemsCountValue = selectedItems.length; 
    if(openItemsCount) openItemsCount.textContent = openItemsCountValue; 

    if (sendBtn) {
        sendBtn.disabled = openItemsCountValue === 0;
    }

    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`; 
            if (!acc[key]) {
                acc[key] = { ...item, count: 0 }; 
            }
            acc[key].count++; 
            return acc;
        }, {});

        openOrderList.innerHTML = Object.values(groupedItems).map(group => {
            
            let noteDisplay;
            if (group.note) {
                const esperaTag = ' [EM ESPERA]';
                const cleanNote = group.note.replace(esperaTag, '').trim();
                const hasEspera = group.note.includes(esperaTag);
                
                noteDisplay = `(<span class="text-yellow-400">${cleanNote}</span>${hasEspera ? ' <i class="fas fa-pause-circle text-yellow-400"></i>' : ''})`;
            } else {
                noteDisplay = `(Adicionar Obs.)`;
            }

            return `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm border border-dark-border">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-dark-text">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-indigo-400 hover:text-indigo-300"
                          onclick="window.openClientObsModalForGroup('${group.id}', '${group.note || ''}')">
                        ${noteDisplay}
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
            `;
        }).join('');
    }
};

// --- FUNÇÕES DE MODAL ---

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


export function openClientObsModalForGroup(itemId, noteKey, isNew = false) {
    // ... (sem alteração)
    const products = getProducts();
    const product = products.find(p => p.id == itemId); 

    if (!clientObsModal || !clientObsItemName || !clientObsInput || !clientEsperaSwitch || !product) {
        console.error("Erro ao abrir modal OBS: Elementos ou produto não encontrados.");
        return;
    }

    clientObsItemName.textContent = product.name; 

    const esperaTag = ' [EM ESPERA]';
    const currentNoteCleaned = noteKey.replace(esperaTag, '').trim();
    clientObsInput.value = currentNoteCleaned;
    
    clientObsInput.readOnly = false; 
    clientObsInput.placeholder = "Ex: Sem cebola, Ponto da carne...";

    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey;
    
    clientObsModal.dataset.isNewItem = isNew ? 'true' : 'false';

    clientEsperaSwitch.checked = noteKey.toLowerCase().includes('espera');

    clientObsModal.style.display = 'flex'; 
    clientObsInput.focus(); 
}
window.openClientObsModalForGroup = openClientObsModalForGroup;


export const openProductInfoModal = (product) => {
    // ... (sem alteração)
    if (!clientProductInfoModal || !infoProductName || !infoProductDescription || !infoProductImage || !infoProductPrice || !infoProductImageLink) {
        console.error("Elementos do Modal de Informação do Produto não encontrados.");
        return;
    }
    console.log("[Client] Opening Product Info Modal for:", product.name);

    infoProductName.textContent = product.name;
    infoProductPrice.textContent = formatCurrency(product.price);
    infoProductDescription.innerHTML = product.description;
    infoProductImage.src = product.image; 
    infoProductImageLink.href = product.image;
    clientProductInfoModal.dataset.product = JSON.stringify(product);

    clientProductInfoModal.style.display = 'flex';
};
window.openProductInfoModal = openProductInfoModal;


// --- FUNÇÃO PRINCIPAL: Envio de Pedido pelo Cliente ---
export const handleClientSendOrder = async () => {
    // ... (sem alteração)
    if (selectedItems.length === 0) {
        alert("Adicione itens ao seu pedido antes de enviar.");
        return;
    }

    if (!currentTableId) {
        if (clientAssocModal) clientAssocModal.style.display = 'flex';
        if(assocErrorMsg) {
             assocErrorMsg.textContent = "Para enviar seu pedido, preencha a mesa e seu contato.";
             assocErrorMsg.classList.remove('text-red-400'); 
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
        alert("Falha ao enviar pedido para o Garçom/Firebase. Tente novamente.");
    } finally {
        if (btn) btn.disabled = false; 
    }
};

export const handleClientAssociationAndSend = async () => {
    // ... (sem alteração)
    const tableNumber = assocTableInput?.value.trim();
    const phone = assocPhoneInput?.value.replace(/\D/g, ''); 
    const name = assocNameInput?.value.trim() || 'Cliente Comanda'; 

    if (!tableNumber || tableNumber === '0') {
         assocErrorMsg.textContent = "Número da mesa é obrigatório.";
         assocErrorMsg.style.display = 'block';
         return;
    }
    if (phone.length < 10) { 
         assocErrorMsg.textContent = "Telefone/WhatsApp inválido. Inclua DDD (mínimo 10 dígitos).";
         assocErrorMsg.style.display = 'block';
         return;
    }
    assocErrorMsg.style.display = 'none'; 

    if (assocSendOrderBtn) { assocSendOrderBtn.disabled = true; assocSendOrderBtn.textContent = 'Verificando...'; }

    try {
        const tableRef = getTableDocRef(tableNumber);
        const docSnap = await getDoc(tableRef);

        if (!docSnap.exists() || docSnap.data().status?.toLowerCase() !== 'open') {
            assocErrorMsg.textContent = `Mesa ${tableNumber} não encontrada ou não está aberta. Verifique o número.`;
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
        setCurrentTable(tableNumber, true); 

        if (selectedItems.length > 0) {
            await saveSelectedItemsToFirebase(tableNumber, selectedItems);
        }

        if (clientAssocModal) clientAssocModal.style.display = 'none';

        handleClientSendOrder();

    } catch (error) {
         console.error("[ASSOCIAÇÃO CLIENTE] Erro:", error);
         assocErrorMsg.textContent = `Falha na associação/cadastro: ${error.message}. Tente novamente.`;
         assocErrorMsg.style.display = 'block';
    } finally {
        if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
    }
};


const handleQuickButtonClient = (e) => {
    // ... (sem alteração)
    const btn = e.target.closest('.quick-obs-btn'); 
    if (btn && clientObsInput && !clientObsInput.readOnly) { 
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
    // ... (sem alteração)
    const itemId = clientObsModal.dataset.itemId; 
    const originalNoteKey = clientObsModal.dataset.originalNoteKey; 
    let newNote = clientObsInput.value.trim(); 

    const isEsperaActive = clientEsperaSwitch.checked;
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

    if (updated) {
        selectedItems.length = 0; 
        selectedItems.push(...updatedItems); 

        clientObsModal.style.display = 'none'; 
        renderClientOrderScreen(); 
        if (currentTableId) {
            saveSelectedItemsToFirebase(currentTableId, selectedItems); 
        }
    } else {
        console.warn("Nenhum item encontrado para atualizar a observação.");
        clientObsModal.style.display = 'none'; 
    }
};


// --- INICIALIZAÇÃO DO CONTROLLER DO CLIENTE ---
export const initClientOrderController = () => {
    console.log("[ClientOrderController] initClientOrderController CALLED");
    if(clientInitialized) {
        console.log("[ClientOrderController] Already initialized.");
        return; 
    }

    // Mapeia os elementos HTML essenciais para variáveis
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

    clientProductInfoModal = document.getElementById('productInfoModal');
    infoProductName = document.getElementById('infoProductName');
    infoProductDescription = document.getElementById('infoProductDescription');
    infoProductImage = document.getElementById('infoProductImage');
    infoProductPrice = document.getElementById('infoProductPrice');
    infoProductImageLink = document.getElementById('infoProductImageLink');


    // Validação CRÍTICA
    const essentialElements = [
        clientObsModal, clientAssocModal, clientMenuItemsGrid, clientProductInfoModal,
        clientSearchProductInput, clientCategoryFiltersContainer, clientSaveObsBtn, clientCancelObsBtn,
        assocSendOrderBtn, assocCancelBtn, 
        infoProductName, infoProductDescription, infoProductImage, infoProductPrice, infoProductImageLink,
        clientEsperaSwitch 
    ];
    if (essentialElements.some(el => !el)) {
        console.error("[ClientController] Erro Fatal: Elementos críticos não encontrados no HTML. Verifique os IDs. Aborting initialization.");
        const body = document.querySelector('body');
        if (body) body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Erro ao carregar a interface. Os elementos necessários não foram encontrados. Tente recarregar a página.</p>';
        return; 
    }
    console.log("[ClientOrderController] Essential elements mapped.");


    // Adiciona os Listeners (ouvintes de eventos)
    const sendClientBtn = document.getElementById('sendClientOrderBtn');
    if (sendClientBtn) sendClientBtn.addEventListener('click', handleClientSendOrder);

    if (assocSendOrderBtn) assocSendOrderBtn.addEventListener('click', handleClientAssociationAndSend);
    if (assocCancelBtn) assocCancelBtn.addEventListener('click', () => { if(clientAssocModal) clientAssocModal.style.display = 'none'; });

    // Listeners do Modal OBS
    if (clientSaveObsBtn) clientSaveObsBtn.addEventListener('click', handleSaveClientObs);
    
    if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => {
        const itemId = clientObsModal.dataset.itemId;
        const originalNoteKey = clientObsModal.dataset.originalNoteKey;
        const currentNote = clientObsInput.value.trim();
        const isNewItem = clientObsModal.dataset.isNewItem === 'true';

        if (isNewItem && originalNoteKey === '' && currentNote === '') {
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
                 console.log("[Client] Item recém-adicionado cancelado e removido.");
             }
        }
        clientObsModal.style.display = 'none'; 
    });


    // Listener para input de busca
    if (clientSearchProductInput) {
        clientSearchProductInput.addEventListener('input', (e) => {
            currentClientSearch = e.target.value; 
            renderClientMenu(); 
        });
    }

    // Listener para botões de filtro de categoria (delegação de evento)
    if (clientCategoryFiltersContainer) {
        clientCategoryFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn'); 
            if (btn) {
                currentClientCategoryFilter = btn.dataset.category; 
                renderClientMenu(); 
            }
        });
    }

    // Event Delegation para cliques no grid de produtos
    if (clientMenuItemsGrid) {
        clientMenuItemsGrid.addEventListener('click', (e) => {
            let productData; 
            const clickedElement = e.target; 

            const dataElement = clickedElement.closest('[data-product]');

            if (dataElement && dataElement.dataset.product) {
                try {
                    productData = JSON.parse(dataElement.dataset.product.replace(/&#39;/g, "'"));
                } catch (err) {
                    console.error("Erro ao parsear dados do produto no clique:", err, dataElement.dataset.product);
                    return; 
                }
            } else {
                return;
            }

            if (clickedElement.closest('.info-btn')) {
                console.log("[Client Click] Info button clicked.");
                openProductInfoModal(productData);

            } else if (clickedElement.closest('.info-img-trigger') || clickedElement.closest('.info-name-trigger')) {
                console.log("[Client Click] Info trigger (img/name) clicked.");
                openProductInfoModal(productData);

            } else if (clickedElement.closest('.add-item-btn')) {
                console.log("[Client Click] Add button clicked.");
                addClientItemToSelection(productData);

            } else if (clickedElement.closest('.product-card')) {
                console.log("[Client Click] Card area clicked (no specific action).");
            }
        });
    } else {
        console.error("[ClientOrderController] menuItemsGrid NOT FOUND for attaching listener.");
    }

    // ==== NOVO: Mapeia e busca botões de OBS dinâmicos ====
    const quickObsButtons = document.getElementById('quickObsButtons');
    if (quickObsButtons) {
        // Busca os botões
        fetchQuickObservations(quickObsButtons);
        // Adiciona o listener de clique
        quickObsButtons.addEventListener('click', handleQuickButtonClient);
    }
    
    // Listener para o botão "Quero esse" (do modal de info)
    const infoProductAddBtn = document.getElementById('infoProductAddBtn');
    if (infoProductAddBtn) {
        infoProductAddBtn.addEventListener('click', () => {
            const productDataString = clientProductInfoModal.dataset.product;
            if (productDataString) {
                try {
                    const product = JSON.parse(productDataString);
                    addClientItemToSelection(product);
                    clientProductInfoModal.style.display = 'none'; 
                } catch (e) {
                    console.error("Erro ao adicionar produto pelo modal", e);
                    alert("Não foi possível adicionar o produto.");
                }
            }
        });
    }

    // ===== INÍCIO DA ATUALIZAÇÃO (Corrige Race Condition) =====
    console.log("[ClientOrderController] Fetching WooCommerce data...");
    
    // Espera que AMBOS (produtos e categorias) terminem de carregar
    Promise.all([
        fetchWooCommerceProducts(null), // Carrega produtos, mas não renderiza ainda
        fetchWooCommerceCategories(null) // Carrega categorias, mas não renderiza ainda
    ]).then(() => {
        // SÓ ENTÃO renderiza o menu UMA VEZ com todos os dados
        renderClientMenu(); 
        console.log("[ClientOrderController] Products and Categories fetched successfully.");
    }).catch(e => {
        console.error("[ClientController INIT] Falha CRÍTICA ao carregar dados:", e);
        alert("Erro ao carregar o cardápio. Tente recarregar a página.");
    });
    // ===== FIM DA ATUALIZAÇÃO =====

    clientInitialized = true; 
    console.log("[ClientOrderController] initClientOrderController FINISHED.");
};