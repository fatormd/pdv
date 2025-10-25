// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2) ---
import { getProducts, getCategories } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
import { saveSelectedItemsToFirebase } from "/services/firebaseService.js";
// CORREÇÃO 1: Importa 'screens' do app.js
import { currentTableId, selectedItems, userRole, currentOrderSnapshot, screens } from "/app.js"; 
import { arrayUnion, serverTimestamp, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getKdsCollectionRef, getTableDocRef } from "/services/firebaseService.js";
import { goToScreen } from "/app.js"; // Importar explicitamente


// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
let obsModal, obsItemName, obsInput, saveObsBtn, cancelObsBtn, esperaSwitch;
let searchProductInput, categoryFiltersContainer, menuItemsGrid;
let openOrderList, openItemsCount, sendSelectedItemsBtn;
let quickObsButtons;

// Estado local do módulo
let currentSearch = '';
let currentCategoryFilter = 'all';
let orderInitialized = false;


// --- FUNÇÕES DE AÇÃO GERAL ---

export const increaseLocalItemQuantity = (itemId, noteKey) => {
    const itemToCopy = selectedItems.find(item =>
        item.id == itemId && (item.note || '') === noteKey
    );

    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy, note: noteKey }); // MUTATE (OK)
        renderOrderScreen(); // Re-renderiza a lista de itens selecionados
        saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase
    }
};
window.increaseLocalItemQuantity = increaseLocalItemQuantity;


export const decreaseLocalItemQuantity = (itemId, noteKey) => {
    // Encontra o ÍNDICE do último item correspondente
    let indexToRemove = -1;
    for (let i = selectedItems.length - 1; i >= 0; i--) {
        if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
            indexToRemove = i;
            break;
        }
    }

    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1); // MUTATE (OK)
        renderOrderScreen(); // Re-renderiza a lista de itens selecionados
        saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase
    }
};
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;


// --- FUNÇÕES DE EXIBIÇÃO DE TELA E MODAL ---

export const renderMenu = () => {
    if (!menuItemsGrid || !categoryFiltersContainer) {
        // console.warn("[Order] Elementos do menu não encontrados para renderizar.");
        return;
    }

    const products = getProducts();
    const categories = getCategories();

    // 1. Renderiza Filtros de Categoria (se ainda não renderizados)
    if (categories.length > 0 && categoryFiltersContainer.innerHTML.trim() === '') {
        categoryFiltersContainer.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentCategoryFilter ? 'bg-pumpkin text-white' : 'bg-dark-input text-dark-text border border-gray-600';
            return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }
     // Atualiza o estado ativo dos botões de categoria
     categoryFiltersContainer.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentCategoryFilter;
        btn.classList.toggle('bg-pumpkin', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-dark-input', !isActive);
        btn.classList.toggle('text-dark-text', !isActive);
        btn.classList.toggle('border-gray-600', !isActive);
        btn.classList.toggle('border-pumpkin', isActive);
    });


    // 2. Filtra Produtos baseado no estado atual
    let filteredProducts = products;
    if (currentSearch) {
        const normalizedSearch = currentSearch.toLowerCase();
        filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(normalizedSearch));
    }
    if (currentCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === currentCategoryFilter);
    }

    // 3. Renderiza Itens do Cardápio
    if (filteredProducts.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        menuItemsGrid.innerHTML = filteredProducts.map(product => `
            <div class="product-card bg-dark-card border border-gray-700 p-4 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition duration-150">
                <h4 class="font-bold text-base text-dark-text">${product.name}</h4>
                <p class="text-xs text-dark-placeholder">${product.category} (${product.sector})</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-bold text-lg text-pumpkin">${formatCurrency(product.price)}</span>
                    <button class="add-item-btn add-icon-btn bg-green-600 text-white hover:bg-green-700 transition"
                            data-product='${JSON.stringify(product).replace(/'/g, '&#39;')}'>
                        <i class="fas fa-plus text-lg"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// Renderiza a lista de itens selecionados (Painel 2)
const _renderSelectedItemsList = () => {
    if (!openOrderList || !openItemsCount || !sendSelectedItemsBtn) return;

    const openItemsCountValue = selectedItems.length;
    openItemsCount.textContent = openItemsCountValue;
    sendSelectedItemsBtn.disabled = openItemsCountValue === 0;

    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) acc[key] = { ...item, count: 0 };
            acc[key].count++;
            return acc;
        }, {});

        openOrderList.innerHTML = Object.values(groupedItems).map(group => `
            <div class="flex justify-between items-center bg-dark-input border border-gray-600 p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-dark-text">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-indigo-300 hover:text-indigo-200" data-item-id="${group.id}" data-item-note-key="${group.note || ''}">
                        ${group.note ? `<span class="text-yellow-400">(${group.note.replace(' [EM ESPERA]', '')})</span>${group.note.includes('[EM ESPERA]') ? ' <i class="fas fa-pause-circle text-yellow-400"></i>' : ''}` : `(Adicionar Obs.)`}
                    </span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full text-lg hover:bg-red-700 transition duration-150"
                            data-item-id="${group.id}" data-item-note-key="${group.note || ''}" data-action="decrease">
                        <i class="fas fa-minus pointer-events-none"></i>
                    </button>
                    <button class="qty-btn bg-green-600 text-white rounded-full text-lg hover:bg-green-700 transition duration-150"
                            data-item-id="${group.id}" data-item-note-key="${group.note || ''}" data-action="increase">
                        <i class="fas fa-plus pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// Função principal para renderizar toda a tela de pedido
export const renderOrderScreen = (orderSnapshot) => {
    // Se um snapshot for passado (do listener do app.js)
    if (orderSnapshot) {
         const firebaseSelectedItems = orderSnapshot.selectedItems || [];
         
         // **CORREÇÃO 1:** Usa 'screens' (agora importado) para verificar a tela ativa
         const isOrderScreenActive = document.getElementById('appContainer')?.style.transform === `translateX(-${screens['orderScreen'] * 100}vw)`;
         
         if (!isOrderScreenActive && JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
             console.log("[OrderController] Atualizando selectedItems com snapshot.");
             selectedItems.length = 0;
             selectedItems.push(...firebaseSelectedItems);
         }
    }
    _renderSelectedItemsList();
    renderMenu(); // Renderiza/Atualiza o menu (agora é chamado após a correção do erro)
};


// Abertura do Modal de Observações (Apenas Staff)
export const openObsModalForGroup = (itemId, noteKey) => {
    const products = getProducts();
    const product = products.find(p => p.id == itemId);

    if (!obsModal || !obsItemName || !obsInput || !esperaSwitch || !product) {
        console.error("Erro: Elementos do modal OBS ou produto não encontrados.");
        return;
    }

    obsItemName.textContent = product.name;
    const esperaTag = ' [EM ESPERA]';
    const currentNoteCleaned = noteKey.replace(esperaTag, '').trim();
    obsInput.value = currentNoteCleaned;

    obsModal.dataset.itemId = itemId;
    obsModal.dataset.originalNoteKey = noteKey; // Chave original

    esperaSwitch.checked = noteKey.toLowerCase().includes('espera');

    obsInput.readOnly = false;
    obsInput.placeholder = "Ex: Sem cebola, Ponto da carne mal passada...";

    obsModal.style.display = 'flex';
};
window.openObsModalForGroup = openObsModalForGroup; // Expor globalmente


// Adicionar Produto à Lista de Selecionados (chamado pelo botão + no cardápio)
export const addItemToSelection = (product) => {
    if (!currentTableId) {
        alert("Selecione ou abra uma mesa primeiro.");
        return;
    }
    if (!product || !product.id) {
         console.error("Tentativa de adicionar produto inválido:", product);
         return;
    }

    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha',
        category: product.category || 'uncategorized',
        note: ''
    };

    selectedItems.push(newItem); // MUTATE (OK)

    renderOrderScreen(); // Atualiza a UI
    saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva no Firebase

    openObsModalForGroup(product.id, ''); // Abre modal para o item recém-adicionado
};


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

    // **CORREÇÃO 2:** Calcula o valor a ser adicionado ao total
    const itemsToSendValue = itemsToSend.reduce((sum, item) => sum + (item.price || 0), 0);
    const kdsOrderRef = doc(getKdsCollectionRef()); // Cria referência para novo doc KDS

    const itemsForFirebase = itemsToSend.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category,
        sector: item.sector,
        note: item.note || '',
        sentAt: Date.now(), // Timestamp JS
        orderId: kdsOrderRef.id,
    }));

    try {
        console.log("[Order] Enviando para KDS:", itemsForFirebase);
        // Envio KDS
        await setDoc(kdsOrderRef, {
            orderId: kdsOrderRef.id,
            tableNumber: parseInt(currentTableId),
            sentAt: serverTimestamp(), // Timestamp do servidor
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

        // **CORREÇÃO 2:** Pega o total atual do snapshot e soma o novo valor
        const currentTotal = currentOrderSnapshot?.total || 0;
        const newTotal = currentTotal + itemsToSendValue;

        await updateDoc(tableRef, {
            sentItems: arrayUnion(...itemsForFirebase), // Adiciona itens enviados
            selectedItems: itemsToHold,                // Atualiza selecionados (só os em espera)
            total: newTotal,                           // <-- ATUALIZA O TOTAL
            lastKdsSentAt: serverTimestamp()           // Atualiza timestamp do último envio
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
export const initOrderController = () => {
    if(orderInitialized) return;
    console.log("[OrderController] Inicializando...");

    // Mapeia elementos específicos deste painel
    searchProductInput = document.getElementById('searchProductInput');
    categoryFiltersContainer = document.getElementById('categoryFilters');
    menuItemsGrid = document.getElementById('menuItemsGrid');
    openOrderList = document.getElementById('openOrderList');
    openItemsCount = document.getElementById('openItemsCount');
    sendSelectedItemsBtn = document.getElementById('sendSelectedItemsBtn');

    // Mapeia elementos do modal OBS
    obsModal = document.getElementById('obsModal');
    obsItemName = document.getElementById('obsItemName');
    obsInput = document.getElementById('obsInput');
    saveObsBtn = document.getElementById('saveObsBtn');
    cancelObsBtn = document.getElementById('cancelObsBtn');
    esperaSwitch = document.getElementById('esperaSwitch');
    quickObsButtons = document.getElementById('quickObsButtons');

    // Listener para busca de produto
    if (searchProductInput) {
        searchProductInput.addEventListener('input', (e) => {
            currentSearch = e.target.value;
            renderMenu(); // Re-renderiza o menu com o novo termo de busca
        });
    } else {
         console.error("[OrderController] Input 'searchProductInput' não encontrado.");
    }

    // Listener para filtros de categoria (delegação de evento)
    if (categoryFiltersContainer) {
        categoryFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                currentCategoryFilter = btn.dataset.category;
                renderMenu(); // Re-renderiza o menu com o novo filtro
            }
        });
    } else {
         console.error("[OrderController] Container 'categoryFilters' não encontrado.");
    }

    // Listener para botões +/-/obs na lista de itens selecionados (delegação)
    if (openOrderList) {
        openOrderList.addEventListener('click', (e) => {
            const target = e.target;
            const qtyBtn = target.closest('.qty-btn'); 
            const obsSpan = target.closest('span[data-item-id]'); // Clica na observação

            if (qtyBtn) {
                const itemId = qtyBtn.dataset.itemId;
                const noteKey = qtyBtn.dataset.itemNoteKey;
                const action = qtyBtn.dataset.action;
                if (action === 'increase') {
                    increaseLocalItemQuantity(itemId, noteKey);
                } else if (action === 'decrease') {
                    decreaseLocalItemQuantity(itemId, noteKey);
                }
            } else if (obsSpan) {
                const itemId = obsSpan.dataset.itemId;
                const noteKey = obsSpan.dataset.itemNoteKey;
                openObsModalForGroup(itemId, noteKey);
            }
        });
    } else {
        console.error("[OrderController] Lista 'openOrderList' não encontrada.");
    }

     // Listener para adicionar item (delegação no menuItemsGrid)
     if (menuItemsGrid) {
        menuItemsGrid.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.add-item-btn');
            if (addBtn && addBtn.dataset.product) {
                try {
                    const productData = JSON.parse(addBtn.dataset.product.replace(/&#39;/g, "'"));
                    addItemToSelection(productData);
                } catch (err) {
                    console.error("Erro ao parsear dados do produto:", err);
                }
            }
        });
    } else {
         console.error("[OrderController] Grid 'menuItemsGrid' não encontrado.");
    }


    // Listener para botão de enviar pedido
    if (sendSelectedItemsBtn) {
        sendSelectedItemsBtn.addEventListener('click', handleSendSelectedItems);
    } else {
         console.error("[OrderController] Botão 'sendSelectedItemsBtn' não encontrado.");
    }

    // Listeners do Modal OBS
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

            let updated = false;
            // Cria um novo array temporário com as atualizações
            const updatedItems = selectedItems.map(item => {
                if (item.id == itemId && (item.note || '') === originalNoteKey) {
                    updated = true;
                    return { ...item, note: newNote };
                }
                return item;
            });
            
            // Muta o array original 'selectedItems'
            selectedItems.length = 0; 
            selectedItems.push(...updatedItems);

            if (updated) {
                obsModal.style.display = 'none';
                renderOrderScreen();
                saveSelectedItemsToFirebase(currentTableId, selectedItems);
            } else {
                console.warn("Nenhum item encontrado para atualizar a observação.");
                obsModal.style.display = 'none';
            }
        });
    } else {
        console.error("[OrderController] Botão 'saveObsBtn' não encontrado.");
    }

    if (cancelObsBtn) {
        cancelObsBtn.addEventListener('click', () => {
            const itemId = obsModal.dataset.itemId;
            const originalNoteKey = obsModal.dataset.originalNoteKey;
            const currentNote = obsInput.value.trim();

            if (originalNoteKey === '' && currentNote === '') {
                 let lastIndex = -1;
                 for (let i = selectedItems.length - 1; i >= 0; i--) {
                     if (selectedItems[i].id == itemId && selectedItems[i].note === '') {
                         lastIndex = i;
                         break;
                     }
                 }
                 if (lastIndex > -1) {
                     selectedItems.splice(lastIndex, 1); // MUTATE (OK)
                     console.log("Item recém-adicionado cancelado.");
                 }
            }

            obsModal.style.display = 'none';
            renderOrderScreen(); // Re-renderiza
            saveSelectedItemsToFirebase(currentTableId, selectedItems); // Salva
        });
    } else {
        console.error("[OrderController] Botão 'cancelObsBtn' não encontrado.");
    }

    if (quickObsButtons) {
        quickObsButtons.addEventListener('click', (e) => {
             const btn = e.target.closest('.quick-obs-btn');
             if (btn && obsInput && !obsInput.readOnly) {
                 const obsText = btn.dataset.obs;
                 let currentValue = obsInput.value.trim();
                 if (currentValue && !currentValue.endsWith(',') && !currentValue.endsWith(' ')) {
                     currentValue += ', ';
                 } else if (currentValue && (currentValue.endsWith(',') || currentValue.endsWith(' '))) {
                     currentValue += ' ';
                 }
                 obsInput.value = (currentValue + obsText).trim();
             }
        });
    } else {
        console.error("[OrderController] Container 'quickObsButtons' não encontrado.");
    }

    orderInitialized = true;
    console.log("[OrderController] Inicializado.");
};
