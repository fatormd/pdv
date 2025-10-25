// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js";

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
    const taxRate = applyServiceTax ? 0.10 : 0;
    const serviceValue = subtotal * taxRate;
    const total = subtotal + serviceValue;
    return { total, serviceValue };
};
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};
const groupMainAccountItems = (orderSnapshot) => {
    if (!orderSnapshot || !orderSnapshot.sentItems) return {};
    const sentItems = orderSnapshot.sentItems || [];
    
    // Agrupa diretamente os sentItems (lógica de splits removida por hora)
    return sentItems.reduce((acc, item) => {
        const groupKey = `${item.name}-${item.note || ''}`;
        if (!acc[groupKey]) {
            acc[groupKey] = { items: [], totalCount: 0, totalValue: 0, groupKey: groupKey };
        }
        acc[groupKey].items.push(item);
        acc[groupKey].totalCount++;
        acc[groupKey].totalValue += (item.price || 0);
        return acc;
    }, {});
};

// --- FUNÇÕES DE AÇÃO ---
// AÇÃO REAL (chamada pelo app.js após a senha)
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !currentOrderSnapshot) return;
    const tsNumber = parseInt(timestamp);
    const paymentToDelete = currentOrderSnapshot.payments?.find(p => p.timestamp === tsNumber);
    if (!paymentToDelete) { alert("Pagamento não encontrado."); return; }
    const tableRef = getTableDocRef(currentTableId);
    try {
        await updateDoc(tableRef, { payments: arrayRemove(paymentToDelete) });
        alert("Pagamento removido da lista.");
    } catch (e) { console.error("Erro ao deletar pagamento:", e); alert("Erro ao tentar remover."); }
}

// INICIA o fluxo de senha (chamada pelo HTML)
export const deletePayment = async (timestamp) => {
    window.openManagerAuthModal('deletePayment', timestamp);
}
window.deletePayment = deletePayment; // Expor globalmente


// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (lógica mantida) ... */ };
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    paymentSummaryList.innerHTML = '';
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-xs text-dark-placeholder italic p-2">Nenhum pagamento registrado.</p>`;
    } else {
        payments.forEach(p => {
            const paymentDiv = document.createElement('div');
            paymentDiv.className = "flex justify-between items-center py-1 border-b border-gray-700";
            paymentDiv.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-xs text-gray-400">${p.method}</span>
                    <span class="font-semibold text-sm text-dark-text">${formatCurrency(p.value)}</span>
                </div>
                <button class="delete-payment-btn text-red-500 hover:text-red-400 transition" title="Excluir Pagamento (Gerente)">
                    <i class="fas fa-trash text-sm pointer-events-none"></i>
                </button>
            `;
            const deleteBtn = paymentDiv.querySelector('.delete-payment-btn');
            if (deleteBtn) {
                deleteBtn.onclick = () => deletePayment(p.timestamp); // Chama a função exportada
            }
            paymentSummaryList.appendChild(paymentDiv);
        });
    }
};
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };
const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = '';
    PAYMENT_METHODS.forEach(method => {
        paymentMethodButtonsContainer.innerHTML += `
            <button class="payment-method-btn bg-dark-input text-dark-text border border-gray-600" data-method="${method}">
                ${method}
            </button>
        `;
    });
};
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (lógica mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
export function activateItemSelection(action) { /* ... (lógica mantida) ... */ };
export const handleMassActionRequest = (action) => { /* ... (lógica mantida) ... */ };
export const handleMassDeleteConfirmed = async (selectedGroups) => { /* ... (lógica mantida) ... */ };
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (lógica mantida) ... */ };
window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Expor globalmente

// Placeholders (Exportados)
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (lógica mantida) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // **CORREÇÃO:** Mapeia TODOS os elementos PRIMEIRO
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
    
    // Mapeia modais e seus conteúdos
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    tableTransferModal = document.getElementById('tableTransferModal');
    
    // **CORREÇÃO:** Mapeia elementos *dentro* dos modais com segurança
    if (tableTransferModal) { 
         targetTableInput = tableTransferModal.querySelector('#targetTableInput'); // <-- Input da Mesa de Destino
         confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn');
         transferStatus = tableTransferModal.querySelector('#transferStatus');
         // checkTargetTableBtn não é mais usado, a lógica está no input
    }
    if(selectiveTransferModal) {
        transferItemsList = selectiveTransferModal.querySelector('#transferItemsList');
        // Se houver outros elementos no selectiveTransferModal, mapeie-os aqui
    }

    // Verifica elemento essencial
    if (!reviewItemsList) {
        console.error("[PaymentController] Erro Fatal: Elemento 'reviewItemsList' não encontrado.");
        return; // Interrompe
    }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId || !currentOrderSnapshot) return;
        const currentStatus = currentOrderSnapshot.serviceTaxApplied === undefined ? true : currentOrderSnapshot.serviceTaxApplied;
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: !currentStatus });
            console.log(`Taxa de serviço ${!currentStatus ? 'aplicada' : 'removida'}.`);
        } catch(e) { console.error("Erro ao alternar taxa:", e); }
    });
    
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    // if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Desabilitado
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-pumpkin', 'text-white'));
            btn.classList.add('active', 'bg-pumpkin', 'text-white');
            if(addPaymentBtn && remainingBalanceDisplay) {
                 const isClosed = remainingBalanceDisplay.classList.contains('text-green-400') || (getNumericValueFromCurrency(remainingBalanceDisplay.textContent || 'R$ 0,00') === 0 && (currentOrderSnapshot?.payments?.length || 0) > 0);
                 addPaymentBtn.disabled = isClosed;
            }
        }
    });
    
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
         if (!currentTableId || !currentOrderSnapshot) return;
         const value = getNumericValueFromCurrency(paymentValueInput?.value || '0');
         const activeMethodBtn = paymentMethodButtonsContainer?.querySelector('.payment-method-btn.active');
         const method = activeMethodBtn ? activeMethodBtn.dataset.method : null;
         if (!method || value <= 0) { alert("Selecione método e valor válido."); return; }
         const newPayment = { method, value, timestamp: Date.now(), userId: window.userId || 'unknown' };
         try {
             await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
             if(paymentValueInput) paymentValueInput.value = 'R$ 0,00';
             activeMethodBtn?.classList.remove('active', 'bg-pumpkin', 'text-white');
             addPaymentBtn.disabled = true;
         } catch(e) { console.error("Erro ao adicionar pagamento:", e); alert("Falha ao registrar pagamento."); }
    });

    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    
    // Listeners da Calculadora
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; /* ... */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... (lógica da calc mantida) ... */ });

    // Listener do Modal de Transferência de Mesa (Confirmação)
    if(confirmTransferBtn) {
        // Limpa listeners antigos clonando
        const newConfirmBtn = confirmTransferBtn.cloneNode(true);
        confirmTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTransferBtn);
        newConfirmBtn.addEventListener('click', handleConfirmTableTransfer);
    }

    // Listener do Input da Mesa de Destino
    if (targetTableInput) { // **CORREÇÃO:** Garante que o listener só é anexado se o input foi encontrado
        targetTableInput.addEventListener('input', async (e) => {
            const tableNumber = e.target.value.trim();
            const confirmBtn = document.getElementById('confirmTableTransferBtn'); // Busca novamente por segurança
            const newTableDinersInputEl = document.getElementById('newTableDinersInput');
            const transferStatusEl = document.getElementById('transferStatus'); // Este ID está no modal selectiveTransfer?

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
                         if(transferStatusEl) { /* ... (lógica status OK) ... */ }
                    } else {
                         newTableDinersInputEl.classList.remove('hidden');
                         confirmBtn.textContent = `Abrir Mesa ${tableNumber} e Transferir`;
                         confirmBtn.disabled = false;
                         if(transferStatusEl) { /* ... (lógica status Fechada) ... */ }
                    }
                 } catch (error) {
                     console.error("Erro ao verificar mesa:", error);
                     confirmBtn.textContent = 'Erro ao verificar';
                     if(transferStatusEl) { /* ... (lógica status Erro) ... */ }
                 }
            } else if (tableNumber === currentTableId) {
                 confirmBtn.textContent = 'Mesa igual à atual';
                 if(transferStatusEl) { /* ... (lógica status Erro) ... */ }
            } else {
                 confirmBtn.textContent = 'Prosseguir';
            }
       });
    } else {
        console.warn("[PaymentController] Input 'targetTableInput' (do modal de transferência) não encontrado. A transferência pode não funcionar.");
    }

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
