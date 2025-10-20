// --- CONTROLLERS/ORDERCONTROLLER.JS (Painel 2) ---
import { getProducts, getCategories } from "../services/wooCommerceService.js";
import { formatCurrency } from "../utils.js";
// CRITICAL FIX: Importando saveSelectedItemsToFirebase do serviço, não do app.js
import { saveSelectedItemsToFirebase } from "../services/firebaseService.js"; 
import { currentTableId, selectedItems, userRole, currentOrderSnapshot } from "../app.js";
import { openManagerAuthModal } from "./managerController.js";


// --- FUNÇÕES DE EXIBIÇÃO DE TELA ---

// Função para renderizar o cardápio
export const renderMenu = () => { 
    const menuItemsGrid = document.getElementById('menuItemsGrid');
    const categoryFiltersContainer = document.getElementById('categoryFilters');
    
    if (!menuItemsGrid || !categoryFiltersContainer) return;
    
    const products = getProducts();
    const categories = getCategories(); 

    // 1. Renderiza Filtros de Categoria (se houver)
    if (categories.length > 0) {
        categoryFiltersContainer.innerHTML = categories.map(cat => `
            <button class="category-btn px-4 py-3 rounded-full text-base font-semibold whitespace-nowrap bg-white text-gray-700 border border-gray-300" 
                    data-category="${cat.slug || cat.id}">
                ${cat.name}
            </button>
        `).join('');
    }

    if (products.length === 0) {
        menuItemsGrid.innerHTML = `<div class="col-span-full text-center p-6 text-red-500 italic">Erro ao carregar produtos. Verifique a API do WooCommerce.</div>`;
        return;
    }
    
    // 2. Renderiza Itens do Cardápio
    menuItemsGrid.innerHTML = products.map(product => `
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

export const renderOrderScreen = () => {
    const openOrderList = document.getElementById('openOrderList');
    const openItemsCount = document.getElementById('openItemsCount');
    const sendSelectedItemsBtn = document.getElementById('sendSelectedItemsBtn');

    if (!openOrderList) return;

    const openItemsCountValue = selectedItems.length;
    openItemsCount.textContent = openItemsCountValue;

    if (sendSelectedItemsBtn) {
        // Lógica de desabilitação: Cliente não pode enviar, Garçom/Gerente precisa de itens.
        if (userRole === 'client') {
            sendSelectedItemsBtn.disabled = true;
            sendSelectedItemsBtn.textContent = 'Aguardando Staff';
        } else {
            sendSelectedItemsBtn.disabled = openItemsCountValue === 0;
            sendSelectedItemsBtn.textContent = 'Enviar Itens';
        }
    }

    if (openItemsCountValue === 0) {
        openOrderList.innerHTML = `<div class="text-base text-gray-500 italic p-2">Nenhum item selecionado.</div>`;
    } else {
        // Renderiza itens selecionados
        openOrderList.innerHTML = selectedItems.map(item => `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm">
                <span class="font-semibold">${item.name}</span>
                <span class="text-sm">(${formatCurrency(item.price)})</span>
            </div>
        `).join('');
    }
};

// --- FUNÇÕES DE AÇÃO ---

// Implementação da função openProductInfoModal (Item 2)
export const openProductInfoModal = (productId) => {
    const product = getProducts().find(p => p.id === productId);
    const productInfoModal = document.getElementById('productManagementModal'); // Placeholder
    
    if (!product) return;

    alert(`Detalhes do Produto:\nNome: ${product.name}\nPreço: ${formatCurrency(product.price)}\nSetor: ${product.sector}`);
};
window.openProductInfoModal = openProductInfoModal; // EXPÕE AO ESCOPO GLOBAL

// Implementação da função addItemToSelection (Item 1)
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

    // Atualiza a UI e salva o estado no Firebase
    renderOrderScreen();
    saveSelectedItemsToFirebase(currentTableId, selectedItems);
    
    // Abrir modal de observações aqui (Função futura: window.openObsModalForGroup(product.id, ''));
};
window.addItemToSelection = addItemToSelection; // EXPÕE AO ESCOPO GLOBAL


export const handleSendSelectedItems = () => { alert('Função de Envio KDS (Marcha) em desenvolvimento.'); };
