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


// Função de Renderização do Menu (Reutilizada, mas focada no cliente)
export const renderClientMenu = (filter = currentClientCategoryFilter, search = currentClientSearch) => { 
    const menuItemsGrid = document.getElementById('menuItemsGridClient');
    const categoryFiltersContainer = document.getElementById('categoryFiltersClient');
    const searchProductInput = document.getElementById('searchProductInputClient');
    
    // (A lógica de renderização do menu é idêntica à do Staff, mas usa IDs com sufixo 'Client')
    // ... (omitindo a lógica de filtragem e renderização para brevidade, use o código do orderController)
    // NOTE: Você precisará transferir e adaptar a lógica de renderMenu do orderController para cá
};

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
    }
    
    // ... (Lógica de Agrupamento de Itens é a mesma) ...
};

// Abertura do Modal de Observações (COM VALIDAÇÃO DE QUICK-BUTTONS)
export function openClientObsModalForGroup(itemId, noteKey) {
    // ... (Lógica de mapeamento e configuração do modal)
    
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

    // A lógica de SAVE/CANCEL é compartilhada no orderController, mas adaptada para o novo fluxo:
    // O Cliente só pode usar as quick-buttons para modificar o input.
});
