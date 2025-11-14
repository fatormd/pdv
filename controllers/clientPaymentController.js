// --- CONTROLLERS/CLIENTPAYMENTCONTROLLER.JS (COMPLETO E CORRIGIDO - COM CRM DINÂMICO) ---

// Importa do 'firebaseService.js' e o 'app.js' global
// ===== ATUALIZAÇÃO 1: Importa 'getVouchersCollectionRef' (e outras) do firebaseService =====
import { db, auth, getTableDocRef, appId, getCustomersCollectionRef, getVouchersCollectionRef } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
// O 'currentTableId' e 'showToast' globals são exportados pelo app.js (corrigido)
import { currentTableId, showToast } from "/app.js"; 
import { onSnapshot, doc, updateDoc, arrayUnion, serverTimestamp, writeBatch, increment, getDocs, query, orderBy, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Variáveis de Estado ---
let currentClientUser = null;
let unsubscribeTable = null; // Listener da Mesa
let unsubscribeCustomer = null; // Listener do Cliente
let paymentInitialized = false;
let VOUCHER_RULES_CACHE = []; // NOVO: Cache para regras de voucher

// --- Elementos da DOM ---
let reviewItemsList, crmClientSection;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplayPayment;
let paymentTableNumber;

// ===== ATUALIZAÇÃO 2: Remove as definições locais redundantes =====
// (const firestore = db; FOI REMOVIDA)
// (const getVouchersCollectionRef = () => { ... } FOI REMOVIDA)
// A função 'getVouchersCollectionRef' agora é importada corretamente do firebaseService.


/**
 * Inicializa o controlador da tela de pagamento do cliente.
 */
export const initClientPaymentController = () => {
    if (paymentInitialized) return;
    console.log("[ClientPayment] Inicializando...");

    // Mapeia os elementos
    reviewItemsList = document.getElementById('reviewItemsList');
    crmClientSection = document.getElementById('crmClientSection');
    paymentTableNumber = document.getElementById('payment-table-number');
    
    // Mapeia displays de total
    orderSubtotalDisplay = document.getElementById('orderSubtotalDisplayPayment');
    orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplayPayment');
    orderTotalDisplayPayment = document.getElementById('orderTotalDisplayPayment');

    // Mapeia o botão de solicitar conta
    const requestBillBtn = document.getElementById('requestBillBtn');
    if (requestBillBtn) {
        requestBillBtn.onclick = handleRequestBill;
    }


    // ---- Lógica das Abas do CRM ----
    const tabButtons = document.querySelectorAll('.crm-tab-btn');
    const tabContents = document.querySelectorAll('.crm-tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove 'active' de todos
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Adiciona 'active' ao clicado
            button.classList.add('active');
            const tabId = button.dataset.tab;
            document.getElementById(tabId)?.classList.add('active');
        });
    });

    // Ouve a mudança de tela (disparada pelo app.js)
    window.addEventListener('screenChanged', (e) => {
        if (e.detail.screenId === 'clientPaymentScreen') {
            console.log("[ClientPayment] Tela de pagamento ativada. Iniciando listeners...");
            startListeners(); // Inicia listeners quando a tela fica visível
        } else {
            stopListeners(); // Para listeners quando sai da tela
        }
    });

    // Ouve a mudança de autenticação
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            currentClientUser = user;
            crmClientSection.style.display = 'block'; // Mostra o CRM se logado
            startListeners(); // Inicia (ou reinicia) listeners com o novo usuário
        } else {
            currentClientUser = null;
            crmClientSection.style.display = 'none'; // Esconde o CRM se deslogado
            stopListeners();
        }
    });

    paymentInitialized = true;
};

/**
 * Para os listeners do Firebase para economizar recursos.
 */
function stopListeners() {
    if (unsubscribeTable) {
        console.log("[ClientPayment] Parando listener da mesa.");
        unsubscribeTable();
        unsubscribeTable = null;
    }
    if (unsubscribeCustomer) {
        console.log("[ClientPayment] Parando listener do cliente.");
        unsubscribeCustomer();
        unsubscribeCustomer = null;
    }
}

/**
 * Busca as regras de vouchers do Firestore para o cliente.
 */
async function fetchVoucherRules() {
    try {
        // Agora usa a função 'getVouchersCollectionRef' importada
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const snapshot = await getDocs(q);
        VOUCHER_RULES_CACHE = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return VOUCHER_RULES_CACHE;
    } catch (e) {
        console.error("Erro ao buscar regras de vouchers para o cliente:", e);
        return [];
    }
}


/**
 * Inicia os listeners da mesa e do cliente (se não estiverem ativos).
 */
function startListeners() {
    // Para listeners antigos antes de começar novos
    stopListeners();

    // 1. Listener do Cliente (para o CRM)
    if (currentClientUser && !unsubscribeCustomer) {
        console.log("[ClientPayment] Iniciando listener para Cliente:", currentClientUser.uid);
        const customerRef = doc(getCustomersCollectionRef(), currentClientUser.uid);
        
        unsubscribeCustomer = onSnapshot(customerRef, (doc) => {
            if (doc.exists()) {
                fetchVoucherRules().then(() => renderCrmData(doc.data())); // Busca regras e renderiza
            } else {
                fetchVoucherRules().then(() => renderCrmData({ points: 0 }));
            }
        }, (error) => {
            console.error("[ClientPayment] Erro no listener do cliente:", error);
        });
    }

    // 2. Listener da Mesa (para Itens e Totais)
    if (currentTableId && !unsubscribeTable) { 
        console.log("[ClientPayment] Iniciando listener para Mesa:", currentTableId);
        const tableRef = getTableDocRef(currentTableId);
        
        unsubscribeTable = onSnapshot(tableRef, (doc) => {
            if (doc.exists()) {
                const tableData = doc.data();
                renderSentItems(tableData.sentItems || []);
                renderTotals(tableData);
                if(paymentTableNumber) paymentTableNumber.textContent = `Mesa ${tableData.tableNumber}`;
            } else {
                console.log("[ClientPayment] Documento da mesa não encontrado (Mesa fechada?).");
                renderSentItems([]);
                renderTotals({});
                if(paymentTableNumber) paymentTableNumber.textContent = `Mesa (Fechada)`;
            }
        }, (error) => {
             console.error("[ClientPayment] Erro no listener da mesa:", error);
        });
    } else {
        console.warn("[ClientPayment] Não foi possível iniciar listener: tableId ou user não definidos.", "TableID:", currentTableId, "User:", currentClientUser);
        renderSentItems([]);
        renderTotals({});
    }
}


/**
 * Renderiza a lista de itens confirmados (Feature 1)
 */
function renderSentItems(sentItems) {
    if (!reviewItemsList) return;

    if (sentItems.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item confirmado pelo garçom ainda.</div>`;
        return;
    }

    // Agrupa os itens
    const groupedItems = sentItems.reduce((acc, item) => {
        const key = `${item.name}-${item.note || ''}`;
        if (!acc[key]) {
            acc[key] = { ...item, count: 0, totalPrice: 0 };
        }
        acc[key].count++;
        acc[key].totalPrice += item.price;
        return acc;
    }, {});

    reviewItemsList.innerHTML = Object.values(groupedItems).map(item => `
        <div class="flex flex-col md:flex-row md:justify-between md:items-center bg-dark-input p-3 rounded-lg">
            <div class="flex-grow min-w-0 mr-2 w-full">
                <span class="font-semibold text-white">${item.name} (${item.count}x)</span>
                ${item.note ? `<p class="text-xs text-yellow-400 truncate">(${item.note})</p>` : ''}
            </div>
            <span class="text-base font-semibold text-dark-text mt-1 md:mt-0 md:ml-2 flex-shrink-0">${formatCurrency(item.totalPrice)}</span>
        </div>
    `).join('');
}

/**
 * Renderiza os totais da conta
 */
function renderTotals(tableData) {
    // Calcula o subtotal manualmente a partir dos sentItems
    const sentItems = tableData.sentItems || [];
    const subtotal = sentItems.reduce((sum, item) => sum + (item.price || 0), 0);
    
    const serviceTax = (tableData.serviceTaxApplied && tableData.status !== 'closed') ? subtotal * 0.1 : 0;
    const total = subtotal + serviceTax;

    if (orderSubtotalDisplay) orderSubtotalDisplay.textContent = formatCurrency(subtotal);
    if (orderServiceTaxDisplay) orderServiceTaxDisplay.textContent = formatCurrency(serviceTax);
    if (orderTotalDisplayPayment) orderTotalDisplayPayment.textContent = formatCurrency(total);
    
    // Lógica de divisão
    const diners = tableData.diners || 1;
    const dinersInput = document.getElementById('dinersSplitInput');
    const valuePerDinerEl = document.getElementById('valuePerDinerDisplay');
    
    if (dinersInput) dinersInput.value = diners;
    if (valuePerDinerEl) valuePerDinerEl.textContent = formatCurrency(total / diners);
}


/**
 * Renderiza os dados do CRM (Feature 2)
 */
function renderCrmData(customerData) {
    console.log("[ClientPayment] Renderizando dados do CRM...", customerData);
    
    // Aba 1: Pontos
    const pointsBalanceEl = document.getElementById('crm-points-balance');
    if (pointsBalanceEl) {
        pointsBalanceEl.textContent = customerData.points || 0; 
    }
    
    // Vouchers Disponíveis (AGORA DINÂMICO)
    const vouchersDisponiveisEl = document.getElementById('crm-vouchers-disponiveis');
    if (vouchersDisponiveisEl) {
        const availableVouchers = VOUCHER_RULES_CACHE.filter(v => (customerData.points || 0) >= v.points);

        if (availableVouchers.length > 0) {
            vouchersDisponiveisEl.innerHTML = availableVouchers.map(v => `
                <div class="p-3 bg-indigo-900 border border-indigo-700 rounded-lg">
                    <p class="font-semibold text-white">${v.name}</p>
                    <p class="text-xs text-indigo-300">Resgate por ${v.points} pontos.</p>
                    <button class="resgate-voucher-btn px-3 py-1 mt-2 bg-pumpkin text-white rounded-md hover:bg-pumpkin-dark transition text-xs font-semibold" 
                            data-voucher-id="${v.id}" 
                            data-points-cost="${v.points}" 
                            data-discount-value="${v.value}"
                            data-voucher-name="${v.name}">
                        Resgatar Agora
                    </button>
                </div>
            `).join('');
            _attachCrmListeners(); 
        } else {
             vouchersDisponiveisEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Você precisa de mais pontos para resgatar vouchers.</p>`;
        }
    }
    
    // Vouchers Ativos (placeholder)
    const vouchersAtivosEl = document.getElementById('crm-vouchers-ativos');
    if (vouchersAtivosEl) {
         vouchersAtivosEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum voucher aplicado à sua conta no momento.</p>`;
    }
    
    // Histórico de Pedidos
    const orderHistoryEl = document.getElementById('crm-order-history');
    const history = customerData.orderHistory || [];
    
    if (orderHistoryEl) {
        if (history.length > 0) {
            // Ordena os pedidos mais recentes primeiro
            history.sort((a, b) => (b.date || 0) - (a.date || 0)); // 'date' é um número (timestamp)
            
            orderHistoryEl.innerHTML = history.map(order => {
                const date = order.date ? new Date(order.date).toLocaleDateString('pt-BR') : 'N/A';
                return `
                    <div class="border-b border-gray-700 pb-2">
                        <p class="text-sm font-semibold text-dark-text">${formatCurrency(order.total)}</p>
                        <p class="text-xs text-dark-placeholder">Em ${date} (${order.points} pts)</p>
                    </div>
                `;
            }).join('');
        } else {
             orderHistoryEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum pedido registrado ainda.</p>`;
        }
    }
    
    // Vouchers Utilizados (placeholder)
    const vouchersUsadosEl = document.getElementById('crm-vouchers-usados');
    if (vouchersUsadosEl) {
         vouchersUsadosEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum histórico de vouchers resgatados.</p>`;
    }
}

/**
 * Resgate REAL do voucher.
 */
async function handleVoucherResgate(e) {
    const btn = e.target.closest('.resgate-voucher-btn');
    if (!btn) return;

    const voucherId = btn.dataset.voucherId;
    const POINTS_DEBIT = parseInt(btn.dataset.pointsCost);
    const DISCOUNT_VALUE = parseFloat(btn.dataset.discountValue);
    const voucherName = btn.dataset.voucherName;

    if (!currentClientUser) {
        showToast("Faça login para resgatar vouchers.", true);
        return;
    }
    if (!currentTableId) {
        showToast("Associe-se a uma mesa primeiro.", true);
        return;
    }

    const currentPoints = document.getElementById('crm-points-balance')?.textContent ? parseInt(document.getElementById('crm-points-balance').textContent) : 0;

    if (currentPoints < POINTS_DEBIT) {
         showToast(`Você precisa de ${POINTS_DEBIT} pontos para resgatar este voucher. Saldo atual: ${currentPoints}.`, true);
         return;
    }

    if (!confirm(`Confirmar resgate do voucher ${voucherName} por ${POINTS_DEBIT} pontos? (R$ ${DISCOUNT_VALUE.toFixed(2)} de desconto será aplicado na conta)`)) return;
    
    try {
        // ===== ATUALIZAÇÃO 3: Usa 'db' (importado) em vez de 'firestore' (removido) =====
        const batch = writeBatch(db); 
        const customerRef = doc(getCustomersCollectionRef(), currentClientUser.uid);
        const tableRef = getTableDocRef(currentTableId);

        // 1. Debitar Pontos do Cliente e Registrar Resgate
        batch.update(customerRef, {
            points: increment(-POINTS_DEBIT),
            vouchersUsed: arrayUnion({
                voucherId: voucherId,
                name: voucherName,
                value: DISCOUNT_VALUE,
                pointsDebited: POINTS_DEBIT,
                date: Date.now()
            })
        });

        // 2. Aplicar Desconto na Mesa (como um pagamento/desconto 'Voucher')
        const paymentData = {
            method: 'Voucher',
            value: formatCurrency(DISCOUNT_VALUE), // R$ 10,00 formatado
            timestamp: Date.now(),
            byUser: currentClientUser.displayName || 'Cliente CRM' 
        };
        
        batch.update(tableRef, {
            payments: arrayUnion(paymentData)
        });

        await batch.commit();

        showToast(`Resgate de R$ ${DISCOUNT_VALUE.toFixed(2)} concluído! ${POINTS_DEBIT} pontos debitados e desconto aplicado na Mesa.`, false);

    } catch (e) {
        console.error("Erro ao resgatar voucher:", e);
        showToast(`Falha ao resgatar voucher. Erro: ${e.message}`, true);
    }
}

/**
 * Anexa listeners ao painel CRM.
 */
function _attachCrmListeners() {
    document.querySelectorAll('.resgate-voucher-btn').forEach(btn => {
        // Evita anexar múltiplas vezes
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', handleVoucherResgate);
    });
}

/**
 * Lida com a solicitação de fechamento de conta.
 */
async function handleRequestBill() {
    const btn = document.getElementById('requestBillBtn');
    
    if (!currentTableId || !currentClientUser) {
        showToast("Erro: Mesa ou cliente não identificados.", true);
        return;
    }

    if (!confirm("Deseja realmente solicitar o fechamento da conta? Um garçom será notificado.")) {
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Solicitando...';

    try {
        const tableRef = getTableDocRef(currentTableId);
        // Notifica o garçom e ativa o "sino" de alerta no painel de staff
        await updateDoc(tableRef, {
            waiterNotification: "Cliente solicitou fechamento de conta",
            billRequested: true,     // Sinal verde para o painel staff
            clientOrderPending: false // Limpa o sinal antigo
        });
        
        showToast("Solicitação enviada! Um garçom virá até sua mesa.");
        btn.innerHTML = '<i class="fas fa-check"></i> Solicitação Enviada';

    } catch (e) {
        console.error("Erro ao solicitar fechamento:", e);
        showToast("Erro ao enviar solicitação. Tente novamente.", true);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cash-register"></i> SOLICITAR FECHAMENTO DE CONTA';
    }
}