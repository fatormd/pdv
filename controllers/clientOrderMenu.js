// --- controllers/clientOrderMenu.js ---
import { formatCurrency, toggleLoading } from "/utils.js"; 
import { getProducts, getCategories, fetchWooCommerceCategories, fetchWooCommerceProducts } from "/services/wooCommerceService.js?v=4";
import { showToast } from "/app.js"; 

// Variáveis de Módulo (Estado do Menu e Carrinho)
export let selectedItems = []; 
export let quickObsCache = []; 
let currentCategoryFilter = 'all';
let currentPage = 1;
let currentSearch = '';
let searchTimeout = null;
let loadMoreBtn;
const ESPERA_KEY = "(EM ESPERA)"; 

// Variáveis UI
let clientMenuContainer, clientCategoryFilters, clientCartCount, sendOrderBtn, searchProductInputClient;
let clientObsModal, clientObsText, clientQuickObsButtons, clientConfirmObsBtn, clientCancelObsBtn;

export const initMenu = (externalElements) => {
    ({ 
        clientMenuContainer, clientCategoryFilters, clientCartCount, sendOrderBtn, 
        searchProductInputClient, clientObsModal, clientObsText, clientQuickObsButtons, 
        clientConfirmObsBtn, clientCancelObsBtn 
    } = externalElements);

    // Eventos do Menu
    if (clientMenuContainer) clientMenuContainer.addEventListener('click', handleMenuClick);
    if (clientCategoryFilters) clientCategoryFilters.addEventListener('click', handleCategoryClick);
    if (searchProductInputClient) searchProductInputClient.addEventListener('input', handleSearch);

    // Eventos do Carrinho
    document.getElementById('client-cart-items-list')?.addEventListener('click', handleCartClick);
    
    // Eventos do Modal de Observação
    if (clientObsModal) {
        if (clientQuickObsButtons) clientQuickObsButtons.addEventListener('click', handleQuickObsClick);
        if (clientConfirmObsBtn) clientConfirmObsBtn.addEventListener('click', handleConfirmObs);
        if (clientCancelObsBtn) clientCancelObsBtn.addEventListener('click', () => { clientObsModal.style.display = 'none'; renderClientOrderScreen(); });
    }

    return { loadMenu, fetchQuickObservations, renderClientOrderScreen };
};

// --- Lógica de Carregamento e Filtros ---

export async function loadMenu() {
    try {
        await fetchWooCommerceCategories(null);
        await fetchWooCommerceProducts(1, '', 'all', false);
        renderMenu(); 
    } catch (error) {
        console.error("Erro menu:", error);
    }
}

const handleSearch = (e) => {
    currentSearch = e.target.value;
    currentPage = 1;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        clientMenuContainer.innerHTML = '<div class="col-span-full text-center text-pumpkin py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
        await fetchWooCommerceProducts(1, currentSearch, currentCategoryFilter, false);
        renderMenu(false);
    }, 600);
};

const handleCategoryClick = async (e) => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    
    // Remove 'active' de todos
    clientCategoryFilters.querySelectorAll('.category-btn').forEach(b => {
        b.classList.remove('bg-brand-primary', 'text-white');
        b.classList.add('bg-dark-input', 'text-dark-text', 'border', 'border-gray-600');
    });
    
    // Adiciona 'active' ao clicado
    btn.classList.add('bg-brand-primary', 'text-white');
    btn.classList.remove('bg-dark-input', 'text-dark-text', 'border', 'border-gray-600');

    currentCategoryFilter = btn.dataset.category;
    currentPage = 1;
    
    clientMenuContainer.innerHTML = '<div class="col-span-full text-center text-pumpkin py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    await fetchWooCommerceProducts(1, currentSearch, currentCategoryFilter, false);
    renderMenu(false);
};

const handleLoadMore = async () => {
    currentPage++;
    toggleLoading(loadMoreBtn, true, 'Carregando...');
    
    const newItems = await fetchWooCommerceProducts(currentPage, currentSearch, currentCategoryFilter, true);
    
    if (newItems.length === 0) {
        showToast("Fim da lista.", false);
        loadMoreBtn.style.display = 'none';
    } else {
        renderMenu(true); 
    }
};

// --- RENDERIZAÇÃO ---

export function renderMenu(append = false) {
    if (!clientMenuContainer) return;
    
    // Renderiza Filtros
    if (clientCategoryFilters && (clientCategoryFilters.innerHTML.trim() === '' || !append)) {
        const categories = getCategories();
        clientCategoryFilters.innerHTML = categories.map(cat => {
            const isActive = cat.slug === currentCategoryFilter ? 'bg-brand-primary text-white' : 'bg-dark-input text-dark-text border border-gray-600';
            return `<button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap ${isActive}" data-category="${cat.slug || cat.id}">${cat.name}</button>`;
        }).join('');
    }

    const products = getProducts();
    let filteredProducts = products;

    if (currentCategoryFilter === 'top10') {
        const top10Ids = JSON.parse(localStorage.getItem('top10_products') || '[]');
        filteredProducts = products.filter(p => top10Ids.includes(p.id.toString()));
        filteredProducts.sort((a, b) => top10Ids.indexOf(a.id.toString()) - top10Ids.indexOf(b.id.toString()));
    }

    if (!append) clientMenuContainer.innerHTML = '';
    
    // Renderiza Produtos
    if (filteredProducts.length === 0) {
        clientMenuContainer.innerHTML = `<div class="col-span-full text-center p-6 text-yellow-400 italic">Nenhum produto encontrado.</div>`;
    } else {
        const html = filteredProducts.map((product, index) => {
            let badge = '';
            if (currentCategoryFilter === 'top10' && index < 3) {
                const colors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];
                badge = `<i class="fas fa-medal ${colors[index]} absolute top-2 right-2 text-xl drop-shadow-md"></i>`;
            }

            return `
            <div class="product-card bg-dark-card border border-dark-border rounded-xl shadow-md flex flex-col overflow-hidden relative" data-product-id="${product.id}">
                ${badge}
                <img src="${product.image}" alt="${product.name}" class="w-full h-32 object-cover">
                <div class="p-4 flex flex-col flex-grow">
                    <h4 class="font-semibold text-base text-white mb-2 min-h-[2.5rem]">${product.name}</h4>
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-bold text-lg text-brand-primary">${formatCurrency(product.price)}</span>
                        <button class="add-item-btn bg-brand-primary text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-brand-primary-dark transition pointer-events-none">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="flex-grow"></div>
                    <button class="info-item-btn w-full bg-dark-input text-dark-text font-semibold py-2 rounded-lg hover:bg-gray-600 transition text-sm">
                        Descrição
                    </button>
                </div>
            </div>
        `}).join('');

        if (append) {
            if (loadMoreBtn) loadMoreBtn.remove();
            clientMenuContainer.insertAdjacentHTML('beforeend', html);
        } else {
            clientMenuContainer.innerHTML = html;
        }
    }

    if (currentCategoryFilter !== 'top10') {
        renderLoadMoreButton();
    }
}

const renderLoadMoreButton = () => {
    if (loadMoreBtn) loadMoreBtn.remove();
    loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'col-span-full py-3 mt-4 bg-gray-800 text-gray-400 rounded-lg font-bold text-sm';
    loadMoreBtn.innerText = 'Ver mais produtos';
    loadMoreBtn.onclick = handleLoadMore;
    clientMenuContainer.appendChild(loadMoreBtn);
};

// --- Lógica de Carrinho e Observação ---

const handleMenuClick = (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    const products = getProducts();
    const product = products.find(p => p.id == card.dataset.productId);
    if (!product) return;
    
    if (e.target.closest('.info-item-btn')) {
         openProductInfoModal(product);
    } else {
         addItemToCart(product);
    }
};

const handleCartClick = (e) => {
    const qtyBtn = e.target.closest('.qty-btn');
    const obsSpan = e.target.closest('.obs-span');
    
    if (qtyBtn) {
        const itemId = qtyBtn.dataset.itemId;
        const noteKey = qtyBtn.dataset.itemNoteKey;
        const action = qtyBtn.dataset.action;
        if(action === 'increase') increaseCartItemQuantity(itemId, noteKey);
        if(action === 'decrease') decreaseCartItemQuantity(itemId, noteKey);
    }
    
    if (obsSpan) {
        const itemId = obsSpan.dataset.itemId;
        const noteKey = obsSpan.dataset.itemNoteKey;
        openClientObsModal(itemId, noteKey);
    }
};

function addItemToCart(product) {
    if (!product || !product.id) return;
    const newItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        sector: product.sector || 'cozinha',
        category: product.category || 'uncategorized',
        note: ''
    };
    selectedItems.push(newItem); 
    renderClientOrderScreen(); 
    showToast("Item adicionado!", false);
    openClientObsModal(product.id, '');
}

function increaseCartItemQuantity(itemId, noteKey) {
    const itemToCopy = selectedItems.findLast(item => item.id == itemId && (item.note || '') === noteKey);
    if (itemToCopy) {
        selectedItems.push({ ...itemToCopy }); 
        renderClientOrderScreen(); 
    }
}

function decreaseCartItemQuantity(itemId, noteKey) {
    let indexToRemove = -1;
    for (let i = selectedItems.length - 1; i >= 0; i--) {
        if (selectedItems[i].id == itemId && (selectedItems[i].note || '') === noteKey) {
            indexToRemove = i;
            break;
        }
    }
    if (indexToRemove > -1) {
        selectedItems.splice(indexToRemove, 1); 
        renderClientOrderScreen(); 
    }
}

function openProductInfoModal(product) {
    const modal = document.getElementById('productInfoModal');
    const img = document.getElementById('infoProductImage');
    const nameEl = document.getElementById('infoProductName');
    const priceEl = document.getElementById('infoProductPrice');
    const descEl = document.getElementById('infoProductDescription');
    const addBtn = document.getElementById('infoProductAddBtn');
    
    if (!modal) return;

    img.src = product.image || 'https://placehold.co/600x400/1f2937/d1d5db?text=Produto';
    nameEl.textContent = product.name;
    priceEl.textContent = formatCurrency(product.price);
    descEl.innerHTML = product.description || 'Sem descrição.';
    
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    newAddBtn.onclick = () => {
        addItemToCart(product);
        modal.style.display = 'none'; 
    };
    modal.style.display = 'flex';
}

function openClientObsModal(itemId, noteKey) {
    const products = getProducts();
    const product = products.find(p => p.id == itemId);
    const esperaSwitch = document.getElementById('esperaSwitch'); 
    
    if (!clientObsModal || !product || !esperaSwitch) return;

    const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
    const isEspera = regexEspera.test(noteKey);
    let cleanNote = noteKey.replace(regexEspera, '').trim();
    if (cleanNote.startsWith(',')) cleanNote = cleanNote.substring(1).trim();

    clientObsModal.querySelector('h3').textContent = product.name;
    clientObsText.value = cleanNote; 
    esperaSwitch.checked = isEspera; 

    clientObsModal.dataset.itemId = itemId;
    clientObsModal.dataset.originalNoteKey = noteKey; 
    clientObsModal.style.display = 'flex';
}

const handleQuickObsClick = (e) => {
    const btn = e.target.closest('.quick-obs-btn');
    if (btn && clientObsText) {
        const obsText = btn.dataset.obs;
        let currentValue = clientObsText.value.trim();
        if (currentValue && !currentValue.endsWith(',') && !currentValue.endsWith(' ')) currentValue += ', ';
        else if (currentValue && (currentValue.endsWith(',') || currentValue.endsWith(' '))) currentValue += ' ';
        clientObsText.value = (currentValue + obsText).trim();
    }
};

const handleConfirmObs = () => {
    const itemId = clientObsModal.dataset.itemId;
    const originalNoteKey = clientObsModal.dataset.originalNoteKey;
    let newNote = clientObsText.value.trim();
    
    const esperaSwitch = document.getElementById('esperaSwitch');
    const isEspera = esperaSwitch ? esperaSwitch.checked : false;
    const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
    const hasKey = newNote.toUpperCase().includes(ESPERA_KEY);

    if (isEspera && !hasKey) newNote = newNote ? `${ESPERA_KEY} ${newNote}` : ESPERA_KEY;
    else if (!isEspera && hasKey) {
        newNote = newNote.replace(regexEspera, '').trim();
        newNote = newNote.replace(/,,/g, ',').replace(/^,/, '').trim();
    }
    
    newNote = newNote.trim(); 

    let updated = false;
    const updatedItems = selectedItems.map(item => {
        if (item.id == itemId && (item.note || '') === originalNoteKey) { updated = true; return { ...item, note: newNote }; }
        return item;
    });
    
    selectedItems.length = 0; 
    selectedItems.push(...updatedItems);

    if (updated) { clientObsModal.style.display = 'none'; renderClientOrderScreen(); } 
    else { clientObsModal.style.display = 'none'; }
};

// --- Renderização do Carrinho ---

function _renderClientCart() {
    const cartItemsList = document.getElementById('client-cart-items-list');
    if (!cartItemsList) return;
    
    if (selectedItems.length === 0) {
        cartItemsList.innerHTML = `<div class="text-sm md:text-base text-dark-placeholder italic p-2">Nenhum item selecionado.</div>`;
    } else {
        const groupedItems = selectedItems.reduce((acc, item) => {
            const key = `${item.id}-${item.note || ''}`;
            if (!acc[key]) acc[key] = { ...item, count: 0 };
            acc[key].count++;
            return acc;
        }, {});
        
        cartItemsList.innerHTML = Object.values(groupedItems).map(group => {
            const note = group.note || '';
            const regexEspera = new RegExp(ESPERA_KEY.replace('(', '\\(').replace(')', '\\)'), 'ig');
            const isEspera = regexEspera.test(note);
            let displayNote = note.replace(regexEspera, '').trim();
            if (displayNote.startsWith(',')) displayNote = displayNote.substring(1).trim();
            
            let noteHtml = '';
            if (isEspera) noteHtml = `<span class="text-yellow-400 font-semibold">${ESPERA_KEY}</span>`;
            if (displayNote) noteHtml += ` <span class="text-brand-primary">(${displayNote})</span>`;
            if (!noteHtml) noteHtml = `(Adicionar Obs.)`;
            
            return `
            <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg shadow-sm">
                <div class="flex flex-col flex-grow min-w-0 mr-2">
                    <span class="font-semibold text-white">${group.name} (${group.count}x)</span>
                    <span class="text-sm cursor-pointer text-gray-400 hover:text-white obs-span" 
                          data-item-id="${group.id}" data-item-note-key="${note}">
                        ${noteHtml}
                    </span>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button class="qty-btn bg-red-600 text-white rounded-full h-8 w-8 flex items-center justify-center"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="decrease"><i class="fas fa-minus"></i></button>
                    <button class="qty-btn bg-green-600 text-white rounded-full h-8 w-8 flex items-center justify-center"
                            data-item-id="${group.id}" data-item-note-key="${note}" data-action="increase"><i class="fas fa-plus"></i></button>
                </div>
            </div>
        `}).join('');
    }
}

export function renderClientOrderScreen(tableData) {
    if (clientCartCount) clientCartCount.textContent = selectedItems.length;
    
    if (sendOrderBtn) {
        const billRequested = tableData?.waiterNotification?.includes('fechamento') || tableData?.billRequested === true;
        if (billRequested) {
            sendOrderBtn.disabled = true;
            sendOrderBtn.innerHTML = '<i class="fas fa-hourglass-half"></i>';
            sendOrderBtn.classList.add('opacity-50');
        } else {
            sendOrderBtn.disabled = selectedItems.length === 0;
            sendOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i>';
            sendOrderBtn.classList.remove('opacity-50');
        }
    }
    _renderClientCart();
}

// --- Observações Rápidas (Quick Obs) ---

export const fetchQuickObservations = async () => {
    try {
        if (quickObsCache.length > 0) { renderClientQuickObsButtons(quickObsCache); return quickObsCache; }
        const { query, orderBy, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const { getQuickObsCollectionRef } = await import("/services/firebaseService.js");

        const q = query(getQuickObsCollectionRef(), orderBy('text', 'asc'));
        const snap = await getDocs(q);
        quickObsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderClientQuickObsButtons(quickObsCache);
    } catch (e) { console.error(e); }
};

function renderClientQuickObsButtons(observations) {
    if (!clientQuickObsButtons) return;
    if (observations.length === 0) { clientQuickObsButtons.innerHTML = '<p class="text-xs italic">Nenhuma obs.</p>'; return; }
    clientQuickObsButtons.innerHTML = observations.map(obs => 
        `<button class="quick-obs-btn text-xs px-3 py-1 bg-dark-input rounded-full hover:bg-gray-600" data-obs="${obs.text}">${obs.text}</button>`
    ).join('');
}