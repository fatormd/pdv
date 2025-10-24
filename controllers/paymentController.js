// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js";

// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
// ... (outras variáveis mantidas) ...
let paymentSummaryList; // Certifique-se que esta está declarada aqui

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---

// Função para executar a exclusão de pagamento APÓS autenticação
const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !currentOrderSnapshot) return;
    const tsNumber = parseInt(timestamp);
    const paymentToDelete = currentOrderSnapshot.payments?.find(p => p.timestamp === tsNumber);

    if (!paymentToDelete) {
         alert("Pagamento não encontrado.");
         return;
    }

    const tableRef = getTableDocRef(currentTableId);
    try {
        await updateDoc(tableRef, {
            payments: arrayRemove(paymentToDelete)
        });
        alert("Pagamento removido da lista.");
        // O onSnapshot do app.js cuidará de re-renderizar
    } catch (e) {
        console.error("Erro ao deletar pagamento:", e);
        alert("Erro ao tentar remover o pagamento.");
    }
}

// CORRIGIDO: Função para deletar um pagamento (chama autenticação) - Exportada Corretamente
export const deletePayment = async (timestamp) => {
    // Chama o modal de autenticação, passando a ação e o timestamp
    // A função openManagerAuthModal é importada e chamada diretamente
    openManagerAuthModal('deletePayment', timestamp);
}
// REMOVIDO: window.deletePayment = deletePayment; // Remove a atribuição global

// --- FUNÇÕES DE RENDERIZAÇÃO ---

const renderReviewItemsList = (orderSnapshot) => { /* ... (lógica mantida) ... */ };

// Renderiza Pagamentos Registrados
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    paymentSummaryList.innerHTML = ''; // Limpa antes de renderizar

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
                    <i class="fas fa-trash text-sm pointer-events-none"></i> {/* Evita que o ícone capture o clique */}
                </button>
            `;
            // Adiciona listener programaticamente
            const deleteBtn = paymentDiv.querySelector('.delete-payment-btn');
            if (deleteBtn) {
                // Passa o timestamp diretamente para a função deletePayment importada
                deleteBtn.onclick = () => deletePayment(p.timestamp);
            }
            paymentSummaryList.appendChild(paymentDiv);
        });
    }
};


const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };

// Renderiza o Resumo Financeiro Total
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return;

    const subtotal = orderSnapshot.total || 0;
    const payments = orderSnapshot.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + (p.value || 0), 0);
    const serviceTaxApplied = orderSnapshot.serviceTaxApplied === undefined ? true : orderSnapshot.serviceTaxApplied;
    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = diners > 0 ? generalTotal / diners : 0;
    const remainingBalance = generalTotal - currentPaymentsTotal;
    const isClosed = remainingBalance <= 0.01;
    const displayBalance = Math.abs(remainingBalance);

    // Atualiza textos (usando a função auxiliar)
    const paymentTableNumberEl = document.getElementById('payment-table-number');
    if (paymentTableNumberEl) paymentTableNumberEl.textContent = `Mesa ${tableId}`;
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
    updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));

    // Atualiza Valor Restante/Troco
    if (remainingBalanceDisplay) {
        remainingBalanceDisplay.textContent = formatCurrency(displayBalance);
        const label = remainingBalanceDisplay.previousElementSibling;
        remainingBalanceDisplay.classList.remove('text-red-400', 'text-green-400', 'text-dark-text');
        if (!isClosed) {
            remainingBalanceDisplay.classList.add('text-red-400');
            if(label) label.textContent = 'VALOR RESTANTE:';
        } else if (remainingBalance < -0.01) {
            remainingBalanceDisplay.classList.add('text-green-400');
            if(label) label.textContent = 'TROCO:';
        } else {
            remainingBalanceDisplay.classList.add('text-dark-text');
            if(label) label.textContent = 'VALOR RESTANTE:';
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

    // Botões Finalizar/NFe/Add Pagamento
    if (finalizeOrderBtn) finalizeOrderBtn.disabled = !isClosed;
    if (openNfeModalBtn) openNfeModalBtn.disabled = !isClosed;
    if (addPaymentBtn) addPaymentBtn.disabled = isClosed;

    // Renderiza sub-componentes
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
export function activateItemSelection(action) { /* ... (lógica mantida) ... */ };
export const handleMassActionRequest = (action) => { /* ... (lógica mantida) ... */ };
export const handleMassDeleteConfirmed = async (selectedGroups) => { /* ... (lógica mantida) ... */ };
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (lógica mantida) ... */ };

// Placeholders
export const handleAddSplitAccount = async () => { alert("Divisão de conta em desenvolvimento."); };
const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
const openSplitTransferModal = (targetKey, mode) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (lógica mantida) ... */ };

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
    paymentSummaryList = document.getElementById('paymentSummaryList'); // Garante que está mapeado
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
    targetTableInput = document.getElementById('targetTableInput');
    checkTargetTableBtn = document.getElementById('checkTargetTableBtn');
    confirmTransferBtn = document.getElementById('confirmTransferBtn');
    transferStatus = document.getElementById('transferStatus');
    transferItemsList = document.getElementById('transferItemsList');
    tableTransferModal = document.getElementById('tableTransferModal');


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
            if(addPaymentBtn) {
                // Habilita addPaymentBtn apenas se a conta não estiver fechada
                 const isClosed = remainingBalanceDisplay?.classList.contains('text-green-400') || remainingBalanceDisplay?.textContent === 'R$ 0,00';
                 addPaymentBtn.disabled = isClosed;
            }
        }
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
         if (!currentTableId || !currentOrderSnapshot) return;
         const value = getNumericValueFromCurrency(paymentValueInput?.value || '0'); // Garante fallback
         const activeMethodBtn = paymentMethodButtonsContainer?.querySelector('.payment-method-btn.active');
         const method = activeMethodBtn ? activeMethodBtn.dataset.method : null;

         if (!method || value <= 0) { alert("Selecione método e valor válido."); return; }

         const newPayment = { method, value, timestamp: Date.now(), userId: window.userId || 'unknown' };
         try {
             await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
             if(paymentValueInput) paymentValueInput.value = 'R$ 0,00';
             activeMethodBtn?.classList.remove('active', 'bg-pumpkin', 'text-white');
             addPaymentBtn.disabled = true; // Desabilita após adicionar
         } catch(e) { console.error("Erro ao adicionar pagamento:", e); alert("Falha ao registrar pagamento."); }
    });

    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    // Listener do NFe está no app.js

    // Listeners da Calculadora
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; /* ... */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... (lógica mantida) ... */ });

     // Listeners do Modal de Transferência de Mesa
    const confirmTableTransferBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmTableTransferBtn) confirmTableTransferBtn.addEventListener('click', handleConfirmTableTransfer); // Já definido globalmente

    if (targetTableInput) targetTableInput.addEventListener('input', async (e) => { /* ... (lógica mantida) ... */ });


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
