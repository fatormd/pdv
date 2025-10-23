// --- CONTROLLERS/CLIENTORDERCONTROLLER.JS (Novo Módulo - Painel 5) ---
import { getProducts } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js"; 
import { currentTableId, selectedItems, userRole, currentOrderSnapshot } from "/app.js";
import { arrayUnion, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getTableDocRef } from "/services/firebaseService.js";


// --- VARIÁVEIS DE ELEMENTOS (Definidas no DOMContentLoaded) ---
let clientObsModal, clientObsInput, clientSaveObsBtn, clientCancelObsBtn, clientEsperaSwitch;
let currentClientSearch = ''; 
let currentClientCategoryFilter = 'all'; 


// Função de Renderização da Lista de Pedidos do Cliente
export const renderClientOrderScreen = () => {
    // Renderiza Tela do Cliente
    const openOrderList = document.getElementById('openOrderListClient');
    const openItemsCount = document.getElementById('openItemsCountClient');
    const sendBtn = document.getElementById('sendClientOrderBtn');
    
    if (!openOrderList) return;
    
    const openItemsCountValue = selectedItems.length;
    openItemsCount.textContent = openItemsCountValue;

    if (sendBtn) {
        sendBtn.disabled = openItemsCountValue === 0;
        sendBtn.innerHTML = '<i class="fas fa-check-circle"></i>'; // Garante que o ícone de envio do cliente seja o correto
    }
    
    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
    } else {
        // Lógica de Agrupamento para exibição (CORREÇÃO IMPLEMENTADA AQUI)
        const groupedItems = selectedItems.reduce((acc, item, index) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) {
                acc[key] = { ...item, count: 0 };
            }
            acc[key].count++;
            return acc;
        }, {});

        openOrderList.innerHTML = Object.values(groupedItems).map(group => `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-gray-800">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer" onclick="window.openClientObsModalForGroup('${group.id}', '${group.note || ''}')">
                        ${group.note ? `(${group.note})` : `(Adicionar Obs.)`}
                    </span>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-500 text-white rounded-full text-lg hover:bg-red-600 transition duration-150" 
                            onclick="window.decreaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Remover um">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button class="qty-btn bg-green-500 text-white rounded-full text-lg hover:bg-green-600 transition duration-150" 
                            onclick="window.increaseLocalItemQuantity('${group.id}', '${group.note || ''}')" title="Adicionar um">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// Abertura do Modal de Observações (COM VALIDAÇÃO DE QUICK-BUTTONS)
export function openClientObsModalForGroup(itemId, noteKey) {
    
    // NOVO: Exibir e configurar o modal do cliente (semelhante ao Staff, mas com as restrições)
    const products = getProducts();
    const product = products.find(p => p.id == itemId);

    if (!clientObsModal || !product) return;

    clientObsModal.querySelector('#obsItemName').textContent = product.name;
    const currentNoteCleaned = noteKey.replace(' [EM ESPERA]', '').trim(); 
    clientObsInput.value = currentNoteCleaned;
    clientObsInput.readOnly = true; // CRÍTICO: Bloqueia a edição livre
    clientObsInput.placeholder = "Apenas botões rápidos permitidos.";
    
    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey;
    
    // O cliente não deve poder definir 'Em Espera'
    const esperaSwitch = clientObsModal.querySelector('#esperaSwitch');
    if (esperaSwitch) esperaSwitch.checked = false;
    
    clientObsModal.style.display = 'flex';
}
window.openClientObsModalForGroup = openClientObsModalForGroup;


// NOVO MÓDULO: Envio de Pedido pelo Cliente (Aguardando Garçom)
export const handleClientSendOrder = async () => {
    if (!currentTableId || selectedItems.length === 0) return;
    
    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para o Garçom?`)) return;

    try {
        const tableRef = getTableDocRef(currentTableId);
        
        const requestedOrder = {
            orderId: `req_${Date.now()}`,
            items: selectedItems.map(item => ({...item, requestedAt: Date.now()})),
            requestedAt: Date.now(),
            status: 'pending_waiter' // Novo status para o Garçom
        };
        
        // Atualiza o Firebase para notificar o Staff
        await updateDoc(tableRef, {
            requestedOrders: arrayUnion(requestedOrder), 
            selectedItems: [],
            clientOrderPending: true, // Flag para o card da mesa
            waiterNotification: { type: 'client_request', timestamp: serverTimestamp() } 
        });

        // Limpa o estado local
        selectedItems.length = 0; 
        renderClientOrderScreen(); // Re-renderiza a tela do cliente
        
        alert(`Pedido enviado! Aguarde a confirmação do seu Garçom.`);

    } catch (e) {
        console.error("Erro ao enviar pedido do cliente:", e);
        alert("Falha ao enviar pedido para o Garçom/Firebase.");
    }
};

// Listener para as Quick-Buttons do Modal de Observação (Cliente)
const handleQuickButtonClient = (e) => {
    const btn = e.target.closest('.quick-obs-btn');
    if (btn && clientObsInput) {
        const obsText = btn.dataset.obs;
        let currentValue = clientObsInput.value.trim();
        
        if (currentValue && !currentValue.endsWith(',')) {
            currentValue += ', ';
        } else if (currentValue.endsWith(',')) {
            currentValue += ' ';
        }
        
        clientObsInput.value = (currentValue + obsText).trim();
    }
};


document.addEventListener('DOMContentLoaded', () => {
    // Mapeia os elementos do modal de observação (compartilhado)
    clientObsModal = document.getElementById('obsModal');
    clientObsInput = document.getElementById('obsInput');
    clientSaveObsBtn = document.getElementById('saveObsBtn');
    clientCancelObsBtn = document.getElementById('cancelObsBtn');

    const sendClientBtn = document.getElementById('sendClientOrderBtn');
    if (sendClientBtn) sendClientBtn.addEventListener('click', handleClientSendOrder);

    // Anexa o listener de Quick-Buttons para o modal (usado pelo cliente e staff)
    const quickObsButtons = document.getElementById('quickObsButtons');
    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', handleQuickButtonClient);
    }
});
