// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (COM AUTO-ABERTURA DE MESA) ---

// ===== CORREÇÃO CRÍTICA: Adiciona getTableDocRef e getCustomersCollectionRef =====
import { db, auth, getQuickObsCollectionRef, appId, getTablesCollectionRef, getTableDocRef, getCustomersCollectionRef } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
import { getProducts, getCategories, fetchWooCommerceProducts, fetchWooCommerceCategories } from "/services/wooCommerceService.js";
// ===== CORREÇÃO: Adiciona setDoc (para criar a mesa) =====
import { onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc, getDocs, query, where, serverTimestamp, orderBy, increment, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Importações completas do Auth
import { GoogleAuthProvider, signInWithPopup, signInAnonymously, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importa do app.js
import { showToast, currentTableId, setCurrentTable } from "/app.js"; 


// --- Variáveis de Estado (Locais) ---
let selectedItems = []; // Itens do carrinho local
let quickObsCache = []; 
let currentCategoryFilter = 'all';
const ESPERA_KEY = "(EM ESPERA)"; 
let orderControllerInitialized = false;

// --- NOVO: Variáveis do Novo Fluxo ---
let localCurrentTableId = null;    // ID da mesa ativa
let localCurrentClientUser = null; // Guarda o usuário logado (Google)
let tempUserData = null;           // Guarda dados do Google temporariamente antes do cadastro

// --- Elementos da DOM ---
let clientMenuContainer, clientCategoryFilters, sendOrderBtn, clientCartCount;
let associationModal, activateAndSendBtn, googleLoginBtn, activationForm;
let activateTableNumber;
let authActionBtn, clientUserName, clientTableNumber, loggedInStep, loggedInUserName, assocErrorMsg;
let statusScreen, mainContent, appContainer;
let searchProductInputClient; 
let clientObsModal, clientObsText, clientQuickObsButtons, clientConfirmObsBtn, clientCancelObsBtn;

// --- NOVO: Elementos das Abas e do Novo Modal ---
let tabButtons, tabContents;
let customerRegistrationModal, customerRegistrationForm, saveRegistrationBtn;
let regCustomerName, regCustomerEmail, regCustomerWhatsapp, regCustomerBirthday, regErrorMsg;


// --- Inicialização ---

export const initClientOrderController = () => {
    if (orderControllerInitialized) return;
    console.log("[ClientOrder] Inicializando...");

    // Mapeamento dos elementos principais
    clientMenuContainer = document.getElementById('client-menu-container');
    clientCategoryFilters = document.getElementById('client-category-filters');
    sendOrderBtn = document.getElementById('sendOrderBtn');
    clientCartCount = document.getElementById('client-cart-count');
    authActionBtn = document.getElementById('authActionBtn'); // Botão Entrar/Sair no Header
    clientUserName = document.getElementById('client-user-name'); // Nome no Header
    clientTableNumber = document.getElementById('client-table-number'); // Nº da Mesa no Header
    statusScreen = document.getElementById('statusScreen');
    mainContent = document.getElementById('mainContent');
    appContainer = document.getElementById('appContainer');
    searchProductInputClient = document.getElementById('searchProductInputClient');

    // Mapeamento do Modal de Associação (Login)
    associationModal = document.getElementById('associationModal');
    activationForm = document.getElementById('activationForm'); // Form da Aba Mesa
    activateAndSendBtn = document.getElementById('activateAndSendBtn'); // Botão "Enviar Pedido" do modal
    googleLoginBtn = document.getElementById('googleLoginBtn');
    loggedInStep = document.getElementById('loggedInStep'); // Div "Logado como:"
    loggedInUserName = document.getElementById('loggedInUserName'); // Texto "Logado como:"
    assocErrorMsg = document.getElementById('assocErrorMsg');
    activateTableNumber = document.getElementById('activateTableNumber'); // Input do Nº da Mesa
    
    // ==================================================================
    //               NOVA LÓGICA DE ABAS E CADASTRO
    // ==================================================================

    // Mapeamento das Abas
    tabButtons = document.querySelectorAll('.client-tab-btn');
    tabContents = document.querySelectorAll('.client-tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            showTab(tabName);
        });
    });

    // Mapeamento do Novo Modal de Cadastro
    customerRegistrationModal = document.getElementById('customerRegistrationModal');
    customerRegistrationForm = document.getElementById('customerRegistrationForm');
    saveRegistrationBtn = document.getElementById('saveRegistrationBtn');
    regCustomerName = document.getElementById('regCustomerName');
    regCustomerEmail = document.getElementById('regCustomerEmail');
    regCustomerWhatsapp = document.getElementById('regCustomerWhatsapp');
    regCustomerBirthday = document.getElementById('regCustomerBirthday');
    regErrorMsg = document.getElementById('regErrorMsg');

    // Listener para o form do novo modal
    if(customerRegistrationForm) {
        customerRegistrationForm.addEventListener('submit', handleNewCustomerRegistration);
    }
    // ==================================================================
    
    // Mapeamento do Modal Obs
    clientObsModal = document.getElementById('clientObsModal'); 
    clientObsText = document.getElementById('clientObsText'); 
    clientQuickObsButtons = document.getElementById('clientQuickObsButtons'); 
    clientConfirmObsBtn = document.getElementById('clientConfirmObsBtn');
    clientCancelObsBtn = document.getElementById('clientCancelObsBtn'); 

    if (clientObsModal) { // Verifica se os elementos do modal existem
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
                    renderClientOrderScreen(); // Re-renderiza localmente (sem snapshot)
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
                renderClientOrderScreen(); // Re-renderiza localmente (sem snapshot)
            });
        }
    } else {
        console.warn("[ClientOrder] Modal de Observação (clientObsModal) não encontrado.");
    }


    // Listeners principais (Login, Envio)
    if (sendOrderBtn) sendOrderBtn.onclick = handleSendOrderClick;
    if (authActionBtn) authActionBtn.onclick = handleAuthActionClick;
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (activationForm) activationForm.onsubmit = handleActivationAndSend; // Lida com o "Enviar Pedido"
    
    // Botão Cancelar do Modal de Associação
    const cancelBtn = document.getElementById('cancelActivationBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAssociationModal();
        });
    }


    // Delegação de eventos para o menu
    if (clientMenuContainer) {
        clientMenuContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;

            // Pega o produto do Cache
            const product = getProducts().find(p => p.id == card.dataset.productId);
            if (!product) return;

            // Se o clique foi no botão de info, mostra info
            if (e.target.closest('.info-item-btn')) {
                 openProductInfoModal(product);
            } else {
            // Qualquer outro clique no card adiciona ao carrinho
                 addItemToCart(product);
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

    // Gerencia o estado de autenticação
    setupAuthStateObserver();
    
    // Busca os produtos
    loadMenu(); 

    // Busca as observações rápidas
    fetchQuickObservations(); 
    
    orderControllerInitialized = true;
    console.log("[ClientOrder] Inicializado com sucesso.");
};

/**
 * Observa o estado de autenticação do usuário.
 */
function setupAuthStateObserver() {
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            // --- USUÁRIO LOGADO COM GOOGLE ---
            console.log("[ClientOrder] Usuário Google Autenticado:", user.displayName);
            localCurrentClientUser = user; // Armazena o usuário
            tempUserData = { // Salva dados temporários
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            };
            updateAuthUI(user); // Atualiza o header (Nome, "Sair")
            // Verifica se o usuário já tem cadastro completo
            checkCustomerRegistration(user); 
        
        } else if (user && user.isAnonymous) {
             // --- USUÁRIO ANÔNIMO (JÁ ASSOCIADO A UMA MESA) ---
             console.log("[ClientOrder] Usuário Anônimo Autenticado (Mesa Ativa).");
             // Isso acontece DEPOIS do handleActivationAndSend.
             // O localCurrentClientUser (Google) ainda está na memória.
             closeAssociationModal();
             closeCustomerRegistrationModal();
        } else {
            // --- USUÁRIO DESLOGADO ---
            console.log("[ClientOrder] Nenhum usuário autenticado.");
            localCurrentClientUser = null;
            tempUserData = null;
            updateAuthUI(null); // Limpa a UI do header (Visitante, "Entrar")
            updateCustomerInfo(null, false); // Limpa o "Logado como:" no modal
            
            // Se não estiver em uma mesa, abre o modal de login
            if (!currentTableId) {
                openAssociationModal();
            }
        }
    });
}

/**
 * Atualiza a UI (do Header) com base no estado de login.
 */
function updateAuthUI(user) {
    // Validação suave, já que o header do client.html não tem mais esses IDs
    if (clientUserName && authActionBtn) {
        if (user && !user.isAnonymous) {
            clientUserName.textContent = user.displayName || user.name || "Cliente";
            authActionBtn.textContent = "Sair";
            authActionBtn.classList.add('text-red-400');
        } else {
            clientUserName.textContent = "Visitante";
            authActionBtn.textContent = "Entrar";
            authActionBtn.classList.remove('text-red-400');
        }
    }
}

/**
 * Ação do botão "Entrar" / "Sair" do Header (SE ELE EXISTIR).
 */
function handleAuthActionClick() {
    if (localCurrentClientUser) { // Se está logado com Google
        signOut(auth).then(() => {
            console.log("Usuário deslogado.");
            showToast("Você saiu da sua conta.");
            // O onAuthStateChanged vai lidar com a abertura do modal
        });
    } else { // Se está deslogado
        openAssociationModal();
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
        if (mainContent) mainContent.style.display = 'flex'; // 'flex' é o display do container
        
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
        clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        clientMenuContainer.innerHTML = filteredProducts.map(product => `
            <!-- Card de Produto - Pega o ID para o clique -->
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden" data-product-id="${product.id}">
                <img src="${product.image}" alt="${product.name}" class="w-full h-32 object-cover">
                
                <div class="p-4 flex flex-col flex-grow">
                    <h4 class="font-semibold text-base text-white mb-2 min-h-[2.5rem]">${product.name}</h4>
                    
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-bold text-lg text-brand-primary">${formatCurrency(product.price)}</span>
                        
                        <!-- Botão Adicionar (só visual, clique é no card) -->
                        <button class="add-item-btn bg-brand-primary text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-brand-primary-dark transition pointer-events-none">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>

                    <div class="flex-grow"></div>
                    
                    <!-- Botão Descrição -->
                    <button class="info-item-btn w-full bg-dark-input text-dark-text font-semibold py-2 rounded-lg hover:bg-gray-600 transition text-sm">
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
        cartItemsList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
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
export function renderClientOrderScreen(tableData) {
    if (clientCartCount) {
        clientCartCount.textContent = selectedItems.length;
    }
    
    if (sendOrderBtn) {
        const billRequested = tableData?.waiterNotification?.includes('fechamento');
        
        if (billRequested) {
            sendOrderBtn.disabled = true;
            sendOrderBtn.innerHTML = '<i class="fas fa-hourglass-half"></i>';
            sendOrderBtn.title = 'Aguardando fechamento da conta...';
        } else {
            sendOrderBtn.disabled = selectedItems.length === 0;
            sendOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
            sendOrderBtn.title = 'Enviar Pedido para Confirmação';
        }
    }
    
    _renderClientCart();
}


/**
 * Lida com o clique em "Enviar Pedido".
 */
function handleSendOrderClick() {
    if (selectedItems.length === 0) {
        showToast("Seu carrinho está vazio.", true);
        return;
    }
    
    // Se não há mesa, abre o modal de associação
    if (!localCurrentTableId && !currentTableId) { 
        openAssociationModal();
    } else {
        // Se já tem mesa, envia o pedido
        sendOrderToFirebase();
    }
}

// ==================================================================
//               LÓGICA DE ABAS, AUTENTICAÇÃO E ATIVAÇÃO (ATUALIZADA)
// ==================================================================

/**
 * Mostra uma aba específica no modal de associação.
 * @param {string} tabName - O 'data-tab' da aba (ex: 'mesa', 'retirada')
 */
function showTab(tabName) {
    if(!tabContents || !tabButtons) return;
    // Esconde todos os conteúdos
    tabContents.forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    // Remove 'active' de todos os botões
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });

    // Mostra o conteúdo e o botão da aba selecionada
    const activeContent = document.getElementById(`tab-content-${tabName}`);
    const activeButton = document.querySelector(`.client-tab-btn[data-tab="${tabName}"]`);
    
    if (activeContent) {
        activeContent.style.display = 'block';
        activeContent.classList.add('active');
    }
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

/**
 * Abre o modal de associação (login) e reseta para a aba 'mesa'.
 */
function openAssociationModal() {
    if (associationModal) {
        if(assocErrorMsg) assocErrorMsg.style.display = 'none';
        associationModal.style.display = 'flex';
        showTab('mesa'); // Garante que a aba 'mesa' é a padrão
        if (activateTableNumber) {
            activateTableNumber.focus();
        }
    }
}

/**
 * Fecha o modal de associação.
 */
function closeAssociationModal() {
    if (associationModal) {
        associationModal.style.display = 'none';
    }
}

/**
 * Abre o novo modal de cadastro.
 */
function openCustomerRegistrationModal() {
    if (customerRegistrationModal && tempUserData) {
        // Preenche o modal com os dados do Google
        regCustomerName.textContent = tempUserData.name || 'Nome não encontrado';
        regCustomerEmail.textContent = tempUserData.email || 'Email não encontrado';
        regCustomerWhatsapp.value = ''; // Limpa campos
        regCustomerBirthday.value = ''; // Limpa campos
        if(regErrorMsg) regErrorMsg.style.display = 'none';
        
        // Mostra o modal
        customerRegistrationModal.style.display = 'flex';
        // Esconde o modal de associação
        associationModal.style.display = 'none';
    } else {
        console.error("Não foi possível abrir o modal de registro. tempUserData:", tempUserData);
    }
}

/**
 * Fecha o modal de cadastro.
 */
function closeCustomerRegistrationModal() {
    if (customerRegistrationModal) {
        customerRegistrationModal.style.display = 'none';
    }
}


/**
 * Inicia o fluxo de login com Google.
 */
async function signInWithGoogle(e) {
    e.preventDefault(); // Previne o submit do form
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        // O listener 'onAuthStateChanged' vai pegar o resultado e continuar o fluxo.
        console.log("Login com Google bem-sucedido, aguardando onAuthStateChanged...");
    } catch (error) {
        console.error("Erro no login com Google:", error);
        showAssocError("Erro ao tentar logar com Google.");
    }
}

/**
 * Verifica se o usuário do Google já tem cadastro completo no Firestore.
 * Se não tiver, abre o modal de cadastro.
 * @param {object} user - O objeto User do Firebase Auth.
 */
async function checkCustomerRegistration(user) {
    const customerRef = doc(getCustomersCollectionRef(), user.uid);
    try {
        const docSnap = await getDoc(customerRef);
        if (docSnap.exists() && docSnap.data().phone) { // Verifica se tem 'phone' (whatsapp)
            // Usuário existe E tem whatsapp (cadastro completo)
            console.log("Cliente já cadastrado:", docSnap.data());
            localCurrentClientUser.phone = docSnap.data().phone; // Atualiza o 'phone' local
            updateCustomerInfo(user, false); // Atualiza a UI (não é novo)
        } else {
            // Usuário novo ou com cadastro incompleto
            console.log("Cliente novo ou incompleto. Abrindo modal de cadastro.");
            openCustomerRegistrationModal(); // Abre o novo modal de cadastro
        }
    } catch (error) {
        console.error("Erro ao verificar cliente:", error);
        showAssocError("Erro ao verificar seu cadastro.");
    }
}

/**
 * Lida com o salvamento do NOVO modal de cadastro (nascimento/whatsapp).
 */
async function handleNewCustomerRegistration(e) {
    e.preventDefault();
    if (!tempUserData) {
        showAssocError("Erro: Dados do usuário perdidos. Tente logar novamente.");
        return;
    }

    const whatsapp = regCustomerWhatsapp.value;
    const birthday = regCustomerBirthday.value;

    if (!whatsapp || !birthday) {
        regErrorMsg.textContent = "Por favor, preencha todos os campos.";
        regErrorMsg.style.display = 'block';
        return;
    }
    regErrorMsg.style.display = 'none';

    // Adiciona os novos dados ao objeto de usuário temporário
    const completeUserData = {
        ...tempUserData,
        whatsapp: whatsapp,
        nascimento: birthday
    };

    saveRegistrationBtn.disabled = true;
    saveRegistrationBtn.textContent = "Salvando...";

    try {
        // Chama a função que salva no Firestore
        await saveCustomerData(completeUserData);
        
        // Atualiza o 'phone' no usuário local
        if(localCurrentClientUser) {
            localCurrentClientUser.phone = whatsapp;
        }

        showToast("Cadastro concluído com sucesso!", false);
        closeCustomerRegistrationModal(); // Fecha o modal de cadastro
        
        // Reabre o modal de associação, agora com o usuário logado
        openAssociationModal(); 
        updateCustomerInfo(localCurrentClientUser, false); // Atualiza a UI "Logado como:"

    } catch (error) {
        console.error("Erro ao salvar cadastro:", error);
        regErrorMsg.textContent = "Falha ao salvar cadastro. Tente novamente.";
        regErrorMsg.style.display = 'block';
    } finally {
        saveRegistrationBtn.disabled = false;
        saveRegistrationBtn.textContent = "Salvar e Continuar";
    }
}

/**
 * Salva os dados do cliente no Firestore (Função ATUALIZADA).
 * @param {object} userData - Objeto com dados do usuário (uid, name, email, photoURL, whatsapp, nascimento)
 */
async function saveCustomerData(userData) {
    const customerRef = doc(getCustomersCollectionRef(), userData.uid);
    const dataToSave = {
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.whatsapp,  // Salvando como 'phone'
        birthday: userData.nascimento, // Salvando como 'birthday'
        photoURL: userData.photoURL || null,
        points: 0,
        orderHistory: [],
        vouchersUsed: [],
        createdAt: serverTimestamp()
    };
    
    // Usa setDoc com merge:true para criar ou atualizar o cadastro
    await setDoc(customerRef, dataToSave, { merge: true });
    console.log("Cadastro do cliente salvo no Firestore:", userData.uid);
}


/**
 * Atualiza a UI no modal de associação com os dados do cliente.
 * @param {object | null} user - O objeto User do Firebase Auth, ou null.
 * @param {boolean} isNew - Flag se o usuário é novo (para não mostrar)
 */
function updateCustomerInfo(user, isNew = false) {
    if (!loggedInStep || !loggedInUserName || !googleLoginBtn) return;
    
    if (user && !isNew) { // Só mostra se NÃO for um usuário novo (que está no outro modal)
        loggedInStep.style.display = 'block';
        loggedInUserName.textContent = user.displayName || user.email;
        googleLoginBtn.style.display = 'none'; // Esconde o botão de login
    } else {
        loggedInStep.style.display = 'none';
        loggedInUserName.textContent = '';
        googleLoginBtn.style.display = 'flex'; // Mostra o botão de login
    }
}


// ==================================================================
//               LÓGICA DE ATIVAÇÃO DE MESA (REESCRITA)
// ==================================================================

/**
 * Lida com a ativação da mesa e envio do primeiro pedido (botão "Enviar Pedido").
 * Esta é a versão ATUALIZADA que implementa a auto-abertura de mesa.
 */
async function handleActivationAndSend(e) {
    e.preventDefault();
    const tableId = activateTableNumber.value.trim();
    
    if (!tableId) {
        showAssocError("Por favor, informe o número da mesa.");
        activateTableNumber.focus();
        return;
    }
    
    // VERIFICAÇÃO: O usuário DEVE estar logado (Google) para ativar a mesa.
    if (!localCurrentClientUser) {
        showAssocError("Por favor, faça o login com Google para continuar.");
        return;
    }

    console.log(`Tentando ativar mesa ${tableId} para o cliente ${localCurrentClientUser.uid}`);
    
    activateAndSendBtn.disabled = true;
    activateAndSendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Acessando...';
    assocErrorMsg.style.display = 'none';

    try {
        const tableRef = getTableDocRef(tableId);
        const tableSnap = await getDoc(tableRef);

        // --- LÓGICA DE ATIVAÇÃO ATUALIZADA ---

        if (tableSnap.exists()) {
            // --- CENÁRIO 1: A MESA EXISTE ---
            const tableData = tableSnap.data();

            if (tableData.status !== 'closed' && tableData.clientId && tableData.clientId !== localCurrentClientUser.uid) {
                // CENÁRIO 1a: Mesa está aberta/ocupada por OUTRO cliente. BLOQUEAR.
                throw new Error("Esta mesa está ocupada por outro cliente.");
            
            } else {
                // CENÁRIO 1b: A mesa está:
                // 1. Fechada (será reaberta)
                // 2. Aberta e é minha (reconectando)
                // 3. Aberta e livre (assumindo)
                
                console.log(`Mesa ${tableId} encontrada. Status: ${tableData.status || 'aberta'}. Conectando...`);
                
                // Desloga do Google, Loga Anonimamente para a sessão
                await signOut(auth);
                const anonUser = await signInAnonymously(auth);
                console.log("Logado anonimamente para a sessão da mesa:", anonUser.user.uid);

                // ATUALIZA a mesa, reabrindo-a se necessário
                await updateDoc(tableRef, {
                    clientId: localCurrentClientUser.uid, 
                    clientName: localCurrentClientUser.displayName,
                    clientPhone: localCurrentClientUser.phone || null,
                    anonymousUid: anonUser.user.uid,
                    status: 'open', // <-- Força a reabertura ou mantém aberta
                    diners: tableData.diners || 1 // Mantém os comensais se já existiam
                });
            }
        
        } else {
            // --- CENÁRIO 2: A MESA NÃO EXISTE ---
            // Lógica de "Auto-abertura" que você pediu
            console.log(`Mesa ${tableId} não encontrada. Criando (auto-abertura)...`);
            
            // Desloga do Google, Loga Anonimamente
            await signOut(auth);
            const anonUser = await signInAnonymously(auth);
            console.log("Logado anonimamente para a sessão da mesa:", anonUser.user.uid);

            // CRIA o novo documento da mesa
            const newTableData = {
                tableNumber: parseInt(tableId, 10),
                diners: 1, 
                sector: 'Cliente', // Setor padrão para auto-abertura
                status: 'open',
                createdAt: serverTimestamp(),
                total: 0,
                sentItems: [],
                payments: [],
                serviceTaxApplied: true,
                selectedItems: [], 
                requestedOrders: [], // Começa com array vazio
                clientId: localCurrentClientUser.uid,
                clientName: localCurrentClientUser.displayName,
                clientPhone: localCurrentClientUser.phone || null,
                anonymousUid: anonUser.user.uid
            };
            await setDoc(tableRef, newTableData);
        }

        // --- CAMINHO DE SUCESSO (Comum aos cenários 1b e 2) ---
        
        localCurrentTableId = tableId; // Define o ID da mesa localmente
        setCurrentTable(tableId, true); // Define a mesa atual globalmente (no app.js)
        
        // Se houver itens no carrinho, envia o primeiro pedido
        if (selectedItems.length > 0) {
            await sendOrderToFirebase(); 
        } else {
            // Apenas atualiza o header
            clientTableNumber.textContent = `Mesa ${tableId}`;
        }
        
        showToast(`Mesa ${tableId} ativada! Bem-vindo(a)!`, false);
        closeAssociationModal();

    } catch (error) {
        console.error("Erro ao ativar mesa:", error);
        showAssocError(error.message);
        // Se falhar, tenta relogar com Google
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            await signOut(auth);
        }
        // Tenta logar no Google de novo para o usuário não ficar "preso"
        if(googleLoginBtn) googleLoginBtn.click();

    } finally {
        activateAndSendBtn.disabled = false;
        activateAndSendBtn.innerHTML = 'Enviar Pedido';
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
//               OBSERVAÇÕES RÁPIDAS
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
//               LÓGICA DE ENVIO DE PEDIDO
// ==================================================================
/**
 * Envia o pedido (carrinho) para o Firebase.
 */
async function sendOrderToFirebase() {
    const tableId = localCurrentTableId || currentTableId; // Pega o ID da mesa

    if (!tableId || selectedItems.length === 0) {
        alert("Nenhum item ou mesa selecionada.");
        return;
    }

    const orderId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Usa o usuário do Google (localCurrentClientUser) para os dados do cliente
    const clientPhone = localCurrentClientUser?.phone || null;
    const clientName = localCurrentClientUser?.displayName || 'Cliente';
    const clientUid = localCurrentClientUser?.uid || 'N/A';

    const newOrderRequest = {
        orderId: orderId,
        requestedAt: new Date().toISOString(),
        clientInfo: {
            uid: clientUid,
            name: clientName,
            phone: clientPhone 
        },
        items: selectedItems.map(item => ({ ...item })) 
    };

    try {
        const tableRef = getTableDocRef(tableId); 
        
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(newOrderRequest),
            clientOrderPending: true,
            waiterNotification: "Novo Pedido do Cliente"
        });

        selectedItems.length = 0;
        renderClientOrderScreen(); // Re-renderiza localmente
        
        showToast("Pedido enviado! Um garçom irá confirmar em breve.");
        
    } catch (e) {
        console.error("Erro ao enviar pedido para o Firebase:", e);
        showToast("Falha ao enviar o pedido. Tente novamente.", true);
    }
}