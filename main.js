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
    // Simulação: Apenas o listener (loadTableData) irá atualizar o UI
    return new Promise(resolve => setTimeout(resolve, 50));
};

// Mock de dados para simular o onSnapshot
let currentOrderSnapshot = {
    tableId: 'T1',
    name: 'Mesa 1',
    total: 75.00, 
    serviceFee: 7.50,
    payments: [
        { method: 'Cartão', value: 50.00, payer: 'Pessoa 1', timestamp: 1 },
    ],
    sentItems: [
        { id: '101', name: 'Hamburguer Artesanal', price: 30.00, qty: 1, note: '', paidBy: 'Pessoa 1' }, 
        { id: '102', name: 'Batata Frita P', price: 15.00, qty: 1, note: '', paidBy: 'Pessoa 1' },     
        { id: '201', name: 'Coca-Cola (Lata)', price: 7.50, qty: 1, note: '', paidBy: null },          
        { id: '301', name: 'Cerveja Long Neck', price: 18.00, qty: 1, note: 'Gelaaaada!', paidBy: null },
        { id: '301', name: 'Cerveja Long Neck', price: 18.00, qty: 1, note: 'Gelaaaada!', paidBy: null },
        { id: '401', name: 'Sobremesa do Chef', price: 31.50, qty: 1, note: 'Sem calda', paidBy: null } 
    ]
};

let currentTableId = 'T1';
let serviceFeeIncluded = false;
let splitSelectedItems = []; 
let splitGroupedItems = []; 
let currentManagerAction = null; // 'deleteItem', 'transfer', etc.
let managerActionPayload = null;


// ----------------------------------------------------------------------
// ELEMENTOS DA UI
// ----------------------------------------------------------------------
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

// Referências do NOVO MODAL DE DIVISÃO
const openItemSplitModalBtn = document.getElementById('openItemSplitModalBtn');
const itemSplitModal = document.getElementById('itemSplitModal');
const splitItemsList = document.getElementById('splitItemsList');
const splitPayerNameInput = document.getElementById('splitPayerNameInput');
const selectedSplitTotalDisplay = document.getElementById('selectedSplitTotalDisplay');
const confirmSplitPaymentBtn = document.getElementById('confirmSplitPaymentBtn');

// Referências do Modal Gerencial
const managerModal = document.getElementById('managerModal');
const managerModalMessage = document.getElementById('managerModalMessage');
const managerPasswordInput = document.getElementById('managerPasswordInput');
const managerConfirmBtn = document.getElementById('managerConfirmBtn');


// ----------------------------------------------------------------------
// FUNÇÕES DE UTILIDADE
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
// FUNÇÕES DE PAGAMENTO E RENDERIZAÇÃO
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
        
        // Botão de Exclusão (só aparece para itens ABETOS)
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
    
    // Atualiza o total de itens abertos no snapshot (simulação de sincronização)
    currentOrderSnapshot.total = totalRecalculated;
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
    loadTableData();

    // No código real:
    /*
    const tableRef = getTableDocRef(currentTableId);
    try {
        await updateDoc(tableRef, {
            payments: arrayUnion(newPayment)
        });
    } catch (e) {
        console.error("Erro ao adicionar pagamento:", e);
        alert("Erro ao adicionar pagamento. Tente novamente.");
    }
    */
};

/** Finaliza a ordem (placeholder para WooCommerce) */
const finalizeOrder = () => {
    if (!finalizeOrderBtn.disabled) {
        // Implementação da chamada API para WooCommerce aqui
        console.log("CHAMADA WOOCOMMERCE: finalizeWooCommerceOrder() executada.");
        alert("Conta Fechada! Ordem enviada para finalização no WooCommerce (Simulado).");

        // Simulação de fechamento da mesa
        currentOrderSnapshot = null;
        currentTableId = null;
        loadTableData(); // Volta para o estado inicial/mock de mesas
    }
};

// ----------------------------------------------------------------------
// FUNÇÕES DE DIVISÃO POR ITENS (NOVO RECURSO)
// ----------------------------------------------------------------------

/** Abre o Modal de Divisão por Itens */
const openItemSplitModal = () => {
    if (!currentTableId || !currentOrderSnapshot) return;

    // 1. Filtrar itens: apenas os que *não* possuem um 'paidBy'
    const unpaidItems = currentOrderSnapshot.sentItems.filter(item => !item.paidBy);

    if (unpaidItems.length === 0) {
        // Usamos modal customizado ou notificação no PDV real. Aqui usamos alert.
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
    // Procuramos o item agrupado usando a chave
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
    
    // Itens selecionados no modal
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
        
        // Mapeia o array SENTITEMS real para encontrar e marcar os itens não pagos correspondentes
        updatedSentItems = updatedSentItems.map(item => {
            const itemKey = `${item.id}-${item.note || ''}`;
            
            // Se o item for do tipo selecionado, ainda não estiver pago, e a quantidade ainda não foi marcada
            if (itemKey === key && !item.paidBy && count < group.qty) {
                count++;
                // Marca o item como pago, atribuindo ao pagador
                return { ...item, paidBy: payerName, paidAt: Date.now(), paymentId: newPayment.timestamp };
            }
            return item;
        });
    });
    
    // SIMULAÇÃO DE UPDATE NO FIREBASE:
    currentOrderSnapshot.payments.push(newPayment);
    currentOrderSnapshot.sentItems = updatedSentItems;

    // No código real:
    /*
    const tableRef = getTableDocRef(currentTableId);
    try {
        const batch = writeBatch(db);
        batch.update(tableRef, { payments: arrayUnion(newPayment) });
        batch.update(tableRef, { sentItems: updatedSentItems }); // Reescrita do array completo
        await batch.commit();
    } catch (e) {
        console.error("Erro ao registrar pagamento parcial:", e);
        alert("Erro ao registrar pagamento. Tente novamente.");
    }
    */
    
    // Atualiza a interface
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
    } 
    // Outras ações gerenciais viriam aqui: else if (currentManagerAction === 'transfer') ...
});

/** Executa a exclusão de item (após autenticação) */
const handleDeleteItem = (itemId, itemNote) => {
    if (!currentOrderSnapshot) return;

    // Encontra e remove apenas 1 instância do item
    let removed = false;
    currentOrderSnapshot.sentItems = currentOrderSnapshot.sentItems.filter(item => {
        if (!removed && item.id === itemId && (item.note || '') === itemNote && !item.paidBy) {
            removed = true;
            return false; // Remove este item
        }
        return true;
    });

    // Simulação de update do Firebase
    loadTableData();
    alert(`Item excluído com sucesso (Simulado).`);

    // No código real:
    /*
    const tableRef = getTableDocRef(currentTableId);
    await updateDoc(tableRef, { sentItems: currentOrderSnapshot.sentItems }); 
    */
};


// ----------------------------------------------------------------------
// INICIALIZAÇÃO E LISTENERS
// ----------------------------------------------------------------------

/** Função principal chamada para renderizar a UI */
const loadTableData = () => {
    // onSnapshot listener do Firebase chamaria esta função após cada update.
    if (!currentTableId || !currentOrderSnapshot) {
        document.body.innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-xl text-gray-500">Nenhuma comanda aberta.</div>';
        return;
    }
    
    renderSentItems();
    renderPaymentInfo();
};


// LISTENERS
if (openItemSplitModalBtn) openItemSplitModalBtn.addEventListener('click', openItemSplitModal);
if (serviceTaxCheckbox) serviceTaxCheckbox.addEventListener('change', () => {
    serviceFeeIncluded = serviceTaxCheckbox.checked;
    renderPaymentInfo();
});
if (paymentInput) paymentInput.addEventListener('input', applyCurrencyMask);
if (addPaymentBtn) addPaymentBtn.addEventListener('click', addPayment);
if (finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', finalizeOrder);


// Inicializa o PDV com os dados mockados no carregamento da página
window.onload = loadTableData;
