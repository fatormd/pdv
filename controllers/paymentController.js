// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { goToScreen, userRole, currentTableId, currentOrderSnapshot } from "../app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "../utils.js";
import { getTableDocRef } from "../services/firebaseService.js";
import { updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Variáveis de estado do módulo
let currentPaymentMethod = 'Dinheiro'; // Padrão

// Função para calcular o total geral (subtotal + serviço)
const calculateTotal = (subtotal, applyServiceTax) => {
    const taxRate = applyServiceTax ? 0.10 : 0;
    const serviceValue = subtotal * taxRate;
    const total = subtotal + serviceValue;
    return { total, serviceValue };
};

// Função auxiliar para atualizar texto
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};


// 1. Implementa a lógica para alternar a taxa de serviço (NOVO)
export const handleToggleServiceTax = async () => {
    if (!currentTableId || userRole === 'client') return;

    try {
        const tableRef = getTableDocRef(currentTableId);
        // Toggle baseado no estado atual do snapshot
        const newServiceTaxApplied = !(currentOrderSnapshot?.serviceTaxApplied || false);
        
        await updateDoc(tableRef, {
            serviceTaxApplied: newServiceTaxApplied
        });

        alert(`Taxa de serviço ${newServiceTaxApplied ? 'Aplicada' : 'Removida'} com sucesso.`);
    } catch (e) {
        console.error("Erro ao alternar taxa de serviço:", e);
        alert("Falha ao atualizar a taxa de serviço.");
    }
};
window.handleToggleServiceTax = handleToggleServiceTax;


// 2. Implementa a função de registro de pagamento (NOVO)
export const handleAddPayment = async () => {
    if (!currentTableId || userRole === 'client') return;
    
    const paymentValueInput = document.getElementById('paymentValueInput');
    const paymentMethod = currentPaymentMethod; 

    const rawValue = getNumericValueFromCurrency(paymentValueInput.value);

    if (rawValue <= 0 || !paymentMethod) {
        alert("Selecione um método e insira um valor válido.");
        return;
    }

    const newPayment = {
        method: paymentMethod,
        value: rawValue,
        paidAt: Date.now()
    };
    
    try {
        const tableRef = getTableDocRef(currentTableId);
        
        await updateDoc(tableRef, {
            payments: arrayUnion(newPayment)
        });
        
        alert(`Pagamento de ${formatCurrency(rawValue)} via ${paymentMethod} registrado.`);
        
        // Limpa o input após o sucesso
        paymentValueInput.value = formatCurrency(0); 
        
    } catch (e) {
        console.error("Erro ao adicionar pagamento:", e);
        alert("Erro ao registrar pagamento. Tente novamente.");
    }
};
window.handleAddPayment = handleAddPayment;


// NOVO: Renderiza a lista de itens da conta (para exclusão/transferência em massa)
const renderReviewItemsList = (currentOrderSnapshot) => {
    const listEl = document.getElementById('reviewItemsList');
    if (!listEl) return;
    
    const sentItems = currentOrderSnapshot.sentItems || [];
    
    // Calcula itens já movidos para splits (para não listá-los na conta principal)
    // Usa orderId e sentAt como chave de identificação única do item
    const itemsInSplits = Object.values(currentOrderSnapshot.splits || {})
                                .flatMap(split => split.items.map(item => item.orderId + item.sentAt)); 
    
    const mainAccountItems = sentItems.filter(item => {
        const key = item.orderId + item.sentAt;
        return !itemsInSplits.includes(key);
    });

    if (mainAccountItems.length === 0) {
        listEl.innerHTML = `<div class="text-sm text-gray-500 italic p-2">Nenhum item restante na conta principal.</div>`;
    } else {
        // Agrupamento para exibição
        const groupedItems = mainAccountItems.reduce((acc, item) => {
            const key = `${item.name}-${item.note || ''}`;
            if (!acc[key]) {
                acc[key] = { ...item, count: 0, price: 0 };
            }
            acc[key].count++;
            acc[key].price += item.price;
            return acc;
        }, {});

        const listHtml = Object.values(groupedItems).map(group => `
            <div class="flex justify-between items-center py-1 border-b border-gray-100">
                <span class="text-sm text-gray-700">${group.name} (${group.count}x)</span>
                <span class="text-sm font-semibold">${formatCurrency(group.price)}</span>
            </div>
        `).join('');
        
        listEl.innerHTML = `
            <div class="max-h-40 overflow-y-auto">
                ${listHtml}
            </div>
            <p class="text-sm text-gray-500 italic p-2 mt-2">Total de ${mainAccountItems.length} itens na conta principal. </p>
        `;
    }
};


// NOVO: Renderiza os botões/cards de divisão de conta (Painel 3)
export const renderPaymentSplits = (currentTableId, currentOrderSnapshot) => {
    const paymentSplitsContainer = document.getElementById('paymentSplitsContainer');
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    if (!paymentSplitsContainer || !currentOrderSnapshot) return;

    const sentItems = currentOrderSnapshot.sentItems || [];
    // Inicializa splits se não existir
    const splits = currentOrderSnapshot.splits || {};
    
    // Calcula o total dos itens que JÁ FORAM MOVIMENTADOS para as subcontas
    let totalItemsInSplits = 0;
    Object.values(splits).forEach(split => totalItemsInSplits += split.items.reduce((sum, item) => sum + item.price, 0));

    const totalSentItems = sentItems.reduce((sum, item) => sum + item.price, 0);
    const totalInMainAccount = Math.max(0, totalSentItems - totalItemsInSplits);
    const itemsRemaining = sentItems.length - Object.values(splits).reduce((c, s) => c + (s.items || []).length, 0);
    
    // Apenas o Garçom/Gerente pode adicionar divisões, e se houver itens para dividir
    if (addSplitAccountBtn) {
        addSplitAccountBtn.disabled = userRole === 'client' || itemsRemaining === 0;
    }

    paymentSplitsContainer.innerHTML = '';
    let accountCounter = 0;
    
    // 1. Renderiza a Conta Principal (Restante)
    paymentSplitsContainer.innerHTML += `
        <div class="bg-gray-200 p-3 rounded-lg border border-indigo-400">
            <h4 class="font-bold text-lg flex justify-between items-center text-indigo-800">
                <span>Conta Principal (Restante)</span>
                <span class="text-xl">${formatCurrency(totalInMainAccount)}</span>
            </h4>
            <p class="text-sm text-gray-700 mt-1">
                Itens restantes a pagar: ${itemsRemaining}
            </p>
            <button class="text-xs mt-2 px-3 py-1 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition disabled:opacity-50" 
                    onclick="window.openSplitTransferModal('main', 'move_out')" ${userRole === 'client' || totalInMainAccount === 0 ? 'disabled' : ''}>
                <i class="fas fa-cut"></i> Mover Itens
            </button>
        </div>
    `;

    // 2. Renderiza as Contas de Divisão
    Object.keys(splits).forEach(splitKey => {
        const split = splits[splitKey];
        accountCounter++;
        const splitTotal = split.total || 0;
        const splitPaymentsTotal = split.payments ? split.payments.reduce((sum, p) => sum + p.value, 0) : 0;
        const isPaid = splitTotal <= splitPaymentsTotal;
        
        paymentSplitsContainer.innerHTML += `
            <div class="bg-white p-3 rounded-lg border ${isPaid ? 'border-green-500' : 'border-red-500'} shadow">
                <h4 class="font-bold text-lg flex justify-between items-center text-gray-800">
                    <span>Conta ${accountCounter}</span>
                    <span class="text-xl ${isPaid ? 'text-green-600' : 'text-red-600'}">${formatCurrency(splitTotal)}</span>
                </h4>
                <p class="text-sm text-gray-700 mt-1">
                    Itens: ${split.items.length}. Pagamentos: ${formatCurrency(splitPaymentsTotal)}
                </p>
                <div class="flex space-x-2 mt-2">
                    <button class="text-xs px-3 py-1 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition" 
                            onclick="window.openPaymentModalForSplit('${splitKey}')" ${userRole === 'client' ? 'disabled' : ''}>
                        <i class="fas fa-credit-card"></i> Pagar
                    </button>
                    <button class="text-xs px-3 py-1 bg-gray-500 text-white rounded-full hover:bg-gray-600 transition" 
                            onclick="window.moveItemsToMainAccount('${splitKey}')" ${userRole === 'client' ? 'disabled' : ''}>
                        <i class="fas fa-arrow-left"></i> Desfazer
                    </button>
                </div>
            </div>
        `;
    });
};


// Recalcula e renderiza o resumo de pagamento
export const renderPaymentSummary = (currentTableId, currentOrderSnapshot) => {
    if (!currentOrderSnapshot) return;

    const tableData = currentOrderSnapshot;
    const subtotal = tableData.total || 0; 
    const payments = tableData.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + p.value, 0);

    const serviceTaxApplied = tableData.serviceTaxApplied || false;

    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    
    // Pega o input de valor por pessoa
    const dinersSplitInput = document.getElementById('dinersSplitInput');
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = generalTotal / diners;

    const remainingBalance = generalTotal - currentPaymentsTotal;
    
    // Atualiza UI
    updateText('payment-table-number', `Mesa ${currentTableId}`);
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
    updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    
    // Valor Restante
    const remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    if (remainingBalanceDisplay) {
        remainingBalanceDisplay.textContent = formatCurrency(Math.abs(remainingBalance));
        remainingBalanceDisplay.classList.remove('text-red-600', 'text-green-600', 'text-gray-800');
        if (remainingBalance > 0.01) {
            remainingBalanceDisplay.classList.add('text-red-600'); 
        } else if (remainingBalance < -0.01) {
            remainingBalanceDisplay.classList.add('text-green-600'); 
            remainingBalanceDisplay.textContent = `TROCO: ${formatCurrency(Math.abs(remainingBalance))}`;
        } else {
            remainingBalanceDisplay.classList.add('text-gray-800'); 
        }
    }
    
    // Toggle do botão de serviço
    const toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-red-600', !serviceTaxApplied);
        
        // Adiciona o listener aqui (caso não exista, para evitar duplicação)
        if (!toggleServiceTaxBtn.hasAttribute('data-listener')) {
            toggleServiceTaxBtn.addEventListener('click', handleToggleServiceTax);
            toggleServiceTaxBtn.setAttribute('data-listener', 'true');
        }
    }
    
    // Habilita/Desabilita Finalizar
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    if (finalizeOrderBtn) {
        const canFinalize = remainingBalance <= 0.01 && currentPaymentsTotal > 0;
        finalizeOrderBtn.disabled = !canFinalize;
    }
    
    // Listener para o input de Pessoas (Divisão)
    if (dinersSplitInput && !dinersSplitInput.hasAttribute('data-listener')) {
        dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
        dinersSplitInput.setAttribute('data-listener', 'true');
    }
    
    // NOVO: Renderiza a lista de itens da conta (para exclusão/transferência em massa)
    renderReviewItemsList(currentOrderSnapshot);
    
    // NOVO: Renderiza os botões/cards de divisão
    renderPaymentSplits(currentTableId, currentOrderSnapshot);
};


// NOVO: Adiciona a funcionalidade de adicionar conta de divisão
export const handleAddSplitAccount = async () => {
    if (!currentTableId || userRole === 'client') return;
    
    const splitKey = `split_${Date.now()}`;
    const tableRef = getTableDocRef(currentTableId);

    const newSplit = {
        items: [],
        total: 0,
        payments: [],
        createdAt: Date.now()
    };
    
    // Usa uma chave aninhada para adicionar o novo split
    try {
        const currentSplits = currentOrderSnapshot.splits || {};
        await updateDoc(tableRef, {
            splits: { ...currentSplits, [splitKey]: newSplit }
        });
        alert("Nova conta de divisão adicionada! Agora use o botão 'Mover Itens'.");
    } catch (e) {
        console.error("Erro ao adicionar conta de divisão:", e);
        alert("Erro ao tentar adicionar a conta de divisão.");
    }
};
window.handleAddSplitAccount = handleAddSplitAccount;


// Implementar no futuro: Lógica para mover itens para as subcontas.
const openSplitTransferModal = (targetKey, mode) => {
    // Implementação de um modal para seleção de itens será feita em uma próxima fase
    alert(`Gerenciamento da conta ${targetKey} no modo ${mode} (Em desenvolvimento).`);
};
window.openSplitTransferModal = openSplitTransferModal;


// Implementar no futuro: Lógica para fechar a conta (WooCommerce)
export const handleFinalizeOrder = () => {
    if (!currentTableId || userRole === 'client') return;
    
    // Etapas Pendentes:
    // 1. Criar função no wooCommerceService para registrar o pedido final.
    // 2. Coletar todos os items (sentItems + items de todos os splits).
    // 3. Coletar todos os pagamentos (payments da conta principal + payments de todos os splits).
    // 4. Se o envio ao WooCommerce for bem-sucedido, atualizar o status da mesa no Firebase para 'closed'.
    
    alert("Função de Fechamento de Conta (WooCommerce Sync e Fechamento de Mesa) em desenvolvimento.");
};
window.handleFinalizeOrder = handleFinalizeOrder;


// Implementar no futuro: Lógica para pagar splits (Placeholder)
const openPaymentModalForSplit = (splitKey) => {
    alert(`Pagar Conta de Divisão (${splitKey}) em desenvolvimento.`);
};
window.openPaymentModalForSplit = openPaymentModalForSplit;

// Implementar no futuro: Lógica para desfazer split (Placeholder)
const moveItemsToMainAccount = (splitKey) => {
    alert(`Desfazer itens da conta (${splitKey}) para a conta principal em desenvolvimento.`);
};
window.moveItemsToMainAccount = moveItemsToMainAccount;


// Event listener para inicialização
document.addEventListener('DOMContentLoaded', () => {
    const addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    const paymentMethodButtons = document.getElementById('paymentMethodButtons');
    const paymentValueInput = document.getElementById('paymentValueInput');
    const addPaymentBtn = document.getElementById('addPaymentBtn');
    const finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    
    // 1. Adicionar Conta de Divisão
    if (addSplitAccountBtn) {
        addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); 
    }

    // 2. Botões de Método de Pagamento (Seleção)
    if (paymentMethodButtons) {
        // Inicializa o primeiro como ativo
        const firstButton = paymentMethodButtons.querySelector('.payment-method-btn');
        if (firstButton) {
            firstButton.classList.add('active');
            currentPaymentMethod = firstButton.dataset.method;
        }

        paymentMethodButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.payment-method-btn');
            if (btn) {
                // Remove 'active' de todos
                document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
                // Adiciona 'active' ao clicado
                btn.classList.add('active');
                currentPaymentMethod = btn.dataset.method;
                
                // Opcional: pré-preenche o valor total para Dinheiro/Pix
                if (currentOrderSnapshot) {
                     const { total: generalTotal } = calculateTotal(currentOrderSnapshot.total || 0, currentOrderSnapshot.serviceTaxApplied || false);
                     document.getElementById('paymentValueInput').value = formatCurrency(generalTotal);
                }
            }
        });
    }

    // 3. Input de Valor Pago (Máscara de Moeda)
    if (paymentValueInput) {
        // Inicializa o valor
        paymentValueInput.value = formatCurrency(0); 
        
        paymentValueInput.addEventListener('input', (e) => {
             // Simplesmente remove tudo que não for número e coloca a máscara (manualmente para evitar libs)
             let value = e.target.value.replace(/\D/g, ''); 
             if (value.length > 2) {
                 // Converte para centavos
                 value = (parseFloat(value) / 100).toFixed(2).replace('.', ',');
                 // Adiciona R$
                 e.target.value = `R$ ${value}`;
             }
        });
        
        // Seleciona o valor total ao focar (facilita o pagamento completo)
        paymentValueInput.addEventListener('focus', (e) => {
            if (currentOrderSnapshot) {
                 const { total: generalTotal } = calculateTotal(currentOrderSnapshot.total || 0, currentOrderSnapshot.serviceTaxApplied || false);
                 document.getElementById('paymentValueInput').value = formatCurrency(generalTotal);
            }
        });
    }

    // 4. Adicionar Pagamento
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', handleAddPayment);
    }
    
    // 5. Finalizar Conta
    if (finalizeOrderBtn) {
        finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    }
});
