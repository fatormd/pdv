import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, collection, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuração e Variáveis Globais ---
const appId = '1:1097659747429:web:8ec0a7c3978c311dbe0a8c';
const firebaseConfig = {
    apiKey: "AIzaSyCiquxozxlU2dmlNCCwUG1sjpZVzOuZd0M",
    authDomain: "fator-pdv.firebaseapp.com",
    projectId: "fator-pdv",
    storageBucket: "fator-pdv.firebasestorage.app",
    messagingSenderId: "1097659747429",
    appId: "1:1097659747429:web:8ec0a7c3978c311dbe0a8c",
    measurementId: "G-02QWNRXRCV"
};
const initialAuthToken = null;

let app, db, auth;
let userId = null;
let tablesData = [];
let currentOrder = null;
let itemToObserve = null;
let currentMode = 0;
let unsubscribeOrder = null;

let finalCharge = {
    subtotal: 0,
    taxRate: 0.10,
    serviceTaxApplied: true,
    total: 0,
    payments: []
};
let selectedPaymentMethod = 'Dinheiro';
let isAppLoading = true;
let isAuthReady = false;
let appErrorMessage = null;

const MENU_ITEMS = [
    { id: 'picanha', name: 'Picanha Grelhada', price: 79.90, category: 'main' },
    { id: 'salmao', name: 'Salmão com Ervas', price: 65.00, category: 'main' },
    { id: 'agua', name: 'Água Mineral', price: 5.00, category: 'drinks' },
    { id: 'cerveja', name: 'Cerveja Long Neck', price: 15.00, category: 'drinks' },
    { id: 'mousse', name: 'Mousse de Chocolate', price: 18.00, category: 'desserts' },
    { id: 'petit', name: 'Petit Gateau', price: 22.00, category: 'desserts' }
];

const GERENTE_SENHA = 'gerente2025';

// --- Funções Auxiliares de Cálculo ---
function calculateSubtotal(order) {
    let subtotal = 0;
    const allItems = [...(order.itemsOpen || []), ...(order.itemsSent || [])];
    allItems.forEach(item => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        subtotal += (price * quantity);
    });
    return subtotal;
}
function calculateTotal(subtotal, applyServiceTax, taxRate = 0.10) {
    const taxValue = applyServiceTax ? subtotal * taxRate : 0;
    return subtotal + taxValue;
}
function calculatePaidTotal() {
    return finalCharge.payments.reduce((sum, payment) => sum + payment.value, 0);
}

// --- Funções Auxiliares de UI ---
function displayMessage(message, type = 'info') {
    const messagesEl = document.getElementById('statusMessage');
    if (!messagesEl) return;
    messagesEl.textContent = message;
    messagesEl.classList.remove('hidden', 'text-red-500', 'text-green-500', 'text-indigo-500');
    if (type === 'error') {
        messagesEl.classList.add('text-red-500');
    } else if (type === 'success') {
        messagesEl.classList.add('text-green-500');
    } else {
        messagesEl.classList.add('text-indigo-500');
    }
    setTimeout(() => {
        messagesEl.classList.add('hidden');
    }, 4000);
}

// --- 1. Inicialização do Firebase e Autenticação ---
async function initializeFirebase() {
    const userIdDisplay = document.getElementById('user-id-display');
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("SUA_CHAVE_API_FIREBASE")) {
            throw new Error("Configuração do Firebase ausente ou com valores placeholder. Atualize o script.js.");
        }
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        await new Promise((resolve, reject) => {
            const authPromise = initialAuthToken ? signInWithCustomToken(auth, initialAuthToken) : signInAnonymously(auth);
            authPromise.then(() => {
                const unsubscribe = onAuthStateChanged(auth, (user) => {
                    if (user) {
                        userId = user.uid;
                        userIdDisplay.textContent = `Usuário ID: ${userId}`;
                        isAuthReady = true;
                        setupTableListener();
                    } else {
                        reject(new Error("Falha na autenticação do Firebase."));
                    }
                    unsubscribe();
                    resolve();
                });
            }).catch(reject);
        });
    } catch (error) {
        console.error("Erro na inicialização do Firebase:", error);
        appErrorMessage = `Falha ao conectar: ${error.message}`;
    } finally {
        isAppLoading = false;
        renderAppStatus();
    }
}
function renderAppStatus() {
    const mainContent = document.getElementById('mainContent');
    const statusScreen = document.getElementById('statusScreen');
    const statusContent = document.getElementById('statusContent');
    const userIdDisplay = document.getElementById('user-id-display');
    if (isAppLoading) {
        mainContent.classList.add('hidden');
        statusScreen.classList.remove('hidden');
        statusContent.innerHTML = `<div class="loading-spinner mb-4"></div><p class="text-lg font-medium text-gray-700">Iniciando sistema...</p><p class="text-sm text-gray-500 mt-1">Conectando ao Firebase e autenticando.</p>`;
    } else if (appErrorMessage || !isAuthReady) {
        mainContent.classList.add('hidden');
        statusScreen.classList.remove('hidden');
        statusContent.innerHTML = `<i class="fas fa-exclamation-triangle text-red-600 text-3xl mb-4"></i><h1 class="text-xl font-bold text-red-700">ERRO CRÍTICO</h1><p class="mt-2 text-center text-sm text-gray-600 max-w-sm">${appErrorMessage || 'Autenticação falhou ou as regras de segurança estão impedindo o acesso.'}</p><p class="mt-4 text-xs font-semibold text-red-500">Configuração: <span class="font-mono">${firebaseConfig && firebaseConfig.apiKey !== "SUA_CHAVE_API_FIREBASE" ? 'ENCONTRADA' : 'AUSENTE'}</span>.</p>`;
        userIdDisplay.textContent = `Usuário ID: FALHA`;
    } else {
        statusScreen.classList.add('hidden');
        mainContent.classList.remove('hidden');
        userIdDisplay.classList.remove('hidden');
    }
}

// --- Funções de Dados e Listener ---
function setupTableListener() {
    if (!db || !userId) return;
    const tablesColRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders',);
    onSnapshot(tablesColRef, (snapshot) => {
        tablesData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'Aberta') {
                const subtotal = calculateSubtotal(data);
                const total = calculateTotal(subtotal, data.serviceTaxApplied !== false);
                tablesData.push({ id: doc.id, ...data, total });
            }
        });
        renderOpenTables();
    }, (error) => {
        console.error("Erro no onSnapshot de Mesas:", error);
    });
}

function setupOrderListener(tableId) {
     if (unsubscribeOrder) unsubscribeOrder();
     if (!db || !tableId) return;
     const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', tableId);
     unsubscribeOrder = onSnapshot(docRef, (docSnap) => {
         if (docSnap.exists()) {
             currentOrder = { id: docSnap.id, ...docSnap.data() };
             if (currentOrder.status !== 'Aberta') {
                 showPanelScreen();
                 return;
             }
             renderOrderScreen();
         } else {
             showPanelScreen();
         }
     }, (error) => {
         console.error(`Erro no onSnapshot da comanda ${tableId}:`, error);
     });
}

// --- Funções de Renderização e UI ---
function showPanelScreen() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.transform = 'translateX(0)';
    currentMode = 0;
    if (unsubscribeOrder) unsubscribeOrder();
    currentOrder = null;
    renderOrderScreen();
}
function showOrderScreen(tableId) {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.transform = 'translateX(-100vw)';
    currentMode = 1;
    setupOrderListener(tableId);
}
function showPaymentScreen() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.transform = 'translateX(-200vw)';
    currentMode = 2;
    renderOrderScreen();
}
function renderOpenTables() {
    const openTablesCount = document.getElementById('openTablesCount');
    const openTablesList = document.getElementById('openTablesList');
    if(openTablesCount) openTablesCount.textContent = tablesData.length;
    if (!openTablesList) return;
    if (tablesData.length === 0) {
        openTablesList.innerHTML = `<div class="col-span-full text-sm text-gray-500 italic p-4 content-card bg-white">Nenhuma mesa aberta.</div>`;
        return;
    }
    openTablesList.innerHTML = tablesData.map(table => `
        <button class="table-card table-card-panel ${table.total > 0 ? 'bg-red-500 text-white' : 'bg-green-500 text-white'} p-3 content-card shadow-lg hover:opacity-90 transition duration-150" data-table-id="${table.id}">
            <div class="flex flex-col items-center">
                <p class="text-4xl font-extrabold mb-1">${table.tableNumber.replace('Mesa ', '')}</p>
                <p class="text-sm">${table.diners} Pessoas</p>
            </div>
            <div class="mt-2">
                <p class="text-base font-bold">R$ ${table.total.toFixed(2).replace('.', ',')}</p>
                <p class="text-xs opacity-80">${(table.itemsSent || []).length} Itens Enviados</p>
            </div>
        </button>
    `).join('');
    document.querySelectorAll('.table-card').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tableId = e.currentTarget.getAttribute('data-table-id');
            showOrderScreen(tableId);
        });
    });
}
function renderOrderScreen() {
    if (!currentOrder) return;
    const currentTableNumber = document.getElementById('current-table-number');
    const openOrderList = document.getElementById('openOrderList');
    const reviewItemsList = document.getElementById('reviewItemsList');
    const orderSubtotalDisplay = document.getElementById('orderSubtotalDisplay');
    const orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplay');
    const orderTotalDisplay = document.getElementById('orderTotalDisplay');
    const openItemsCount = document.getElementById('openItemsCount');
    if (currentTableNumber) currentTableNumber.textContent = currentOrder.tableNumber || `Mesa ${currentOrder.id.replace('MESA_', '')}`;
    if (!openOrderList || !reviewItemsList) return;
    const openItems = currentOrder.itemsOpen || [];
    const sentItems = currentOrder.itemsSent || [];
    const subtotal = calculateSubtotal(currentOrder);
    const serviceTaxApplied = currentOrder.serviceTaxApplied !== false;
    const taxValue = serviceTaxApplied ? subtotal * finalCharge.taxRate : 0;
    const total = subtotal + taxValue;
    if(orderSubtotalDisplay) orderSubtotalDisplay.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    if(orderServiceTaxDisplay) orderServiceTaxDisplay.textContent = `R$ ${taxValue.toFixed(2).replace('.', ',')}`;
    if(orderTotalDisplay) orderTotalDisplay.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    const paidTotal = calculatePaidTotal();
    let remaining = total - paidTotal;
    if (currentOrder.total !== total) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        updateDoc(docRef, { total: total, serviceTaxApplied: serviceTaxApplied }).catch(console.error);
    }
    if(openItemsCount) openItemsCount.textContent = openItems.length;
    const sendOrderButton = document.getElementById('sendOrderButton');
    if(sendOrderButton) sendOrderButton.disabled = openItems.length === 0;
    if (openItems.length > 0) {
        openOrderList.innerHTML = openItems.map(item => `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-indigo-100" data-item-id="${item.id}">
                <div class="flex flex-col w-3/4">
                    <span class="font-semibold text-base text-gray-800">${item.name || 'Item (Nome Ausente)'}</span>
                    <div class="flex items-center space-x-2 mt-1">
                        <button data-item-id="${item.id}" data-item-name="${item.name || 'Item (Nome Ausente)'}" data-obs="${item.observation || ''}" class="obs-btn text-sm ${item.observation ? 'text-green-600 font-bold' : 'text-indigo-600'} hover:text-indigo-800 transition py-2 px-1">
                            <i class="fas ${item.observation ? 'fa-check' : 'fa-edit'} mr-1"></i> ${item.observation ? 'Obs: ' + item.observation : 'Add Detalhes'}
                        </button>
                    </div>
                </div>
                <div class="flex items-center space-x-1 border border-gray-300 rounded-full p-1 bg-white">
                    <button data-item-id="${item.id}" data-action="decrease" class="qty-btn text-red-500 hover:bg-red-100 rounded-full flex items-center justify-center text-lg"><i class="fas fa-minus text-sm"></i></button>
                    <span class="font-bold text-base w-6 text-center">${item.quantity}</span>
                    <button data-item-id="${item.id}" data-action="increase" class="qty-btn text-green-500 hover:bg-green-100 rounded-full flex items-center justify-center text-lg"><i class="fas fa-plus text-sm"></i></button>
                </div>
            </div>
        `).join('');
    } else {
        openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
    }
    if (sentItems.length > 0) {
        reviewItemsList.innerHTML = sentItems.map(item => `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border-b border-gray-200">
                <div class="flex flex-col w-3/4">
                    <span class="font-semibold text-base text-gray-800">${item.quantity}x ${item.name}</span>
                    ${item.observation ? `<span class="text-xs text-green-600 italic">Obs: ${item.observation}</span>` : ''}
                </div>
                <div class="flex space-x-3">
                    <button data-item-id="${item.id}" data-action="remove-sent" class="remove-sent-btn text-red-500 hover:bg-red-100 p-2 rounded-full w-9 h-9" title="Excluir Item"><i class="fas fa-trash-alt text-base"></i></button>
                    <button data-item-id="${item.id}" data-action="transfer-sent" class="transfer-sent-btn text-indigo-500 hover:bg-indigo-100 p-2 rounded-full w-9 h-9" title="Transferir para outra mesa"><i class="fas fa-exchange-alt text-base"></i></button>
                </div>
            </div>
        `).join('');
        document.querySelectorAll('.remove-sent-btn').forEach(btn => {
            btn.addEventListener('click', () => removeSentItem(btn.getAttribute('data-item-id')));
        });
        document.querySelectorAll('.transfer-sent-btn').forEach(btn => {
            btn.addEventListener('click', () => transferSentItem(btn.getAttribute('data-item-id')));
        });
    } else {
        reviewItemsList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item enviado.</div>`;
    }
    const orderingInputs = document.getElementById('orderingInputs');
    const reviewDetailsContainer = document.getElementById('reviewDetailsContainer');
    if (currentMode === 1) {
        if(orderingInputs) orderingInputs.classList.remove('hidden');
        if(reviewDetailsContainer) reviewDetailsContainer.classList.add('hidden');
    } else if (currentMode === 2) {
        if(orderingInputs) orderingInputs.classList.add('hidden');
        if(reviewDetailsContainer) reviewDetailsContainer.classList.remove('hidden');
    }
    const orderSubtotalDisplayPayment = document.getElementById('orderSubtotalDisplayPayment');
    const orderServiceTaxDisplayPayment = document.getElementById('orderServiceTaxDisplayPayment');
    const orderTotalDisplayPayment = document.getElementById('orderTotalDisplayPayment');
    const paymentTableNumber = document.getElementById('payment-table-number');
    if (orderSubtotalDisplayPayment) orderSubtotalDisplayPayment.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    if (orderServiceTaxDisplayPayment) orderServiceTaxDisplayPayment.textContent = `R$ ${(total - subtotal).toFixed(2).replace('.', ',')}`;
    if (orderTotalDisplayPayment) orderTotalDisplayPayment.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (paymentTableNumber) paymentTableNumber.textContent = currentOrder.tableNumber || `Mesa ${currentOrder.id.replace('MESA_', '')}`;
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (menuItemsGrid) {
        searchProducts(); // Mostra produtos filtrados se houver busca ativa
    }
}
function renderMenu(category) {
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (!menuItemsGrid) return;
    const itemsToRender = category === 'all' ? MENU_ITEMS : MENU_ITEMS.filter(item => item.category === category);
    menuItemsGrid.innerHTML = itemsToRender.map(item => `
        <div class="menu-item content-card bg-white p-3 flex flex-col justify-between items-start text-left hover:shadow-lg transition duration-200"
                 data-item-id="${item.id}" data-item-name="${item.name}" data-price="${item.price}">
            <p class="font-semibold text-gray-800 text-base">${item.name}</p>
            <div class="flex items-center justify-between w-full mt-1">
                <p class="text-lg font-bold text-indigo-700">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                <button class="add-to-order-btn bg-green-500 text-white font-bold p-2 rounded-md hover:bg-green-600 transition"
                         data-item-id="${item.id}" data-item-name="${item.name}" data-price="${item.price}">
                    <i class="fas fa-plus text-sm"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Função única de busca de produtos ---
function searchProducts() {
    const searchInputEl = document.getElementById('searchProductInput');
    const searchValue = (searchInputEl ? searchInputEl.value : "").toLowerCase();
    const currentCategory = document.querySelector('.category-btn.bg-indigo-600')?.getAttribute('data-category') || 'all';
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (!menuItemsGrid) return;
    const itemsToFilter = currentCategory === 'all' ? MENU_ITEMS : MENU_ITEMS.filter(item => item.category === currentCategory);
    const filteredItems = itemsToFilter.filter(item =>
        item.name.toLowerCase().includes(searchValue)
    );
    menuItemsGrid.innerHTML = filteredItems.map(item => `
        <div class="menu-item content-card bg-white p-3 flex flex-col justify-between items-start text-left hover:shadow-lg transition duration-200"
                 data-item-id="${item.id}" data-item-name="${item.name}" data-price="${item.price}">
            <p class="font-semibold text-gray-800 text-base">${item.name}</p>
            <div class="flex items-center justify-between w-full mt-1">
                <p class="text-lg font-bold text-indigo-700">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                <button class="add-to-order-btn bg-green-500 text-white font-bold p-2 rounded-md hover:bg-green-600 transition"
                         data-item-id="${item.id}" data-item-name="${item.name}" data-price="${item.price}">
                    <i class="fas fa-plus text-sm"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// --- Funções de Manipulação de Dados (Criação/Atualização) ---
// ... (o resto do seu código segue igual, já que a duplicidade era só em searchProducts, e o restante já está correto!)

/* ... (demais funções: openTable, removeSentItem, transferSentItem, addItemToOrder, updateItemQuantity, sendOrderToProduction, openObservationModal, saveObservation, etc.) ... */

// No final:
function initializeListeners() {
    document.body.addEventListener('click', (e) => {
        // ... (event delegation para todos os botões, igual ao seu código anterior)
        const categoryBtn = e.target.closest('.category-btn');
        if (categoryBtn) {
            const category = categoryBtn.getAttribute('data-category');
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('bg-indigo-600', 'text-white', 'border-0');
                b.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');
            });
            categoryBtn.classList.add('bg-indigo-600', 'text-white');
            categoryBtn.classList.remove('bg-white', 'text-gray-700');
            renderMenu(category);
            searchProducts(); // <- chama sempre após trocar a categoria
            return;
        }
        // ... (restante dos listeners)
    });

    const searchProductInput = document.getElementById('searchProductInput');
    if (searchProductInput) {
        searchProductInput.addEventListener('input', searchProducts);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    initializeListeners();
});
