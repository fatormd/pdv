// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2) ---
import { getProducts, getCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, screens } from "/app.js"; // Importa 'screens'
import { arrayUnion, serverTimestamp, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getKdsCollectionRef, getTableDocRef } from "/services/firebaseService.js";
import { goToScreen } from "/app.js";


// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
// ... (mantidas) ...
let obsModal, obsItemName, obsInput, saveObsBtn, cancelObsBtn, esperaSwitch;
let searchProductInput, categoryFiltersContainer, menuItemsGrid;
let openOrderList, openItemsCount, sendSelectedItemsBtn;
let quickObsButtons;

// ... (estado local mantido) ...
let currentSearch = '';
let currentCategoryFilter = 'all';
let orderInitialized = false;

// --- FUNÇÕES DE AÇÃO GERAL ---
export const increaseLocalItemQuantity = (itemId, noteKey) => { /* ... (mantida) ... */ };
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
export const decreaseLocalItemQuantity = (itemId, noteKey) => { /* ... (mantida) ... */ };
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;

// --- FUNÇÕES DE EXIBIÇÃO DE TELA E MODAL ---
export const renderMenu = () => { /* ... (mantida) ... */ };
const _renderSelectedItemsList = () => { /* ... (mantida) ... */ };
export const renderOrderScreen = (orderSnapshot) => { /* ... (lógica mantida, usa 'screens' importado) ... */ };
export const openObsModalForGroup = (itemId, noteKey) => { /* ... (lógica mantida) ... */ };
window.openObsModalForGroup = openObsModalForGroup;
export const addItemToSelection = (product) => { /* ... (lógica mantida) ... */ };
// window.addItemToSelection = addItemToSelection; // Não é mais necessário

// Envia Pedidos ao KDS e Resumo (Função de Staff)
export const handleSendSelectedItems = async () => {
    if (!currentTableId || selectedItems.length === 0) return;
    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para a produção?`)) return;

    const itemsToSend = selectedItems.filter(item => !item.note || !item.note.toLowerCase().includes('espera'));
    const itemsToHold = selectedItems.filter(item => item.note && item.note.toLowerCase().includes('espera'));

    if (itemsToSend.length === 0) {
        alert("Nenhum item pronto para envio (todos estão marcados como 'Em Espera').");
        return;
    }

    // **CORREÇÃO BUG 2:** Calcula o valor a ser adicionado ao total
    const itemsToSendValue = itemsToSend.reduce((sum, item) => sum + (item.price || 0), 0);
    const kdsOrderRef = doc(getKdsCollectionRef());

    const itemsForFirebase = itemsToSend.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category,
        sector: item.sector,
        note: item.note || '',
        sentAt: Date.now(),
        orderId: kdsOrderRef.id,
    }));

    try {
        console.log("[Order] Enviando para KDS:", itemsForFirebase);
        // Envio KDS
        await setDoc(kdsOrderRef, {
            orderId: kdsOrderRef.id,
            tableNumber: parseInt(currentTableId),
            sentAt: serverTimestamp(),
            sectors: itemsForFirebase.reduce((acc, item) => {
                const sector = item.sector || 'cozinha';
                acc[sector] = acc[sector] || [];
                acc[sector].push({ name: item.name, note: item.note, price: item.price });
                return acc;
            }, {}),
            status: 'pending',
        });
        console.log("[Order] KDS enviado com sucesso.");

        // Atualização da Mesa
        const tableRef = getTableDocRef(currentTableId);
        console.log("[Order] Atualizando mesa:", currentTableId);

        // **CORREÇÃO BUG 2:** Descomentado e ajustado o cálculo do total
        const currentTotal = currentOrderSnapshot?.total || 0;
        const newTotal = currentTotal + itemsToSendValue;

        await updateDoc(tableRef, {
            sentItems: arrayUnion(...itemsForFirebase),
            selectedItems: itemsToHold,
            total: newTotal, // <-- ADICIONADO O CÁLCULO
            lastKdsSentAt: serverTimestamp()
        });
        console.log("[Order] Mesa atualizada com sucesso.");

        // 3. Sucesso: Atualiza o estado local e UI
        selectedItems.length = 0;
        selectedItems.push(...itemsToHold);
        
        renderOrderScreen(); // Re-renderiza

        alert(`Pedido enviado! ${itemsToHold.length > 0 ? `(${itemsToHold.length} itens retidos em espera)` : ''}`);

    } catch (e) {
        console.error("Erro ao enviar pedido:", e);
        alert("Falha ao enviar pedido ao KDS/Firebase. Tente novamente.");
        // Restaura selectedItems em caso de falha (mutando)
        selectedItems.length = 0;
        selectedItems.push(...itemsToSend, ...itemsToHold);
        renderOrderScreen();
    }
};

// Função de inicialização do Controller (chamada pelo app.js)
export const initOrderController = () => { /* ... (lógica mantida) ... */ };
