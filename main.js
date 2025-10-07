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
let currentMode = 0; // 0 = Painel de Mesas, 1 = Pedido, 2 = Pagamento
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

// --- Funções Auxiliares de UI (Movidas para o Escopo Global) ---
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

// --- Funções de Navegação de Telas ---
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

// --- Funções de Renderização e Lógica da UI ---

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
    
    // NOVO: Chama o renderMenu com o filtro de busca aplicado
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (menuItemsGrid) {
        renderMenu(document.querySelector('.category-btn.bg-indigo-600')?.getAttribute('data-category') || 'all');
    }
}

function renderMenu(category) {
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (!menuItemsGrid) return;
    
    // Obtém o valor atual da busca
    const searchInputEl = document.getElementById('searchProductInput');
    const searchValue = (searchInputEl ? searchInputEl.value : "").toLowerCase();

    const itemsToRender = category === 'all' ? MENU_ITEMS : MENU_ITEMS.filter(item => item.category === category);

    const filteredItems = itemsToRender.filter(item => 
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

function searchTable() {
    const searchInput = document.getElementById('searchTableInput');
    const mesaNumber = searchInput.value.trim();
    if (mesaNumber) {
        const tableId = `MESA_${mesaNumber}`;
        const existingTable = tablesData.find(table => table.id === tableId);
        if (existingTable) {
            showOrderScreen(tableId);
        } else {
            alert(`A Mesa ${mesaNumber} não está aberta.`);
        }
    }
}

// --- Funções de Manipulação de Dados (Criação/Atualização) ---
async function openTable() {
    const mesaInput = document.getElementById('mesaInput');
    const pessoasInput = document.getElementById('pessoasInput');
    const mesaNumber = mesaInput.value.trim();
    const pessoasCount = parseInt(pessoasInput.value);
    if (!mesaNumber || pessoasCount < 1) {
        alert("Por favor, preenra o número da mesa e a quantidade de pessoas.");
        return;
    }
    const tableId = `MESA_${mesaNumber}`;
    const tableNumberDisplay = `Mesa ${mesaNumber}`;
    const newOrder = {
        tableNumber: tableNumberDisplay,
        diners: pessoasCount,
        itemsOpen: [],
        itemsSent: [],
        status: 'Aberta',
        serviceTaxApplied: true,
        payments: [],
        total: 0,
        createdAt: new Date().toISOString(),
        createdBy: userId
    };
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', tableId);
        await setDoc(docRef, newOrder);
        mesaInput.value = '';
        pessoasInput.value = '';
        showOrderScreen(tableId);
    } catch (e) {
        alert(`Erro ao abrir mesa: ${e.message}`);
        console.error("Erro ao abrir mesa: ", e);
    }
}
async function removeSentItem(itemId) {
    if (!currentOrder || !currentOrder.id) return;
    const senha = prompt("Insira a senha do gerente para confirmar:");
    if (senha !== GERENTE_SENHA) {
        alert("Senha incorreta. Ação cancelada.");
        return;
    }
    const itemsSent = (currentOrder.itemsSent || []).filter(item => item.id !== itemId);
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, { itemsSent: itemsSent });
        displayMessage('Item removido do histórico com sucesso.', 'success');
    } catch (e) {
        console.error("Erro ao remover item enviado:", e);
        alert(`Erro ao remover item: ${e.message}`);
    }
}
window.removeSentItem = removeSentItem;
async function transferSentItem(itemId) {
    if (!currentOrder || !currentOrder.id) return;
    const senha = prompt("Insira a senha do gerente para confirmar:");
    if (senha !== GERENTE_SENHA) {
        alert("Senha incorreta. Ação cancelada.");
        return;
    }
    const targetTableNumber = prompt("Para qual número de mesa você deseja transferir este item?");
    if (!targetTableNumber || isNaN(parseInt(targetTableNumber))) {
        alert("Número de mesa inválido.");
        return;
    }
    const targetTableId = `MESA_${targetTableNumber}`;
    const targetDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', targetTableId);
    const itemToTransfer = (currentOrder.itemsSent || []).find(item => item.id === itemId);
    if (!itemToTransfer) {
        alert("Item não encontrado para transferência.");
        return;
    }
    const newItemsSent = (currentOrder.itemsSent || []).filter(item => item.id !== itemId);
    const originDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
    try {
        await updateDoc(originDocRef, { itemsSent: newItemsSent });
        const targetDocSnap = await getDoc(targetDocRef);
        let targetItemsSent = [];
        if (targetDocSnap.exists()) {
            targetItemsSent = targetDocSnap.data().itemsSent || [];
        } else {
            alert(`A mesa ${targetTableNumber} não está aberta.`);
            await updateDoc(originDocRef, { itemsSent: currentOrder.itemsSent });
            return;
        }
        const newTargetItemsSent = [...targetItemsSent, itemToTransfer];
        await updateDoc(targetDocRef, { itemsSent: newTargetItemsSent, lastUpdate: new Date().toISOString() });
        displayMessage(`Item ${itemToTransfer.name} transferido para a Mesa ${targetTableNumber}.`, 'success');
    } catch (e) {
        console.error("Erro ao transferir item:", e);
        alert(`Erro ao transferir item: ${e.message}`);
    }
}
window.transferSentItem = transferSentItem;

async function addItemToOrder(itemId, itemName, price) {
    if (!currentOrder) return;
    const itemIndex = currentOrder.itemsOpen.findIndex(item => item.id === itemId);
    const openItems = [...(currentOrder.itemsOpen || [])];
    if (itemIndex > -1) {
        openItems[itemIndex].quantity += 1;
    } else {
        openItems.push({
            id: itemId,
            name: itemName,
            price: price,
            quantity: 1,
            observation: ''
        });
    }
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, { itemsOpen: openItems });
    } catch (e) {
        console.error("Erro ao adicionar item:", e);
        alert(`Erro ao adicionar item: ${e.message}`);
    }
}
async function updateItemQuantity(itemId, action) {
    if (!currentOrder) return;
    const openItems = [...(currentOrder.itemsOpen || [])];
    const itemIndex = openItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;
    if (action === 'increase') {
        openItems[itemIndex].quantity += 1;
    } else if (action === 'decrease') {
        openItems[itemIndex].quantity -= 1;
        if (openItems[itemIndex].quantity <= 0) {
            openItems.splice(itemIndex, 1);
        }
    }
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, { itemsOpen: openItems });
    } catch (e) {
        console.error("Erro ao atualizar quantidade:", e);
        alert(`Erro ao atualizar quantidade: ${e.message}`);
    }
}
async function sendOrderToProduction() {
    if (!currentOrder || currentOrder.itemsOpen.length === 0) return;
    const itemsToSend = currentOrder.itemsOpen.map(item => ({
        ...item,
        status: 'Enviado',
        sentAt: new Date().toISOString()
    }));
    const newItemsSent = [...(currentOrder.itemsSent || []), ...itemsToSend];
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, {
            itemsSent: newItemsSent,
            itemsOpen: [],
            lastSent: new Date().toISOString()
        });
        displayMessage('Pedido enviado para a produção!', 'success');
    } catch (e) {
        alert(`Erro ao enviar pedido: ${e.message}`);
        console.error("Erro ao enviar pedido: ", e);
    }
}

// --- Funções da Modal de Observação ---
function openObservationModal(itemId, itemName, existingObs) {
    const obsModal = document.getElementById('obsModal');
    if (!obsModal) return;
    
    itemToObserve = itemId;
    document.getElementById('obsItemName').textContent = itemName;
    document.getElementById('obsInput').value = existingObs;
    obsModal.classList.remove('hidden');
}
async function saveObservation() {
    if (!currentOrder || !itemToObserve) return;
    const obsInput = document.getElementById('obsInput').value.trim();
    const openItems = [...(currentOrder.itemsOpen || [])];
    const itemIndex = openItems.findIndex(item => item.id === itemToObserve);
    if (itemIndex > -1) {
        openItems[itemIndex].observation = obsInput;
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
            await updateDoc(docRef, { itemsOpen: openItems });
            document.getElementById('obsModal').classList.add('hidden');
            itemToObserve = null;
        } catch (e) {
            console.error("Erro ao salvar observação:", e);
            alert(`Erro ao salvar observação: ${e.message}`);
        }
    }
}
async function handleCloseTable(taxId, paidTotal, totalDue, change) {
    if (!currentOrder) return;
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        
        await updateDoc(docRef, {
            status: 'Fechada',
            payments: finalCharge.payments,
            totalPaid: paidTotal,
            totalDue: totalDue,
            change: change,
            taxId: taxId || null,
            serviceTaxApplied: finalCharge.serviceTaxApplied,
            closedAt: new Date().toISOString()
        });
        
        displayMessage('Conta finalizada com sucesso!', 'success');
        document.getElementById('confirmCloseModal').classList.add('hidden');
        showPanelScreen();
        
    } catch (e) {
        alert(`Erro ao finalizar pedido: ${e.message}`);
        console.error("Erro ao finalizar pedido: ", e);
    }
}

function updateChargeModalUI() {
    finalCharge.subtotal = calculateSubtotal(currentOrder);
    finalCharge.serviceTaxApplied = currentOrder.serviceTaxApplied !== false;
    finalCharge.total = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
    const paidTotal = calculatePaidTotal();
    const remainingBalance = parseFloat((finalCharge.total - paidTotal).toFixed(2));
    
    const orderSubtotalDisplayPayment = document.getElementById('orderSubtotalDisplayPayment');
    const orderServiceTaxDisplayPayment = document.getElementById('orderServiceTaxDisplayPayment');
    const orderTotalDisplayPayment = document.getElementById('orderTotalDisplayPayment');
    const remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    const serviceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    const paymentSummaryList = document.getElementById('paymentSummaryList');

    if (orderSubtotalDisplayPayment) orderSubtotalDisplayPayment.textContent = `R$ ${finalCharge.subtotal.toFixed(2).replace('.', ',')}`;
    if (orderServiceTaxDisplayPayment) orderServiceTaxDisplayPayment.textContent = `R$ ${(finalCharge.total - finalCharge.subtotal).toFixed(2).replace('.', ',')}`;
    if (orderTotalDisplayPayment) orderTotalDisplayPayment.textContent = `R$ ${finalCharge.total.toFixed(2).replace('.', ',')}`;
    
    if (serviceTaxBtn) {
        serviceTaxBtn.textContent = finalCharge.serviceTaxApplied ? 'Aplicado' : 'Removido';
        serviceTaxBtn.classList.toggle('bg-green-500', finalCharge.serviceTaxApplied);
        serviceTaxBtn.classList.toggle('bg-red-500', !finalCharge.serviceTaxApplied);
        serviceTaxBtn.classList.toggle('hover:bg-green-600', finalCharge.serviceTaxApplied);
        serviceTaxBtn.classList.toggle('hover:bg-red-600', !finalCharge.serviceTaxApplied);
    }
    
    if (paymentSummaryList) {
        let paymentsHtml = '';
        if (finalCharge.payments.length > 0) {
            paymentsHtml = finalCharge.payments.map((p, index) => `
                <div class="flex justify-between items-center py-1">
                    <span class="font-medium">${p.method}</span>
                    <span class="font-bold text-gray-800">R$ ${p.value.toFixed(2).replace('.', ',')}</span>
                    <button data-payment-index="${index}" class="remove-payment-btn text-red-500 hover:text-red-700 text-sm" title="Remover Pagamento">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }
        
        paymentsHtml += `
            <div class="flex justify-between items-center py-1 font-bold border-t border-gray-200 mt-2 pt-2">
                <span>VALOR RESTANTE:</span>
                <span class="text-red-600">${remainingBalance > 0 ? `R$ ${remainingBalance.toFixed(2).replace('.', ',')}` : 'R$ 0,00'}</span>
            </div>
        `;
        
        paymentSummaryList.innerHTML = paymentsHtml;
        
        document.querySelectorAll('.remove-payment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => removePayment(parseInt(e.currentTarget.getAttribute('data-payment-index'))));
        });
    }

    if(finalizeOrderBtn) {
        finalizeOrderBtn.disabled = remainingBalance > 0.01;
        if (!finalizeOrderBtn.disabled) {
            finalizeOrderBtn.classList.replace('bg-red-600', 'bg-green-600');
            finalizeOrderBtn.classList.replace('hover:bg-red-700', 'hover:bg-green-700');
        } else {
            finalizeOrderBtn.classList.replace('bg-green-600', 'bg-red-600');
            finalizeOrderBtn.classList.replace('hover:bg-green-700', 'hover:bg-red-700');
        }
    }
    
    const paymentValueInput = document.getElementById('paymentValueInput');
    if (paymentValueInput) paymentValueInput.value = Math.max(0, remainingBalance).toFixed(2);
}

async function toggleServiceTax() {
    if (!currentOrder) return;
    const newServiceTaxState = !currentOrder.serviceTaxApplied;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
    try {
        await updateDoc(docRef, { serviceTaxApplied: newServiceTaxState });
    } catch (e) {
        console.error("Erro ao alternar a taxa de serviço:", e);
        alert(`Erro ao alternar a taxa de serviço: ${e.message}`);
    }
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        if (btn.getAttribute('data-method') === method) {
            btn.classList.add('active', 'bg-indigo-600', 'text-white');
            btn.classList.remove('bg-gray-200', 'text-gray-700');
        } else {
            btn.classList.remove('active', 'bg-indigo-600', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-700');
        }
    });
}

function addPayment() {
    const valueInput = document.getElementById('paymentValueInput');
    const paymentValue = parseFloat(valueInput.value);

    if (isNaN(paymentValue) || paymentValue <= 0) {
        alert("Insira um valor de pagamento válido.");
        return;
    }
    
    const totalDue = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
    const paidTotal = calculatePaidTotal();
    const remainingBefore = parseFloat((totalDue - paidTotal).toFixed(2));
    
    if (paymentValue > remainingBefore + 0.01 && remainingBefore > 0.01) {
        if (!confirm(`O valor de R$ ${paymentValue.toFixed(2).replace('.', ',')} é maior que o saldo de R$ ${remainingBefore.toFixed(2).replace('.', ',')}. Deseja registrar este valor e dar troco?`)) {
            return;
        }
    }

    finalCharge.payments.push({
        method: selectedPaymentMethod,
        value: paymentValue,
        timestamp: new Date().toISOString()
    });
    
    valueInput.value = '';
    updateChargeModalUI();
}

function removePayment(index) {
    if (!confirm('Deseja realmente remover este pagamento?')) {
        return;
    }
    
    const senha = prompt("Insira a senha do gerente para confirmar a remoção:");
    if (senha !== GERENTE_SENHA) {
        alert("Senha incorreta. Ação cancelada.");
        return;
    }

    if (index >= 0 && index < finalCharge.payments.length) {
        finalCharge.payments.splice(index, 1);
        updateChargeModalUI();
    }
}

async function finalizeOrder() {
    if (!currentOrder) return;
    const totalDue = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
    const paidTotal = calculatePaidTotal();
    let remainingBalance = parseFloat((totalDue - paidTotal).toFixed(2));
    if (remainingBalance > 0.01) {
        alert("O saldo devedor ainda é maior que zero. Registre mais pagamentos.");
        return;
    }
    const change = parseFloat((paidTotal - totalDue).toFixed(2));
    if (change > 0.01) {
        if (!confirm(`Troco a ser dado: R$ ${change.toFixed(2).replace('.', ',')}. Deseja finalizar a conta?`)) {
            return;
        }
    }
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, {
            status: 'Fechada',
            payments: finalCharge.payments,
            totalPaid: paidTotal,
            totalDue: totalDue,
            change: change,
            serviceTaxApplied: finalCharge.serviceTaxApplied,
            closedAt: new Date().toISOString()
        });
        document.getElementById('confirmCloseModal').classList.add('hidden');
        showPanelScreen();
    } catch (e) {
        alert(`Erro ao finalizar pedido: ${e.message}`);
        console.error("Erro ao finalizar pedido: ", e);
    }
}

function openCalculator() {
    const paymentValueInput = document.getElementById('paymentValueInput');
    if (paymentValueInput) {
        const total = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
        paymentValueInput.value = total.toFixed(2);
    }
}

// A função searchProducts foi embutida em renderMenu para eliminar a duplicidade
// e evitar conflitos de escopo.

// --- Funções de Manipulação de Dados (Criação/Atualização) ---

async function addItemToOrder(itemId, itemName, price) {
    if (!currentOrder) return;
    const itemIndex = currentOrder.itemsOpen.findIndex(item => item.id === itemId);
    const openItems = [...(currentOrder.itemsOpen || [])];
    if (itemIndex > -1) {
        openItems[itemIndex].quantity += 1;
    } else {
        openItems.push({
            id: itemId,
            name: itemName,
            price: price,
            quantity: 1,
            observation: ''
        });
    }
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, { itemsOpen: openItems });
    } catch (e) {
        console.error("Erro ao adicionar item:", e);
        alert(`Erro ao adicionar item: ${e.message}`);
    }
}
async function updateItemQuantity(itemId, action) {
    if (!currentOrder) return;
    const openItems = [...(currentOrder.itemsOpen || [])];
    const itemIndex = openItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;
    if (action === 'increase') {
        openItems[itemIndex].quantity += 1;
    } else if (action === 'decrease') {
        openItems[itemIndex].quantity -= 1;
        if (openItems[itemIndex].quantity <= 0) {
            openItems.splice(itemIndex, 1);
        }
    }
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, { itemsOpen: openItems });
    } catch (e) {
        console.error("Erro ao atualizar quantidade:", e);
        alert(`Erro ao atualizar quantidade: ${e.message}`);
    }
}
async function sendOrderToProduction() {
    if (!currentOrder || currentOrder.itemsOpen.length === 0) return;
    const itemsToSend = currentOrder.itemsOpen.map(item => ({
        ...item,
        status: 'Enviado',
        sentAt: new Date().toISOString()
    }));
    const newItemsSent = [...(currentOrder.itemsSent || []), ...itemsToSend];
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
        await updateDoc(docRef, {
            itemsSent: newItemsSent,
            itemsOpen: [],
            lastSent: new Date().toISOString()
        });
        displayMessage('Pedido enviado para a produção!', 'success');
    } catch (e) {
        alert(`Erro ao enviar pedido: ${e.message}`);
        console.error("Erro ao enviar pedido: ", e);
    }
}
// --- Funções da Modal de Observação ---
function openObservationModal(itemId, itemName, existingObs) {
    const obsModal = document.getElementById('obsModal');
    if (!obsModal) return;
    
    itemToObserve = itemId;
    document.getElementById('obsItemName').textContent = itemName;
    document.getElementById('obsInput').value = existingObs;
    obsModal.classList.remove('hidden');
}
async function saveObservation() {
    if (!currentOrder || !itemToObserve) return;
    const obsInput = document.getElementById('obsInput').value.trim();
    const openItems = [...(currentOrder.itemsOpen || [])];
    const itemIndex = openItems.findIndex(item => item.id === itemToObserve);
    if (itemIndex > -1) {
        openItems[itemIndex].observation = obsInput;
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
            await updateDoc(docRef, { itemsOpen: openItems });
            document.getElementById('obsModal').classList.add('hidden');
            itemToObserve = null;
        } catch (e) {
            console.error("Erro ao salvar observação:", e);
            alert(`Erro ao salvar observação: ${e.message}`);
        }
    }
}


function initializeListeners() {
    document.body.addEventListener('click', (e) => {
        // --- Lógica do Botão Adicionar Item (Ícone +) ---
        const addButton = e.target.closest('.add-to-order-btn');
        if (addButton) {
            const card = addButton.closest('.menu-item');
            addItemToOrder(
                card.getAttribute('data-item-id'),
                card.getAttribute('data-item-name'),
                parseFloat(card.getAttribute('data-price'))
            );
            return;
        }
        
        const qtyButton = e.target.closest('.qty-btn');
        if (qtyButton) {
            const itemId = qtyButton.getAttribute('data-item-id');
            const action = qtyButton.getAttribute('data-action');
            if (action === 'increase' || action === 'decrease') {
                updateItemQuantity(itemId, action);
            }
            return;
        }
        const obsButton = e.target.closest('.obs-btn');
        if (obsButton) {
            const card = obsButton.closest('div[data-item-id]');
            const itemId = card.getAttribute('data-item-id');
            const itemName = obsButton.getAttribute('data-item-name');
            const currentObs = obsButton.getAttribute('data-obs');
            openObservationModal(itemId, itemName, currentObs);
            return;
        }
        const searchTableBtn = document.getElementById('searchTableBtn');
        if (searchTableBtn && e.target.closest('#searchTableBtn')) {
            searchTable();
            return;
        }
        const abrirMesaBtn = document.getElementById('abrirMesaBtn');
        if(abrirMesaBtn && e.target.closest('#abrirMesaBtn')) {
            openTable();
            return;
        }
        const backToPanelFromOrderBtn = document.getElementById('backToPanelFromOrderBtn');
        if(backToPanelFromOrderBtn && e.target.closest('#backToPanelFromOrderBtn')) {
            showPanelScreen();
            return;
        }
        
        // --- Lógica do Botão Ir para Pagamento (Ícone de Moeda) ---
        const goToPaymentBtn = document.getElementById('goToPaymentBtn');
        if (goToPaymentBtn && e.target.closest('#goToPaymentBtn')) {
            if (currentOrder && currentOrder.itemsSent.length > 0) {
                 finalCharge.subtotal = calculateSubtotal(currentOrder);
                finalCharge.serviceTaxApplied = currentOrder.serviceTaxApplied !== false;
                finalCharge.payments = currentOrder.payments || [];
                updateChargeModalUI();
                showPaymentScreen();
            } else {
                alert("Nenhum item enviado para a produção. Envie o pedido antes de ir para o pagamento.");
            }
            return;
        }
        
        const backToOrderFromPaymentBtn = document.getElementById('backToOrderFromPaymentBtn');
        if(backToOrderFromPaymentBtn && e.target.closest('#backToOrderFromPaymentBtn')) {
            showOrderScreen(currentOrder.id);
            return;
        }

        const cancelObsBtn = document.getElementById('cancelObsBtn');
        if (cancelObsBtn && e.target.closest('#cancelObsBtn')) {
            document.getElementById('obsModal').classList.add('hidden');
            return;
        }
        const saveObsBtn = document.getElementById('saveObsBtn');
        if (saveObsBtn && e.target.closest('#saveObsBtn')) {
            saveObservation();
            return;
        }
        const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
        if (finalizeOrderBtn && e.target.closest('#finalizeOrderBtn')) {
            const totalDue = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
            const paidTotal = calculatePaidTotal();
            let remainingBalance = parseFloat((totalDue - paidTotal).toFixed(2));
            if (remainingBalance <= 0.01) {
                const confirmModal = document.getElementById('confirmCloseModal');
                document.getElementById('chargePaidDisplay').textContent = `R$ ${paidTotal.toFixed(2).replace('.', ',')}`;
                confirmModal.classList.remove('hidden');
            } else {
                alert("O saldo devedor ainda é maior que zero. Registre mais pagamentos.");
            }
            return;
        }
        const closeTableOnlyBtn = document.getElementById('closeTableOnlyBtn');
        if(closeTableOnlyBtn && e.target.closest('#closeTableOnlyBtn')) {
            handleCloseTable(null, calculatePaidTotal(), finalCharge.total, calculatePaidTotal() - finalCharge.total);
            document.getElementById('confirmCloseModal').classList.add('hidden');
            return;
        }
        const confirmCloseOrderBtn = document.getElementById('confirmCloseOrderBtn');
        if(confirmCloseOrderBtn && e.target.closest('#confirmCloseOrderBtn')) {
            const taxId = document.getElementById('taxIdInput').value.trim();
            handleCloseTable(taxId, calculatePaidTotal(), finalCharge.total, calculatePaidTotal() - finalCharge.total);
            document.getElementById('confirmCloseModal').classList.add('hidden');
            return;
        }
        const toggleServiceTaxBtn = e.target.closest('#toggleServiceTaxBtn');
        if (toggleServiceTaxBtn) {
            toggleServiceTax();
            return;
        }
        const addPaymentBtn = e.target.closest('#addPaymentBtn');
        if (addPaymentBtn) {
            addPayment();
            return;
        }
        const paymentMethodButtons = e.target.closest('#paymentMethodButtons');
        if (paymentMethodButtons && e.target.closest('.payment-method-btn')) {
            const btn = e.target.closest('.payment-method-btn');
            const method = btn.getAttribute('data-method');
            selectPaymentMethod(method);
            return;
        }
        const categoryBtn = e.target.closest('.category-btn');
        if (categoryBtn) {
            const category = categoryBtn.getAttribute('data-category');
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('bg-indigo-600', 'text-white', 'border-0');
                b.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');
            });
            categoryBtn.classList.add('bg-indigo-600', 'text-white');
            categoryBtn.classList.remove('bg-white', 'text-gray-700');
            renderMenu(category); // Renderiza o menu da nova categoria com o filtro de busca aplicado
            return;
        }
        
        const sendOrderButton = e.target.closest('#sendOrderButton');
        if (sendOrderButton) {
            sendOrderToProduction();
            return;
        }
        
        const openCalculatorBtn = e.target.closest('#openCalculatorBtn');
        if (openCalculatorBtn) {
            openCalculator();
            return;
        }
    });

    const searchProductInput = document.getElementById('searchProductInput');
    if (searchProductInput) {
        // O evento de 'input' chama renderMenu, que já contém a lógica de filtragem
        searchProductInput.addEventListener('input', () => {
             // Obtém a categoria atualmente selecionada ou usa 'all' como padrão
            const currentCategory = document.querySelector('.category-btn.bg-indigo-600')?.getAttribute('data-category') || 'all';
            renderMenu(currentCategory);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    initializeListeners();
});
