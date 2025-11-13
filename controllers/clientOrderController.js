// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (COM BUSCA E CORREÇÕES) ---

import { db, auth, getQuickObsCollectionRef, appId } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
import { getProducts, getCategories, fetchWooCommerceProducts, fetchWooCommerceCategories } from "/services/wooCommerceService.js";
import { onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, signInAnonymously, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { showToast } from "/app.js";

// --- Variáveis de Estado do Cliente ---
let currentTableId = null;
let currentDiners = 1;
let currentClientUser = null; // Informações do usuário logado
let currentOrderSnapshot = null; // Snapshot da mesa
let selectedItems = []; // Itens do carrinho local
let quickObsCache = []; // Cache das observações rápidas
let currentCategoryFilter = 'all';
const ESPERA_KEY = "(EM ESPERA)"; // Chave para o status de espera

// --- Elementos da DOM ---
let clientMenuContainer, clientCategoryFilters, sendOrderBtn, clientCartCount;
let associationModal, activateAndSendBtn, googleLoginBtn, phoneLoginBtn, phoneVerifyStep, phoneInput, sendSmsBtn, recaptchaContainer, smsCodeInput, verifySmsBtn, tableDataStep, activateTableNumber, activateDiners;
let authActionBtn, clientUserName, clientTableNumber, loggedInStep, loggedInUserName, assocErrorMsg;
let statusScreen, mainContent, appContainer;
// ===== NOVO: Variável da Barra de Busca =====
let searchProductInputClient; 

// Elementos do Modal de Observação (Cliente)
let clientObsModal, clientObsText, clientQuickObsButtons, clientConfirmObsBtn, clientCancelObsBtn;

// --- Inicialização ---

/**
 * Inicializa o controlador da tela de pedidos do cliente.
 */
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
    
    // ===== NOVO: Mapeamento da Barra de Busca =====
    searchProductInputClient = document.getElementById('searchProductInputClient');

    // Mapeamento do Modal de Associação
    associationModal = document.getElementById('associationModal');
    activateAndSendBtn = document.getElementById('activateAndSendBtn');
    googleLoginBtn = document.getElementById('googleLoginBtn');
    phoneLoginBtn = document.getElementById('phoneLoginBtn');
    phoneVerifyStep = document.getElementById('phoneVerifyStep');
    phoneInput = document.getElementById('phoneInput');
    sendSmsBtn = document.getElementById('sendSmsBtn');
    recaptchaContainer = document.getElementById('recaptcha-container');
    smsCodeInput = document.getElementById('smsCodeInput');
    verifySmsBtn = document.getElementById('verifySmsBtn');
    tableDataStep = document.getElementById('tableDataStep');
    activateTableNumber = document.getElementById('activateTableNumber');
    activateDiners = document.getElementById('activateDiners');
    loggedInStep = document.getElementById('loggedInStep');
    loggedInUserName = document.getElementById('loggedInUserName');
    assocErrorMsg = document.getElementById('assocErrorMsg');
    
    // =================================================================
    // ==== LÓGICA DO MODAL OBS DO CLIENTE ====
    // =================================================================

    // Mapeia elementos do modal de Observação do client.html
    clientObsModal = document.getElementById('clientObsModal'); 
    clientObsText = document.getElementById('clientObsText'); 
    clientQuickObsButtons = document.getElementById('clientQuickObsButtons'); 
    clientConfirmObsBtn = document.getElementById('clientConfirmObsBtn'); // Corrigido (tinha typo)
    clientCancelObsBtn = document.getElementById('clientCancelObsBtn'); 

    if (!clientObsModal || !clientObsText || !clientQuickObsButtons || !clientConfirmObsBtn || !clientCancelObsBtn) {
        console.error("[ClientOrder] Erro Fatal: Elementos do modal de observação não encontrados.");
        return; 
    }

    // Listener para os botões rápidos (delegação de evento)
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

    // Listener para CONFIRMAR observação (Com lógica de "Espera")
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

    // Listener para CANCELAR observação (Corrigido para não remover o item)
    if (clientCancelObsBtn) {
        clientCancelObsBtn.addEventListener('click', () => {
            clientObsModal.style.display = 'none';
            renderClientOrderScreen(); 
        });
    }
    // ==== FIM DA LÓGICA DO MODAL ====


    // Listeners principais (Login, Envio)
    if (sendOrderBtn) sendOrderBtn.onclick = handleSendOrderClick;
    if (authActionBtn) authActionBtn.onclick = handleAuthActionClick;
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (phoneLoginBtn) phoneLoginBtn.onclick = showPhoneVerifyStep;
    if (sendSmsBtn) sendSmsBtn.onclick = sendSmsCode;
    if (verifySmsBtn) verifySmsBtn.onclick = verifySmsCode;
    if (activateAndSendBtn) activateAndSendBtn.onclick = handleActivationAndSend;

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
    
    // Delegação de eventos para o carrinho (renderizado dinamicamente)
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
    
    // ===== NOVO: Listener da Barra de Busca =====
    if (searchProductInputClient) {
        // Chama a função renderMenu() toda vez que o usuário digita
        searchProductInputClient.addEventListener('input', renderMenu);
    }
    // ===== FIM DO NOVO LISTENER =====


    // Gerencia o estado de autenticação
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
        if (user) {
            if (user.isAnonymous) {
                currentClientUser = {
                    uid: user.uid,
                    name: `Mesa ${currentTableId}`,
                    isAnonymous: true
                };
                updateAuthUI(currentClientUser);
            } else {
                currentClientUser = {
                    uid: user.uid,
                    name: user.displayName || user.phoneNumber || "Cliente",
                    email: user.email,
                    phone: user.phoneNumber,
                    isAnonymous: false
                };
                updateAuthUI(currentClientUser);
                checkAndRegisterCustomer(user);
            }
        } else {
            currentClientUser = null;
            updateAuthUI(null);
            signInAnonymously(auth).catch(error => {
                 console.error("Erro no login anônimo inicial:", error);
                 if (statusScreen) statusScreen.innerHTML = '<p class="text-red-400">Erro ao conectar. Tente recarregar a página.</p>';
            });
        }
    });
}

/**
 * Atualiza a UI com base no estado de login.
 */
function updateAuthUI(user) {
    if (!clientUserName || !authActionBtn || !loggedInStep || !loggedInUserName || !phoneVerifyStep) {
        console.warn("[ClientOrder] Elementos de UI de autenticação não encontrados. UI não será atualizada.");
        return;
    }
    
    if (user && !user.isAnonymous) {
        clientUserName.textContent = user.name;
        authActionBtn.textContent = "Sair";
        authActionBtn.classList.add('text-red-400');
        loggedInStep.style.display = 'block';
        loggedInUserName.textContent = user.name;
        phoneVerifyStep.style.display = 'none';
        const authButtons = document.getElementById('authButtons');
        if (authButtons) authButtons.style.display = 'none';
    } else {
        clientUserName.textContent = "Visitante";
        authActionBtn.textContent = "Entrar";
        authActionBtn.classList.remove('text-red-400');
        loggedInStep.style.display = 'none';
        phoneVerifyStep.style.display = 'none';
        const authButtons = document.getElementById('authButtons');
        if (authButtons) authButtons.style.display = 'block';
    }
}

/**
 * Ação do botão "Entrar" / "Sair".
 */
function handleAuthActionClick() {
    if (currentClientUser && !currentClientUser.isAnonymous) {
        auth.signOut().then(() => {
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
    
    // Atualiza o estado dos botões de categoria
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
    
    // 1. Filtro por Categoria (existente)
    if (currentCategoryFilter !== 'all') {
        filteredProducts = products.filter(p => p.category === currentCategoryFilter);
    }
    
    // ===== 2. NOVO: Filtro por Barra de Busca =====
    let searchTerm = '';
    // (usamos a variável global 'searchProductInputClient' definida na init)
    if (searchProductInputClient) { 
         searchTerm = searchProductInputClient.value.trim().toLowerCase();
    }

    if (searchTerm) {
        // Filtra os produtos que já foram filtrados pela categoria
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(searchTerm) // Verifica se o nome do produto inclui o texto
        );
    }
    // ===== FIM DO FILTRO DE BUSCA =====
    
    
    // 3. Renderização (com mensagens de "nenhum resultado" atualizadas)
    if (filteredProducts.length === 0) {
        if (searchTerm && currentCategoryFilter === 'all') {
            clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado para "${searchTerm}".</div>`;
        } else if (searchTerm && currentCategoryFilter !== 'all') {
            clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto para "${searchTerm}" nesta categoria.</div>`;
        } else {
             clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-red-400 italic">Nenhum produto nesta categoria.</div>`;
        }
    } else {
        // ATUALIZADO: Novo HTML para o card (Layout 2.0)
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
    renderClientOrderScreen(); // Atualiza a contagem no botão
    
    openClientObsModal(product.id, ''); // Abre o modal para o item recém-adicionado
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

    // Mapeia os elementos do modal
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
    const esperaSwitch = document.getElementById('esperaSwitch'); // Pega o switch

    if (!clientObsModal || !clientObsText || !product || !esperaSwitch) {
        console.error("Erro: Elementos do modal OBS, switch ou produto não encontrados.");
        return;
    }

    const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
    const isEspera = regexEspera.test(noteKey);
    
    let cleanNote = noteKey.replace(regexEspera, '').trim();
    if (cleanNote.startsWith(',')) cleanNote = cleanNote.substring(1).trim();

    // Popula o modal
    clientObsModal.querySelector('h3').textContent = product.name;
    clientObsText.value = cleanNote; // Define a nota limpa
    esperaSwitch.checked = isEspera; // Define o estado do switch

    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey; // Salva a nota original (com a tag)

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
    
    _renderClientCart(); // Renderiza a lista de itens no carrinho
}

/**
 * Lida com o clique em "Enviar Pedido".
 */
function handleSendOrderClick() {
    if (selectedItems.length === 0) return;

    if (currentTableId) {
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

    assocErrorMsg.style.display = 'none';
    if (phoneInput) phoneInput.value = '';
    if (smsCodeInput) smsCodeInput.value = '';
    if (smsCodeInput) smsCodeInput.style.display = 'none';
    if (verifySmsBtn) verifySmsBtn.style.display = 'none';
    
    if (currentClientUser && !currentClientUser.isAnonymous) {
        if(loggedInStep) loggedInStep.style.display = 'block';
        if(loggedInUserName) loggedInUserName.textContent = currentClientUser.name;
        if (phoneVerifyStep) phoneVerifyStep.style.display = 'none';
        const authButtons = document.getElementById('authButtons');
        if (authButtons) authButtons.style.display = 'none';
    } else {
        if(loggedInStep) loggedInStep.style.display = 'none';
        if (phoneVerifyStep) phoneVerifyStep.style.display = 'none';
        const authButtons = document.getElementById('authButtons');
        if (authButtons) authButtons.style.display = 'block';
    }

    if (mode === 'sendOrder') {
        if(tableDataStep) tableDataStep.style.display = 'block';
        activateAndSendBtn.textContent = "Confirmar e Enviar";
        activateAndSendBtn.dataset.mode = 'sendOrder';
    } else { 
        if(tableDataStep) tableDataStep.style.display = 'none';
        activateAndSendBtn.textContent = "Confirmar Login";
        activateAndSendBtn.dataset.mode = 'authOnly';
    }
    
    associationModal.style.display = 'flex';
}

/**
 * Lida com a confirmação final do modal (Ativar e Enviar).
 */
async function handleActivationAndSend() {
    const mode = activateAndSendBtn.dataset.mode;
    
    if (!currentClientUser) {
        showAssocError("Você não está autenticado. Por favor, faça login.");
        return;
    }
    
    if (mode === 'authOnly') {
         associationModal.style.display = 'none';
         showToast(`Login como ${currentClientUser.name} confirmado!`);
         return;
    }

    const tableNumber = activateTableNumber.value;
    const diners = parseInt(activateDiners.value) || 1;
    
    if (!tableNumber) {
        showAssocError("Por favor, insira o número da mesa.");
        return;
    }

    activateAndSendBtn.disabled = true;
    activateAndSendBtn.textContent = "Verificando...";
    
    try {
        const tableRef = doc(db, 'artifacts', appId, 'public', 'data', 'tables', tableNumber);
        const tableDoc = await getDoc(tableRef);

        if (tableDoc.exists() && tableDoc.data().status === 'open') {
            currentTableId = tableNumber;
            currentDiners = diners; 
            
            if (!currentClientUser.isAnonymous) {
                 await updateDoc(tableRef, {
                     clientName: currentClientUser.name,
                     clientId: currentClientUser.uid,
                     clientDocType: currentClientUser.phone ? 'phone' : 'google'
                 });
            }
            
            clientTableNumber.textContent = `Mesa ${currentTableId}`;
            
            await sendOrderToFirebase();
            associationModal.style.display = 'none';
        } else {
            showAssocError("Mesa não encontrada ou não está aberta. Peça a um garçom para abrir a mesa.");
        }
        
    } catch (e) {
        console.error("Erro ao ativar mesa:", e);
        showAssocError("Erro ao verificar a mesa. Tente novamente.");
    } finally {
        activateAndSendBtn.disabled = false;
        activateAndSendBtn.textContent = "Confirmar e Enviar";
    }
}

/**
 * Envia o pedido (carrinho) para o Firebase.
 */
async function sendOrderToFirebase() {
    if (!currentTableId || selectedItems.length === 0) {
        alert("Nenhum item ou mesa selecionada.");
        return;
    }

    const orderId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const newOrderRequest = {
        orderId: orderId,
        requestedAt: new Date().toISOString(),
        clientInfo: {
            uid: currentClientUser?.uid,
            name: currentClientUser?.name,
            phone: currentClientUser?.phone
        },
        items: selectedItems.map(item => ({ ...item })) 
    };

    try {
        const tableRef = doc(db, 'artifacts', appId, 'public', 'data', 'tables', currentTableId);
        
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

/**
 * Exibe a etapa de verificação por telefone.
 */
function showPhoneVerifyStep() {
    phoneVerifyStep.style.display = 'block';
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      'size': 'invisible',
      'callback': (response) => {
        console.log("reCAPTCHA resolvido.");
      }
    });
}

/**
 * Envia o código SMS.
 */
function sendSmsCode() {
    const appVerifier = window.recaptchaVerifier;
    const phoneNumber = "+55" + phoneInput.value.replace(/\D/g, ''); 
    
    if (phoneNumber.length < 13) {
         showAssocError("Número de celular inválido. Inclua o DDD.");
         return;
    }

    sendSmsBtn.disabled = true;
    sendSmsBtn.textContent = "Enviando...";

    signInWithPhoneNumber(auth, phoneNumber, appVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            showToast("Código SMS enviado!");
            smsCodeInput.style.display = 'block';
            verifySmsBtn.style.display = 'block';
            sendSmsBtn.textContent = "Reenviar Código";
        })
        .catch((error) => {
            console.error("Erro ao enviar SMS:", error);
            showAssocError("Falha ao enviar SMS. Tente novamente.");
             if (window.recaptchaVerifier) {
                 window.recaptchaVerifier.render().then(widgetId => {
                    grecaptcha.reset(widgetId);
                 });
             }
        })
        .finally(() => {
            sendSmsBtn.disabled = false;
        });
}

/**
 * Verifica o código SMS.
 */
function verifySmsCode() {
    const code = smsCodeInput.value;
    if (code.length < 6) {
        showAssocError("Código inválido.");
        return;
    }

    verifySmsBtn.disabled = true;
    verifySmsBtn.textContent = "Verificando...";

    window.confirmationResult.confirm(code)
        .then((result) => {
            const user = result.user;
            showToast(`Bem-vindo, ${user.phoneNumber}!`);
        })
        .catch((error) => {
            console.error("Erro ao verificar código:", error);
            showAssocError("Código incorreto. Tente novamente.");
        })
        .finally(() => {
            verifySmsBtn.disabled = false;
            verifySmsBtn.textContent = "Verificar Código";
        });
}

/**
 * (Opcional) Registra/Atualiza o cliente no Firestore após o login.
 */
async function checkAndRegisterCustomer(user) {
    if (!user || user.isAnonymous) return;
    
    const customerId = user.phoneNumber ? user.phoneNumber.replace("+55", "") : user.uid;
    const customerRef = doc(db, 'artifacts', appId, 'public', 'data', 'customers', customerId);

    try {
        const docSnap = await getDoc(customerRef);
        if (!docSnap.exists()) {
            await setDoc(customerRef, {
                uid: user.uid,
                name: user.displayName || `Cliente ${customerId}`,
                phone: user.phoneNumber || null,
                email: user.email || null,
                doc: customerId, 
                createdAt: serverTimestamp() 
            });
            console.log("Novo cliente registrado no Firestore:", customerId);
        } else {
             if (docSnap.data().uid !== user.uid) {
                 await updateDoc(customerRef, { uid: user.uid });
             }
        }
    } catch (e) {
        console.error("Erro ao registrar/verificar cliente:", e);
    }
}