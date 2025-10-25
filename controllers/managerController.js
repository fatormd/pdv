// --- CONTROLLERS/MANAGERCONTROLLER.JS (Painel 4) ---
import { goToScreen } from "/app.js";
import { getProducts } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
// REMOVIDO: import { activateItemSelection, handleMassDeleteConfirmed } from "./paymentController.js";

// Estado
let managerInitialized = false;
// Mapeado dentro do init para garantir que o DOM esteja pronto
let productManagementModal; 


// --- FUNÇÕES DE GESTÃO (Placeholders) ---
const renderProductManagement = () => {
    if (!productManagementModal) {
         alert("Módulo de Gestão de Produtos em desenvolvimento.");
         return;
    }
    // ... (lógica para renderizar o modal de produtos, se existir) ...
    const products = getProducts();
    let listHtml = products.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-gray-600">
            <div class="flex flex-col">
                <span class="font-semibold text-dark-text">${p.name}</span>
                <span class="text-xs text-dark-placeholder">ID: ${p.id} | Setor: ${p.sector}</span>
            </div>
            <div class="flex items-center space-x-2">
                <span class="font-bold text-pumpkin">${formatCurrency(p.price)}</span>
                <button class="px-3 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition" onclick="alert('Editar ${p.id}')">Editar</button>
                <button class="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition" onclick="alert('Excluir ${p.id}')">Excluir</button>
            </div>
        </div>
    `).join('');

    productManagementModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-xl max-h-screen overflow-y-auto">
            <h3 class="text-xl font-bold mb-4 text-pumpkin">Gestão de Produtos (WooCommerce)</h3>
            <div class="flex justify-between mb-4">
                 <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition" onclick="alert('Abrir formulário de criação')">
                    <i class="fas fa-plus"></i> Novo Produto
                 </button>
                 <button class="px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition" onclick="document.getElementById('productManagementModal').style.display='none'">
                    Fechar
                 </button>
            </div>
            <div class="border border-gray-600 p-3 rounded-lg max-h-96 overflow-y-auto bg-dark-bg">
                ${listHtml || '<p class="text-dark-placeholder italic">Nenhum produto carregado.</p>'}
            </div>
        </div>
    `;
    productManagementModal.style.display = 'flex';
};

// Esta função agora é chamada pelo app.js (openManagerAuthModal)
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Executando ação gerencial: ${action}`);
    switch (action) {
        // Ações de PaymentController são tratadas no app.js
        case 'goToManagerPanel':
             goToScreen('managerScreen');
             break;
        case 'openProductManagement':
        case 'openCategoryManagement':
            renderProductManagement(); // Usa o mesmo modal para visualização
            break;
        case 'openInventoryManagement':
            alert("Módulo de ESTOQUE/INVENTÁRIO (Fase 2) em desenvolvimento.");
            break;
        case 'openCashManagement':
            alert("Módulo de GESTÃO DE CAIXA (Fase 1) em desenvolvimento.");
            break;
        case 'openReservations':
            alert("Módulo de RESERVAS/FILA DE ESPERA em desenvolvimento.");
            break;
        case 'openCustomerCRM':
            alert("Módulo de CRM (Fidelidade) em desenvolvimento.");
            break;
        case 'openWaiterReg':
            alert("Módulo de Cadastro de Usuários em desenvolvimento.");
            break;
        case 'openRecipesManagement':
            alert("Módulo de FICHA TÉCNICA (BOM) em desenvolvimento.");
            break;
        case 'openWooSync':
            alert("Ação de SINCRONIZAÇÃO FORÇADA em desenvolvimento.");
            break;
        // REMOVIDO: 'deleteMass', 'openSelectiveTransfer' (tratados pelo app.js/paymentController)
        default:
             alert(`Módulo Gerencial não reconhecido: ${action}.`);
    }
};

// REMOVIDO: export const openManagerAuthModal = (...) => { ... }; (Movido para app.js)


// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    if(managerInitialized) return;
    console.log("[ManagerController] Inicializando...");

    // Mapeia o modal de produtos
    productManagementModal = document.getElementById('productManagementModal');
    const managerCards = document.querySelectorAll('#managerScreen .manager-card');

    managerCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr) {
            // Remove o onclick inline para substituí-lo por listener
            card.removeAttribute('onclick');

            // Tenta extrair a ação do openManagerAuthModal
            const matchAuth = onclickAttr.match(/openManagerAuthModal\('([^']+)'/);
            // CORREÇÃO: Trata o caso do modal de Relatórios
            const matchReports = onclickAttr.includes("document.getElementById('reportsModal')");

            if (matchAuth && matchAuth[1]) {
                const action = matchAuth[1];
                const payload = null;
                card.addEventListener('click', () => {
                    // Chama a função GLOBAL do app.js
                    window.openManagerAuthModal(action, payload);
                });
            } else if (matchReports) {
                 // Trata o botão de Relatórios especificamente
                 card.addEventListener('click', () => {
                     const modal = document.getElementById('reportsModal');
                     if(modal) modal.style.display = 'flex';
                 });
                 // console.log(`[Manager] Card 'Relatórios' configurado.`);
            } else {
                 console.warn("Não foi possível parsear onclick para card:", card.outerHTML);
                 // Adiciona um listener de fallback
                 card.addEventListener('click', () => {
                    try { eval(onclickAttr); } catch(e) { console.error("Erro ao executar onclick antigo:", e); }
                 });
            }
        }
    });

    // Mapeia e adiciona listener para o botão de voltar
    const backBtn = document.getElementById('backToPanelFromManagerBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => window.goToScreen('panelScreen'));
    }

    managerInitialized = true;
    console.log("[ManagerController] Inicializado.");
};
