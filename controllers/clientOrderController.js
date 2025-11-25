// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS ---
// VERSÃO FINAL - RETIRADA, MESA E ENTREGA (MOTOCA)

import { db, auth, getQuickObsCollectionRef, appId, getTablesCollectionRef, getTableDocRef, getCustomersCollectionRef, getKdsCollectionRef } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
import { getProducts, getCategories, fetchWooCommerceCategories, fetchWooCommerceProducts } from "/services/wooCommerceService.js";
import { onSnapshot, doc, updateDoc, arrayUnion, setDoc, getDoc, getDocs, query, serverTimestamp, orderBy, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importa funções globais
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
let unsubscribeClientKds = null; 
let currentAssociationTab = 'mesa'; // 'mesa', 'retirada' ou 'entrega'

// Elementos
let clientMenuContainer, clientCategoryFilters, sendOrderBtn, clientCartCount;
let associationModal, activateAndSendBtn, googleLoginBtn, activationForm;
let activateTableNumber, activatePickupPin, btnCallMotoboy;
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

    // Mapeamento
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
    activatePickupPin = document.getElementById('activatePickupPin');
    btnCallMotoboy = document.getElementById('btnCallMotoboy');

    // Lógica de Abas do Modal de Associação
    tabButtons = document.querySelectorAll('.assoc-tab-btn');
    tabContents = document.querySelectorAll('.assoc-tab-content');
    const defaultActionButtons = document.getElementById('defaultActionButtons');

    if (tabButtons) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove ativo de todos
                tabButtons.forEach(btn => btn.classList.remove('active', 'border-brand-primary', 'text-brand-primary'));
                tabContents.forEach(content => content.style.display = 'none');
                
                // Ativa o clicado
                button.classList.add('active', 'border-brand-primary', 'text-brand-primary');
                const tabName = button.dataset.tab;
                currentAssociationTab = tabName;
                
                const contentEl = document.getElementById(`content-${tabName}`);
                if(contentEl) {
                    contentEl.style.display = 'block';
                    // Foca no input correto e ajusta botões
                    if (tabName === 'mesa') { 
                        if(activateTableNumber) activateTableNumber.focus(); 
                        if(defaultActionButtons) defaultActionButtons.style.display = 'flex';
                    }
                    else if (tabName === 'retirada') { 
                        if(activatePickupPin) activatePickupPin.focus(); 
                        if(defaultActionButtons) defaultActionButtons.style.display = 'flex';
                    }
                    else if (tabName === 'entrega') {
                        // Na entrega, o botão "Chamar Motoca" é a ação, então escondemos o "Confirmar" padrão
                        if(defaultActionButtons) defaultActionButtons.style.display = 'none';
                    }
                }
            });
        });
    }

    if (btnCallMotoboy) btnCallMotoboy.addEventListener('click', handleCallMotoboy);

    // Cadastro de Cliente
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

    // Event Delegation para o Menu
    if (clientMenuContainer) {
        clientMenuContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
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
    
    if (localCurrentTableId || currentTableId) {
        startClientKdsListener(localCurrentTableId || currentTableId);
    }

    orderControllerInitialized = true;
    console.log("[ClientOrder] Inicializado.");
};

// --- FUNÇÃO MOTOCA ---
const handleCallMotoboy = () => {
    if (!localCurrentClientUser) {
        showAssocError("Faça login para chamar o entregador.");
        return;
    }
    // Placeholder para redirecionamento futuro
    alert("Redirecionando para o sistema de entregas... (Em Breve)");
    // window.location.href = "URL_DO_PROJETO_MOTOCA";
};

// --- STATUS KDS ---
const startClientKdsListener = (tableId) => {
    if (unsubscribeClientKds) unsubscribeClientKds();
    if (!tableId) return;

    let queryVal = tableId;
    if (!isNaN(tableId) && !tableId.toString().startsWith('pickup_')) {
        queryVal = parseInt(tableId);
    }

    const q = query(
        getKdsCollectionRef(), 
        where('tableNumber', '==', queryVal),
        where('status', 'in', ['pending', 'preparing', 'ready'])
    );

    unsubscribeClientKds = onSnapshot(q, (snapshot) => {
        const orders = snapshot.docs.map(d => d.data());
        updateClientStatusUI(orders);
    });
};

const updateClientStatusUI = (orders) => {
    let statusBar = document.getElementById('clientKdsStatusBar');
    if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.id = 'clientKdsStatusBar';
        document.body.prepend(statusBar);
        setTimeout(() => statusBar.classList.remove('translate-y-[-100%]'), 100);
    }

    if (orders.length === 0) {
        statusBar.style.display = 'none';
        return;
    }

    statusBar.style.display = 'flex';
    
    const hasReady = orders.some(o => o.status === 'ready');
    const hasPreparing = orders.some(o => o.status === 'preparing');
    
    let statusText = '';
    let iconClass = '';
    let bgClass = '';
    
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

    statusBar.className = `fixed top-0 left-0 right-0 p-3 z-[60] shadow-lg flex justify-between items-center transform transition-transform duration-300 ${bgClass}`;
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
             closeAssociationModal();
             closeCustomerRegistrationModal();
        } else {
            localCurrentClientUser = null;
            tempUserData = null;
            updateAuthUI(null);
            updateCustomerInfo(null, false);
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
        console.error("Erro menu:", error);
        if (statusScreen) statusScreen.innerHTML = '<p class="text-red-400 p-4 text-center">Erro ao carregar cardápio.</p>';
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

    if (currentCategoryFilter !== 'all') {
        if (currentCategoryFilter === 'top10') {
             const top10Ids = JSON.parse(localStorage.getItem('top10_products') || '[]');
             filteredProducts = filteredProducts.filter(p => top10Ids.includes(p.id.toString()));
             filteredProducts.sort((a, b) => top10Ids.indexOf(a.id.toString()) - top10Ids.indexOf(b.id.toString()));
        } else {
             filteredProducts = products.filter(p => p.category === currentCategoryFilter);
        }
    }

    let searchTerm = '';
    if (searchProductInputClient) searchTerm = searchProductInputClient.value.trim().toLowerCase();
    if (searchTerm) filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(searchTerm));
    
    if (filteredProducts.length === 0) {
        clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        clientMenuContainer.innerHTML = filteredProducts.map((product, index) => {
            let badge = '';
            if (currentCategoryFilter === 'top10' && index < 3) {
                const colors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];
                badge = `<i class="fas fa-medal ${colors[index]} absolute top-2 right-2 text-xl drop-shadow-md"></i>`;
            }

            return `
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden relative" data-product-id="${product.id}">
                ${badge}
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
        `}).join('');
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
    const nameEl = document.getElementById('infoProductName');
    const priceEl = document.getElementById('infoProductPrice');
    const descEl = document.getElementById('infoProductDescription');
    const addBtn = document.getElementById('infoProductAddBtn');
    
    if (!modal) return;

    img.src = product.image || 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto';
    nameEl.textContent = product.name;
    priceEl.textContent = formatCurrency(product.price);
    descEl.innerHTML = product.description || 'Sem descrição.';
    
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
    
    if (!clientObsModal || !product || !esperaSwitch) return;

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
            if (isEspera) noteHtml = `<span class="text-yellow-400 font-semibold">${ESPERA_KEY}</span>`;
            if (displayNote) noteHtml += ` <span class="text-brand-primary">(${displayNote})</span>`;
            if (!noteHtml) noteHtml = `(Adicionar Obs.)`;
            
            return `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-white">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-gray-400 hover:text-white obs-span" 
                          data-item-id="${group.id}" data-item-note-key="${note}">
                        ${noteHtml}
                    </span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="decrease"><i class="fas fa-minus"></i></button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="increase"><i class="fas fa-plus"></i></button>
                </div>
            </div>
        `}).join('');
    }
}

export function renderClientOrderScreen(tableData) {
    if (clientCartCount) clientCartCount.textContent = selectedItems.length;
    
    if (sendOrderBtn) {
        const billRequested = tableData?.waiterNotification?.includes('fechamento') || tableData?.billRequested === true;
        if (billRequested) {
            sendOrderBtn.disabled = true;
            sendOrderBtn.innerHTML = '<i class="fas fa-hourglass-half"></i>';
            sendOrderBtn.classList.add('opacity-50');
        } else {
            sendOrderBtn.disabled = selectedItems.length === 0;
            sendOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
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
    tabContents.forEach(content => { content.style.display = 'none'; content.classList.remove('active'); });
    tabButtons.forEach(button => { button.classList.remove('active'); });
    const activeContent = document.getElementById(`tab-content-${tabName}`);
    const activeButton = document.querySelector(`.client-tab-btn[data-tab="${tabName}"]`);
    if (activeContent) { activeContent.style.display = 'block'; activeContent.classList.add('active'); }
    if (activeButton) { activeButton.classList.add('active'); }
}

function openAssociationModal() {
    if (associationModal) {
        if(assocErrorMsg) assocErrorMsg.style.display = 'none';
        associationModal.style.display = 'flex';
        
        // Default tab MESA
        document.querySelectorAll('.assoc-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.assoc-tab-content').forEach(c => c.style.display = 'none');
        
        const mesaTab = document.querySelector('.assoc-tab-btn[data-tab="mesa"]');
        const mesaContent = document.getElementById('content-mesa');
        
        if(mesaTab) mesaTab.classList.add('active');
        if(mesaContent) mesaContent.style.display = 'block';
        currentAssociationTab = 'mesa';
        
        if (activateTableNumber) activateTableNumber.focus();
        
        // Mostra o botão de confirmação por padrão (Mesa)
        const defaultActionButtons = document.getElementById('defaultActionButtons');
        if (defaultActionButtons) defaultActionButtons.style.display = 'flex';
    }
}

function closeAssociationModal() { if (associationModal) associationModal.style.display = 'none'; }

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
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Erro Login:", error); showAssocError("Erro ao tentar logar."); }
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
        console.error("Erro check customer:", error);
        showAssocError("Erro ao verificar cadastro.");
    }
}

async function handleNewCustomerRegistration(e) {
    e.preventDefault();
    if (!tempUserData) { showAssocError("Erro: Dados perdidos. Logue novamente."); return; }
    
    const whatsapp = regCustomerWhatsapp.value;
    const birthday = regCustomerBirthday.value;
    
    if (!whatsapp || !birthday) { regErrorMsg.textContent = "Preencha todos os campos."; regErrorMsg.style.display = 'block'; return; }
    regErrorMsg.style.display = 'none';
    
    const completeUserData = { ...tempUserData, whatsapp: whatsapp, nascimento: birthday };
    saveRegistrationBtn.disabled = true; saveRegistrationBtn.textContent = "Salvando...";
    
    try {
        await saveCustomerData(completeUserData);
        if(localCurrentClientUser) localCurrentClientUser.phone = whatsapp;
        showToast("Cadastro concluído!", false);
        closeCustomerRegistrationModal(); 
        openAssociationModal(); 
        updateCustomerInfo(localCurrentClientUser, false); 
    } catch (error) {
        console.error("Erro salvar:", error);
        regErrorMsg.textContent = "Falha ao salvar.";
        regErrorMsg.style.display = 'block';
    } finally {
        saveRegistrationBtn.disabled = false; saveRegistrationBtn.textContent = "Salvar e Continuar";
    }
}

async function saveCustomerData(userData) {
    const customerRef = doc(getCustomersCollectionRef(), userData.uid);
    await setDoc(customerRef, {
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.whatsapp,  
        birthday: userData.nascimento, 
        photoURL: userData.photoURL || null,
        points: 0,
        createdAt: serverTimestamp()
    }, { merge: true });
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

// --- ATIVAÇÃO DE MESA / RETIRADA ---
async function handleActivationAndSend(e) {
    if (e) e.preventDefault();
    
    let identifier = '';
    let isPickup = false;

    if (currentAssociationTab === 'mesa') {
        identifier = activateTableNumber.value.trim();
        if (!identifier) { showAssocError("Informe o número da mesa."); return; }
    } else if (currentAssociationTab === 'retirada') {
        identifier = activatePickupPin.value.trim();
        if (!identifier || identifier.length < 4) { showAssocError("PIN inválido (min 4 dígitos)."); return; }
        isPickup = true;
    }

    if (!localCurrentClientUser) { showAssocError("Faça login para continuar."); return; }

    activateAndSendBtn.disabled = true; activateAndSendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    assocErrorMsg.style.display = 'none';

    try {
        // Se for retirada, usa prefixo. Se for mesa, usa número direto.
        const tableDocId = isPickup ? `pickup_${identifier}` : identifier;
        const tableRef = getTableDocRef(tableDocId);
        const tableSnap = await getDoc(tableRef);

        localCurrentTableId = tableDocId;
        setCurrentTable(tableDocId, true, false);

        const clientData = {
            uid: localCurrentClientUser.uid,
            name: localCurrentClientUser.displayName,
            phone: localCurrentClientUser.phone || null
        };

        if (tableSnap.exists()) {
            const tData = tableSnap.data();
            
            // Bloqueio se ocupada por outro
            if (tData.status !== 'closed' && tData.clientId && tData.clientId !== clientData.uid) {
                throw new Error("Esta mesa/PIN está em uso por outro cliente.");
            }
            
            // Reabertura inteligente
            if (tData.status === 'closed') {
                console.log(`Reabrindo ${tableDocId}...`);
                const historyRef = doc(getTablesCollectionRef(), `${tableDocId}_closed_${Date.now()}`);
                await setDoc(historyRef, tData); 
                
                // Reseta
                await setDoc(tableRef, {
                    tableNumber: isPickup ? identifier : parseInt(identifier),
                    status: 'open',
                    sector: isPickup ? 'Retirada' : (tData.sector || 'Salão'),
                    isPickup: isPickup,
                    createdAt: serverTimestamp(),
                    total: 0,
                    sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [], requestedOrders: [],
                    clientId: clientData.uid, clientName: clientData.name, clientPhone: clientData.phone,
                    anonymousUid: null
                });
            } else {
                // Atualiza dono se estava livre
                if (!tData.clientId) {
                    await updateDoc(tableRef, { clientId: clientData.uid, clientName: clientData.name, clientPhone: clientData.phone });
                }
            }
        } else {
            // Criação de nova mesa/retirada
            if (!isPickup && !confirm(`Mesa ${identifier} não existe. Abrir nova?`)) throw new Error("Ação cancelada.");
            
            await setDoc(tableRef, {
                tableNumber: isPickup ? identifier : parseInt(identifier), // PIN vira o número para retirada
                status: 'open',
                sector: isPickup ? 'Retirada' : 'Cliente',
                isPickup: isPickup,
                createdAt: serverTimestamp(),
                total: 0,
                sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [], requestedOrders: [],
                clientId: clientData.uid, clientName: clientData.name, clientPhone: clientData.phone,
                anonymousUid: null
            });
        }

        // Inicia Listeners
        setTableListener(tableDocId, true);
        startClientKdsListener(tableDocId);

        if (selectedItems.length > 0) await sendOrderToFirebase();
        
        closeAssociationModal();
        showToast(isPickup ? `Retirada #${identifier} iniciada!` : `Mesa ${identifier} vinculada!`);

    } catch (error) {
        console.error(error);
        showAssocError(error.message);
    } finally {
        activateAndSendBtn.disabled = false; activateAndSendBtn.innerHTML = 'Confirmar';
    }
}

function showAssocError(message) { if (assocErrorMsg) { assocErrorMsg.textContent = message; assocErrorMsg.style.display = 'block'; } }

function renderClientQuickObsButtons(observations) {
    if (!clientQuickObsButtons) return;
    if (observations.length === 0) { clientQuickObsButtons.innerHTML = '<p class="text-xs italic">Nenhuma obs.</p>'; return; }
    clientQuickObsButtons.innerHTML = observations.map(obs => `<button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input rounded-full hover:bg-gray-600" data-obs="${obs.text}">${obs.text}</button>`).join('');
}

export const fetchQuickObservations = async () => {
    try {
        if (quickObsCache.length > 0) { renderClientQuickObsButtons(quickObsCache); return quickObsCache; }
        const q = query(getQuickObsCollectionRef(), orderBy('text', 'asc'));
        const snap = await getDocs(q);
        quickObsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderClientQuickObsButtons(quickObsCache);
    } catch (e) { console.error(e); }
};

async function sendOrderToFirebase() {
    const tableId = localCurrentTableId || currentTableId; 
    if (!tableId || selectedItems.length === 0) { alert("Vazio."); return; }

    const orderId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newOrderRequest = {
        orderId: orderId,
        requestedAt: new Date().toISOString(),
        clientInfo: { uid: localCurrentClientUser?.uid, name: localCurrentClientUser?.displayName, phone: localCurrentClientUser?.phone },
        items: selectedItems.map(item => ({ ...item })) 
    };

    try {
        const tableRef = getTableDocRef(tableId); 
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(newOrderRequest),
            clientOrderPending: true,
            waiterNotification: "Novo Pedido"
        });
        selectedItems.length = 0;
        renderClientOrderScreen(); 
        showToast("Pedido enviado!");
    } catch (e) {
        console.error("Erro envio:", e);
        showToast("Falha ao enviar.", true);
    }
}