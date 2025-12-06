// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (CORRIGIDO: FILTROS E FALLBACK DE SETOR) ---

import { db, auth, getQuickObsCollectionRef, appId, getTablesCollectionRef, getTableDocRef, getCustomersCollectionRef, getKdsCollectionRef, getSectorsCollectionRef } from "/services/firebaseService.js";
import { formatCurrency, toggleLoading, showToast } from "/utils.js"; 
import { getProducts, getCategories, fetchWooCommerceProducts } from "/services/wooCommerceService.js";
import { onSnapshot, doc, updateDoc, arrayUnion, setDoc, getDoc, getDocs, query, serverTimestamp, orderBy, where, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- ESTADO GLOBAL ---
let selectedItems = []; 
let quickObsCache = []; 
let currentFilter = 'all'; 
const ESPERA_KEY = "(EM ESPERA)"; 
let orderControllerInitialized = false;
let localCurrentTableId = null;    
let localCurrentClientUser = null; 
let tempUserData = null;
let unsubscribeClientKds = null; 
let currentAssociationTab = 'mesa';
let restaurantNameCache = "Fator PDV"; 

// Caches
let sectorsCache = [];
let productExtensionsCache = {};

// --- MODO DEMO ---
let currentBusinessType = 'food'; 

const DEMO_DATA = {
    retail: {
        title: "Fator Shop",
        categories: [
            { id: 'roupas', name: 'Roupas', slug: 'roupas' },
            { id: 'acessorios', name: 'Acessórios', slug: 'acessorios' },
            { id: 'eletronicos', name: 'Eletrônicos', slug: 'eletronicos' }
        ],
        products: [
            { id: 'r1', name: 'Camiseta Básica', price: 49.90, image: 'https://placehold.co/600x400/222/fff?text=Camiseta', category: 'roupas' },
            { id: 'r2', name: 'Calça Jeans', price: 129.90, image: 'https://placehold.co/600x400/333/fff?text=Jeans', category: 'roupas' },
            { id: 'r4', name: 'Fone Bluetooth', price: 199.90, image: 'https://placehold.co/600x400/555/fff?text=Fone', category: 'eletronicos' }
        ]
    },
    services: {
        title: "Fator Serviços",
        categories: [
            { id: 'beleza', name: 'Beleza', slug: 'beleza' },
            { id: 'manutencao', name: 'Manutenção', slug: 'manutencao' }
        ],
        products: [
            { id: 's1', name: 'Corte de Cabelo', price: 45.00, image: 'https://placehold.co/600x400/333/fff?text=Corte', category: 'beleza' },
            { id: 's2', name: 'Manutenção Elétrica', price: 150.00, image: 'https://placehold.co/600x400/555/fff?text=Eletrica', category: 'manutencao' }
        ]
    }
};

let currentPage = 1;
let currentSearch = '';
let searchTimeout = null;
let loadMoreBtn;

// Elementos do DOM
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
let goToPaymentBtnClient; 
let kdsTrackingIconContainer, kdsTrackingIcon, kdsTrackingStatusEl;
let headerClientNameDisplay;
let businessTypeSelector;

// ==================================================================
//               1. INICIALIZAÇÃO
// ==================================================================

export const initClientOrderController = () => {
    if (orderControllerInitialized) return;
    console.log("[ClientOrder] Inicializando...");

    // Binding de Elementos
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
    goToPaymentBtnClient = document.getElementById('goToPaymentBtnClient'); 
    kdsTrackingIconContainer = document.getElementById('kdsTrackingIconContainer');
    kdsTrackingIcon = document.getElementById('kdsTrackingIcon');
    kdsTrackingStatusEl = document.getElementById('kdsTrackingStatus');
    headerClientNameDisplay = document.getElementById('headerClientNameDisplay');
    businessTypeSelector = document.getElementById('businessTypeSelector');

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

    // Configuração de Abas do Modal
    tabButtons = document.querySelectorAll('.assoc-tab-btn');
    tabContents = document.querySelectorAll('.assoc-tab-content');
    const defaultActionButtons = document.getElementById('defaultActionButtons');

    if (tabButtons) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active', 'border-brand-primary', 'text-brand-primary'));
                tabContents.forEach(content => content.style.display = 'none');
                button.classList.add('active', 'border-brand-primary', 'text-brand-primary');
                const tabName = button.dataset.tab;
                currentAssociationTab = tabName;
                const contentEl = document.getElementById(`content-${tabName}`);
                if(contentEl) {
                    contentEl.style.display = 'block';
                    if (tabName === 'mesa' || tabName === 'retirada') { if(defaultActionButtons) defaultActionButtons.style.display = 'flex'; }
                    else if (tabName === 'entrega') { if(defaultActionButtons) defaultActionButtons.style.display = 'none'; }
                }
            });
        });
    }

    if (btnCallMotoboy) btnCallMotoboy.addEventListener('click', handleCallMotoboy);

    if (businessTypeSelector) {
        businessTypeSelector.addEventListener('change', (e) => {
            currentBusinessType = e.target.value;
            currentFilter = 'all'; 
            updateRestaurantTitle(); 
            loadMenu(); 
        });
    }

    customerRegistrationModal = document.getElementById('customerRegistrationModal');
    customerRegistrationForm = document.getElementById('customerRegistrationForm');
    saveRegistrationBtn = document.getElementById('saveRegistrationBtn');
    regCustomerName = document.getElementById('regCustomerName');
    regCustomerEmail = document.getElementById('regCustomerEmail');
    regCustomerWhatsapp = document.getElementById('regCustomerWhatsapp');
    regCustomerBirthday = document.getElementById('regCustomerBirthday');
    regErrorMsg = document.getElementById('regErrorMsg');

    if(customerRegistrationForm) customerRegistrationForm.addEventListener('submit', handleNewCustomerRegistration);
    
    clientObsModal = document.getElementById('clientObsModal'); 
    clientObsText = document.getElementById('clientObsText'); 
    clientQuickObsButtons = document.getElementById('clientQuickObsButtons'); 
    clientConfirmObsBtn = document.getElementById('clientConfirmObsBtn');
    clientCancelObsBtn = document.getElementById('clientCancelObsBtn'); 

    if (clientObsModal) {
        if (clientQuickObsButtons) {
            clientQuickObsButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('.quick-obs-btn');
                if (btn && clientObsText) clientObsText.value = (clientObsText.value.trim() + (clientObsText.value ? ', ' : '') + btn.dataset.obs).trim();
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

                if (isEspera && !hasKey) newNote = newNote ? `${ESPERA_KEY} ${newNote}` : ESPERA_KEY;
                else if (!isEspera && hasKey) newNote = newNote.replace(regexEspera, '').trim().replace(/^,/, '').trim();
                
                let updated = false;
                const updatedItems = selectedItems.map(item => {
                    if (item.id == itemId && (item.note || '') === originalNoteKey) {
                        updated = true;
                        return { ...item, note: newNote };
                    }
                    return item;
                });
                
                selectedItems.length = 0; selectedItems.push(...updatedItems);
                clientObsModal.style.display = 'none';
                if (updated) renderClientOrderScreen();
            });
        }
        if (clientCancelObsBtn) {
            clientCancelObsBtn.addEventListener('click', () => { clientObsModal.style.display = 'none'; });
        }
    }

    if (sendOrderBtn) sendOrderBtn.onclick = handleSendOrderClick;
    if (authActionBtn) authActionBtn.onclick = handleAuthActionClick;
    if (googleLoginBtn) googleLoginBtn.onclick = signInWithGoogle;
    if (activationForm) activationForm.onsubmit = handleActivationAndSend;
    
    const cancelBtn = document.getElementById('cancelActivationBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeAssociationModal(); });

    if (clientMenuContainer) {
        clientMenuContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            const pid = card.dataset.productId;
            let product;
            if (currentBusinessType === 'food') {
                product = getProducts().find(p => p.id == pid);
            } else {
                product = DEMO_DATA[currentBusinessType].products.find(p => p.id == pid);
            }
            if (!product) return;
            if (e.target.closest('.info-item-btn')) openProductInfoModal(product);
            else addItemToCart(product);
        });
    }
    
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
             openClientObsModal(obsSpan.dataset.itemId, obsSpan.dataset.itemNoteKey);
         }
    });

    if (clientCategoryFilters) clientCategoryFilters.addEventListener('click', handleFilterClick);
    if (searchProductInputClient) searchProductInputClient.addEventListener('input', handleSearch);

    setupAuthStateObserver();
    fetchSectorsAndExtensions().then(() => loadMenu());
    fetchQuickObservations(); 
    fetchRestaurantInfo(); 
    
    if (localCurrentTableId || window.currentTableId) {
        startClientKdsListener(localCurrentTableId || window.currentTableId);
    }

    orderControllerInitialized = true;
    console.log("[ClientOrder] Inicializado.");
};

// --- FETCH DE DADOS (SETORES DE PRODUÇÃO) ---
async function fetchSectorsAndExtensions() {
    try {
        // Busca setores de PRODUÇÃO (ignora atendimento)
        const qSectors = query(getSectorsCollectionRef(), orderBy('name'));
        const snapSectors = await getDocs(qSectors);
        
        sectorsCache = snapSectors.docs
            .map(d => d.data())
            .filter(s => s.type !== 'atendimento' && s.type !== 'service') 
            .map(s => s.name); 

        // Se não houver setores configurados, usa padrões
        if (sectorsCache.length === 0) {
            sectorsCache = ['Cozinha', 'Bar', 'Churrasqueira'];
        }

        // Busca extensões de produtos
        const qProds = collection(db, 'artifacts', appId, 'public', 'data', 'products');
        const snapProds = await getDocs(qProds);
        
        productExtensionsCache = {};
        snapProds.forEach(doc => { productExtensionsCache[doc.id] = doc.data(); });
        
        console.log("[ClientOrder] Filtros de Produção:", sectorsCache);
    } catch (e) {
        console.error("[ClientOrder] Erro ao carregar dados:", e);
    }
}

// --- RENDERIZAÇÃO DO MENU ---
async function loadMenu() {
    showMenuSkeleton();
    currentPage = 1;
    if (currentBusinessType === 'food') {
        try {
            await fetchWooCommerceProducts(1, '', 'all', false);
        } catch (error) {
            console.error("Erro ao carregar menu:", error);
            showToast("Erro ao carregar cardápio.", true);
        }
    }
    renderMenu(false);
}

function renderMenu(append = false) { 
    if (!clientMenuContainer) return; 
    
    let filters = [], products = [];
    
    if (currentBusinessType === 'food') {
        filters = sectorsCache; // Usa setores como filtro
        products = getProducts();
    } else {
        filters = DEMO_DATA[currentBusinessType].categories.map(c => c.name);
        products = DEMO_DATA[currentBusinessType].products;
    }

    if (clientCategoryFilters && (clientCategoryFilters.innerHTML.trim() === '' || !append || currentBusinessType !== 'food')) { 
        let html = `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${currentFilter === 'all' ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600'}" data-filter="all">Todos</button>`;
        html += filters.map(item => { 
            const name = typeof item === 'string' ? item : item; 
            const isActive = name === currentFilter ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600'; 
            return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-filter="${name}">${name}</button>`; 
        }).join('');
        clientCategoryFilters.innerHTML = html;
    } 
    
    let filteredProducts = products; 
    
    if (currentFilter !== 'all') {
        if (currentBusinessType === 'food') {
            // Filtra por SETOR
            filteredProducts = products.filter(p => {
                const ext = productExtensionsCache[String(p.id)];
                
                // --- LÓGICA DE FALLBACK IMPORTANTE ---
                // Se o produto não tem setor definido (ext.sector undefined), assumimos que ele pertence
                // ao setor "padrão" (geralmente 'Cozinha'). Isso evita que produtos não configurados sumam.
                let prodSector = 'Cozinha';
                if (ext && ext.sector) {
                    prodSector = ext.sector;
                } else {
                    // Tenta adivinhar um setor padrão da lista se 'Cozinha' não existir
                    if (sectorsCache.length > 0 && !sectorsCache.includes('Cozinha')) {
                        prodSector = sectorsCache[0];
                    }
                }
                
                return prodSector === currentFilter;
            });
        } else {
            filteredProducts = products.filter(p => p.category === currentFilter || (p.categories && p.categories.some(c => c.slug === currentFilter)));
        }
    }

    if (currentSearch) {
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(currentSearch.toLowerCase()));
    }

    if (!append) clientMenuContainer.innerHTML = ''; 
    
    if (filteredProducts.length === 0) { 
        clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado neste setor.</div>`; 
    } else { 
        const html = filteredProducts.map((product, index) => { 
            let badge = '';
            if (index < 2 && currentFilter === 'all') badge = `<i class="fas fa-fire text-orange-500 absolute top-2 right-2 text-xl drop-shadow-md animate-pulse"></i>`;
            
            let imgSrc = product.image;
            if(productExtensionsCache[String(product.id)]?.localImage) imgSrc = productExtensionsCache[String(product.id)].localImage;
            
            return `
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden relative group" data-product-id="${product.id}">
                ${badge}
                <div class="w-full h-32 overflow-hidden">
                    <img src="${imgSrc}" alt="${product.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
                </div>
                <div class="p-3 flex flex-col flex-grow">
                    <h4 class="font-semibold text-sm md:text-base text-white mb-1 leading-tight min-h-[2.5rem] line-clamp-2">${product.name}</h4>
                    <div class="flex justify-between items-end mt-auto">
                        <span class="font-bold text-lg text-brand-primary">${formatCurrency(product.price)}</span>
                        <button class="add-item-btn bg-brand-primary text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-brand-primary-dark transition shadow-lg pointer-events-none">
                            <i class="fas fa-plus text-sm"></i>
                        </button>
                    </div>
                </div>
            </div>`; 
        }).join(''); 
        
        if (append) { 
            if (loadMoreBtn) loadMoreBtn.remove(); 
            clientMenuContainer.insertAdjacentHTML('beforeend', html); 
        } else { 
            clientMenuContainer.innerHTML = html; 
        } 
    } 
    if (currentBusinessType === 'food') renderLoadMoreButton(); 
}

function renderLoadMoreButton() {
    if (loadMoreBtn) loadMoreBtn.remove(); 
    loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'col-span-full py-3 mt-4 bg-gray-800 text-gray-400 rounded-lg font-bold text-sm hover:bg-gray-700 transition';
    loadMoreBtn.innerText = 'Carregar mais produtos'; 
    loadMoreBtn.onclick = handleLoadMore; 
    clientMenuContainer.appendChild(loadMoreBtn);
}

const handleFilterClick = async (e) => {
    const btn = e.target.closest('.category-btn'); if (!btn) return;
    currentFilter = btn.dataset.filter; 
    currentPage = 1; 
    showMenuSkeleton();
    if (currentBusinessType === 'food') {
        await fetchWooCommerceProducts(1, currentSearch, 'all', false); 
    }
    renderMenu(false);
};

const handleSearch = (e) => {
    currentSearch = e.target.value; 
    currentPage = 1; 
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => { 
        showMenuSkeleton(); 
        if (currentBusinessType === 'food') {
            await fetchWooCommerceProducts(1, currentSearch, 'all', false); 
        }
        renderMenu(false); 
    }, 600);
};

const handleLoadMore = async () => {
    currentPage++; 
    toggleLoading(loadMoreBtn, true, 'Carregando...');
    if (currentBusinessType === 'food') {
        const newItems = await fetchWooCommerceProducts(currentPage, currentSearch, 'all', true);
        if (newItems.length === 0) { 
            showToast("Fim da lista.", false); 
            loadMoreBtn.style.display = 'none'; 
        } else { 
            renderMenu(true); 
        }
    }
};

// ... (Demais funções mantidas)
async function handleSendOrderClick() { const tableId = localCurrentTableId || window.currentTableId; if (!selectedItems || selectedItems.length === 0) { showToast("Carrinho vazio.", true); return; } if (!tableId) openAssociationModal(); else await sendOrderToFirebase(); }
function handleAuthActionClick() { if (localCurrentClientUser) { if(confirm("Deseja realmente sair?")) { signOut(auth).then(() => { showToast("Saiu."); window.location.reload(); }); } } else openAssociationModal(); }
async function signInWithGoogle(e) { if(e) e.preventDefault(); try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { console.error(error); showAssocError("Erro login."); } }
async function handleActivationAndSend(e) { if (e) e.preventDefault(); let identifier = '', isPickup = false; if (currentAssociationTab === 'mesa') { identifier = activateTableNumber.value.trim(); if (!identifier) return showAssocError("Informe a mesa."); } else if (currentAssociationTab === 'retirada') { identifier = activatePickupPin.value.trim(); if (!identifier) return showAssocError("Informe o PIN."); isPickup = true; } if (!localCurrentClientUser) return showAssocError("Faça login."); toggleLoading(activateAndSendBtn, true); try { const tableDocId = isPickup ? `pickup_${identifier}` : identifier; const tableRef = getTableDocRef(tableDocId); const tableSnap = await getDoc(tableRef); localCurrentTableId = tableDocId; if(window.setCurrentTable) window.setCurrentTable(tableDocId, true, false); const cData = { uid: localCurrentClientUser.uid, name: localCurrentClientUser.displayName, phone: localCurrentClientUser.phone }; if (tableSnap.exists()) { const t = tableSnap.data(); if (t.status !== 'closed' && t.clientId && t.clientId !== cData.uid) throw new Error("Mesa ocupada."); if (t.status === 'closed') { await setDoc(doc(getTablesCollectionRef(), `${tableDocId}_closed_${Date.now()}`), t); await setDoc(tableRef, { tableNumber: isPickup?identifier:parseInt(identifier), status:'open', sector:isPickup?'Retirada':(t.sector||'Salão'), isPickup, createdAt:serverTimestamp(), total:0, sentItems:[], selectedItems:[], requestedOrders:[], clientId:cData.uid, clientName:cData.name }); } else if (!t.clientId) await updateDoc(tableRef, { clientId:cData.uid, clientName:cData.name }); } else { await setDoc(tableRef, { tableNumber: isPickup?identifier:parseInt(identifier), status:'open', sector:isPickup?'Retirada':'Cliente', isPickup, createdAt:serverTimestamp(), total:0, sentItems:[], selectedItems:[], requestedOrders:[], clientId:cData.uid, clientName:cData.name }); } if(window.setTableListener) window.setTableListener(tableDocId, true); startClientKdsListener(tableDocId); if(selectedItems.length > 0) await sendOrderToFirebase(); closeAssociationModal(); showToast("Vinculado!", false); if(clientTableNumber) clientTableNumber.textContent = isPickup ? `PIN: ${identifier}` : `Mesa ${identifier}`; } catch(e) { console.error(e); showAssocError(e.message); } finally { toggleLoading(activateAndSendBtn, false, 'Confirmar'); } }
const handleCallMotoboy = () => { if (!localCurrentClientUser) return showAssocError("Faça login."); alert("Em breve."); };
async function handleNewCustomerRegistration(e) { e.preventDefault(); if(!tempUserData) return; if(!regCustomerWhatsapp.value) return; try { await saveCustomerData({...tempUserData, whatsapp:regCustomerWhatsapp.value, nascimento:regCustomerBirthday.value}); closeCustomerRegistrationModal(); openAssociationModal(); } catch(e){console.error(e);} }
export const renderClientOrderScreen = () => { if (clientCartCount) { const count = selectedItems.length; clientCartCount.textContent = count; clientCartCount.style.display = count > 0 ? 'flex' : 'none'; } _renderClientCart(); };
function addItemToCart(product) { if (!product || !product.id) return; const ext = productExtensionsCache[String(product.id)]; const sector = ext ? ext.sector : (currentBusinessType === 'food' ? 'Cozinha' : 'Balcão'); selectedItems.push({ id: product.id, name: product.name, price: product.price, sector: sector, category: product.category, note: '' }); renderClientOrderScreen(); showToast("Adicionado!", false); openClientObsModal(product.id, ''); }
function _renderClientCart() { const list = document.getElementById('client-cart-items-list'); if(!list) return; if(selectedItems.length === 0) list.innerHTML = `<div class="text-sm italic text-gray-500 p-2">Vazio.</div>`; else { const grp = selectedItems.reduce((a,i)=>{ const k=`${i.id}-${i.note||''}`; if(!a[k]) a[k]={...i, count:0}; a[k].count++; return a;}, {}); list.innerHTML = Object.values(grp).map(g => `<div class="flex justify-between items-center bg-dark-input p-3 rounded shadow-sm"><div class="flex flex-col mr-2"><span class="font-bold text-white">${g.name} (${g.count}x)</span><span class="text-xs text-gray-400 obs-span cursor-pointer" data-item-id="${g.id}" data-item-note-key="${g.note||''}">${g.note ? `(${g.note})` : 'Adicionar Obs.'}</span></div><div class="flex space-x-2"><button class="qty-btn bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center" data-action="decrease" data-item-id="${g.id}" data-item-note-key="${g.note||''}"><i class="fas fa-minus text-xs"></i></button><button class="qty-btn bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center" data-action="increase" data-item-id="${g.id}" data-item-note-key="${g.note||''}"><i class="fas fa-plus text-xs"></i></button></div></div>`).join(''); } }
function startClientKdsListener(tableId) { if (unsubscribeClientKds) unsubscribeClientKds(); unsubscribeClientKds = onSnapshot(getTableDocRef(tableId), (docSnap) => { if (!docSnap.exists() || docSnap.data().status === 'closed') { showToast("Conta encerrada.", false); localCurrentTableId = null; window.currentTableId = null; if(clientTableNumber) clientTableNumber.textContent = restaurantNameCache; selectedItems = []; renderClientOrderScreen(); openAssociationModal(); return; } if (kdsTrackingStatusEl) { const d = docSnap.data(); if (d.clientOrderPending) { kdsTrackingStatusEl.textContent = "Enviado"; kdsTrackingStatusEl.className = "text-yellow-400 text-xs font-bold"; } else if (d.sentItems?.length > 0) { kdsTrackingStatusEl.textContent = "Preparando"; kdsTrackingStatusEl.className = "text-green-400 text-xs font-bold"; } else { kdsTrackingStatusEl.textContent = "Pedir"; kdsTrackingStatusEl.className = "text-gray-400 text-xs"; } } }); }
function showMenuSkeleton() { if(clientMenuContainer) clientMenuContainer.innerHTML = '<div class="col-span-full py-10 flex justify-center"><i class="fas fa-spinner fa-spin text-3xl text-gray-600"></i></div>'; }
function showAssocError(msg) { if(assocErrorMsg) { assocErrorMsg.textContent = msg; assocErrorMsg.style.display = 'block'; } }
function openAssociationModal() { if(associationModal) { if(assocErrorMsg) assocErrorMsg.style.display='none'; associationModal.style.display = 'flex'; } }
function closeAssociationModal() { if(associationModal) associationModal.style.display = 'none'; }
function openProductInfoModal(p) { if(!p) return; document.getElementById('infoProductName').textContent = p.name; document.getElementById('infoProductPrice').textContent = formatCurrency(p.price); document.getElementById('infoProductDescription').textContent = p.description || 'Sem descrição'; document.getElementById('infoProductImage').src = p.image || 'https://placehold.co/400'; document.getElementById('productInfoModal').style.display='flex'; document.getElementById('infoProductAddBtn').onclick=()=>{addItemToCart(p);document.getElementById('productInfoModal').style.display='none';}; }
function increaseCartItemQuantity(id, note) { const item = selectedItems.findLast(i=>i.id==id && (i.note||'')===note); if(item) { selectedItems.push({...item}); renderClientOrderScreen(); } }
function decreaseCartItemQuantity(id, note) { const idx = selectedItems.findIndex(i=>i.id==id && (i.note||'')===note); if(idx>-1) { selectedItems.splice(idx,1); renderClientOrderScreen(); } }
async function sendOrderToFirebase() { const tId = localCurrentTableId; if(!tId) return; toggleLoading(sendOrderBtn,true); try { await updateDoc(getTableDocRef(tId), { requestedOrders: arrayUnion({ orderId: `req_${Date.now()}`, requestedAt: new Date().toISOString(), clientInfo: { name: localCurrentClientUser?.displayName||'Cliente' }, items: selectedItems }), clientOrderPending: true }); selectedItems=[]; renderClientOrderScreen(); showToast("Enviado!",false); } catch(e){console.error(e);showToast("Erro envio",true);} finally{toggleLoading(sendOrderBtn,false,'ENVIAR');} }
function fetchRestaurantInfo() { if(currentBusinessType!=='food') return; getDoc(doc(db,'artifacts',appId,'public','data','settings','store_info')).then(s=>{ if(s.exists()){ const n = s.data().name; restaurantNameCache=n; if(document.getElementById('restaurantTitle')) document.getElementById('restaurantTitle').textContent=n; if(clientTableNumber && !localCurrentTableId) clientTableNumber.textContent=n; } }); }
function fetchQuickObservations() { const q=query(getQuickObsCollectionRef(),orderBy('text')); getDocs(q).then(s=>{ if(clientQuickObsButtons) clientQuickObsButtons.innerHTML = s.docs.map(d=>`<button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input rounded-full hover:bg-gray-600" data-obs="${d.data().text}">${d.data().text}</button>`).join(''); }); }
function setupAuthStateObserver() { onAuthStateChanged(auth, u=>{ if(u && !u.isAnonymous) { localCurrentClientUser=u; updateAuthUI(u); restoreActiveSession(u); } else { localCurrentClientUser=null; updateAuthUI(null); if(!window.currentTableId) openAssociationModal(); } }); }
function updateAuthUI(u) { if(!goToPaymentBtnClient) return; if(u) { goToPaymentBtnClient.innerHTML='<i class="fas fa-receipt"></i>'; goToPaymentBtnClient.onclick=()=>window.goToScreen('clientPaymentScreen'); } else { goToPaymentBtnClient.innerHTML='<i class="fas fa-user"></i>'; goToPaymentBtnClient.onclick=signInWithGoogle; } }
async function restoreActiveSession(u) { const q=query(getTablesCollectionRef(),where('clientId','==',u.uid),where('status','==','open')); const s=await getDocs(q); if(!s.empty) { const id=s.docs[0].id; localCurrentTableId=id; if(clientTableNumber) clientTableNumber.textContent=`Mesa ${id}`; startClientKdsListener(id); closeAssociationModal(); } }
async function saveCustomerData(d) { await setDoc(doc(getCustomersCollectionRef(),d.uid), d, {merge:true}); }