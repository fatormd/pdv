// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (COM CORREÇÃO DE IMPORT E REFERENCEERROR) ---

import { db, auth, getQuickObsCollectionRef, appId, getTablesCollectionRef } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
import { getProducts, getCategories, fetchWooCommerceProducts, fetchWooCommerceCategories } from "/services/wooCommerceService.js";
// ===== CORREÇÃO: Adicionado 'orderBy' à importação =====
import { onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc, getDocs, query, where, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, signInAnonymously, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importa 'showToast' do app.js (como definido no seu app.js)
import { showToast } from "/app.js"; 


// --- Variáveis de Estado (Locais) ---
// O estado global (currentTableId) é importado do app.js
import { currentTableId } from "/app.js";

let selectedItems = []; // Itens do carrinho local
let quickObsCache = []; 
let currentCategoryFilter = 'all';
const ESPERA_KEY = "(EM ESPERA)"; 

// --- Elementos da DOM ---
let clientMenuContainer, clientCategoryFilters, sendOrderBtn, clientCartCount;
let associationModal, activateAndSendBtn, googleLoginBtn;
let tableDataStep, activateTableNumber, activateDiners;
let authActionBtn, clientUserName, clientTableNumber, loggedInStep, loggedInUserName, assocErrorMsg;
let statusScreen, mainContent, appContainer;
let searchProductInputClient; 
let registrationStep, registerWhatsApp, registerDOB, confirmRegisterBtn, registerErrorMsg;
let clientObsModal, clientObsText, clientQuickObsButtons, clientConfirmObsBtn, clientCancelObsBtn;

// ===== CORREÇÃO: Readicionando a variável que foi apagada acidentalmente =====
let localCurrentTableId = null;
// ===== FIM DA CORREÇÃO =====
let localCurrentClientUser = null; // O 'user' logado é local para este controller

// --- Inicialização ---

export const initClientOrderController = () => {
    console.log("[ClientOrder] Inicializando...");

    // Mapeamento dos elementos principais
    clientMenuContainer = document.getElementById('client-menu-container');
    clientCategoryFilters = document.getElementById('client-category-filters');
    sendOrderBtn = document.getElementById('sendOrderBtn');
    clientCartCount = document.getElementById('client-cart-count');
    authActionBtn = document.getElementById('authActionBtn');
    clientUserName = document.getElementById('client-user-name');
    clientTableNumber = document.getElementById('client-table-number');
    statusScreen = document.getElementById('statusScreen');
    mainContent = document.getElementById('mainContent');
    appContainer = document.getElementById('appContainer');
    searchProductInputClient = document.getElementById('searchProductInputClient');

    // Mapeamento do Modal de Associação
    associationModal = document.getElementById('associationModal');
    activateAndSendBtn = document.getElementById('activateAndSendBtn');
    googleLoginBtn = document.getElementById('googleLoginBtn');
    tableDataStep = document.getElementById('tableDataStep');
    activateTableNumber = document.getElementById('activateTableNumber');
    loggedInStep = document.getElementById('loggedInStep');
    loggedInUserName = document.getElementById('loggedInUserName');
    assocErrorMsg = document.getElementById('assocErrorMsg');
    
    // Mapeamento do Registro
    registrationStep = document.getElementById('registrationStep');
    registerWhatsApp = document.getElementById('registerWhatsApp');
    registerDOB = document.getElementById('registerDOB');
    confirmRegisterBtn = document.getElementById('confirmRegisterBtn');
    registerErrorMsg = document.getElementById('registerErrorMsg');
    
    // Mapeamento do Modal Obs
    clientObsModal = document.getElementById('clientObsModal'); 
    clientObsText = document.getElementById('clientObsText'); 
    clientQuickObsButtons = document.getElementById('clientQuickObsButtons'); 
    clientConfirmObsBtn = document.getElementById('clientConfirmObsBtn');
    clientCancelObsBtn = document.getElementById('clientCancelObsBtn'); 

    if (!clientObsModal || !clientObsText || !clientQuickObsButtons || !clientConfirmObsBtn || !clientCancelObsBtn) {
        console.error("[ClientOrder] Erro Fatal: Elementos do modal de observação não encontrados.");
        return; 
    }

    // Listener Modal Obs: Botões Rápidos
    if (clientQuickObsButtons) {
        clientQuickObsButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-obs-btn');
            if (btn && clientObsText) {
                const obsText = btn.dataset.obs;
                let currentValue = clientObsText.value.trim();
                if (currentValue && !currentValue.endsWith(',') && !currentValue.endsWith(' ')) {
                    currentValue += ', ';
                } else if (currentValue && (currentValue.endsWith(',') || currentValue.endsWith(' '))) {
                    currentValue += ' ';
                }
                clientObsText.value = (currentValue + obsText).trim();
            }
        });
    }

    // Listener Modal Obs: Confirmar
    if (clientConfirmObsBtn) {
        clientConfirmObsBtn.addEventListener('click', () => {
            const itemId = clientObsModal.dataset.itemId;
            const originalNoteKey = clientObsModal.dataset.originalNoteKey;
            let newNote = clientObsText.value.trim();
            
            const esperaSwitch = document.getElementById('esperaSwitch');
            const isEspera = esperaSwitch.checked;
            const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
            const hasKey = newNote.toUpperCase().includes(ESPERA_KEY);

            if (isEspera && !hasKey) {
                newNote = newNote ? `${ESPERA_KEY} ${newNote}` : ESPERA_KEY;
            } else if (!isEspera && hasKey) {
                newNote = newNote.replace(regexEspera, '').trim();
                newNote = newNote.replace(/,,/g, ',').replace(/^,/, '').trim();
            }
            
            newNote = newNote.trim(); 

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
                clientObsModal.style.display = 'none';
                renderClientOrderScreen();
            } else {
                console.warn("Nenhum item encontrado para atualizar a observação.");
                clientObsModal.style.display = 'none';
            }
        });
    }

    // Listener Modal Obs: Cancelar
    if (clientCancelObsBtn) {
        clientCancelObsBtn.addEventListener('click', () => {
            clientObsModal.style.display = 'none';
            renderClientOrderScreen(); 
        });
    }

    // Listeners principais (Login, Envio)
    if (sendOrderBtn) sendOrderBtn.onclick = handleSendOrderClick;
    if (authActionBtn) authActionBtn.onclick = handleAuthActionClick;
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (activateAndSendBtn) activateAndSendBtn.onclick = handleActivationAndSend;
    if (confirmRegisterBtn) {
        confirmRegisterBtn.onclick = handleCustomerRegistration;
    }

    // Delegação de eventos para o menu
    if (clientMenuContainer) {
        clientMenuContainer.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.add-item-btn');
            const infoBtn = e.target.closest('.info-item-btn');

            if (addBtn && addBtn.dataset.product) {
                const product = JSON.parse(addBtn.dataset.product.replace(/'/g, "&#39;"));
                addItemToCart(product);
            }
            
            if (infoBtn && infoBtn.dataset.product) {
                 const product = JSON.parse(infoBtn.dataset.product.replace(/'/g, "&#39;"));
                 openProductInfoModal(product);
            }
        });
    }
    
    // Delegação de eventos para o carrinho
    document.getElementById('client-cart-items-list')?.addEventListener('click', (e) => {
         const qtyBtn = e.target.closest('.qty-btn');
         const obsSpan = e.target.closest('.obs-span');
         
         if (qtyBtn) {
             const itemId = qtyBtn.dataset.itemId;
             const noteKey = qtyBtn.dataset.itemNoteKey;
             const action = qtyBtn.dataset.action;
             if(action === 'increase') increaseCartItemQuantity(itemId, noteKey);
             if(action === 'decrease') decreaseCartItemQuantity(itemId, noteKey);
         }
         if (obsSpan) {
             const itemId = obsSpan.dataset.itemId;
             const noteKey = obsSpan.dataset.itemNoteKey;
             openClientObsModal(itemId, noteKey);
         }
    });

    // Filtros de Categoria
    if (clientCategoryFilters) {
        clientCategoryFilters.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                currentCategoryFilter = btn.dataset.category;
                renderMenu();
            }
        });
    }
    
    // Listener da Barra de Busca
    if (searchProductInputClient) {
        searchProductInputClient.addEventListener('input', renderMenu);
    }

    // Gerencia o estado de autenticação (agora no app.js, mas a UI ainda é local)
    setupAuthStateObserver();
    
    // Busca os produtos
    loadMenu(); 

    // Busca as observações rápidas
    fetchQuickObservations(); 
    
    console.log("[ClientOrder] Inicializado com sucesso.");
};

/**
 * Observa o estado de autenticação do usuário.
 */
function setupAuthStateObserver() {
    onAuthStateChanged(auth, (user) => {
        localCurrentClientUser = user; // Atualiza o user local
        updateAuthUI(user); // Atualiza a UI local (header, etc.)
        
        // Se o usuário logou (não anônimo), verifica o cadastro
        if (user && !user.isAnonymous) {
            checkAndRegisterCustomer(user);
        }
    });
}

/**
 * Atualiza a UI com base no estado de login.
 */
function updateAuthUI(user) {
    if (!clientUserName || !authActionBtn || !loggedInStep || !loggedInUserName) {
        console.warn("[ClientOrder] Elementos de UI de autenticação não encontrados. UI não será atualizada.");
        return;
    }
    
    const authButtons = document.getElementById('authButtons');

    if (user && !user.isAnonymous) {
        clientUserName.textContent = user.displayName || user.name || "Cliente";
        authActionBtn.textContent = "Sair";
        authActionBtn.classList.add('text-red-400');
        loggedInStep.style.display = 'block';
        loggedInUserName.textContent = user.displayName || user.name || "Cliente";
        if (authButtons) authButtons.style.display = 'none';
    } else {
        clientUserName.textContent = "Visitante";
        authActionBtn.textContent = "Entrar";
        authActionBtn.classList.remove('text-red-400');
        loggedInStep.style.display = 'none';
        if (authButtons) authButtons.style.display = 'block';
        if (tableDataStep) tableDataStep.style.display = 'none';
        if (registrationStep) registrationStep.style.display = 'none';
    }
}

/**
 * Ação do botão "Entrar" / "Sair".
 */
function handleAuthActionClick() {
    if (localCurrentClientUser && !localCurrentClientUser.isAnonymous) {
        signOut(auth).then(() => {
            console.log("Usuário deslogado.");
            showToast("Você saiu da sua conta.");
        });
    } else {
        openAssociationModal('authOnly');
    }
}

/**
 * Carrega o menu (categorias e produtos).
 */
async function loadMenu() {
    try {
        console.log("[ClientOrder] Buscando categorias...");
        const categories = await fetchWooCommerceCategories();
        console.log("[ClientOrder] Buscando produtos...");
        const products = await fetchWooCommerceProducts();
        
        if (categories.length > 0 && clientCategoryFilters) {
             clientCategoryFilters.innerHTML = categories.map(cat => {
                const isActive = cat.slug === currentCategoryFilter ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600';
                return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
             }).join('');
        }
        
        renderMenu(); 
        
        if (statusScreen) statusScreen.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        
    } catch (error) {
        console.error("Erro ao carregar menu:", error);
        if (statusScreen) statusScreen.innerHTML = '<p class="text-red-400">Erro ao carregar o cardápio. Verifique sua conexão.</p>';
    }
}


/**
 * Renderiza os produtos no menu.
 */
function renderMenu() {
    if (!clientMenuContainer) return;
    
    if (clientCategoryFilters) {
        clientCategoryFilters.querySelectorAll('.category-btn').forEach(btn => {
            const isActive = btn.dataset.category === currentCategoryFilter;
            btn.classList.toggle('bg-brand-primary', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('bg-dark-input', !isActive);
            btn.classList.toggle('text-dark-text', !isActive);
        });
    }

    const products = getProducts();
    let filteredProducts = products;
    
    if (currentCategoryFilter !== 'all') {
        filteredProducts = products.filter(p => p.category === currentCategoryFilter);
    }
    
    let searchTerm = '';
    if (searchProductInputClient) { 
         searchTerm = searchProductInputClient.value.trim().toLowerCase();
    }

    if (searchTerm) {
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredProducts.length === 0) {
        if (searchTerm && currentCategoryFilter === 'all') {
            clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado para "${searchTerm}".</div>`;
        } else if (searchTerm && currentCategoryFilter !== 'all') {
            clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto para "${searchTerm}" nesta categoria.</div>`;
        } else {
             clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-red-400 italic">Nenhum produto nesta categoria.</div>`;
        }
    } else {
        clientMenuContainer.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-dark-card border border-gray-700 rounded-xl shadow-md flex flex-col overflow-hidden">
                <img src="${product.image}" alt="${product.name}" class="w-full h-32 object-cover">
                
                <div class="p-4 flex flex-col flex-grow">
                    <h4 class="font-semibold text-base text-white mb-2 min-h-[2.5rem]">${product.name}</h4>
                    
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-bold text-lg text-brand-primary">${formatCurrency(product.price)}</span>
                        
                        <button class="add-item-btn bg-brand-primary text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-brand-primary-dark transition"
                                data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'>
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>

                    <div class="flex-grow"></div>
                    
                    <button class="info-item-btn w-full bg-dark-input text-dark-text font-semibold py-2 rounded-lg hover:bg-gray-600 transition text-sm"
                            data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'>
                        Descrição
                    </button>
                </div>
            </div>
        `).join('');
    }
}

/**
 * Adiciona um item ao carrinho local (selectedItems) e abre o modal de observação.
 */
function addItemToCart(product) {
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
    renderClientOrderScreen(); 
    openClientObsModal(product.id, '');
}

/**
 * Aumenta a quantidade de um item no carrinho.
 */
function increaseCartItemQuantity(itemId, noteKey) {
    const itemToCopy = selectedItems.findLast(item =>
        item.id == itemId && (item.note || '') === noteKey
    );

    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy }); 
        renderClientOrderScreen(); 
    }
}

/**
 * Diminui a quantidade de um item no carrinho.
 */
function decreaseCartItemQuantity(itemId, noteKey) {
    let indexToRemove = -1;
    for (let i = selectedItems.length - 1; i >= 0; i--) {
        if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
            indexToRemove = i;
            break;
        }
    }

    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1); 
        renderClientOrderScreen(); 
    }
}

/**
 * Abre o modal de informações do produto.
 */
function openProductInfoModal(product) {
    if (!product) return;

    const modal = document.getElementById('productInfoModal');
    const img = document.getElementById('infoProductImage');
    const imgLink = document.getElementById('infoProductImageLink');
    const nameEl = document.getElementById('infoProductName');
    const priceEl = document.getElementById('infoProductPrice');
    const descEl = document.getElementById('infoProductDescription');
    const addBtn = document.getElementById('infoProductAddBtn');

    if (!modal || !img || !nameEl || !priceEl || !descEl || !addBtn || !imgLink) {
        console.error("Elementos do modal de informação do produto não encontrados!");
        return;
    }

    img.src = product.image || 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto';
    img.alt = product.name;
    imgLink.href = product.image || '#';
    nameEl.textContent = product.name;
    priceEl.textContent = formatCurrency(product.price);
    descEl.innerHTML = product.description; 

    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    newAddBtn.onclick = () => {
        addItemToCart(product);
        modal.style.display = 'none'; 
        showToast(`${product.name} adicionado ao carrinho!`);
    };

    modal.style.display = 'flex';
}


/**
 * Abre o modal de observação para o cliente.
 */
function openClientObsModal(itemId, noteKey) {
    const products = getProducts();
    const product = products.find(p => p.id == itemId);
    const esperaSwitch = document.getElementById('esperaSwitch'); 

    if (!clientObsModal || !clientObsText || !product || !esperaSwitch) {
        console.error("Erro: Elementos do modal OBS, switch ou produto não encontrados.");
        return;
    }

    const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
    const isEspera = regexEspera.test(noteKey);
    
    let cleanNote = noteKey.replace(regexEspera, '').trim();
    if (cleanNote.startsWith(',')) cleanNote = cleanNote.substring(1).trim();

    clientObsModal.querySelector('h3').textContent = product.name;
    clientObsText.value = cleanNote; 
    esperaSwitch.checked = isEspera; 

    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey; 

    clientObsModal.style.display = 'flex';
}

/**
 * Renderiza o carrinho do cliente (chamado pela renderClientOrderScreen).
 */
function _renderClientCart() {
    const cartItemsList = document.getElementById('client-cart-items-list');
    if (!cartItemsList) return;

    if (selectedItems.length === 0) {
        cartItemsList.innerHTML = `<p class="text-dark-placeholder italic p-4 text-center">Seu carrinho está vazio.</p>`;
    } else {
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) acc[key] = { ...item, count: 0 };
            acc[key].count++;
            return acc;
        }, {});

        cartItemsList.innerHTML = Object.values(groupedItems).map(group => {
            const note = group.note || '';
            const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
            const isEspera = regexEspera.test(note);
            let displayNote = note.replace(regexEspera, '').trim();
            if (displayNote.startsWith(',')) displayNote = displayNote.substring(1).trim();

            let noteHtml = '';
            if (isEspera) {
                noteHtml = `<span class="text-yellow-400 font-semibold">${ESPERA_KEY}</span>`;
                if (displayNote) {
                    noteHtml += ` <span class="text-yellow-400">(${displayNote})</span>`;
                }
            } else if (displayNote) {
                noteHtml = `<span class="text-yellow-400">(${displayNote})</span>`;
            } else {
                noteHtml = `(Adicionar Obs.)`;
            }

            return `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-white">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-brand-primary hover:text-brand-primary-dark obs-span" 
                          data-item-id="${group.id}" data-item-note-key="${note}">
                        ${noteHtml}
                    </span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="decrease">
                        <i class="fas fa-minus pointer-events-none"></i>
                    </button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="increase">
                        <i class="fas fa-plus pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `}).join('');
    }
}

/**
 * Renderiza a tela principal do cliente (carrinho e contagem).
 */
export function renderClientOrderScreen() {
    if (clientCartCount) {
        clientCartCount.textContent = selectedItems.length;
    }
    if (sendOrderBtn) {
        sendOrderBtn.disabled = selectedItems.length === 0;
    }
    
    _renderClientCart();
}

/**
 * Lida com o clique em "Enviar Pedido".
 */
function handleSendOrderClick() {
    if (selectedItems.length === 0) return;
    
    // Usa a variável 'localCurrentTableId' definida neste arquivo
    if (localCurrentTableId) { 
        sendOrderToFirebase();
    } else {
        openAssociationModal('sendOrder');
    }
}

/**
 * Abre o modal de associação de mesa/login.
 */
function openAssociationModal(mode = 'sendOrder') {
    if (!associationModal) return;

    // Reseta todos os steps e erros
    assocErrorMsg.style.display = 'none';
    if (registerErrorMsg) registerErrorMsg.style.display = 'none';
    if (tableDataStep) tableDataStep.style.display = 'none';
    if (registrationStep) registrationStep.style.display = 'none';
    
    const user = localCurrentClientUser;
    const authButtons = document.getElementById('authButtons');
    
    if (user && !user.isAnonymous) {
        if (authButtons) authButtons.style.display = 'none';
        // A lógica de qual step mostrar é tratada pelo checkAndRegisterCustomer
    } else {
        if (authButtons) authButtons.style.display = 'block';
    }

    // Configura o modal para o modo
    if (mode === 'sendOrder') {
        activateAndSendBtn.textContent = "Confirmar e Enviar";
        activateAndSendBtn.dataset.mode = 'sendOrder';
    } else { // mode === 'authOnly'
        activateAndSendBtn.textContent = "Confirmar Login";
        activateAndSendBtn.dataset.mode = 'authOnly';
    }
    
    associationModal.style.display = 'flex';
}


// ==================================================================
//               LÓGICA DE ATIVAÇÃO DE MESA (REESCRITA)
// ==================================================================

/**
 * Lida com a confirmação final do modal (Ativar e Enviar).
 */
async function handleActivationAndSend() {
    const mode = activateAndSendBtn.dataset.mode;
    const user = localCurrentClientUser;
    
    if (!user) {
        showAssocError("Você não está autenticado. Por favor, faça login.");
        return;
    }
    
    if (mode === 'authOnly') {
         associationModal.style.display = 'none';
         showToast(`Login como ${user.displayName} confirmado!`);
         return;
    }

    // --- Modo 'sendOrder' ---
    const tableNumber = activateTableNumber.value;
    const clientId = user.uid;
    
    if (!tableNumber) {
        showAssocError("Por favor, insira o número da mesa.");
        return;
    }

    activateAndSendBtn.disabled = true;
    activateAndSendBtn.textContent = "Verificando...";
    
    try {
        const tableRef = doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber);
        const tableDoc = await getDoc(tableRef);

        if (tableDoc.exists()) {
            // ----- CENÁRIO A: A MESA JÁ EXISTE -----
            const tableData = tableDoc.data();
            
            if (tableData.status === 'open') {
                if (tableData.clientId === clientId) {
                    console.log(`Cliente ${clientId} reconectando à Mesa ${tableNumber}.`);
                    localCurrentTableId = tableNumber; 
                    window.setCurrentTable(tableNumber, true); // Seta no app.js
                } else {
                    throw new Error("Mesa já está em uso por outro cliente.");
                }
            } else {
                throw new Error("Mesa está fechada. Peça a um garçom para reabri-la.");
            }
            
        } else {
            // ----- CENÁRIO B: A MESA NÃO EXISTE (AUTO-ABERTURA) -----
            console.log(`Tentativa de auto-abertura da Mesa ${tableNumber} por ${clientId}.`);
            
            const tablesCollection = getTablesCollectionRef();
            const q = query(tablesCollection, 
                            where('status', '==', 'open'), 
                            where('clientId', '==', clientId));
            
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const existingTable = querySnapshot.docs[0].id;
                throw new Error(`Você já está ativo na Mesa ${existingTable}. Não é possível abrir duas mesas.`);
            }
            
            console.log(`Abrindo nova Mesa ${tableNumber} para ${clientId}...`);
            const customerData = await getCustomerData(clientId);
            
            const newTableData = {
                tableNumber: parseInt(tableNumber, 10),
                diners: 1, 
                sector: 'Auto-Abertura', 
                status: 'open',
                createdAt: serverTimestamp(),
                total: 0,
                sentItems: [],
                payments: [],
                serviceTaxApplied: true,
                selectedItems: [], 
                clientId: clientId,
                clientName: customerData.name || user.displayName,
                clientWhatsapp: customerData.whatsapp || null
            };
            
            await setDoc(tableRef, newTableData);
            localCurrentTableId = tableNumber;
            window.setCurrentTable(tableNumber, true); // Seta no app.js
        }
        
        // ----- SUCESSO -----
        clientTableNumber.textContent = `Mesa ${localCurrentTableId}`;
        await sendOrderToFirebase();
        associationModal.style.display = 'none';
        
    } catch (e) {
        console.error("Erro ao ativar/abrir mesa:", e);
        showAssocError(e.message); 
    } finally {
        activateAndSendBtn.disabled = false;
        activateAndSendBtn.textContent = "Confirmar e Enviar";
    }
}


/**
 * Busca os dados de um cliente (como WhatsApp) do /customers
 */
async function getCustomerData(uid) {
    if (!uid) return { name: null, whatsapp: null };
    
    try {
        const customerRef = doc(db, 'artifacts', appId, 'public', 'data', 'customers', uid);
        const docSnap = await getDoc(customerRef);
        
        if (docSnap.exists()) {
            return {
                name: docSnap.data().name || null,
                whatsapp: docSnap.data().whatsapp || null
            };
        }
        return { name: null, whatsapp: null };
    } catch (e) {
        console.error("Erro ao buscar dados do cliente:", e);
        return { name: null, whatsapp: null };
    }
}


/**
 * Envia o pedido (carrinho) para o Firebase.
 */
async function sendOrderToFirebase() {
    const tableId = localCurrentTableId;
    const user = localCurrentClientUser;

    if (!tableId || selectedItems.length === 0) {
        alert("Nenhum item ou mesa selecionada.");
        return;
    }

    const orderId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Pega o 'phone' do usuário local, que foi atualizado pelo checkAndRegisterCustomer
    const clientPhone = user.phone || null;

    const newOrderRequest = {
        orderId: orderId,
        requestedAt: new Date().toISOString(),
        clientInfo: {
            uid: user?.uid,
            name: user?.displayName,
            phone: clientPhone 
        },
        items: selectedItems.map(item => ({ ...item })) 
    };

    try {
        const tableRef = doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableId);
        
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(newOrderRequest),
            clientOrderPending: true,
            waiterNotification: "Novo Pedido do Cliente"
        });

        selectedItems.length = 0;
        renderClientOrderScreen(); 
        
        showToast("Pedido enviado! Um garçom irá confirmar em breve.");
        
    } catch (e) {
        console.error("Erro ao enviar pedido para o Firebase:", e);
        showToast("Falha ao enviar o pedido. Tente novamente.", true);
    }
}

/**
 * Exibe um erro no modal de associação.
 */
function showAssocError(message) {
    if (assocErrorMsg) {
        assocErrorMsg.textContent = message;
        assocErrorMsg.style.display = 'block';
    }
}

// ==================================================================
//               OBSERVAÇÕES RÁPIDAS (ATUALIZADO)
// ==================================================================

/**
 * Renderiza botões de observação rápida no modal DO CLIENTE.
 */
function renderClientQuickObsButtons(observations) {
    if (!clientQuickObsButtons) return;

    if (observations.length === 0) {
        clientQuickObsButtons.innerHTML = '<p class="text-xs text-dark-placeholder italic">Nenhuma obs. rápida.</p>';
        return;
    }

    clientQuickObsButtons.innerHTML = observations.map(obs => {
        const obsText = obs.text || 'Erro';
        return `
            <button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input text-dark-text rounded-full hover:bg-gray-600 transition" 
                    data-obs="${obsText}">
                ${obsText}
            </button>
        `;
    }).join('');
}

/**
 * Busca as observações rápidas do Firebase e chama o render.
 */
export const fetchQuickObservations = async () => {
    try {
        if (quickObsCache.length > 0) {
            renderClientQuickObsButtons(quickObsCache); 
            return quickObsCache;
        }
        
        // Esta linha agora funciona por causa da importação corrigida
        const q = query(getQuickObsCollectionRef(), orderBy('text', 'asc'));
        const querySnapshot = await getDocs(q);
        quickObsCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        renderClientQuickObsButtons(quickObsCache);
        
        return quickObsCache;
        
    } catch (e) {
        console.error("Erro ao buscar observações rápidas:", e);
        const buttonsContainer = document.getElementById('clientQuickObsButtons'); 
        if (buttonsContainer) buttonsContainer.innerHTML = '<p class="text-xs text-red-400">Erro ao carregar obs.</p>';
        return [];
    }
};


// ==================================================================
//               LÓGICA DE AUTENTICAÇÃO (Google, Celular)
// ==================================================================

/**
 * Inicia o login com Google.
 */
function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => {
            const user = result.user;
            showToast(`Bem-vindo, ${user.displayName}!`);
        })
        .catch((error) => {
            console.error("Erro no login com Google:", error);
            showAssocError("Falha no login com Google. Tente novamente.");
        });
}

// ==================================================================
//               LÓGICA DE REGISTRO DE CLIENTE (CRM)
// ==================================================================

/**
 * Salva os dados de registro (WhatsApp e Data de Nasc.) no Firestore.
 */
async function handleCustomerRegistration() {
    const user = localCurrentClientUser;
    if (!user) {
        showToast("Erro: Usuário não autenticado.", true);
        return;
    }

    const whatsapp = registerWhatsApp.value.replace(/\D/g, ''); 
    const dob = registerDOB.value; 

    if (whatsapp.length < 10) {
        registerErrorMsg.textContent = "Por favor, insira um WhatsApp válido com DDD.";
        registerErrorMsg.style.display = 'block';
        return;
    }
    if (!dob) {
        registerErrorMsg.textContent = "Por favor, insira sua data de nascimento.";
        registerErrorMsg.style.display = 'block';
        return;
    }

    registerErrorMsg.style.display = 'none';
    confirmRegisterBtn.disabled = true;
    confirmRegisterBtn.textContent = "Salvando...";

    try {
        const customerId = user.uid;
        const customerRef = doc(db, 'artifacts', appId, 'public', 'data', 'customers', customerId);
        
        const customerData = {
            uid: user.uid,
            name: user.displayName || `Cliente ${user.uid.substring(0, 5)}`, 
            email: user.email || null, 
            phone: null, 
            whatsapp: whatsapp,
            dob: dob,
            doc: customerId, 
            createdAt: serverTimestamp(),
            points: 0 // Inicia com 0 pontos
        };

        await setDoc(customerRef, customerData, { merge: true });
        
        showToast("Cadastro concluído! Obrigado.");
        
        await checkAndRegisterCustomer(auth.currentUser); 

    } catch (e) {
        console.error("Erro ao salvar cadastro:", e);
        registerErrorMsg.textContent = "Erro ao salvar. Tente novamente.";
        registerErrorMsg.style.display = 'block';
    } finally {
        confirmRegisterBtn.disabled = false;
        confirmRegisterBtn.textContent = "Confirmar Cadastro";
    }
}


/**
 * Verifica se o usuário logado já tem um cadastro completo (com WhatsApp).
 */
async function checkAndRegisterCustomer(user) {
    if (!user || user.isAnonymous) return;
    
    const customerId = user.uid;
    const customerRef = doc(db, 'artifacts', appId, 'public', 'data', 'customers', customerId);

    try {
        const docSnap = await getDoc(customerRef);
        
        if (docSnap.exists() && docSnap.data().whatsapp) {
            // ----- CLIENTE JÁ CADASTRADO -----
            console.log("Cliente já cadastrado:", customerId);
            
            // Atualiza o 'phone' do usuário local para o WhatsApp
            localCurrentClientUser.phone = docSnap.data().whatsapp; 

            if(registrationStep) registrationStep.style.display = 'none';
            if(tableDataStep) tableDataStep.style.display = 'block';
            
        } else {
            // ----- NOVO CLIENTE ou CADASTRO INCOMPLETO -----
            console.log("Novo cliente. Exibindo formulário de registro.");
            
            if(tableDataStep) tableDataStep.style.display = 'none';
            if(registrationStep) registrationStep.style.display = 'block';
            
            if (!docSnap.exists()) {
                 await setDoc(customerRef, {
                    uid: user.uid,
                    name: user.displayName || `Cliente ${user.uid.substring(0, 5)}`,
                    email: user.email || null, 
                    createdAt: serverTimestamp(),
                    points: 0 // Inicia com 0 pontos
                 }, { merge: true });
            }
        }
    } catch (e) {
        console.error("Erro ao registrar/verificar cliente:", e);
        showAssocError("Erro ao verificar seu cadastro. Tente novamente.");
        if(tableDataStep) tableDataStep.style.display = 'none';
        if(registrationStep) registrationStep.style.display = 'none';
    }
}