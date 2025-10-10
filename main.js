// ----------------------------------------------------------------------
// IMPORTAÇÕES FIREBASE (Simulação para o Canvas)
// ----------------------------------------------------------------------
// No código real, estas importações seriam do Firebase SDK:
/*
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
*/

// Simulação de Globais e Configuração (Necessário para rodar no Canvas)
const userId = 'mock-user-pdv-1';
const __app_id = 'fator-pdv-app'; 
const db = {}; // Mock do Firestore
const auth = {}; // Mock do Auth

const getTableDocRef = (tableId) => ({ 
    tableId,
    path: `/artifacts/${__app_id}/public/data/tables/${tableId}`
});

// Mock da função de atualização do Firestore para simular o comportamento
const updateDoc = async (ref, data) => {
    // console.log(`[FIREBASE MOCK] Atualizando ${ref.path} com:`, data);
    return new Promise(resolve => setTimeout(resolve, 50));
};

// ----------------------------------------------------------------------
// MOCK DE DADOS INICIAIS
// ----------------------------------------------------------------------

// Dados do Menu (Painel 2)
const menuItems = [
    { id: '101', name: 'Hamburguer Artesanal', price: 30.00, category: 'Lanches', img: '🍔' },
    { id: '102', name: 'Batata Frita P', price: 15.00, category: 'Porções', img: '🍟' },
    { id: '201', name: 'Coca-Cola (Lata)', price: 7.50, category: 'Bebidas', img: '🥤' },
    { id: '301', name: 'Cerveja Long Neck', price: 18.00, category: 'Bebidas', img: '🍺' },
    { id: '401', name: 'Sobremesa do Chef', price: 31.50, category: 'Sobremesas', img: '🍰' },
    { id: '501', name: 'Picanha Grelhada', price: 65.00, category: 'Pratos', img: '🥩' },
    { id: '601', name: 'Suco de Laranja', price: 10.00, category: 'Bebidas', img: '🍊' },
    { id: '701', name: 'Água Mineral', price: 5.00, category: 'Bebidas', img: '💧' }
];

// Comanda Mockada para simular uma mesa aberta (Painel 3)
const mockOrderData = {
    tableId: 'T1',
    name: 'Mesa 1',
    status: 'open',
    total: 75.00, 
    serviceFee: 7.50,
    payments: [
        { method: 'Cartão', value: 50.00, payer: 'Pessoa 1', timestamp: 1 },
    ],
    sentItems: [
        { id: '101', name: 'Hamburguer Artesanal', price: 30.00, qty: 1, note: '', paidBy: 'Pessoa 1', productionStatus: 'done', price: 30.00 }, 
        { id: '102', name: 'Batata Frita P', price: 15.00, qty: 1, note: '', paidBy: 'Pessoa 1', productionStatus: 'done', price: 15.00 },     
        { id: '201', name: 'Coca-Cola (Lata)', price: 7.50, qty: 1, note: '', paidBy: null, productionStatus: 'sent', price: 7.50 },          
        { id: '301', name: 'Cerveja Long Neck', price: 18.00, qty: 1, note: 'Gelaaaada!', paidBy: null, productionStatus: 'sent', price: 18.00 },
        { id: '301', name: 'Cerveja Long Neck', price: 18.00, qty: 1, note: 'Gelaaaada!', paidBy: null, productionStatus: 'sent', price: 18.00 },
        { id: '401', name: 'Sobremesa do Chef', price: 31.50, qty: 1, note: 'Sem calda', paidBy: null, productionStatus: 'sent', price: 31.50 } 
    ]
};

// Lista de Mesas Abertas (Painel 1)
let tablesList = [
    { id: 'T1', name: 'Mesa 1', total: 75.00, status: 'open', orderRef: 'mock-order-T1' },
    { id: 'T2', name: 'Mesa 2', total: 45.00, status: 'open', orderRef: 'mock-order-T2' },
    { id: 'T3', name: 'Mesa 3', total: 0.00, status: 'closed', orderRef: null },
];

// ----------------------------------------------------------------------
// VARIÁVEIS DE ESTADO
// ----------------------------------------------------------------------

let currentScreen = 'tables'; // 'tables', 'order', 'payment'
let currentTableId = 'T1';
let currentOrderSnapshot = mockOrderData; // Estado da comanda aberta
let selectedItems = []; // Itens no painel 2, aguardando envio (Comanda Local)
let itemForObs = null; // Item temporário para o modal de observações
let serviceFeeIncluded = false; // Se a taxa de serviço está ativa
let splitSelectedItems = []; 
let splitGroupedItems = []; 
let currentManagerAction = null; // 'deleteItem', 'transfer', etc.
let managerActionPayload = null;
let kdsNotifications = 1; // Simulação de 1 pedido pronto

// ----------------------------------------------------------------------
// ELEMENTOS DA UI
// ----------------------------------------------------------------------

// Telas
const allPanels = document.querySelectorAll('.screen-panel');
const statusScreen = document.getElementById('statusScreen');
const tablesScreen = document.getElementById('tables-screen');
const orderScreen = document.getElementById('order-screen');
const paymentScreen = document.getElementById('payment-screen');

// Painel 1 (Mesas)
const tablesGrid = document.getElementById('tablesGrid');

// Painel 2 (Pedido)
const menuGrid = document.getElementById('menuGrid');
const menuSearchInput = document.getElementById('menuSearchInput');
const currentTableName = document.getElementById('currentTableName');
const selectedItemsListP2 = document.getElementById('selectedItemsListP2');
const localOrderTotalDisplay = document.getElementById('localOrderTotalDisplay');
const sendToKitchenBtn = document.getElementById('sendToKitchenBtn');
const openPaymentScreenBtn = document.getElementById('openPaymentScreenBtn');

// Painel 3 (Pagamento)
const orderBadge = document.getElementById('orderBadge');
const sentItemsList = document.getElementById('sentItemsList');
const paymentSubTotalDisplay = document.getElementById('paymentSubTotalDisplay');
const paymentServiceTaxDisplay = document.getElementById('paymentServiceTaxDisplay');
const paymentTotalDisplay = document.getElementById('paymentTotalDisplay');
const serviceTaxCheckbox = document.getElementById('serviceTaxCheckbox');
const paymentsList = document.getElementById('paymentsList');
const totalPaidDisplay = document.getElementById('totalPaidDisplay');
const remainingValueDisplay = document.getElementById('remainingValueDisplay');
const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
const paymentInput = document.getElementById('paymentInput');
const addPaymentBtn = document.getElementById('addPaymentBtn');
const openItemSplitModalBtn = document.getElementById('openItemSplitModalBtn'); // Botão Divisão
const paymentMethodSelect = document.getElementById('paymentMethodSelect');

// Modais
const obsModal = document.getElementById('obsModal');
const obsInput = document.getElementById('obsInput');
const productionMarchBtn = document.getElementById('productionMarchBtn');
const productionWaitBtn = document.getElementById('productionWaitBtn');
const confirmObsBtn = document.getElementById('confirmObsBtn');
const itemSplitModal = document.getElementById('itemSplitModal'); // Modal Divisão
const splitItemsList = document.getElementById('splitItemsList');
const splitPayerNameInput = document.getElementById('splitPayerNameInput');
const selectedSplitTotalDisplay = document.getElementById('selectedSplitTotalDisplay');
const confirmSplitPaymentBtn = document.getElementById('confirmSplitPaymentBtn');
const managerModal = document.getElementById('managerModal');
const managerModalMessage = document.getElementById('managerModalMessage');
const managerPasswordInput = document.getElementById('managerPasswordInput');
const managerConfirmBtn = document.getElementById('managerConfirmBtn');


// ----------------------------------------------------------------------
// NAVEGAÇÃO
// ----------------------------------------------------------------------

/** Alterna a exibição entre as telas principais do PDV. */
const renderScreen = (screenName) => {
    currentScreen = screenName;
    allPanels.forEach(panel => panel.style.display = 'none');
    
    statusScreen.style.display = 'none';

    switch (screenName) {
        case 'tables':
            tablesScreen.style.display = 'flex';
            loadTables();
            break;
        case 'order':
            if (!currentTableId) {
                renderScreen('tables');
                break;
            }
            orderScreen.style.display = 'grid';
            renderMenuAndOrder();
            break;
        case 'payment':
            if (!currentTableId) {
                renderScreen('tables');
                break;
            }
            paymentScreen.style.display = 'grid';
            // Chama a lógica de renderização do painel de pagamento
            renderSentItems();
            renderPaymentInfo();
            break;
        default:
            tablesScreen.style.display = 'flex';
            loadTables();
            break;
    }
};

/** Atualiza o badge de notificação KDS. */
const updateKdsBadge = () => {
    const badgeEl = document.getElementById('kdsNotificationBadge');
    if (kdsNotifications > 0) {
        badgeEl.textContent = kdsNotifications;
        badgeEl.classList.remove('hidden');
    } else {
        badgeEl.classList.add('hidden');
    }
};


// ----------------------------------------------------------------------
// FUNÇÕES DE UTILIDADE E MÁSCARA
// ----------------------------------------------------------------------

/** Formata um valor numérico para o padrão monetário BRL (R$ 0,00). */
const formatCurrency = (value) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/** Aplica máscara monetária no input (R$ 0,00) */
const applyCurrencyMask = (e) => {
    let value = e.target.value.replace(/\D/g, ""); 
    value = (value / 100).toFixed(2);
    value = value.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    e.target.value = `R$ ${value}`;
    checkPaymentInput();
};

/** Define o valor do input de pagamento (usado pelos botões rápidos) */
window.setPaymentValue = (value) => {
    // Converte o valor numérico para o formato de string esperado pela máscara
    const valueString = (value / 100).toFixed(2);
    paymentInput.value = `R$ ${valueString.replace('.', ',')}`; 
    
    // Simula o evento 'input' para disparar a máscara completa e a checagem
    paymentInput.dispatchEvent(new Event('input')); 
};

/** Calcula todos os totais da conta (aberto, pago, restante) */
const calculateTotals = (snapshot) => {
    // Apenas itens *não pagos* entram no cálculo do total da conta
    const unpaidItems = snapshot.sentItems.filter(item => !item.paidBy);
    const totalItems = unpaidItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    const totalPaid = snapshot.payments.reduce((sum, p) => sum + p.value, 0);
    
    const serviceTax = serviceFeeIncluded ? totalItems * 0.10 : 0;
    const totalToPay = totalItems + serviceTax;
    
    const remaining = totalToPay - totalPaid;

    return { totalItems, serviceTax, totalToPay, totalPaid, remaining };
};

/** Verifica se o input de pagamento é válido */
const checkPaymentInput = () => {
    const value = parseFloat(paymentInput.value.replace('R$', '').replace('.', '').replace(',', '.').trim() || 0);
    addPaymentBtn.disabled = value <= 0;
};

// ----------------------------------------------------------------------
// PAINEL 1: MESAS
// ----------------------------------------------------------------------

/** Carrega e renderiza a lista de mesas. */
const loadTables = () => {
    tablesGrid.innerHTML = '';
    
    if (tablesList.length === 0) {
        tablesGrid.innerHTML = `<p class="text-gray-500 col-span-full text-center">Nenhuma mesa aberta. Clique em "Abrir Nova Mesa".</p>`;
        return;
    }

    tablesList.forEach(table => {
        const isOpen = table.status === 'open';
        const bgColor = isOpen ? 'bg-white hover:bg-gray-50' : 'bg-gray-200';
        const totalText = formatCurrency(table.total);
        
        tablesGrid.innerHTML += `
            <div class="${bgColor} content-card p-6 cursor-pointer transition flex flex-col justify-between h-40" onclick="openTable('${table.id}')">
                <div class="flex justify-between items-center">
                    <h4 class="text-xl font-bold text-gray-800">${table.name}</h4>
                    <i class="fas fa-utensils text-2xl ${isOpen ? 'text-indigo-600' : 'text-gray-400'}"></i>
                </div>
                <div class="mt-4">
                    <span class="text-lg font-semibold ${isOpen ? 'text-red-500' : 'text-gray-500'}">Total: ${totalText}</span>
                    <p class="text-sm text-gray-500">${isOpen ? 'Comanda Aberta' : 'Mesa Fechada'}</p>
                </div>
            </div>
        `;
    });
};

/** Abre uma mesa existente ou uma nova, e navega para a tela de pedidos. */
window.openTable = (tableId) => {
    if (tableId === 'new') {
        const newId = `T${tablesList.length + 1}`;
        currentTableId = newId;
        currentOrderSnapshot = {
            tableId: newId,
            name: `Mesa ${newId.replace('T', '')}`,
            status: 'open',
            total: 0.00,
            serviceFee: 0.00,
            payments: [],
            sentItems: []
        };
        tablesList.push({ id: newId, name: currentOrderSnapshot.name, total: 0.00, status: 'open', orderRef: `mock-order-${newId}`, orderSnapshot: currentOrderSnapshot });
        selectedItems = [];
        renderScreen('order');
    } else {
        const table = tablesList.find(t => t.id === tableId);
        if (table && table.status === 'open') {
            currentTableId = tableId;
            
            // Simulação: Carrega os dados da comanda (se for a T1, usa o mock inicial, senão o snapshot armazenado)
            if (tableId === 'T1') {
                currentOrderSnapshot = mockOrderData;
            } else {
                currentOrderSnapshot = table.orderSnapshot;
            }
            
            selectedItems = [];
            renderScreen('order');
        } else {
            alert(`A ${table.name} está fechada.`);
        }
    }
};

// ----------------------------------------------------------------------
// PAINEL 2: PEDIDO E CARDÁPIO
// ----------------------------------------------------------------------

/** Renderiza o cardápio e a comanda local. */
const renderMenuAndOrder = () => {
    if (!currentTableId || !currentOrderSnapshot) return;
    currentTableName.textContent = currentOrderSnapshot.name;
    renderMenu();
    renderSelectedItems();
    updateOrderScreenButtons();
};

/** Renderiza o grid de produtos. */
const renderMenu = (searchTerm = '') => {
    menuGrid.innerHTML = '';
    const term = searchTerm.toLowerCase();
    
    const filteredItems = menuItems.filter(item => 
        item.name.toLowerCase().includes(term) || item.category.toLowerCase().includes(term)
    );

    filteredItems.forEach(item => {
        menuGrid.innerHTML += `
            <div class="bg-white p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition flex flex-col justify-between" onclick="openObsModal('${item.id}')">
                <span class="text-4xl text-center mb-2">${item.img}</span>
                <h4 class="font-bold text-gray-800">${item.name}</h4>
                <p class="text-sm text-gray-500">${item.category}</p>
                <span class="text-lg font-extrabold text-indigo-600 mt-2">${formatCurrency(item.price)}</span>
            </div>
        `;
    });
};

/** Renderiza a lista de itens selecionados localmente (Comanda Local). */
const renderSelectedItems = () => {
    const listEl = selectedItemsListP2;
    listEl.innerHTML = '';
    let total = 0;

    if (selectedItems.length === 0) {
        listEl.innerHTML = `<p class="text-center text-gray-500 mt-10">Selecione itens no cardápio.</p>`;
    } else {
        // Agrupa itens selecionados (pelo ID e nota)
        const grouped = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            acc[key] = acc[key] || { ...item, qty: 0 };
            acc[key].qty++;
            return acc;
        }, {});

        Object.values(grouped).forEach(item => {
            const lineTotal = item.qty * item.price;
            total += lineTotal;

            const obsText = item.note ? `<span class="text-xs text-gray-500 block truncate">Obs: ${item.note}</span>` : '';
            
            listEl.innerHTML += `
                <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg border-l-4 border-indigo-500 shadow-sm">
                    <div class="flex-grow">
                        <span class="font-semibold text-gray-800">${item.name} (${item.qty}x)</span>
                        ${obsText}
                    </div>
                    <div class="flex items-center space-x-2">
                        <button class="text-red-500 hover:text-red-700 transition text-sm" onclick="removeItemFromOrder('${item.id}', '${item.note || ''}')">
                             <i class="fas fa-trash"></i>
                        </button>
                        <span class="font-bold text-indigo-700">${formatCurrency(lineTotal)}</span>
                    </div>
                </div>
            `;
        });
    }

    localOrderTotalDisplay.textContent = formatCurrency(total);
    updateOrderScreenButtons(total);
};

/** Adiciona um item à comanda local (após passar pelo modal de observações). */
const addToOrder = (item, note = '') => {
    const fullItem = menuItems.find(i => i.id === item.id);
    if (fullItem) {
        selectedItems.push({ 
            id: fullItem.id,
            name: fullItem.name,
            price: fullItem.price, // Garante que o preço está aqui
            qty: 1, // Adiciona 1 unidade por vez no array de itens
            note: note,
            productionStatus: 'pending' // Novo item aguardando envio
        });
        renderSelectedItems();
    }
};

/** Remove 1 unidade do item da comanda local. */
const removeItemFromOrder = (itemId, itemNote) => {
    const index = selectedItems.findIndex(item => item.id === itemId && (item.note || '') === itemNote);
    if (index > -1) {
        selectedItems.splice(index, 1);
        renderSelectedItems();
    }
};

/** Habilita/desabilita botões do Painel 2. */
const updateOrderScreenButtons = (total = selectedItems.reduce((sum, i) => sum + (i.price * i.qty), 0)) => {
    sendToKitchenBtn.disabled = selectedItems.length === 0;
    
    // Habilita ir para pagamento se houver itens enviados OU itens locais
    openPaymentScreenBtn.disabled = !currentOrderSnapshot || (currentOrderSnapshot.sentItems.length === 0 && selectedItems.length === 0);
};


// ----------------------------------------------------------------------
// MODAL DE OBSERVAÇÕES E MARCHA/ESPERA
// ----------------------------------------------------------------------

/** Abre o modal de observações para um item. */
window.openObsModal = (itemId) => {
    itemForObs = menuItems.find(i => i.id === itemId);
    if (!itemForObs) return;

    obsInput.value = '';
    document.getElementById('confirmObsBtn').onclick = () => confirmObsAndAdd('wait'); // Padrão: Espera
    productionMarchBtn.onclick = () => confirmObsAndAdd('march');
    productionWaitBtn.onclick = () => confirmObsAndAdd('wait');
    
    document.querySelector('#obsModal h3').textContent = `Observações para: ${itemForObs.name}`;

    obsModal.style.display = 'flex';
};

/** Confirma observação e adiciona o item, definindo o status de produção. */
const confirmObsAndAdd = (action) => {
    if (!itemForObs) return;

    const note = obsInput.value.trim();
    
    // 1. Adiciona o item à comanda local (selectedItems)
    addToOrder(itemForObs, note);
    obsModal.style.display = 'none';

    // 2. Se a ação for 'march', envia imediatamente o item para o KDS
    if (action === 'march') {
        sendSelectedItems(true); // Envia APENAS o item recém-adicionado
    }
    
    itemForObs = null; 
};


// ----------------------------------------------------------------------
// ENVIO PARA COZINHA (KDS)
// ----------------------------------------------------------------------

/** Envia itens da comanda local (selectedItems) para o Firestore (KDS). */
const sendSelectedItems = (sendOnlyLastItem = false) => {
    if (selectedItems.length === 0) return;

    // Itens que estão com status 'pending' na comanda local
    let itemsToSend = selectedItems.filter(item => item.productionStatus === 'pending');
    
    if (sendOnlyLastItem && itemsToSend.length > 0) {
        // Pega apenas o último item para "Marcha"
        itemsToSend = [itemsToSend[itemsToSend.length - 1]];
    } else {
        // Envia todos os pendentes (Marcha Geral)
    }

    if (itemsToSend.length === 0) return;

    // 1. Simulação: Adiciona ao array sentItems (ITENS ENVIADOS)
    currentOrderSnapshot.sentItems.push(...itemsToSend.map(item => ({...item, productionStatus: 'sent'})));
    
    // 2. Simulação: Remove os itens enviados da lista local (selectedItems)
    selectedItems = selectedItems.filter(localItem => 
        !itemsToSend.some(sentItem => 
            sentItem.id === localItem.id && sentItem.note === localItem.note && sentItem.productionStatus === 'pending'
        )
    );

    // 3. Simulação: Atualiza o total da mesa (que deve incluir sentItems)
    const currentTable = tablesList.find(t => t.id === currentTableId);
    
    // Recalcula o total apenas dos itens ABERTOS (não pagos)
    const newTotal = currentOrderSnapshot.sentItems
        .filter(item => !item.paidBy)
        .reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    if(currentTable) currentTable.total = newTotal;
    
    // 4. Atualiza a UI e notifica
    renderSelectedItems();
    loadTables(); // Para atualizar o total na lista de mesas (se visível)
    
    alert(`Pedido de ${itemsToSend.length} item(s) enviado para a cozinha!`);

    // No código real, haveria o addDoc para o KDS e o updateDoc para a mesa aqui.
};

// ----------------------------------------------------------------------
// PAINEL 3: LÓGICA DE PAGAMENTO E DIVISÃO (ITEM SPLIT)
// ----------------------------------------------------------------------

/** Renderiza a lista de itens enviados com status de pagamento. */
const renderSentItems = () => {
    const listEl = sentItemsList;
    if (!currentOrderSnapshot) return;

    listEl.innerHTML = '';

    // Agrupa itens para exibição, incluindo o pagador no agrupamento
    const groupedItems = currentOrderSnapshot.sentItems.reduce((acc, item) => {
        const paidStatus = item.paidBy ? `[PAGO:${item.paidBy}]` : '[ABERTO]';
        const key = `${item.id}-${item.note || ''}-${paidStatus}`; 
        
        acc[key] = acc[key] || { ...item, qty: 0 };
        acc[key].qty++;
        return acc;
    }, {});
    
    let totalRecalculated = 0;

    Object.values(groupedItems).forEach((item) => {
        const lineTotal = item.qty * item.price;
        
        // Só contabiliza no TOTAL GERAL se não estiver pago
        if (!item.paidBy) { 
            totalRecalculated += lineTotal;
        }

        const obsText = item.note ? ` (${item.note})` : '';
        const paidTag = item.paidBy 
            ? `<span class="ml-2 text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">PAGO por ${item.paidBy}</span>`
            : '';
        const isPaidClass = item.paidBy ? 'opacity-60' : '';
        
        const trashButton = item.paidBy ? '' : `
            <button class="text-red-500 hover:text-red-700 transition" onclick="openManagerModal('deleteItem', '${item.id}', '${item.note || ''}')" title="Excluir Item (Gerente)">
                <i class="fas fa-trash text-sm"></i>
            </button>
        `;

        listEl.innerHTML += `
            <div class="flex justify-between items-center py-2 border-b border-gray-100 ${isPaidClass}">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-gray-800">${item.name} (${item.qty}x) ${paidTag}</span>
                    <span class="text-xs text-gray-500 truncate">${obsText}</span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <span class="font-bold text-base text-indigo-700">${formatCurrency(lineTotal)}</span>
                    ${trashButton}
                </div>
            </div>
        `;
    });
    
    currentOrderSnapshot.total = totalRecalculated;
    // Atualiza o total da mesa na lista de mesas também
    const tableIndex = tablesList.findIndex(t => t.id === currentTableId);
    if (tableIndex > -1) tablesList[tableIndex].total = totalRecalculated;
};

/** Renderiza o resumo de pagamentos e totais. */
const renderPaymentInfo = () => {
    if (!currentOrderSnapshot) return;

    const { totalItems, serviceTax, totalToPay, totalPaid, remaining } = calculateTotals(currentOrderSnapshot);
    
    orderBadge.textContent = formatCurrency(totalItems);

    paymentSubTotalDisplay.textContent = formatCurrency(totalItems);
    paymentServiceTaxDisplay.textContent = formatCurrency(serviceTax);
    paymentTotalDisplay.textContent = formatCurrency(totalToPay);

    // Renderiza pagamentos
    paymentsList.innerHTML = '';
    if (currentOrderSnapshot.payments.length === 0) {
        paymentsList.innerHTML = `<p class="text-sm text-gray-500">Nenhum pagamento registrado.</p>`;
    }
    currentOrderSnapshot.payments.forEach(p => {
        const payerText = p.payer ? `(${p.payer})` : '';
         paymentsList.innerHTML += `
            <div class="flex justify-between text-sm text-gray-700 border-b pb-1">
                <span>${p.method} ${payerText}</span>
                <span class="font-semibold text-green-600">${formatCurrency(p.value)}</span>
            </div>
        `;
    });

    totalPaidDisplay.textContent = formatCurrency(totalPaid);
    remainingValueDisplay.textContent = formatCurrency(remaining);
    
    // Habilita FECHAR CONTA quando o restante é <= 0,00
    finalizeOrderBtn.disabled = remaining > 0.005; // Margem para float
    finalizeOrderBtn.className = remaining <= 0.005
        ? 'w-full px-4 py-3 bg-green-600 text-white font-bold rounded-lg transition text-base'
        : 'w-full px-4 py-3 bg-green-600 text-white font-bold rounded-lg transition text-base disabled:opacity-50';
};

/** Adiciona um pagamento parcial (simples, sem divisão por itens) */
const addPayment = async () => {
    const value = parseFloat(paymentInput.value.replace('R$', '').replace('.', '').replace(',', '.').trim() || 0);
    const method = paymentMethodSelect.value;
    
    if (value <= 0 || !currentOrderSnapshot) return;

    const { remaining } = calculateTotals(currentOrderSnapshot);
    const valueToPay = Math.min(value, remaining); // Paga no máximo o que resta

    const newPayment = {
        method: method,
        value: valueToPay,
        timestamp: Date.now(), 
        userId: userId
    };

    // Simulação de update do Firebase
    currentOrderSnapshot.payments.push(newPayment);
    
    // Resetar input e atualizar UI
    paymentInput.value = formatCurrency(0);
    checkPaymentInput();
    loadTableData(); // Atualiza a tela de pagamento (Painel 3)

    // No código real:
    // Chamada ao Firebase com arrayUnion
};

/** Finaliza a ordem (placeholder para WooCommerce) */
const finalizeOrder = () => {
    if (!finalizeOrderBtn.disabled) {
        // CHAMA finalizeWooCommerceOrder()
        console.log("CHAMADA WOOCOMMERCE: finalizeWooCommerceOrder() executada.");
        alert("Conta Fechada! Ordem enviada para finalização no WooCommerce (Simulado).");

        // Simulação de fechamento da mesa
        tablesList = tablesList.filter(t => t.id !== currentTableId);
        currentOrderSnapshot = null;
        currentTableId = null;
        renderScreen('tables'); 
    }
};

/** Abre o Modal de Divisão por Itens */
const openItemSplitModal = () => {
    if (!currentTableId || !currentOrderSnapshot) return;

    // 1. Filtrar itens: apenas os que *não* possuem um 'paidBy'
    const unpaidItems = currentOrderSnapshot.sentItems.filter(item => !item.paidBy);

    if (unpaidItems.length === 0) {
        alert("Todos os itens da conta já foram pagos ou atribuídos a um pagador.");
        return;
    }

    // 2. Agrupar itens não pagos para exibição (item.id + item.note)
    splitGroupedItems = unpaidItems.reduce((acc, item) => {
        const key = `${item.id}-${item.note || ''}`;
        
        if (!acc[key]) {
             acc[key] = { 
                ...item, 
                qty: 0,
                note: item.note || '', 
                isSplitSelected: false, // Flag de seleção
            };
        }
        acc[key].qty++;
        
        return acc;
    }, {});
    
    // Converte para um array para renderização
    splitGroupedItems = Object.values(splitGroupedItems);
    
    // 3. Define um nome de pagador sugerido (Pessoa N+1)
    const existingPaymentsCount = currentOrderSnapshot.payments.length;
    splitPayerNameInput.value = `Pessoa ${existingPaymentsCount + 1}`;

    renderSplitItemsList();
    itemSplitModal.style.display = 'flex';
};

/** Renderiza a lista de itens no modal de divisão e recalcula o total selecionado. */
const renderSplitItemsList = () => {
    splitItemsList.innerHTML = '';
    let selectedTotal = 0;

    if (splitGroupedItems.length === 0) {
        splitItemsList.innerHTML = `<p class="text-center text-gray-500">Nenhum item não pago para dividir.</p>`;
        selectedSplitTotalDisplay.textContent = formatCurrency(0);
        confirmSplitPaymentBtn.disabled = true;
        return;
    }

    splitGroupedItems.forEach(item => {
        const isChecked = item.isSplitSelected;
        const lineTotal = item.qty * item.price;
        if (isChecked) {
            selectedTotal += lineTotal;
        }

        const obsText = item.note ? ` (${item.note})` : '';
        const itemKey = `${item.id}-${item.note}`;

        splitItemsList.innerHTML += `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border ${isChecked ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}">
                <div class="flex items-center flex-grow min-w-0 mr-2">
                    <input type="checkbox" 
                           data-item-key="${itemKey}"
                           class="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer" 
                           ${isChecked ? 'checked' : ''}
                           onchange="toggleSplitItemSelection('${item.id}', '${item.note || ''}')">
                    <div class="ml-3">
                        <span class="font-semibold text-gray-800">${item.name} (${item.qty}x)</span>
                        <span class="text-xs text-gray-500 truncate">${obsText}</span>
                    </div>
                </div>
                <span class="font-bold text-base text-indigo-700 flex-shrink-0">${formatCurrency(lineTotal)}</span>
            </div>
        `;
    });

    selectedSplitTotalDisplay.textContent = formatCurrency(selectedTotal);
    confirmSplitPaymentBtn.disabled = selectedTotal <= 0;
};

/** Toggle a seleção de um item no modal de divisão (global function) */
window.toggleSplitItemSelection = (itemId, itemNote) => {
    const key = `${itemId}-${itemNote}`;
    const index = splitGroupedItems.findIndex(item => `${item.id}-${item.note}` === key);

    if (index > -1) {
        const item = splitGroupedItems[index];
        item.isSplitSelected = !item.isSplitSelected;
        renderSplitItemsList();
    }
};

/** Confirmação do Pagamento Parcial, marcando os sentItems como pagos */
confirmSplitPaymentBtn.addEventListener('click', async () => {
    if (!currentTableId || !currentOrderSnapshot) return;

    const payerName = splitPayerNameInput.value.trim() || `Pessoa ${currentOrderSnapshot.payments.length + 1}`;
    
    const itemsToPay = splitGroupedItems.filter(item => item.isSplitSelected);

    if (itemsToPay.length === 0) {
        alert("Selecione pelo menos um item para registrar o pagamento.");
        return;
    }

    const totalToPay = itemsToPay.reduce((sum, item) => sum + (item.qty * item.price), 0);
    
    // 1. Cria o novo registro de pagamento
    const newPayment = {
        method: `DIVISÃO (${payerName})`, 
        value: totalToPay,
        timestamp: Date.now(), 
        payer: payerName,
        isPartialSplit: true 
    };

    // 2. Prepara o array de itens atualizado (Simula a transação no Firebase)
    let updatedSentItems = currentOrderSnapshot.sentItems;
    
    itemsToPay.forEach(group => {
        let count = 0;
        const key = `${group.id}-${group.note}`;
        
        updatedSentItems = updatedSentItems.map(item => {
            const itemKey = `${item.id}-${item.note || ''}`;
            
            if (itemKey === key && !item.paidBy && count < group.qty) {
                count++;
                return { ...item, paidBy: payerName, paidAt: Date.now(), paymentId: newPayment.timestamp };
            }
            return item;
        });
    });
    
    // SIMULAÇÃO DE UPDATE NO FIREBASE:
    currentOrderSnapshot.payments.push(newPayment);
    currentOrderSnapshot.sentItems = updatedSentItems;
    
    loadTableData(); 
    itemSplitModal.style.display = 'none';
    alert(`Pagamento parcial de ${formatCurrency(totalToPay)} registrado para ${payerName}.`);
});


// ----------------------------------------------------------------------
// FUNÇÕES GERENCIAIS (SIMULADAS)
// ----------------------------------------------------------------------

/** Abre o modal de autenticação gerencial para ações críticas */
window.openManagerModal = (action, ...payload) => {
    currentManagerAction = action;
    managerActionPayload = payload;
    
    let message = "Ação requer senha de gerente (1234).";
    if (action === 'deleteItem') {
        const itemName = currentOrderSnapshot.sentItems.find(i => i.id === payload[0])?.name || "Item";
        message = `Confirma exclusão de um ${itemName} da conta? Requer senha.`;
    } else if (action === 'transfer') {
        message = `Confirma a transferência seletiva dos itens? Requer senha.`;
    }

    managerModalMessage.textContent = message;
    managerPasswordInput.value = '';
    managerModal.style.display = 'flex';
};

/** Confirma a ação gerencial após a senha */
managerConfirmBtn.addEventListener('click', () => {
    const password = managerPasswordInput.value;
    const requiredPassword = '1234'; // Senha simulada

    if (password !== requiredPassword) {
        alert("Senha incorreta.");
        return;
    }

    managerModal.style.display = 'none';
    
    if (currentManagerAction === 'deleteItem') {
        handleDeleteItem(...managerActionPayload);
    } else if (currentManagerAction === 'transfer') {
        alert("Transferência Seletiva liberada! (Lógica de transferência não implementada no código, apenas autenticada).");
    }
});

/** Executa a exclusão de item (após autenticação) */
const handleDeleteItem = (itemId, itemNote) => {
    if (!currentOrderSnapshot) return;

    let removed = false;
    currentOrderSnapshot.sentItems = currentOrderSnapshot.sentItems.filter(item => {
        if (!removed && item.id === itemId && (item.note || '') === itemNote && !item.paidBy) {
            removed = true;
            return false; // Remove este item
        }
        return true;
    });

    loadTableData();
    alert(`Item excluído com sucesso (Simulado).`);
};


// ----------------------------------------------------------------------
// INICIALIZAÇÃO E LISTENERS
// ----------------------------------------------------------------------

/** Função principal chamada para renderizar a UI */
const loadTableData = () => {
    if (!currentTableId || !currentOrderSnapshot) {
        if (currentScreen !== 'tables') renderScreen('tables');
        return;
    }
    
    // Atualiza apenas o painel visível
    if (currentScreen === 'payment') {
        renderSentItems();
        renderPaymentInfo();
    } else if (currentScreen === 'order') {
        renderMenuAndOrder();
    } else if (currentScreen === 'tables') {
        loadTables();
    }
    
    updateKdsBadge(); 
};


// VINCULAÇÃO DE LISTENERS GERAIS
// Painel 2
menuSearchInput.addEventListener('input', (e) => renderMenu(e.target.value));
sendToKitchenBtn.addEventListener('click', () => sendSelectedItems(false));
openPaymentScreenBtn.addEventListener('click', () => renderScreen('payment'));

// Painel 3
if (openItemSplitModalBtn) openItemSplitModalBtn.addEventListener('click', openItemSplitModal);
if (serviceTaxCheckbox) serviceTaxCheckbox.addEventListener('change', () => {
    serviceFeeIncluded = serviceTaxCheckbox.checked;
    renderPaymentInfo();
});
if (paymentInput) paymentInput.addEventListener('input', applyCurrencyMask);
if (addPaymentBtn) addPaymentBtn.addEventListener('click', addPayment);
if (finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', finalizeOrder);
if (document.getElementById('notificationBtn')) document.getElementById('notificationBtn').addEventListener('click', () => {
    alert(`Você tem ${kdsNotifications} pedido(s) pronto(s) para entrega!`);
    kdsNotifications = 0; 
    updateKdsBadge();
});


// Inicializa o PDV na tela de mesas
window.onload = () => {
    // Simulação: se T1 está aberta, exibe ela
    renderScreen('tables');
};
