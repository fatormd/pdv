// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (VERSÃO FINAL - COMPLETA) ---

import { db, auth, getQuickObsCollectionRef, appId, getTablesCollectionRef, getTableDocRef, getCustomersCollectionRef, getKdsCollectionRef } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
import { getProducts, getCategories, fetchWooCommerceCategories, fetchWooCommerceProducts } from "/services/wooCommerceService.js";
import { onSnapshot, doc, updateDoc, arrayUnion, setDoc, getDoc, getDocs, query, serverTimestamp, orderBy, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importa variáveis e funções globais do app.js
import { showToast, currentTableId, setCurrentTable, setTableListener } from "/app.js"; 

// --- Variáveis de Estado ---
let selectedItems = []; 
let quickObsCache = []; 
let currentCategoryFilter = 'all';
const ESPERA_KEY = "(EM ESPERA)"; 
let orderControllerInitialized = false;
let localCurrentTableId = null;    
let localCurrentClientUser = null; 
let tempUserData = null;
let unsubscribeClientKds = null; // Listener do KDS

// --- Elementos da DOM ---
let clientMenuContainer, clientCategoryFilters, sendOrderBtn, clientCartCount;
let associationModal, activateAndSendBtn, googleLoginBtn, activationForm;
let activateTableNumber;
let authActionBtn, clientUserName, clientTableNumber, loggedInStep, loggedInUserName, assocErrorMsg;
let statusScreen, mainContent, appContainer;
let searchProductInputClient; 
let clientObsModal, clientObsText, clientQuickObsButtons, clientConfirmObsBtn, clientCancelObsBtn;
let tabButtons, tabContents;
let customerRegistrationModal, customerRegistrationForm, saveRegistrationBtn;
let regCustomerName, regCustomerEmail, regCustomerWhatsapp, regCustomerBirthday, regErrorMsg;


export const initClientOrderController = () => {
    if (orderControllerInitialized) return;
    console.log("[ClientOrder] Inicializando...");

    // Mapeamento de Elementos
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

    associationModal = document.getElementById('associationModal');
    activationForm = document.getElementById('activationForm'); 
    activateAndSendBtn = document.getElementById('activateAndSendBtn'); 
    googleLoginBtn = document.getElementById('googleLoginBtn');
    loggedInStep = document.getElementById('loggedInStep'); 
    loggedInUserName = document.getElementById('loggedInUserName'); 
    assocErrorMsg = document.getElementById('assocErrorMsg');
    activateTableNumber = document.getElementById('activateTableNumber'); 
    
    // Abas (Cardápio / Conta)
    tabButtons = document.querySelectorAll('.client-tab-btn');
    tabContents = document.querySelectorAll('.client-tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            showTab(tabName);
        });
    });

    // Modal de Cadastro
    customerRegistrationModal = document.getElementById('customerRegistrationModal');
    customerRegistrationForm = document.getElementById('customerRegistrationForm');
    saveRegistrationBtn = document.getElementById('saveRegistrationBtn');
    regCustomerName = document.getElementById('regCustomerName');
    regCustomerEmail = document.getElementById('regCustomerEmail');
    regCustomerWhatsapp = document.getElementById('regCustomerWhatsapp');
    regCustomerBirthday = document.getElementById('regCustomerBirthday');
    regErrorMsg = document.getElementById('regErrorMsg');

    if(customerRegistrationForm) {
        customerRegistrationForm.addEventListener('submit', handleNewCustomerRegistration);
    }
    
    // Modal de Observações
    clientObsModal = document.getElementById('clientObsModal'); 
    clientObsText = document.getElementById('clientObsText'); 
    clientQuickObsButtons = document.getElementById('clientQuickObsButtons'); 
    clientConfirmObsBtn = document.getElementById('clientConfirmObsBtn');
    clientCancelObsBtn = document.getElementById('clientCancelObsBtn'); 

    if (clientObsModal) {
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

        if (clientConfirmObsBtn) {
            clientConfirmObsBtn.addEventListener('click', () => {
                const itemId = clientObsModal.dataset.itemId;
                const originalNoteKey = clientObsModal.dataset.originalNoteKey;
                let newNote = clientObsText.value.trim();
                
                const esperaSwitch = document.getElementById('esperaSwitch');
                const isEspera = esperaSwitch ? esperaSwitch.checked : false;
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
                    clientObsModal.style.display = 'none';
                }
            });
        }

        if (clientCancelObsBtn) {
            clientCancelObsBtn.addEventListener('click', () => {
                clientObsModal.style.display = 'none';
                renderClientOrderScreen(); 
            });
        }
    }

    // Listeners de Ação
    if (sendOrderBtn) sendOrderBtn.onclick = handleSendOrderClick;
    if (authActionBtn) authActionBtn.onclick = handleAuthActionClick;
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (activationForm) activationForm.onsubmit = handleActivationAndSend;
    
    const cancelBtn = document.getElementById('cancelActivationBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAssociationModal();
        });
    }

    if (clientMenuContainer) {
        clientMenuContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            
            // Procura o produto na lista global
            const product = getProducts().find(p => p.id == card.dataset.productId);
            if (!product) return;

            if (e.target.closest('.info-item-btn')) {
                 openProductInfoModal(product);
            } else {
                 addItemToCart(product);
            }
        });
    }
    
    // Listener no Carrinho (Delegação)
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

    if (clientCategoryFilters) {
        clientCategoryFilters.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                currentCategoryFilter = btn.dataset.category;
                renderMenu();
            }
        });
    }
    
    if (searchProductInputClient) {
        searchProductInputClient.addEventListener('input', renderMenu);
    }

    setupAuthStateObserver();
    loadMenu(); 
    fetchQuickObservations(); 
    
    // Se já existir uma mesa carregada (ex: refresh da página), inicia o listener KDS
    if (localCurrentTableId || currentTableId) {
        startClientKdsListener(localCurrentTableId || currentTableId);
    }

    orderControllerInitialized = true;
    console.log("[ClientOrder] Inicializado com sucesso.");
};

// --- LÓGICA DE STATUS KDS PARA O CLIENTE (NOVA) ---
const startClientKdsListener = (tableId) => {
    if (unsubscribeClientKds) unsubscribeClientKds();
    if (!tableId) return;

    console.log(`[ClientOrder] Iniciando KDS Listener para mesa ${tableId}`);
    
    const q = query(
        getKdsCollectionRef(), 
        where('tableNumber', '==', parseInt(tableId)),
        where('status', 'in', ['pending', 'preparing', 'ready'])
    );

    unsubscribeClientKds = onSnapshot(q, (snapshot) => {
        const orders = snapshot.docs.map(d => d.data());
        updateClientStatusUI(orders);
    }, (error) => {
        console.error("[ClientOrder] Erro no KDS Listener:", error);
    });
};

const updateClientStatusUI = (orders) => {
    let statusBar = document.getElementById('clientKdsStatusBar');
    
    // Cria a barra se não existir
    if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.id = 'clientKdsStatusBar';
        statusBar.className = 'fixed top-0 left-0 right-0 bg-gray-900 text-white p-3 z-[60] shadow-lg border-b border-gray-700 flex justify-between items-center transform transition-transform duration-300 translate-y-[-100%]';
        document.body.prepend(statusBar);
        setTimeout(() => statusBar.classList.remove('translate-y-[-100%]'), 100);
    }

    if (orders.length === 0) {
        statusBar.style.display = 'none';
        return;
    }

    statusBar.style.display = 'flex';
    
    // Define prioridade de exibição: Ready > Preparing > Pending
    let statusText = '';
    let iconClass = '';
    let bgClass = '';
    
    const hasReady = orders.some(o => o.status === 'ready');
    const hasPreparing = orders.some(o => o.status === 'preparing');
    
    if (hasReady) {
        statusText = 'Seu pedido está pronto!';
        iconClass = 'fas fa-check-circle text-green-400';
        bgClass = 'bg-gray-900 border-b-2 border-green-500';
    } else if (hasPreparing) {
        statusText = 'Preparando seu pedido...';
        iconClass = 'fas fa-fire text-blue-400 animate-pulse';
        bgClass = 'bg-gray-900 border-b-2 border-blue-500';
    } else {
        statusText = 'Pedido recebido na cozinha.';
        iconClass = 'fas fa-clock text-yellow-400';
        bgClass = 'bg-gray-900 border-b-2 border-yellow-500';
    }

    statusBar.className = `fixed top-0 left-0 right-0 p-3 z-[60] shadow-lg flex justify-between items-center ${bgClass}`;
    statusBar.innerHTML = `
        <div class="flex items-center">
            <i class="${iconClass} text-xl mr-3"></i>
            <span class="font-bold text-sm text-white">${statusText}</span>
        </div>
        <span class="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">${orders.length} pedido(s)</span>
    `;
};


// --- AUTH & USER ---
function setupAuthStateObserver() {
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            console.log("[ClientOrder] Usuário Google Autenticado:", user.displayName);
            localCurrentClientUser = user; 
            tempUserData = { 
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            };
            updateAuthUI(user);
            checkCustomerRegistration(user); 
        } else if (user && user.isAnonymous) {
             console.log("[ClientOrder] Usuário Anônimo Autenticado.");
             closeAssociationModal();
             closeCustomerRegistrationModal();
        } else {
            console.log("[ClientOrder] Nenhum usuário autenticado.");
            localCurrentClientUser = null;
            tempUserData = null;
            updateAuthUI(null);
            updateCustomerInfo(null, false);
            // Se não tem mesa e não tem user, pede associação
            if (!currentTableId) {
                openAssociationModal();
            }
        }
    });
}

function updateAuthUI(user) {
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

function handleAuthActionClick() {
    if (localCurrentClientUser) {
        signOut(auth).then(() => {
            showToast("Você saiu da sua conta.");
            window.location.reload();
        });
    } else {
        openAssociationModal();
    }
}

// --- MENU & CART ---
async function loadMenu() {
    try {
        const categories = await fetchWooCommerceCategories();
        const products = await fetchWooCommerceProducts();
        
        if (categories.length > 0 && clientCategoryFilters) {
             clientCategoryFilters.innerHTML = categories.map(cat => {
                const isActive = cat.slug === currentCategoryFilter ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600';
                return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
             }).join('');
        }
        renderMenu(); 
        
        if (statusScreen) statusScreen.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex'; 
    } catch (error) {
        console.error("Erro ao carregar menu:", error);
        if (statusScreen) statusScreen.innerHTML = '<p class="text-red-400 p-4 text-center">Erro ao carregar o cardápio. Verifique sua conexão.</p>';
    }
}

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

    // Filtro por Categoria (incluindo Top 10 se houver lógica no backend, aqui simplificado)
    if (currentCategoryFilter !== 'all') {
        filteredProducts = products.filter(p => p.category === currentCategoryFilter);
    }

    // Filtro de Busca
    let searchTerm = '';
    if (searchProductInputClient) { 
         searchTerm = searchProductInputClient.value.trim().toLowerCase();
    }
    if (searchTerm) {
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(searchTerm));
    }
    
    if (filteredProducts.length === 0) {
        clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        clientMenuContainer.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden" data-product-id="${product.id}">
                <img src="${product.image}" alt="${product.name}" class="w-full h-32 object-cover">
                <div class="p-4 flex flex-col flex-grow">
                    <h4 class="font-semibold text-base text-white mb-2 min-h-[2.5rem]">${product.name}</h4>
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-bold text-lg text-brand-primary">${formatCurrency(product.price)}</span>
                        <button class="add-item-btn bg-brand-primary text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-brand-primary-dark transition pointer-events-none">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="flex-grow"></div>
                    <button class="info-item-btn w-full bg-dark-input text-dark-text font-semibold py-2 rounded-lg hover:bg-gray-600 transition text-sm">
                        Descrição
                    </button>
                </div>
            </div>
        `).join('');
    }
}

function addItemToCart(product) {
    if (!product || !product.id) return;
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

function increaseCartItemQuantity(itemId, noteKey) {
    const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy }); 
        renderClientOrderScreen(); 
    }
}

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

function openProductInfoModal(product) {
    if (!product) return;
    const modal = document.getElementById('productInfoModal');
    const img = document.getElementById('infoProductImage');
    const imgLink = document.getElementById('infoProductImageLink');
    const nameEl = document.getElementById('infoProductName');
    const priceEl = document.getElementById('infoProductPrice');
    const descEl = document.getElementById('infoProductDescription');
    const addBtn = document.getElementById('infoProductAddBtn');
    
    if (!modal || !img || !nameEl || !priceEl || !descEl || !addBtn || !imgLink) return;

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

function openClientObsModal(itemId, noteKey) {
    const products = getProducts();
    const product = products.find(p => p.id == itemId);
    const esperaSwitch = document.getElementById('esperaSwitch'); 
    
    if (!clientObsModal || !clientObsText || !product || !esperaSwitch) return;

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
                if (displayNote) noteHtml += ` <span class="text-yellow-400">(${displayNote})</span>`;
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
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="decrease">
                        <i class="fas fa-minus pointer-events-none"></i>
                    </button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="increase">
                        <i class="fas fa-plus pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `}).join('');
    }
}

export function renderClientOrderScreen(tableData) {
    if (clientCartCount) clientCartCount.textContent = selectedItems.length;
    
    if (sendOrderBtn) {
        // Verifica se já pediu a conta
        const billRequested = tableData?.waiterNotification?.includes('fechamento') || tableData?.billRequested === true;
        
        if (billRequested) {
            sendOrderBtn.disabled = true;
            sendOrderBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Aguardando Conta';
            sendOrderBtn.classList.add('opacity-50');
        } else {
            sendOrderBtn.disabled = selectedItems.length === 0;
            sendOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i> Enviar Pedido';
            sendOrderBtn.classList.remove('opacity-50');
        }
    }
    _renderClientCart();
}

function handleSendOrderClick() {
    if (selectedItems.length === 0) { showToast("Seu carrinho está vazio.", true); return; }
    if (!localCurrentTableId && !currentTableId) { openAssociationModal(); } else { sendOrderToFirebase(); }
}

function showTab(tabName) {
    if(!tabContents || !tabButtons) return;
    tabContents.forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });
    const activeContent = document.getElementById(`tab-content-${tabName}`);
    const activeButton = document.querySelector(`.client-tab-btn[data-tab="${tabName}"]`);
    if (activeContent) { activeContent.style.display = 'block'; activeContent.classList.add('active'); }
    if (activeButton) { activeButton.classList.add('active'); }
}

function openAssociationModal() {
    if (associationModal) {
        if(assocErrorMsg) assocErrorMsg.style.display = 'none';
        associationModal.style.display = 'flex';
        showTab('mesa'); 
        if (activateTableNumber) activateTableNumber.focus();
    }
}

function closeAssociationModal() {
    if (associationModal) associationModal.style.display = 'none';
}

function openCustomerRegistrationModal() {
    if (customerRegistrationModal && tempUserData) {
        regCustomerName.textContent = tempUserData.name || 'Nome não encontrado';
        regCustomerEmail.textContent = tempUserData.email || 'Email não encontrado';
        regCustomerWhatsapp.value = ''; 
        regCustomerBirthday.value = ''; 
        if(regErrorMsg) regErrorMsg.style.display = 'none';
        customerRegistrationModal.style.display = 'flex';
        associationModal.style.display = 'none';
    }
}

function closeCustomerRegistrationModal() {
    if (customerRegistrationModal) customerRegistrationModal.style.display = 'none';
}

async function signInWithGoogle(e) {
    e.preventDefault(); 
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Erro no login com Google:", error);
        showAssocError("Erro ao tentar logar com Google.");
    }
}

async function checkCustomerRegistration(user) {
    const customerRef = doc(getCustomersCollectionRef(), user.uid);
    try {
        const docSnap = await getDoc(customerRef);
        if (docSnap.exists() && docSnap.data().phone) { 
            localCurrentClientUser.phone = docSnap.data().phone; 
            updateCustomerInfo(user, false); 
        } else {
            openCustomerRegistrationModal();
        }
    } catch (error) {
        console.error("Erro ao verificar cliente:", error);
        showAssocError("Erro ao verificar seu cadastro.");
    }
}

async function handleNewCustomerRegistration(e) {
    e.preventDefault();
    if (!tempUserData) { showAssocError("Erro: Dados do usuário perdidos. Tente logar novamente."); return; }
    
    const whatsapp = regCustomerWhatsapp.value;
    const birthday = regCustomerBirthday.value;
    
    if (!whatsapp || !birthday) { 
        regErrorMsg.textContent = "Por favor, preencha todos os campos."; 
        regErrorMsg.style.display = 'block'; 
        return; 
    }
    
    regErrorMsg.style.display = 'none';
    const completeUserData = { ...tempUserData, whatsapp: whatsapp, nascimento: birthday };
    
    saveRegistrationBtn.disabled = true; saveRegistrationBtn.textContent = "Salvando...";
    
    try {
        await saveCustomerData(completeUserData);
        if(localCurrentClientUser) localCurrentClientUser.phone = whatsapp;
        showToast("Cadastro concluído com sucesso!", false);
        closeCustomerRegistrationModal(); 
        openAssociationModal(); 
        updateCustomerInfo(localCurrentClientUser, false); 
    } catch (error) {
        console.error("Erro ao salvar cadastro:", error);
        regErrorMsg.textContent = "Falha ao salvar cadastro. Tente novamente.";
        regErrorMsg.style.display = 'block';
    } finally {
        saveRegistrationBtn.disabled = false; saveRegistrationBtn.textContent = "Salvar e Continuar";
    }
}

async function saveCustomerData(userData) {
    const customerRef = doc(getCustomersCollectionRef(), userData.uid);
    const dataToSave = {
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.whatsapp,  
        birthday: userData.nascimento, 
        photoURL: userData.photoURL || null,
        points: 0,
        orderHistory: [],
        vouchersUsed: [],
        createdAt: serverTimestamp()
    };
    await setDoc(customerRef, dataToSave, { merge: true });
}

function updateCustomerInfo(user, isNew = false) {
    if (!loggedInStep || !loggedInUserName || !googleLoginBtn) return;
    if (user && !isNew) { 
        loggedInStep.style.display = 'block';
        loggedInUserName.textContent = user.displayName || user.email;
        googleLoginBtn.style.display = 'none'; 
    } else {
        loggedInStep.style.display = 'none';
        loggedInUserName.textContent = '';
        googleLoginBtn.style.display = 'flex'; 
    }
}

// ==================================================================
//               LÓGICA DE ATIVAÇÃO DE MESA (REABERTURA INTELIGENTE)
// ==================================================================

async function handleActivationAndSend(e) {
    if (e) e.preventDefault(); 
    const tableId = activateTableNumber.value.trim();
    
    if (!tableId) { 
        showAssocError("Por favor, informe o número da mesa."); 
        activateTableNumber.focus(); 
        return; 
    }
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

        // 1. Define a mesa localmente
        localCurrentTableId = tableId; 
        setCurrentTable(tableId, true, false); 

        const clientData = {
            uid: localCurrentClientUser.uid,
            name: localCurrentClientUser.displayName,
            phone: localCurrentClientUser.phone || null
        };

        // 2. Lógica de Criação / Atualização / Reabertura
        if (tableSnap.exists()) {
            const tableData = tableSnap.data();

            // A. Mesa Ocupada por Outro
            if (tableData.status !== 'closed' && tableData.clientId && tableData.clientId !== clientData.uid) {
                localCurrentTableId = null;
                setCurrentTable(null, true, false);
                throw new Error("Esta mesa está ocupada por outro cliente.");
            } 
            
            // B. Mesa Fechada -> REABERTURA (Arquiva e Reseta)
            else if (tableData.status === 'closed') {
                console.log(`Mesa ${tableId} estava fechada. Arquivando sessão anterior e reabrindo...`);
                
                const historyId = `${tableId}_closed_${Date.now()}`;
                const historyRef = doc(getTablesCollectionRef(), historyId);
                
                await setDoc(historyRef, tableData);

                const newSessionData = {
                    tableNumber: parseInt(tableId, 10),
                    diners: tableData.diners || 1, 
                    sector: tableData.sector || 'Salão', 
                    status: 'open',
                    createdAt: serverTimestamp(),
                    total: 0,
                    sentItems: [],
                    payments: [],
                    serviceTaxApplied: true,
                    selectedItems: [], 
                    requestedOrders: [],
                    clientId: clientData.uid,
                    clientName: clientData.name,
                    clientPhone: clientData.phone,
                    anonymousUid: null,
                    closedAt: null,
                    finalTotal: null
                };
                
                await setDoc(tableRef, newSessionData);
            }
            
            // C. Mesa Aberta pelo Próprio Cliente
            else {
                console.log(`Mesa ${tableId} encontrada e ativa. Atualizando dados...`);
                await updateDoc(tableRef, {
                    clientId: clientData.uid, 
                    clientName: clientData.name,
                    clientPhone: clientData.phone,
                    status: 'open'
                });
            }

        } else {
            // D. Mesa Nova (Nunca existiu)
            console.log(`Mesa ${tableId} não encontrada. Criando do zero...`);
            const newTableData = {
                tableNumber: parseInt(tableId, 10),
                diners: 1, 
                sector: 'Cliente',
                status: 'open',
                createdAt: serverTimestamp(),
                total: 0,
                sentItems: [],
                payments: [],
                serviceTaxApplied: true,
                selectedItems: [], 
                requestedOrders: [],
                clientId: clientData.uid,
                clientName: clientData.name,
                clientPhone: clientData.phone,
                anonymousUid: null
            };
            await setDoc(tableRef, newTableData);
        }

        // 3. Inicia Listener e Status KDS
        console.log("Mesa configurada. Iniciando listener...");
        setTableListener(tableId, true);
        startClientKdsListener(tableId); // <--- ATIVA O MONITORAMENTO DO KDS

        if (selectedItems.length > 0) {
            await sendOrderToFirebase(); 
        } else {
            if (clientTableNumber) clientTableNumber.textContent = `Mesa ${tableId}`;
            showToast(`Mesa ${tableId} aberta!`, false);
        }
        
        closeAssociationModal();

    } catch (error) {
        console.error("Erro ao ativar mesa:", error);
        showAssocError(error.message);
    } finally {
        if (activateAndSendBtn) {
            activateAndSendBtn.disabled = false;
            activateAndSendBtn.innerHTML = 'Enviar Pedido';
        }
    }
}

function showAssocError(message) {
    if (assocErrorMsg) { assocErrorMsg.textContent = message; assocErrorMsg.style.display = 'block'; }
}

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

async function sendOrderToFirebase() {
    const tableId = localCurrentTableId || currentTableId; 
    if (!tableId || selectedItems.length === 0) { alert("Nenhum item ou mesa selecionada."); return; }

    const orderId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const clientPhone = localCurrentClientUser?.phone || null;
    const clientName = localCurrentClientUser?.displayName || 'Cliente';
    const clientUid = localCurrentClientUser?.uid || 'N/A';

    const newOrderRequest = {
        orderId: orderId,
        requestedAt: new Date().toISOString(),
        clientInfo: { uid: clientUid, name: clientName, phone: clientPhone },
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
        renderClientOrderScreen(); 
        showToast("Pedido enviado! Um garçom irá confirmar em breve.");
    } catch (e) {
        console.error("Erro ao enviar pedido para o Firebase:", e);
        showToast("Falha ao enviar o pedido. Tente novamente.", true);
    }
}