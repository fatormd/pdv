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

// --- Funções de UI e Renderização (Definidas no início para evitar erros de escopo) ---
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
    if(orderServiceTaxDisplay) orderServiceTaxDisplay.textContent = `R$ ${(total - subtotal).toFixed(2).replace('.', ',')}`;
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
        renderMenu(document.querySelector('.category-btn.bg-indigo-600')?.getAttribute('data-category') || 'all');
    }
}

function renderMenu(category) {
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    if (!menuItemsGrid) return;
    
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

function updateChargeModalUI() {
    finalCharge.subtotal = calculateSubtotal(currentOrder);
    finalCharge.serviceTaxApplied = currentOrder.serviceTaxApplied !== false;
    finalCharge.total = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
    const paidTotal = calculatePaidTotal();
    const remainingBalance = parseFloat((finalCharge.total - paidTotal).toFixed(2));
    
    const orderSubtotalDisplayPayment = document.getElementById('orderSubtotalDisplayPayment');
    const orderServiceTaxDisplayPayment = document.getElementById('orderServiceTaxDisplayPayment');
    const orderTotalDisplayPayment = document.getElementById('orderTotalDisplayPayment');
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

function openCalculator() {
    const paymentValueInput = document.getElementById('paymentValueInput');
    if (paymentValueInput) {
        const total = calculateTotal(finalCharge.subtotal, finalCharge.serviceTaxApplied, finalCharge.taxRate);
        paymentValueInput.value = total.toFixed(2);
    }
}

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

// --- Funções de Manipulação de Dados (Criação, Atualização, Exclusão) ---

/**
 * Salva as alterações do pedido atual no Firebase Firestore.
 */
async function saveOrderToFirebase() {
    if (!currentOrder || !db) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
    try {
        await setDoc(docRef, currentOrder);
        displayMessage('Pedido atualizado com sucesso!', 'success');
    } catch (e) {
        console.error("Erro ao salvar o pedido:", e);
        displayMessage('Erro ao salvar o pedido.', 'error');
    }
}

/**
 * Adiciona um item ao array de itens abertos do pedido.
 */
function addItemToOrder(itemId, itemName, price) {
    if (!currentOrder) {
        displayMessage("Nenhum pedido selecionado. Abra uma mesa primeiro.", "error");
        return;
    }

    const existingItem = currentOrder.itemsOpen.find(item => item.id === itemId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        currentOrder.itemsOpen.push({
            id: itemId,
            name: itemName,
            price: price,
            quantity: 1,
            addedBy: userId,
            timestamp: new Date().toISOString()
        });
    }

    saveOrderToFirebase();
}

/**
 * Atualiza a quantidade de um item no array de itens abertos.
 */
function updateItemQuantity(itemId, action) {
    const itemIndex = currentOrder.itemsOpen.findIndex(item => item.id === itemId);
    if (itemIndex > -1) {
        if (action === 'increase') {
            currentOrder.itemsOpen[itemIndex].quantity += 1;
        } else if (action === 'decrease') {
            currentOrder.itemsOpen[itemIndex].quantity -= 1;
            if (currentOrder.itemsOpen[itemIndex].quantity <= 0) {
                currentOrder.itemsOpen.splice(itemIndex, 1);
            }
        }
        saveOrderToFirebase();
    }
}

/**
 * Adiciona uma observação a um item aberto.
 */
function saveObservation() {
    if (!itemToObserve || !currentOrder) return;
    const obsInput = document.getElementById('obsInput');
    const item = currentOrder.itemsOpen.find(i => i.id === itemToObserve);
    if (item) {
        item.observation = obsInput.value.trim();
        saveOrderToFirebase();
        document.getElementById('obsModal').classList.add('hidden');
    }
}

/**
 * Move itens de 'itemsOpen' para 'itemsSent'.
 */
async function sendOrderToProduction() {
    if (!currentOrder || (currentOrder.itemsOpen || []).length === 0) {
        displayMessage("Não há itens para enviar.", "info");
        return;
    }
    
    // Concatena itens abertos com os já enviados.
    const updatedItemsSent = [...(currentOrder.itemsSent || []), ...currentOrder.itemsOpen];
    
    // Limpa o array de itens abertos.
    currentOrder.itemsOpen = [];
    currentOrder.itemsSent = updatedItemsSent;
    
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id);
    try {
        await updateDoc(docRef, {
            itemsOpen: [],
            itemsSent: updatedItemsSent,
            updatedAt: new Date().toISOString()
        });
        displayMessage("Pedido enviado para a produção!", "success");
    } catch (e) {
        console.error("Erro ao enviar pedido:", e);
        displayMessage("Erro ao enviar pedido.", "error");
    }
}

// ** FUNÇÃO ADICIONADA: removeSentItem **
/**
 * Remove um item do array de itens enviados. Requer senha de gerente.
 */
function removeSentItem(itemId) {
    if (!currentOrder) return;
    
    const senha = prompt("Insira a senha do gerente para confirmar a exclusão:");
    if (senha !== GERENTE_SENHA) {
        alert("Senha incorreta. Ação cancelada.");
        return;
    }
    
    const itemIndex = currentOrder.itemsSent.findIndex(item => item.id === itemId);
    if (itemIndex > -1) {
        const removedItem = currentOrder.itemsSent.splice(itemIndex, 1)[0];
        displayMessage(`Item "${removedItem.name}" removido.`, "success");
        saveOrderToFirebase();
    }
}

// ** FUNÇÃO ADICIONADA: transferSentItem **
/**
 * Transfere um item enviado para outra mesa.
 */
async function transferSentItem(itemId) {
    if (!currentOrder) return;
    
    const newTableNumber = prompt("Para qual número de mesa deseja transferir este item?");
    if (!newTableNumber || isNaN(parseInt(newTableNumber))) {
        alert("Número de mesa inválido. Ação cancelada.");
        return;
    }
    
    const newTableId = `MESA_${newTableNumber}`;
    const itemIndex = currentOrder.itemsSent.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
        displayMessage("Item não encontrado no pedido enviado.", "error");
        return;
    }
    
    const itemToTransfer = currentOrder.itemsSent[itemIndex];
    
    const newDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', newTableId);
    
    try {
        const newDocSnap = await getDoc(newDocRef);
        let newItemsOpen = [];
        let newItemsSent = [];

        if (newDocSnap.exists()) {
            const newTableData = newDocSnap.data();
            newItemsOpen = newTableData.itemsOpen || [];
            newItemsSent = newTableData.itemsSent || [];
        }

        // Remove o item da mesa atual
        currentOrder.itemsSent.splice(itemIndex, 1);
        
        // Adiciona o item na nova mesa
        newItemsOpen.push({
            ...itemToTransfer,
            timestamp: new Date().toISOString(),
            transferredFrom: currentOrder.id
        });

        // Salva as alterações nas duas mesas
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentOrder.id), {
            itemsSent: currentOrder.itemsSent
        });

        await setDoc(newDocRef, {
            id: newTableId,
            tableNumber: `Mesa ${newTableNumber}`,
            diners: 1, // Pode ajustar isso se necessário
            itemsOpen: newItemsOpen,
            itemsSent: newItemsSent,
            status: 'Aberta'
        }, { merge: true }); // O 'merge: true' é importante para não apagar dados existentes

        displayMessage(`Item transferido para a Mesa ${newTableNumber}!`, "success");
    } catch (e) {
        console.error("Erro ao transferir item:", e);
        displayMessage("Erro ao transferir item. Ação cancelada.", "error");
    }
}

// ... (Resto do seu código, não foi alterado)
