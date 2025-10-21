// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2) ---
import { getProducts, getCategories } from "../services/wooCommerceService.js";
import { formatCurrency } from "../utils.js";
import { saveSelectedItemsToFirebase } from "../services/firebaseService.js"; 
import { currentTableId, selectedItems, userRole, currentOrderSnapshot } from "../app.js";
import { arrayUnion, serverTimestamp, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getKdsCollectionRef, getTableDocRef } from "../services/firebaseService.js";
import { openManagerAuthModal } from "./managerController.js";
import { renderClientOrderScreen, openClientObsModalForGroup } from "./clientOrderController.js"; // Importa do novo módulo


// --- VARIÁVEIS DE ELEMENTOS (Serão definidas em DOMContentLoaded) ---
let obsModal, obsItemName, obsInput, saveObsBtn, cancelObsBtn, esperaSwitch;

// NOVO: Variável para manter o estado da busca e filtro
let currentSearch = ''; 
let currentCategoryFilter = 'all'; 


// --- FUNÇÕES DE AÇÃO GERAL ---

export const increaseLocalItemQuantity = (itemId, noteKey) => {
    const itemToCopy = selectedItems.find(item => 
        item.id == itemId && (item.note || '') === noteKey
    );

    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy, note: noteKey });
        renderOrderScreen();
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }
};
window.increaseLocalItemQuantity = increaseLocalItemQuantity;


export const decreaseLocalItemQuantity = (itemId, noteKey) => {
    const indexToRemove = selectedItems.findIndex(item => 
        item.id == itemId && (item.note || '') === noteKey
    );

    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1);
        renderOrderScreen();
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }
};
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;


// --- FUNÇÕES DE EXIBIÇÃO DE TELA E MODAL ---

export const renderMenu = (filter = currentCategoryFilter, search = '', screen = 'staff') => { 
    // Adaptação para o novo fluxo:
    const isClient = screen === 'client';
    const suffix = isClient ? 'Client' : '';
    
    // ... (Restante da lógica do renderMenu é a mesma, focando nos sufixos) ...
    const menuItemsGrid = document.getElementById(`menuItemsGrid${suffix}`);
    const categoryFiltersContainer = document.getElementById(`categoryFilters${suffix}`);
    const searchProductInput = document.getElementById(`searchProductInput${suffix}`);
    
    if (!menuItemsGrid || !categoryFiltersContainer) return;
    
    const products = getProducts();
    const categories = getCategories(); 

    // 1. Renderiza Filtros de Categoria
    if (categories.length > 0) {
        categoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentCategoryFilter ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300';
            return `
                <button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" 
                        data-category="${cat.slug || cat.id}">
                    ${cat.name}
                </button>
            `;
        }).join('');
    }
    
    // ... (Lógica de Filtro e Busca) ...

    let filteredProducts = products;
    if (search) {
        const normalizedSearch = search.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    
    if (currentCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentCategoryFilter);
    }

    if (searchProductInput && !searchProductInput.hasAttribute('data-listener')) {
        searchProductInput.addEventListener('input', (e) => renderMenu(currentCategoryFilter, e.target.value, screen));
        searchProductInput.setAttribute('data-listener', 'true');
    }

    if (filteredProducts.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-500 italic">Nenhum produto encontrado.</div>`;
        return;
    }
    
    // 3. Renderiza Itens do Cardápio
    menuItemsGrid.innerHTML = filteredProducts.map(product => `
        <div class="product-card bg-white p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150 border border-gray-200">
            <h4 class="font-bold text-base text-gray-800">${product.name}</h4>
            <p class="text-xs text-gray-500">${product.category} (${product.sector})</p>
            <div class="flex justify-between items-center mt-2">
                <span class="font-bold text-lg text-indigo-700">${formatCurrency(product.price)}</span>
                <button class="add-item-btn add-icon-btn bg-green-500 text-white hover:bg-green-600 transition"
                        onclick='window.addItemToSelection(${JSON.stringify(product).replace(/'/g, '&#39;')})'>
                    <i class="fas fa-plus text-lg"></i>
                </button>
            </div>
            <button class="w-full mt-2 px-2 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                    onclick="window.openProductInfoModal(${product.id})">
                Informações
            </button>
        </div>
    `).join('');
};

// Ajustada para renderizar ambas as telas
export const renderOrderScreen = () => {
    // Renderiza Tela do Staff
    _renderOrderList('openOrderList', 'openItemsCount', 'sendSelectedItemsBtn', false);
    
    // Renderiza Tela do Cliente (Delegada ao novo controller)
    renderClientOrderScreen();
    
    // Renderiza o menu nas duas telas
    renderMenu(currentCategoryFilter, currentSearch, 'staff');
    renderMenu(currentCategoryFilter, currentSearch, 'client');
};

const _renderOrderList = (listId, countId, btnId, isClient) => {
    const openOrderList = document.getElementById(listId);
    const openItemsCount = document.getElementById(countId);
    const sendBtn = document.getElementById(btnId);
    
    if (!openOrderList) return;
    
    const openItemsCountValue = selectedItems.length;
    openItemsCount.textContent = openItemsCountValue;

    if (sendBtn) {
        // Lógica de desativação e texto para o botão de envio
        sendBtn.disabled = openItemsCountValue === 0;
        if (isClient) {
             sendBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else {
             sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }

    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
    } else {
        // Agrupamento para exibição
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
                    <span class="text-sm cursor-pointer" onclick="window.openObsModalForGroup('${group.id}', '${group.note || ''}')">
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

// Item 3: Abertura do Modal de Observações (Restrito para Cliente)
export const openObsModalForGroup = (itemId, noteKey) => {
    // Se o cliente estiver ativo, delega para a função restrita do cliente
    if (userRole === 'client') {
        openClientObsModalForGroup(itemId, noteKey);
        return;
    }
    
    const products = getProducts();
    const product = products.find(p => p.id == itemId);
    
    // Mapeamento local dos elementos (Agora são variáveis de escopo global no módulo)
    if (!obsModal || !obsItemName || !obsInput || !esperaSwitch) {
        console.error("Erro: Elementos do modal de observação não foram inicializados.");
        return; 
    }

    if (!product) return;

    // 1. Configura o estado do modal (Staff Flow)
    obsItemName.textContent = product.name; 
    
    const currentNoteCleaned = noteKey.replace(' [EM ESPERA]', '').trim(); 
    obsInput.value = currentNoteCleaned;
    
    obsModal.dataset.itemId = itemId;
    obsModal.dataset.originalNoteKey = noteKey;
    
    esperaSwitch.checked = noteKey.toLowerCase().includes('espera');

    // Staff tem acesso total
    obsInput.readOnly = false;
    obsInput.placeholder = "Ex: Sem cebola, Ponto da carne mal passada...";

    // 2. Exibe o modal
    obsModal.style.display = 'flex';
};
window.openObsModalForGroup = openObsModalForGroup; 

// Funções de Detalhe (CRITICAL FIX: Expõe a função globalmente)
export const openProductInfoModal = (productId) => {
    const product = getProducts().find(p => p.id === productId);
    
    if (!product) return;

    alert(`Detalhes do Produto:\nNome: ${product.name}\nPreço: ${formatCurrency(product.price)}\nSetor: ${product.sector}`);
};
window.openProductInfoModal = openProductInfoModal; // EXPÕE AO ESCOPO GLOBAL


// Item 1: Adicionar Produto à Lista (Expõe ao onclick do Cardápio)
export const addItemToSelection = (product) => {
    if (!currentTableId) {
        alert("Selecione ou abra uma mesa primeiro.");
        return;
    }

    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector, 
        note: ''
    };
    
    selectedItems.push(newItem); 

    renderOrderScreen();
    saveSelectedItemsToFirebase(currentTableId, selectedItems);
    
    // Abre o modal para iniciar o fluxo de observações
    openObsModalForGroup(product.id, ''); 
};
window.addItemToSelection = addItemToSelection;


// Item 1: Envia Pedidos ao KDS e Resumo (Função de Staff)
export const handleSendSelectedItems = async () => { 
    if (!currentTableId || selectedItems.length === 0) return;
    if (userRole === 'client') return; 

    if (!confirm(`Confirmar o envio de ${selectedItems.length} item(s) para a produção?`)) return;

    const itemsToSend = selectedItems.filter(item => !item.note || !item.note.toLowerCase().includes('espera'));
    const itemsToHold = selectedItems.filter(item => item.note && item.note.toLowerCase().includes('espera'));

    if (itemsToSend.length === 0) {
        alert("Nenhum item pronto para envio.");
        return;
    }
    
    const itemsToSendValue = itemsToSend.reduce((sum, item) => sum + item.price, 0);
    const kdsOrderRef = doc(getKdsCollectionRef());
    
    const itemsForUpdate = itemsToSend.map(item => ({
        ...item,
        sentAt: Date.now(),
        orderId: kdsOrderRef.id,
    }));

    try {
        // Envio KDS
        await setDoc(kdsOrderRef, {
            orderId: kdsOrderRef.id,
            tableNumber: parseInt(currentTableId),
            sentAt: serverTimestamp(),
            sectors: itemsToSend.reduce((acc, item) => { 
                acc[item.sector] = acc[item.sector] || []; 
                acc[item.sector].push({
                    name: item.name,
                    note: item.note || '',
                    price: item.price
                }); 
                return acc; 
            }, {}),
            status: 'pending',
        });
        
        // Atualização da Mesa
        const tableRef = getTableDocRef(currentTableId);
        await updateDoc(tableRef, {
            sentItems: arrayUnion(...itemsForUpdate), 
            selectedItems: itemsToHold, // Retém os itens 'Em Espera'
            total: (currentOrderSnapshot?.total || 0) + itemsToSendValue, // Atualiza o total
            lastKdsSentAt: serverTimestamp() 
        });

        // 3. Sucesso: Atualiza o estado local
        selectedItems.length = 0; // Limpa localmente
        selectedItems.push(...itemsToHold);
        renderOrderScreen();
        
        alert(`Pedido enviado! Total atualizado. ${itemsToHold.length} itens retidos.`);

    } catch (e) {
        console.error("Erro ao enviar pedido:", e);
        alert("Falha ao enviar pedido ao KDS/Firebase. Tente novamente.");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendSelectedItemsBtn');
    if (sendBtn) sendBtn.addEventListener('click', handleSendSelectedItems);
    
    // Mapeamento defensivo dos elementos do modal DENTRO DO DOMContentLoaded
    obsModal = document.getElementById('obsModal'); 
    obsItemName = document.getElementById('obsItemName');
    obsInput = document.getElementById('obsInput');
    saveObsBtn = document.getElementById('saveObsBtn');
    cancelObsBtn = document.getElementById('cancelObsBtn');
    esperaSwitch = document.getElementById('esperaSwitch');
    
    if (saveObsBtn) {
        saveObsBtn.addEventListener('click', () => {
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey; 
            let newNote = obsInput.value.trim();
            const isEsperaActive = esperaSwitch.checked;
            const esperaTag = ' [EM ESPERA]';

            let noteCleaned = newNote.replace(esperaTag, '').trim();
            noteCleaned = noteCleaned.replace(/,?\s*\[EM ESPERA\]/gi, '').trim();

            if (isEsperaActive) {
                newNote = (noteCleaned + esperaTag).trim();
            } else {
                newNote = noteCleaned;
            }

            // 2. Atualiza TODOS os itens que pertencem a esse grupo de obs
            let updatedItems = selectedItems.map(item => { 
                if (item.id == itemId && (item.note || '') === originalNoteKey) {
                    return { ...item, note: newNote };
                }
                return item;
            });
            
            // Reatribui o conteúdo da lista global (selectedItems)
            selectedItems.length = 0; 
            selectedItems.push(...updatedItems);

            obsModal.style.display = 'none';
            renderOrderScreen();
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        });
    }

    if (cancelObsBtn) {
        cancelObsBtn.addEventListener('click', () => {
             // O item permanece na lista se foi recém-adicionado
             obsModal.style.display = 'none';
             renderOrderScreen(); 
        });
    }
});
