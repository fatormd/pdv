// --- CONTROLLERS/CLIENTPAYMENTCONTROLLER.JS (CORRIGIDO) ---

// ===== ATENÇÃO: Importa de 'firebaseService.js' e o 'app.js' global =====
import { db, auth, getTableDocRef, appId } from "/services/firebaseService.js";
import { formatCurrency } from "/utils.js";
// O 'currentTableId' global é exportado pelo app.js
import { currentTableId } from "/app.js"; 
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Variáveis de Estado ---
let currentClientUser = null;
let unsubscribeTable = null; // Listener da Mesa
let unsubscribeCustomer = null; // Listener do Cliente
let paymentInitialized = false;

// --- Elementos da DOM ---
let reviewItemsList, crmClientSection;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplayPayment;
let paymentTableNumber;

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
 * Inicia os listeners da mesa e do cliente (se não estiverem ativos).
 */
function startListeners() {
    // Para listeners antigos antes de começar novos
    stopListeners();

    // 1. Listener do Cliente (para o CRM)
    if (currentClientUser && !unsubscribeCustomer) {
        console.log("[ClientPayment] Iniciando listener para Cliente:", currentClientUser.uid);
        // Usa o 'appId' global importado do firebaseService
        const customerRef = doc(db, 'artifacts', appId, 'public', 'data', 'customers', currentClientUser.uid);
        
        unsubscribeCustomer = onSnapshot(customerRef, (doc) => {
            if (doc.exists()) {
                renderCrmData(doc.data());
            } else {
                console.log("[ClientPayment] Documento do cliente não encontrado.");
                renderCrmData({ points: 0 }); // Mostra 0 pontos se não houver doc
            }
        }, (error) => {
            console.error("[ClientPayment] Erro no listener do cliente:", error);
        });
    }

    // 2. Listener da Mesa (para Itens e Totais)
    // Usa o 'currentTableId' global importado do app.js
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
        // Limpa a tela se não houver mesa
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
        <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg">
            <div class="flex-grow min-w-0 mr-2">
                <span class="font-semibold text-white truncate">${item.name} (${item.count}x)</span>
                ${item.note ? `<p class="text-xs text-yellow-400 truncate">(${item.note})</p>` : ''}
            </div>
            <span class="text-base font-semibold text-dark-text ml-2 flex-shrink-0">${formatCurrency(item.totalPrice)}</span>
        </div>
    `).join('');
}

/**
 * Renderiza os totais da conta
 */
function renderTotals(tableData) {
    const subtotal = tableData.total || 0;
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
        pointsBalanceEl.textContent = customerData.points || 0; // Mostra 0 se for undefined
    }

    // TODO: Renderizar as outras abas (Vouchers Disponíveis, Ativos, Histórico)
    
    const vouchersDisponiveisEl = document.getElementById('crm-vouchers-disponiveis');
    if (vouchersDisponiveisEl) {
        vouchersDisponiveisEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Lógica de vouchers em construção.</p>`;
    }
    
    const vouchersAtivosEl = document.getElementById('crm-vouchers-ativos');
    if (vouchersAtivosEl) {
         vouchersAtivosEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Lógica de vouchers em construção.</p>`;
    }
    
    const orderHistoryEl = document.getElementById('crm-order-history');
     if (orderHistoryEl) {
         orderHistoryEl.innerHTML = `<p class="text-sm text-dark-placeholder italic">Lógica de histórico em construção.</p>`;
     }
}