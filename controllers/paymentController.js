// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js"; // Apenas estados globais necessários
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js"; // Importa função de transferência

// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX; // Elementos da Calculadora
let selectiveTransferModal, targetTableInput, checkTargetTableBtn, confirmTransferBtn, transferStatus, transferItemsList; // Elementos Transferência
let tableTransferModal; // Elementos Transferência de Mesa

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---

// Renderiza Itens no Resumo da Conta (com checkboxes)
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    // Atualiza ícones de ação em massa
    const transferBtn = document.getElementById('itemMassTransferBtn');
    const deleteBtn = document.getElementById('itemMassDeleteBtn');
    if(transferBtn) transferBtn.classList.toggle('text-yellow-400', isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-red-400', isMassSelectionActive);
    if(transferBtn) transferBtn.classList.toggle('text-gray-400', !isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-gray-400', !isMassSelectionActive);

    if (mainAccountItemsCount === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal.</div>`;
        return;
    }

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey;
        const massItemKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(',');
        const disabledAttr = isMassSelectionActive ? '' : 'disabled';
        const checkedAttr = document.querySelector(`.item-select-checkbox[data-group-key="${groupKey}"]:checked`) ? 'checked' : '';

        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-600 hover:bg-gray-700 transition">
                <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2"
                       data-group-key="${groupKey}" data-item-keys="${massItemKeys}"
                       ${disabledAttr} ${checkedAttr}>
                <div class="flex flex-col flex-grow min-w-0 pr-2">
                    <span class="text-sm font-semibold text-dark-text">${firstItem.name} (${group.totalCount}x)</span>
                    ${firstItem.note ? `<span class="text-xs text-dark-placeholder truncate">(${firstItem.note})</span>` : ''}
                </div>
                <span class="text-sm font-bold text-pumpkin">${formatCurrency(group.totalValue)}</span>
            </div>
        `;
    }).join('');

    reviewItemsList.innerHTML = `
        <div class="flex justify-between items-center pb-2 border-b border-gray-600 mb-2">
            <label class="flex items-center space-x-2 text-sm font-semibold text-dark-text">
                <input type="checkbox" id="selectAllItems" class="h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin">
                <span>Todos</span>
            </label>
            <div class="flex space-x-2">
                 <button id="massTransferBtn" class="px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50" title="Transferir (Gerente)">T (<span id="selectedItemsCount">0</span>)</button>
                 <button id="massDeleteBtn" class="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50" title="Excluir (Gerente)">X (<span id="selectedItemsCountDelete">0</span>)</button>
            </div>
        </div>
        <div class="border border-gray-600 p-2 rounded-lg bg-dark-bg max-h-48 overflow-y-auto">
            ${listHtml}
        </div>
        {/* <p class="text-sm text-dark-placeholder italic p-2 mt-2">Total de ${mainAccountItemsCount} itens na conta principal.</p> */}
    `;

    // Reanexa listeners após renderizar
    attachReviewListListeners();
};

// Renderiza Pagamentos Registrados
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    paymentSummaryList.innerHTML = '';
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-xs text-dark-placeholder italic p-2">Nenhum pagamento registrado.</p>`;
    } else {
        payments.forEach(p => {
            paymentSummaryList.innerHTML += `
                <div class="flex justify-between items-center py-1 border-b border-gray-700">
                    <div class="flex flex-col">
                        <span class="text-xs text-gray-400">${p.method}</span>
                        <span class="font-semibold text-sm text-dark-text">${formatCurrency(p.value)}</span>
                    </div>
                    <button class="text-red-500 hover:text-red-400 transition" onclick="deletePayment(${p.timestamp})" title="Excluir Pagamento (Gerente)">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            `;
        });
    }
};

// Renderiza Contas Divididas (Placeholder)
const renderPaymentSplits = (orderSnapshot) => {
     if (!paymentSplitsContainer) return;
     // Lógica placeholder por enquanto
     paymentSplitsContainer.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Funcionalidade de divisão de contas em desenvolvimento.</div>`;
     if(addSplitAccountBtn) addSplitAccountBtn.disabled = true; // Desabilita botão por hora
};

// Renderiza o Resumo Financeiro Total
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return; // Só renderiza se o controller estiver init

    const subtotal = orderSnapshot.total || 0;
    const payments = orderSnapshot.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + p.value, 0);
    const serviceTaxApplied = orderSnapshot.serviceTaxApplied || false;
    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = diners > 0 ? generalTotal / diners : 0;
    const remainingBalance = generalTotal - currentPaymentsTotal;
    const isClosed = remainingBalance <= 0.01; // Considera pequena margem para float
    const displayBalance = Math.abs(remainingBalance);

    // Atualiza textos
    if(paymentTableNumber) paymentTableNumber.textContent = `Mesa ${tableId}`;
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
    updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));

    // Atualiza Valor Restante/Troco
    if (remainingBalanceDisplay) {
        remainingBalanceDisplay.textContent = formatCurrency(displayBalance);
        remainingBalanceDisplay.classList.remove('text-red-400', 'text-green-400', 'text-dark-text');
        if (!isClosed) {
            remainingBalanceDisplay.classList.add('text-red-400');
            remainingBalanceDisplay.previousElementSibling.textContent = 'VALOR RESTANTE:';
        } else if (remainingBalance < -0.01) {
            remainingBalanceDisplay.classList.add('text-green-400');
            remainingBalanceDisplay.previousElementSibling.textContent = 'TROCO:';
        } else {
            remainingBalanceDisplay.classList.add('text-dark-text');
            remainingBalanceDisplay.previousElementSibling.textContent = 'VALOR RESTANTE:';
        }
    }

    // Botão Taxa
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('hover:bg-green-700', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-red-600', !serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('hover:bg-red-700', !serviceTaxApplied);
    }

    // Botões Finalizar/NFe
    if (finalizeOrderBtn) finalizeOrderBtn.disabled = !isClosed;
    if (openNfeModalBtn) openNfeModalBtn.disabled = !isClosed; // Botão NF-e depende de conta fechada
    if (addPaymentBtn) addPaymentBtn.disabled = isClosed; // Desabilita Add Pagamento se conta fechada

    // Renderiza sub-componentes
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot); // Renderiza divisão (placeholder)
};


// --- LÓGICAS DE AÇÃO ---

// Ativa/Desativa modo de seleção em massa
export function activateItemSelection(action) {
    /* ... (lógica mantida como antes) ... */
    const checkboxes = document.querySelectorAll('.item-select-checkbox');
    if (!checkboxes.length && !isMassSelectionActive) { alert("Não há itens para selecionar."); return; }

    if (!isMassSelectionActive) {
        isMassSelectionActive = true;
        checkboxes.forEach(cb => { cb.disabled = false; cb.checked = false; });
        alert(`SELEÇÃO ATIVA para ${action.toUpperCase()}. Clique no ícone novamente para executar.`);
    } else {
        isMassSelectionActive = false;
        const selectedGroups = Array.from(checkboxes).filter(cb => cb.checked).map(cb => ({ groupKey: cb.dataset.groupKey, itemKeys: cb.dataset.itemKeys.split(',') }));
        checkboxes.forEach(cb => { cb.disabled = true; cb.checked = false; });

        if (selectedGroups.length === 0) {
            alert("Nenhum item selecionado. Modo desativado.");
        } else if (action === 'transfer') {
            const allItemKeys = selectedGroups.flatMap(group => group.itemKeys);
            const itemsToTransferPayload = allItemKeys.map(key => {
                const [orderId, sentAt] = key.split('_');
                return currentOrderSnapshot.sentItems.find(item => item.orderId === orderId && item.sentAt == sentAt);
            }).filter(Boolean);
            openTableTransferModal(itemsToTransferPayload);
        } else if (action === 'delete') {
            handleMassDeleteConfirmed(selectedGroups);
        }
    }
    renderReviewItemsList(currentOrderSnapshot); // Re-renderiza para atualizar UI
}
// Expor globalmente se necessário
// window.activateItemSelection = activateItemSelection;

// Ponto de entrada para ações em massa (chamado pelo HTML)
export const handleMassActionRequest = (action) => {
    if (isMassSelectionActive) {
        activateItemSelection(action); // Executa se já ativo
    } else {
        // Pede senha para ativar
        openManagerAuthModal(action === 'delete' ? 'openMassDelete' : 'openMassTransfer', action);
    }
};
// Expor globalmente
window.handleMassActionRequest = handleMassActionRequest;


// Confirmação Exclusão em Massa
export const handleMassDeleteConfirmed = async (selectedGroups) => { /* ... (lógica mantida) ... */ };
// Expor globalmente se necessário
// window.handleMassDeleteConfirmed = handleMassDeleteConfirmed;


// Abre Modal de Transferência de Mesa
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
// Expor globalmente
window.openTableTransferModal = openTableTransferModal;


// Confirma Transferência de Mesa
export function handleConfirmTableTransfer() { /* ... (lógica mantida, usa import handleTableTransferConfirmed) ... */ };
// Expor globalmente para listener
window.handleConfirmTableTransfer = handleConfirmTableTransfer;


// Adiciona Conta Dividida (Placeholder)
export const handleAddSplitAccount = async () => { alert("Divisão de conta em desenvolvimento."); };
// Expor globalmente
window.handleAddSplitAccount = handleAddSplitAccount;


// Placeholders para ações de split
const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
window.openPaymentModalForSplit = openPaymentModalForSplit;
const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
window.moveItemsToMainAccount = moveItemsToMainAccount;
const openSplitTransferModal = (targetKey, mode) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
window.openSplitTransferModal = openSplitTransferModal;


// Finaliza Conta (Placeholder)
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };


// --- INICIALIZAÇÃO DO CONTROLLER ---

// Anexa listeners aos checkboxes e botões de ação em massa (chamado após renderReviewItemsList)
const attachReviewListListeners = () => {
    const selectAllItems = document.getElementById('selectAllItems');
    const itemCheckboxes = reviewItemsList.querySelectorAll('.item-checkbox');
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');
    const selectedCountSpan = document.getElementById('selectedItemsCount');
    const selectedCountDeleteSpan = document.getElementById('selectedItemsCountDelete');

    const updateMassActionButtons = () => {
        const checkedCount = reviewItemsList.querySelectorAll('.item-checkbox:checked').length;
        if (massDeleteBtn) massDeleteBtn.disabled = checkedCount === 0;
        if (massTransferBtn) massTransferBtn.disabled = checkedCount === 0;
        if (selectedCountSpan) selectedCountSpan.textContent = checkedCount;
        if (selectedCountDeleteSpan) selectedCountDeleteSpan.textContent = checkedCount;
        if (selectAllItems) selectAllItems.checked = checkedCount === itemCheckboxes.length && itemCheckboxes.length > 0;
    };

    if (selectAllItems) {
        // Remove listener antigo para evitar duplicação
        selectAllItems.replaceWith(selectAllItems.cloneNode(true));
        document.getElementById('selectAllItems').addEventListener('change', (e) => {
            itemCheckboxes.forEach(cb => cb.checked = e.target.checked);
            updateMassActionButtons();
        });
    }

    itemCheckboxes.forEach(cb => {
        // Remove listener antigo
        cb.replaceWith(cb.cloneNode(true));
        reviewItemsList.querySelector(`.item-checkbox[value="${cb.value}"]`)
            ?.addEventListener('change', updateMassActionButtons);
    });

    // Reanexa listeners aos botões de ação em massa
    if (massDeleteBtn) {
         massDeleteBtn.replaceWith(massDeleteBtn.cloneNode(true)); // Limpa listeners antigos
         document.getElementById('massDeleteBtn').addEventListener('click', () => handleMassActionRequest('delete'));
    }
     if (massTransferBtn) {
         massTransferBtn.replaceWith(massTransferBtn.cloneNode(true));
         document.getElementById('massTransferBtn').addEventListener('click', () => handleMassActionRequest('transfer'));
    }

    updateMassActionButtons(); // Atualiza estado inicial
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
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    targetTableInput = document.getElementById('targetTableInput'); // Input no modal de transferência
    checkTargetTableBtn = document.getElementById('checkTargetTableBtn');
    confirmTransferBtn = document.getElementById('confirmTransferBtn');
    transferStatus = document.getElementById('transferStatus');
    transferItemsList = document.getElementById('transferItemsList');
    tableTransferModal = document.getElementById('tableTransferModal'); // Modal de confirmação de transferência


    // Adiciona Listeners
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId || !currentOrderSnapshot) return;
        const currentStatus = currentOrderSnapshot.serviceTaxApplied || false;
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: !currentStatus });
        } catch(e) { console.error("Erro ao alternar taxa:", e); }
    });

    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));

    if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount);

    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-pumpkin', 'text-white'));
            btn.classList.add('active', 'bg-pumpkin', 'text-white');
            if(addPaymentBtn) addPaymentBtn.disabled = false;
        }
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
         if (!currentTableId || !currentOrderSnapshot) return;
         const value = getNumericValueFromCurrency(paymentValueInput.value);
         const activeMethodBtn = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
         const method = activeMethodBtn ? activeMethodBtn.dataset.method : null;

         if (!method || value <= 0) { alert("Selecione método e valor."); return; }

         const newPayment = { method, value, timestamp: Date.now(), userId: window.userId || 'unknown' }; // Usa userId global
         try {
             await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
             paymentValueInput.value = 'R$ 0,00';
             activeMethodBtn.classList.remove('active', 'bg-pumpkin', 'text-white');
             addPaymentBtn.disabled = true;
         } catch(e) { console.error("Erro ao adicionar pagamento:", e); alert("Falha ao registrar pagamento."); }
    });

    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    // Listener do NFe já está no app.js

    // Listeners da Calculadora
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { /* ... (lógica mantida) ... */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... (lógica mantida) ... */ });

     // Listeners do Modal de Transferência (aberto via ação em massa)
    const confirmTableTransferBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmTableTransferBtn) confirmTableTransferBtn.addEventListener('click', handleConfirmTableTransfer);

    if (targetTableInput) targetTableInput.addEventListener('input', async (e) => {
        const tableNumber = e.target.value.trim();
        const confirmBtn = document.getElementById('confirmTableTransferBtn');
        const newTableDinersInputEl = document.getElementById('newTableDinersInput'); // Elemento container
        confirmBtn.disabled = true; // Desabilita por padrão ao digitar
        if(newTableDinersInputEl) newTableDinersInputEl.classList.add('hidden');
        confirmBtn.textContent = 'Verificando...';

        if (tableNumber && tableNumber !== currentTableId) {
             try {
                const targetRef = getTableDocRef(tableNumber);
                const targetSnap = await getDoc(targetRef);
                if (targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open') {
                     confirmBtn.textContent = `Transferir para Mesa ${tableNumber}`;
                     confirmBtn.disabled = false;
                } else {
                     // Mesa não existe ou está fechada -> Pede para abrir
                     if(newTableDinersInputEl) newTableDinersInputEl.classList.remove('hidden');
                     confirmBtn.textContent = `Abrir Mesa ${tableNumber} e Transferir`;
                     confirmBtn.disabled = false; // Habilita para abrir e transferir
                }
             } catch (error) {
                 console.error("Erro ao verificar mesa de destino:", error);
                 confirmBtn.textContent = 'Erro ao verificar';
             }
        } else if (tableNumber === currentTableId) {
             confirmBtn.textContent = 'Mesa igual à atual';
        } else {
             confirmBtn.textContent = 'Prosseguir'; // Estado inicial se vazio
        }
   });


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
