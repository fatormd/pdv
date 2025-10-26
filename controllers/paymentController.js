// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX;
let selectiveTransferModal, targetTableInput, checkTargetTableBtn, confirmTransferBtn, transferStatus, transferItemsList;
let tableTransferModal;

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => {
    return applyServiceTax ? subtotal * 1.10 : subtotal;
};
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};
const groupMainAccountItems = (orderSnapshot) => {
    // Esta função agrupa itens para a "Conta Principal" se a divisão for implementada
    return orderSnapshot?.sentItems || [];
};

// --- FUNÇÕES DE AÇÃO ---
// AÇÃO REAL (chamada pelo app.js)
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !timestamp) return;
    const tableRef = getTableDocRef(currentTableId);
    
    // Encontra o pagamento no snapshot atual para recalcular o total
    const paymentToRemove = currentOrderSnapshot?.payments.find(p => p.timestamp === timestamp);
    if (!paymentToRemove) {
        alert("Erro: Pagamento não encontrado para exclusão.");
        return;
    }
    
    const paymentValue = getNumericValueFromCurrency(paymentToRemove.value);
    const currentTotalPaid = currentOrderSnapshot?.payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0) || 0;
    const newTotalPaid = currentTotalPaid - paymentValue;

    try {
        await updateDoc(tableRef, {
            payments: arrayRemove(paymentToRemove)
            // O total PAGO é recalculado, o total DA CONTA não muda
        });
        console.log(`[Payment] Pagamento ${timestamp} removido.`);
        // O listener do app.js vai atualizar o renderPaymentSummary
    } catch (e) {
        console.error("Erro ao excluir pagamento:", e);
        alert("Erro ao excluir pagamento.");
    }
};

// INICIA o fluxo de senha (chamada pelo HTML)
export const deletePayment = async (timestamp) => {
    window.openManagerAuthModal('deletePayment', timestamp); // Chama função global
}
// window.deletePayment = deletePayment; // Exposto no app.js


// --- FUNÇÕES DE RENDERIZAÇÃO ---

// ==================================================================
//               FUNÇÃO CORRIGIDA / RECONSTRUÍDA
// ==================================================================
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;

    // Itens no "Resumo da Conta" são os itens JÁ ENVIADOS
    const items = orderSnapshot?.sentItems || [];

    if (items.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item enviado para a conta ainda.</div>`;
        // Limpa a barra de ação se não houver itens
        const oldActionBar = document.getElementById('reviewActionBar');
        if (oldActionBar) oldActionBar.remove();
        return; 
    }

    // Agrupa os itens (lógica similar ao orderController)
    const groupedItems = items.reduce((acc, item) => {
        const key = `${item.id}-${item.note || ''}`;
        if (!acc[key]) {
            // Guarda os itens originais para a transferência
            acc[key] = { ...item, count: 0, originalItems: [] }; 
        }
        acc[key].count++;
        acc[key].originalItems.push(item);
        return acc;
    }, {});

    // Gera o HTML para cada item agrupado
    let itemsHtml = Object.values(groupedItems).map(group => {
        // Codifica o array de itens originais para o data-attribute
        const itemData = JSON.stringify(group.originalItems).replace(/'/g, '&#39;');

        return `
        <div class="flex justify-between items-center py-2 border-b border-dark-border hover:bg-dark-input p-2 rounded-lg">
            <div class="flex items-center flex-grow min-w-0 mr-2">
                <input type="checkbox" 
                       class="item-select-checkbox mr-3 h-5 w-5 bg-dark-input border-gray-600 rounded text-pumpkin focus:ring-pumpkin"
                       data-items='${itemData}'
                       onchange="window.activateItemSelection()">
                <div class="flex flex-col min-w-0">
                    <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span>
                    <span class="text-xs text-dark-placeholder">${group.note || 'Sem observações'}</span>
                </div>
            </div>
            <span class="font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.price * group.count)}</span>
        </div>
        `;
    }).join('');

    // Gera a Barra de Ação (Seleção em Massa)
    const actionBarHtml = `
        <div id="reviewActionBar" class="flex justify-between items-center p-2 mt-4 bg-dark-input rounded-lg sticky bottom-0">
            <div class="flex items-center">
                <input type="checkbox" id="selectAllItems" class="mr-2 h-4 w-4" 
                       onchange="window.activateItemSelection('toggleAll')">
                <label for="selectAllItems" class="text-sm font-semibold">Selecionar Todos</label>
            </div>
            <div class="flex space-x-2">
                <button id="massDeleteBtn" class="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-bold opacity-50 cursor-not-allowed" disabled>
                    <i class="fas fa-trash"></i> (<span id="deleteCount">0</span>)
                </button>
                <button id="massTransferBtn" class="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-bold opacity-50 cursor-not-allowed" disabled>
                    <i class="fas fa-arrow-right"></i> (<span id="transferCount">0</span>)
                </button>
            </div>
        </div>
    `;

    reviewItemsList.innerHTML = itemsHtml + actionBarHtml;

    // AGORA que os botões (massDeleteBtn, etc.) existem no HTML, 
    // nós podemos adicionar os listeners a eles.
    attachReviewListListeners();
};
// ==================================================================
//                  FIM DA FUNÇÃO CORRIGIDA
// ==================================================================

const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum pagamento registrado.</p>`;
        return;
    }

    paymentSummaryList.innerHTML = payments.map(p => `
        <div class="flex justify-between items-center py-1 border-b border-dark-border">
            <div class="flex items-center space-x-2">
                <button class="text-red-500 hover:text-red-400" title="Excluir Pagamento" onclick="window.deletePayment(${p.timestamp})">
                    <i class="fas fa-times-circle"></i>
                </button>
                <span class="font-semibold">${p.method}</span>
            </div>
            <span class="text-gray-400">${p.value}</span>
        </div>
    `).join('');
};

const renderPaymentSplits = (orderSnapshot) => { 
    // Lógica placeholder mantida
    if(paymentSplitsContainer) paymentSplitsContainer.innerHTML = '<div class="text-sm text-dark-placeholder italic p-2">Divisão de conta em desenvolvimento.</div>';
};

const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">
            ${method}
        </button>
    `).join('');
};

export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return;

    const payments = orderSnapshot.payments || [];
    
    const sentItems = orderSnapshot.sentItems || [];
    const subtotal = calculateItemsValue(sentItems);
    const applyServiceTax = orderSnapshot.serviceTaxApplied ?? true;
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    const total = subtotal + serviceTax;
    
    const totalPaid = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalance = total - totalPaid;
    
    const diners = parseInt(dinersSplitInput.value) || 1;
    const valuePerDiner = total / diners;

    // Atualiza a UI
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(total));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalance));
    
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false; // Habilita o botão
        toggleServiceTaxBtn.style.opacity = '1';
    }
    
    if (dinersSplitInput) dinersSplitInput.readOnly = false;
    
    if (finalizeOrderBtn) {
        const canFinalize = remainingBalance <= 0.01 && sentItems.length > 0;
        finalizeOrderBtn.disabled = !canFinalize;
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }

    // Chama as funções de renderização filhas
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---

// Esta função é chamada pelos checkboxes (onchange)
window.activateItemSelection = (mode = null) => {
    const allCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox');
    const selectAllBox = document.getElementById('selectAllItems');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');
    
    if (!deleteBtn || !transferBtn || !selectAllBox) return;

    if (mode === 'toggleAll') {
        allCheckboxes.forEach(box => box.checked = selectAllBox.checked);
    }

    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    const count = selectedCheckboxes.length;

    isMassSelectionActive = count > 0;
    
    // Atualiza contadores
    document.getElementById('deleteCount').textContent = count;
    document.getElementById('transferCount').textContent = count;
    
    // Habilita/Desabilita botões
    [deleteBtn, transferBtn].forEach(btn => {
        btn.disabled = !isMassSelectionActive;
        btn.classList.toggle('opacity-50', !isMassSelectionActive);
        btn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);
    });

    // Atualiza "Selecionar Todos"
    if (count === allCheckboxes.length && allCheckboxes.length > 0) {
        selectAllBox.checked = true;
    } else {
        selectAllBox.checked = false;
    }

    // Coleta itens para transferência
    window.itemsToTransfer = [];
    selectedCheckboxes.forEach(box => {
        try {
            const items = JSON.parse(box.dataset.items);
            window.itemsToTransfer.push(...items);
        } catch(e) { console.error("Erro ao ler dados de item para transferência:", e); }
    });
};

// INICIA fluxo de senha (chamada pelos botões com contador)
export const handleMassActionRequest = (action) => {
    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert("Nenhum item selecionado.");
        return;
    }
    // Chama a função GLOBAL do app.js
    if (action === 'delete') {
        window.openManagerAuthModal('executeMassDelete', null);
    } else if (action === 'transfer') {
        window.openManagerAuthModal('executeMassTransfer', null);
    }
};
// window.handleMassActionRequest = handleMassActionRequest; // Exposto no app.js

// AÇÃO REAL (chamada pelo app.js)
export const handleMassDeleteConfirmed = async () => {
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado para exclusão.");
        return;
    }

    const itemsToDelete = window.itemsToTransfer;
    const tableRef = getTableDocRef(currentTableId);
    
    // Calcula o valor a ser removido do total
    const valueToDecrease = itemsToDelete.reduce((sum, item) => sum + (item.price || 0), 0);
    const currentTotal = currentOrderSnapshot?.total || 0;
    const newTotal = Math.max(0, currentTotal - valueToDecrease); // Evita total negativo

    try {
        const batch = writeBatch(getFirestore());
        
        itemsToDelete.forEach(item => {
            batch.update(tableRef, { sentItems: arrayRemove(item) });
        });
        
        batch.update(tableRef, { total: newTotal });
        
        await batch.commit();
        
        alert(`${itemsToDelete.length} item(s) removidos da conta.`);
        window.itemsToTransfer = [];
        // O listener do app.js vai atualizar a UI
        
    } catch (e) {
        console.error("Erro ao excluir itens em massa:", e);
        alert("Falha ao remover os itens.");
    }
};

// AÇÃO REAL (chamada pelo app.js)
export function openTableTransferModal() {
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado para transferência.");
        return;
    }
    
    // Limpa o modal antes de exibir
    if(targetTableInput) targetTableInput.value = '';
    const newTableDinersInputEl = document.getElementById('newTableDinersInput');
    if(newTableDinersInputEl) newTableDinersInputEl.classList.add('hidden');
    const confirmBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Prosseguir';
    }
    
    if (tableTransferModal) {
        tableTransferModal.style.display = 'flex';
    } else {
        alert("Erro: Modal de transferência não encontrado.");
    }
};
// window.openTableTransferModal = openTableTransferModal; // Exposto no app.js

export function handleConfirmTableTransfer() {
     const targetTableInput = document.getElementById('targetTableInput');
     const targetTableNumber = targetTableInput?.value.trim();
     if (!targetTableNumber || parseInt(targetTableNumber) <= 0 || targetTableNumber === currentTableId) { 
         alert("Insira um número de mesa de destino válido.");
         return; 
     }
     
     const items = window.itemsToTransfer || [];
     if(items.length === 0) { 
         alert("Erro: Nenhum item selecionado (window.itemsToTransfer está vazio).");
         return; 
     }
     
     const dinersInput = document.getElementById('newTableDiners');
     const sectorInput = document.getElementById('newTableSector');
     const dinersContainer = document.getElementById('newTableDinersInput');
     let diners = 0; let sector = '';
     
     if (dinersContainer && !dinersContainer.classList.contains('hidden')) {
         diners = parseInt(dinersInput?.value);
         sector = sectorInput?.value;
         if (!diners || !sector) { alert('Mesa destino fechada. Preencha pessoas e setor.'); return; }
     }
     
     const confirmBtn = document.getElementById('confirmTableTransferBtn');
     if(confirmBtn) confirmBtn.disabled = true;
     
     // Chama a função GLOBAL do app.js
     window.handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);
     
     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = [];
 };
// window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Exposto no app.js

// Placeholders (Exportados)
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => {
    // Encontra os botões que acabaram de ser criados pela renderReviewItemsList
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');

    // **CORREÇÃO:** Garante que os botões chamem a função global
    if (massDeleteBtn) {
         // Clona para remover listeners antigos
         const newDeleteBtn = massDeleteBtn.cloneNode(true);
         massDeleteBtn.parentNode.replaceChild(newDeleteBtn, massDeleteBtn);
         newDeleteBtn.addEventListener('click', () => window.handleMassActionRequest('delete')); // Chama global
    }
     if (massTransferBtn) {
         // Clona para remover listeners antigos
         const newTransferBtn = massTransferBtn.cloneNode(true);
         massTransferBtn.parentNode.replaceChild(newTransferBtn, massTransferBtn);
         newTransferBtn.addEventListener('click', () => window.handleMassActionRequest('transfer')); // Chama global
    }
    
    // Listener para os checkboxes (já está no onchange inline)
    // Listener para o selectAll (já está no onchange inline)
};

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos
    reviewItemsList = document.getElementById('reviewItemsList');
    paymentSplitsContainer = document.getElementById('paymentSplitsContainer');
    addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    orderSubtotalDisplay = document.getElementById('orderSubtotalDisplayPayment');
    orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplayPayment');
    orderTotalDisplay = document.getElementById('orderTotalDisplayPayment');
    valuePerDinerDisplay = document.getElementById('valuePerDinerDisplay');
    remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    dinersSplitInput = document.getElementById('dinersSplitInput');
    paymentSummaryList = document.getElementById('paymentSummaryList');
    chargeInputs = document.getElementById('chargeInputs');
    openCustomerRegBtn = document.getElementById('openCustomerRegBtn');
    customerSearchInput = document.getElementById('customerSearchInput');
    paymentMethodButtonsContainer = document.getElementById('paymentMethodButtons');
    paymentValueInput = document.getElementById('paymentValueInput');
    openCalculatorBtn = document.getElementById('openCalculatorBtn');
    addPaymentBtn = document.getElementById('addPaymentBtn');
    finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    openNfeModalBtn = document.getElementById('openNfeModalBtn');
    calculatorModal = document.getElementById('calculatorModal');
    calcDisplay = document.getElementById('calcDisplay');
    calcButtons = calculatorModal?.querySelector('.grid');
    closeCalcBtnX = document.getElementById('closeCalcBtnX');
    tableTransferModal = document.getElementById('tableTransferModal');
    
    if (tableTransferModal) {
         targetTableInput = tableTransferModal.querySelector('#targetTableInput');
         confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn');
         transferStatus = tableTransferModal.querySelector('#transferStatus');
    }
    
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    if(selectiveTransferModal) {
        transferItemsList = selectiveTransferModal.querySelector('#transferItemsList');
    }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId) return;
        const newState = !currentOrderSnapshot?.serviceTaxApplied;
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: newState });
            // O listener do app.js vai atualizar a UI
        } catch(e) { console.error("Erro ao atualizar taxa de serviço:", e); }
    });
    
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if(addPaymentBtn) addPaymentBtn.disabled = !paymentValueInput.value;
        }
    });

    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => {
        const activeMethod = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        if(addPaymentBtn) addPaymentBtn.disabled = !e.target.value || !activeMethod;
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
        const activeMethodBtn = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        const method = activeMethodBtn?.dataset.method;
        let value = paymentValueInput.value.trim().replace(',', '.');
        
        if (!method || !value) {
            alert("Selecione um método e insira um valor.");
            return;
        }

        const numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue <= 0) {
            alert("Valor inválido.");
            return;
        }

        const newPayment = {
            method: method,
            value: formatCurrency(numericValue),
            timestamp: Date.now() 
        };

        try {
            await updateDoc(getTableDocRef(currentTableId), {
                payments: arrayUnion(newPayment)
            });
            
            // Limpa os campos
            paymentValueInput.value = '';
            activeMethodBtn.classList.remove('active');
            addPaymentBtn.disabled = true;
            // O listener do app.js vai atualizar a UI
            
        } catch (e) {
            console.error("Erro ao adicionar pagamento:", e);
            alert("Erro ao salvar pagamento.");
        }
    });
    
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    
    if (calcButtons) calcButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !calcDisplay) return;
        
        const key = btn.textContent;

        if (key === 'OK') {
            if(paymentValueInput) paymentValueInput.value = calcDisplay.value;
            if (calculatorModal) calculatorModal.style.display = 'none';
             // Dispara evento de input para revalidar o botão "Adicionar Pagamento"
            if(paymentValueInput) paymentValueInput.dispatchEvent(new Event('input'));
            return;
        }
        if (key === 'C') {
            calcDisplay.value = '';
            return;
        }
        if (key === '←') {
            calcDisplay.value = calcDisplay.value.slice(0, -1);
            return;
        }
        if (key === ',' && calcDisplay.value.includes(',')) {
            return; // Só permite uma vírgula
        }
        if (calcDisplay.value.length >= 10) return;

        calcDisplay.value += key;
    });
    
    if(confirmTransferBtn) {
        // Remove listener antigo se houver
        const newConfirmBtn = confirmTransferBtn.cloneNode(true);
        confirmTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTransferBtn);
        // Adiciona o novo listener
        newConfirmBtn.addEventListener('click', handleConfirmTableTransfer);
    }

    if (targetTableInput) {
        targetTableInput.addEventListener('input', async (e) => {
            const tableNumber = e.target.value.trim();
            const confirmBtn = document.getElementById('confirmTableTransferBtn');
            const newTableDinersInputEl = document.getElementById('newTableDinersInput');
            const transferStatusEl = tableTransferModal?.querySelector('#transferStatus'); 
            
            if(!confirmBtn || !newTableDinersInputEl) return; 

            confirmBtn.disabled = true;
            newTableDinersInputEl.classList.add('hidden');
            confirmBtn.textContent = 'Verificando...';
            if(transferStatusEl) transferStatusEl.classList.add('hidden');

            if (tableNumber && tableNumber !== currentTableId) {
                 try {
                    const targetRef = getTableDocRef(tableNumber);
                    const targetSnap = await getDoc(targetRef);
                    if (targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open') {
                         confirmBtn.textContent = `Transferir para Mesa ${tableNumber}`;
                         confirmBtn.disabled = false;
                         if(transferStatusEl) { /* ... */ }
                    } else {
                         newTableDinersInputEl.classList.remove('hidden');
                         confirmBtn.textContent = `Abrir Mesa ${tableNumber} e Transferir`;
                         confirmBtn.disabled = false;
                         if(transferStatusEl) { /* ... */ }
                    }
                 } catch (error) { 
                     console.error("Erro ao verificar mesa destino:", error);
                     confirmBtn.textContent = 'Erro ao verificar';
                 }
            } else if (tableNumber === currentTableId) {
                 confirmBtn.textContent = 'Mesa igual à atual';
                 if(transferStatusEl) { /* ... */ }
            } else {
                 confirmBtn.textContent = 'Prosseguir';
            }
       });
    } else {
        console.warn("[PaymentController] Input 'targetTableInput' (do modal de transferência) não encontrado.");
    }

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
