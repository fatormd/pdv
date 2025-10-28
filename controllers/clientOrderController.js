// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (Novo Módulo - Painel 5) ---
import { getProducts, getCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js"; 
// Certifique-se de que setCurrentTable e outros sejam exportados de app.js
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, goToScreen, setCurrentTable } from "/app.js"; 
import { arrayUnion, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getTableDocRef, getCustomersCollectionRef } from "/services/firebaseService.js"; 
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- VARIÁVEIS DE ELEMENTOS (Definidas no DOMContentLoaded) ---
let clientObsModal, clientObsInput, clientSaveObsBtn, clientCancelObsBtn;
let clientSearchProductInput, clientCategoryFiltersContainer, clientMenuItemsGrid;
let clientObsItemName, clientEsperaSwitch;

// NOVO: Elementos de Associação
let clientAssocModal, assocTableInput, assocPhoneInput, assocNameInput, assocSendOrderBtn, assocErrorMsg, assocCancelBtn;

// Estado local
let currentClientSearch = ''; 
let currentClientCategoryFilter = 'all'; 
let clientInitialized = false;

// Variável para armazenar o ID do cliente após o cadastro/associação
let associatedClientDocId = null; 

// --- LÓGICA DE MANIPULAÇÃO DE ITENS LOCAIS (Cliente) ---

// Adiciona/remove item na seleção local e salva no Firebase
const _updateLocalItemQuantity = (itemId, noteKey, delta) => {
    let indexToRemove = -1;
    
    // Encontra o ÍNDICE do último item correspondente para REMOÇÃO
    if (delta < 0) {
        for (let i = selectedItems.length - 1; i >= 0; i--) {
            if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
                indexToRemove = i;
                break;
            }
        }
    }

    if (delta > 0) {
         // Adicionar - Tenta copiar o último item com a mesma ID e nota (para manter a ordem)
         const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
         if (itemToCopy) {
             selectedItems.push({ ...itemToCopy }); // Adiciona uma cópia exata
         } else {
             // Se não houver nenhum com essa nota, adiciona um novo do zero (raro, mas seguro)
             const products = getProducts();
             const product = products.find(p => p.id == itemId);
             if (!product) return;
             const newItem = { id: product.id, name: product.name, price: product.price, sector: product.sector || 'cozinha', category: product.category || 'uncategorized', note: noteKey };
             selectedItems.push(newItem);
         }
    } else if (delta < 0 && indexToRemove !== -1) {
        // Remover
        selectedItems.splice(indexToRemove, 1);
    }
    
    renderClientOrderScreen(); // Re-renderiza a lista de itens selecionados
    if (currentTableId) { // Só salva se já estiver associado a uma mesa
        saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    }
};

export const increaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, 1);
export const decreaseLocalItemQuantity = (itemId, noteKey) => _updateLocalItemQuantity(itemId, noteKey, -1);
// Expor globalmente para os onClicks do HTML
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;


// Chamado pelo botão + do cardápio do cliente
export const addClientItemToSelection = (product) => {
    // Não precisa de currentTableId aqui, o cliente monta o carrinho antes de associar
    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha',
        category: product.category || 'uncategorized',
        note: ''
    };

    selectedItems.push(newItem); 
    renderClientOrderScreen(); // Atualiza a UI
    
    // Salva no Firebase APENAS se já estiver associado a uma mesa
    if (currentTableId) {
        saveSelectedItemsToFirebase(currentTableId, selectedItems); 
    }
    
    // Abre o modal de observação para o item recém-adicionado
    openClientObsModalForGroup(product.id, ''); 
};
window.addClientItemToSelection = addClientItemToSelection;


// --- FUNÇÕES DE RENDERIZAÇÃO DE MENU (Cliente) ---
export const renderClientMenu = () => {
    if (!clientMenuItemsGrid || !clientCategoryFiltersContainer) return;

    const products = getProducts();
    const categories = getCategories();

    // 1. Renderiza Filtros de Categoria
    if (categories.length > 0 && clientCategoryFiltersContainer.innerHTML.trim() === '') {
        clientCategoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentClientCategoryFilter ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-700';
            return `<button class="category-btn text-base px-4 py-2 rounded-full font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }
     // Atualiza o estado ativo dos botões de categoria
     clientCategoryFiltersContainer.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentClientCategoryFilter;
        btn.classList.toggle('bg-indigo-700', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-gray-200', !isActive);
        btn.classList.toggle('text-gray-700', !isActive);
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

    // 3. Renderiza Itens do Cardápio
    if (filteredProducts.length === 0) {
        clientMenuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-gray-500 italic">Nenhum produto encontrado.</div>`;
    } else {
        clientMenuItemsGrid.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-white border border-gray-300 p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150">
                <h4 class="font-bold text-base text-gray-800">${product.name}</h4>
                <p class="text-xs text-gray-500">${product.category} (${product.sector})</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-bold text-lg text-pumpkin">${formatCurrency(product.price)}</span>
                    <button class="add-item-btn bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition"
                            onclick="window.addClientItemToSelection(${JSON.stringify(product).replace(/'/g, '&#39;')})">
                        <i class="fas fa-plus text-base"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};


// Função de Renderização da Lista de Pedidos do Cliente
export const renderClientOrderScreen = () => {
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
        openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
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
            <div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-gray-800">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-indigo-500 hover:text-indigo-700" 
                          onclick="window.openClientObsModalForGroup('${group.id}', '${group.note || ''}')">
                        ${group.note ? `(${group.note})` : `(Adicionar Obs.)`}
                    </span>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-500 text-white rounded-full h-8 w-8 flex items-center justify-center hover:bg-red-600 transition duration-150" 
                            onclick="window.decreaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Remover um">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button class="qty-btn bg-green-500 text-white rounded-full h-8 w-8 flex items-center justify-center hover:bg-green-600 transition duration-150" 
                            onclick="window.increaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Adicionar um">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};


// Abertura do Modal de Observações (Cliente - Apenas Quick Buttons)
export function openClientObsModalForGroup(itemId, noteKey) {
    const products = getProducts();
    const product = products.find(p => p.id == itemId);

    if (!clientObsModal || !product) return;

    clientObsItemName.textContent = product.name;
    
    // O cliente NÃO DEVE usar [EM ESPERA]
    const currentNoteCleaned = noteKey.replace(' [EM ESPERA]', '').trim(); 
    clientObsInput.value = currentNoteCleaned;
    clientObsInput.readOnly = true; // CRÍTICO: Bloqueia a edição livre
    clientObsInput.placeholder = "Apenas botões rápidos permitidos.";
    
    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey;
    
    // Desativa o switch 'Em Espera' se existir (client.html já o desativa)
    if (clientEsperaSwitch) clientEsperaSwitch.checked = false;
    
    clientObsModal.style.display = 'flex';
}
window.openClientObsModalForGroup = openClientObsModalForGroup;


// FUNÇÃO PRINCIPAL: Envio de Pedido pelo Cliente (Aciona Modal se necessário)
export const handleClientSendOrder = async () => {
    if (selectedItems.length === 0) {
        alert("Adicione itens ao seu pedido antes de enviar.");
        return;
    }
    
    // Se o cliente ainda não está associado à mesa, abre o modal de associação.
    if (!currentTableId) {
        if (clientAssocModal) clientAssocModal.style.display = 'flex';
        // Atualiza a mensagem
        if(assocErrorMsg) {
             assocErrorMsg.textContent = "Para enviar seu pedido, preencha a mesa e seu contato.";
             assocErrorMsg.classList.remove('text-red-500');
             assocErrorMsg.classList.add('text-gray-600');
             assocErrorMsg.style.display = 'block';
        }
        return;
    }
    
    // Se já associado, confirma e envia o pedido
    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para o Garçom? O garçom deve aprovar o pedido antes de enviá-lo à cozinha.`)) return;

    const btn = document.getElementById('sendClientOrderBtn');
    if (btn) btn.disabled = true;

    try {
        const tableRef = getTableDocRef(currentTableId);
        
        const requestedOrder = {
            orderId: `req_${Date.now()}`,
            items: selectedItems.map(item => ({...item, requestedAt: Date.now()})),
            requestedAt: Date.now(),
            status: 'pending_waiter', // Novo status para o Garçom
            clientInfo: {
                 docId: associatedClientDocId, // O ID/Telefone do cliente que associou
                 name: currentOrderSnapshot?.clientName || 'Cliente Comanda', // Usa o nome da mesa, se houver
                 phone: associatedClientDocId || 'N/A' // O ID é o telefone
            }
        };
        
        // Atualiza o Firebase para notificar o Staff
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(requestedOrder), 
            selectedItems: [], // Limpa o carrinho local do cliente
            clientOrderPending: true, // Flag para o card da mesa do Staff
            waiterNotification: { type: 'client_request', timestamp: serverTimestamp() } 
        });

        // Limpa o estado local
        selectedItems.length = 0; 
        renderClientOrderScreen(); // Re-renderiza a tela do cliente
        
        alert(`Pedido enviado! Aguarde a confirmação do seu Garçom.`);

    } catch (e) {
        console.error("Erro ao enviar pedido do cliente:", e);
        alert("Falha ao enviar pedido para o Garçom/Firebase.");
    } finally {
        if (btn) btn.disabled = false;
    }
};

// NOVO: Lógica de Associação e Envio (Chamada pelo Modal)
export const handleClientAssociationAndSend = async () => {
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
        // 1. Verificar se a mesa existe e está aberta
        const tableRef = getTableDocRef(tableNumber);
        const docSnap = await getDoc(tableRef);

        if (!docSnap.exists() || docSnap.data().status?.toLowerCase() !== 'open') {
            assocErrorMsg.textContent = `Mesa ${tableNumber} não encontrada ou não está aberta.`;
            assocErrorMsg.style.display = 'block';
            if (assocSendOrderBtn) { assocSendOrderBtn.disabled = false; assocSendOrderBtn.textContent = 'Enviar Pedido'; }
            return;
        }

        // 2. Cadastrar/Associar Cliente via Telefone (Usando telefone como ID do Cliente)
        const customersRef = getCustomersCollectionRef();
        const clientDocId = phone;
        const clientDocRef = doc(customersRef, clientDocId);
        
        const clientData = {
            name: name,
            phone: phone,
            associatedTable: tableNumber, // Opcional: rastrear a mesa atual do cliente
            lastVisit: serverTimestamp(),
            // Adicione outros campos como e-mail ou CPF se existirem no modal
        };
        
        // Se o cliente já existe, apenas atualiza lastVisit e associatedTable
        await setDoc(clientDocRef, clientData, { merge: true }); 

        // 3. Estabelecer o Listener na Mesa e atualizar estado global
        associatedClientDocId = clientDocId; // Armazena o ID do cliente
        setCurrentTable(tableNumber, true); // True para modo cliente (isso inicia o listener)

        // Salva o carrinho que o cliente montou *antes* de associar
        if (selectedItems.length > 0) {
            await saveSelectedItemsToFirebase(tableNumber, selectedItems);
        }

        // 4. Fechar o modal
        if (clientAssocModal) clientAssocModal.style.display = 'none';
        
        // 5. Chama a função de envio, que agora saberá que está associado
        // A confirmação final ('Confirmar envio...') será exibida aqui
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
    const btn = e.target.closest('.quick-obs-btn');
    if (btn && clientObsInput) {
        const obsText = btn.dataset.obs;
        let currentValue = clientObsInput.value.trim();
        
        // Lógica para adicionar vírgula e espaço
        if (currentValue && !currentValue.endsWith(',') && currentValue.length > 0) {
            currentValue += ', ';
        } else if (currentValue.endsWith(',')) {
            currentValue += ' ';
        }
        
        clientObsInput.value = (currentValue + obsText).trim();
    }
};

const handleSaveClientObs = () => {
    const itemId = clientObsModal.dataset.itemId;
    const originalNoteKey = clientObsModal.dataset.originalNoteKey;
    let newNote = clientObsInput.value.trim();
    
    // Remove qualquer tag [EM ESPERA] que possa ter sido adicionada por erro
    newNote = newNote.replace(/ \[EM ESPERA\]/gi, '').trim();
    
    let updated = false;
    let firstUpdateIndex = -1; // Rastreia o primeiro item atualizado para evitar recursão
    
    // Cria um novo array temporário com as atualizações
    const updatedItems = selectedItems.map((item, index) => {
        if (item.id == itemId && (item.note || '') === originalNoteKey) {
            if (!updated) { // Atualiza apenas a primeira ocorrência para abrir o modal de novo item
                 firstUpdateIndex = index;
            }
            updated = true;
            return { ...item, note: newNote };
        }
        return item;
    });
    
    // Muta o array original 'selectedItems'
    selectedItems.length = 0; 
    selectedItems.push(...updatedItems);

    if (updated) {
        clientObsModal.style.display = 'none';
        renderClientOrderScreen();
        if (currentTableId) { // Só salva se já associado
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    } else {
        clientObsModal.style.display = 'none';
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER DO CLIENTE ---
export const initClientOrderController = () => {
    if(clientInitialized) return;
    
    // Mapeia os elementos do modal de Observação
    clientObsModal = document.getElementById('obsModal');
    clientObsItemName = document.getElementById('obsItemName');
    clientObsInput = document.getElementById('obsInput');
    clientSaveObsBtn = document.getElementById('saveObsBtn');
    clientCancelObsBtn = document.getElementById('cancelObsBtn');
    clientEsperaSwitch = document.getElementById('esperaSwitch'); 

    // Mapeia os elementos do modal de Associação/Cadastro (NOVO)
    clientAssocModal = document.getElementById('associationModal'); 
    assocTableInput = document.getElementById('assocTableNumber');
    assocPhoneInput = document.getElementById('assocPhone');
    assocNameInput = document.getElementById('assocName');
    assocSendOrderBtn = document.getElementById('assocSendOrderBtn');
    assocErrorMsg = document.getElementById('assocErrorMsg');
    assocCancelBtn = document.getElementById('assocCancelBtn'); // Botão Cancelar do Modal

    // Mapeia os elementos de Menu
    clientSearchProductInput = document.getElementById('searchProductInputClient');
    clientCategoryFiltersContainer = document.getElementById('categoryFiltersClient');
    clientMenuItemsGrid = document.getElementById('menuItemsGridClient');
    
    // Listeners Essenciais
    const sendClientBtn = document.getElementById('sendClientOrderBtn');
    if (sendClientBtn) sendClientBtn.addEventListener('click', handleClientSendOrder);
    
    // NOVO: Listener do Botão de Envio/Associação do Modal
    if (assocSendOrderBtn) assocSendOrderBtn.addEventListener('click', handleClientAssociationAndSend);
    // NOVO: Listener para fechar o modal de associação
    if (assocCancelBtn) assocCancelBtn.addEventListener('click', () => { if(clientAssocModal) clientAssocModal.style.display = 'none'; });
    
    if (clientSaveObsBtn) clientSaveObsBtn.addEventListener('click', handleSaveClientObs);
    if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => { 
        // Lógica de Cancelamento do Modal OBS: Se for um item novo, remove-o
        const itemId = clientObsModal.dataset.itemId;
        const originalNoteKey = clientObsModal.dataset.originalNoteKey;
        const currentNote = clientObsInput.value.trim();

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
                 selectedItems.splice(lastIndex, 1); // Remove o item
                 console.log("Item recém-adicionado cancelado.");
                 renderClientOrderScreen(); // Re-renderiza
                 if (currentTableId) saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva
             }
        }
        clientObsModal.style.display = 'none'; 
    });

    // Listener para busca de produto
    if (clientSearchProductInput) {
        clientSearchProductInput.addEventListener('input', (e) => {
            currentClientSearch = e.target.value;
            renderClientMenu(); 
        });
    }

    // Listener para filtros de categoria (delegação de evento)
    if (clientCategoryFiltersContainer) {
        clientCategoryFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                currentClientCategoryFilter = btn.dataset.category;
                renderClientMenu(); 
            }
        });
    }
    
    // Anexa o listener de Quick-Buttons para o modal
    const quickObsButtons = document.getElementById('quickObsButtons');
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', handleQuickButtonClient);
    }

    clientInitialized = true;
    console.log("[ClientOrderController] Inicializado.");
};
