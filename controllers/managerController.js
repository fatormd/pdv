// --- CONTROLLERS/MANAGERCONTROLLER.JS (Completo e Estável) ---
import { goToScreen } from "/app.js";
import { getProducts } from "/services/wooCommerceService.js";
import { openUserManagementModal } from "/controllers/userManagementController.js";

// Estado
let managerInitialized = false;
let productManagementModal; // Mapeado no init

// --- FUNÇÕES DE GESTÃO (Lógica) ---

const renderProductManagement = () => {
     if (!productManagementModal) {
         productManagementModal = document.getElementById('productManagementModal');
         if (!productManagementModal) {
             alert("Módulo de Gestão de Produtos em desenvolvimento.");
             return;
         }
    }
    const products = getProducts();
    let listHtml = products.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-gray-600">
            <div class="flex flex-col">
                <span class="font-semibold text-dark-text">${p.name}</span>
                <span class="text-xs text-dark-placeholder">ID: ${p.id} | Cat: ${p.category}</span>
            </div>
             <div class="space-x-2 print-hide">
                <button class="p-2 text-indigo-400 hover:text-indigo-300 transition" title="Editar Produto">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="p-2 text-red-500 hover:text-red-400 transition" title="Excluir Produto">
                    <i class="fas fa-trash-alt"></i>
                </button>
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
            <div class="border border-gray-600 p-3 rounded-lg max-h-96 overflow-y-auto bg-dark-bg custom-scrollbar">
                ${listHtml || '<p class="text-dark-placeholder italic">Nenhum produto carregado.</p>'}
            </div>
        </div>
    `;
    productManagementModal.style.display = 'flex';
};

/**
 * Função chamada pelo app.js (via openManagerAuthModal) após autenticação.
 * Direciona a ação para a função correta.
 */
export const handleGerencialAction = (action, payload) => {
    switch (action) {
        case 'openProductManagement':
        case 'openCategoryManagement':
            renderProductManagement();
            break;
        case 'openReportsModal':
            const modal = document.getElementById('reportsModal');
            if(modal) modal.style.display = 'flex';
            else { console.error("[Manager] Modal de relatórios não encontrado."); alert("Modal de relatórios não encontrado."); }
            break;
        case 'openInventoryManagement': alert("Módulo de ESTOQUE (DEV)."); break;
        case 'openCashManagement': alert("Módulo de GESTÃO DE CAIXA (DEV)."); break;
        case 'openReservations': alert("Módulo de RESERVAS/FILA (DEV)."); break;
        case 'openCustomerCRM': alert("Módulo de CRM (DEV)."); break;
        case 'openRecipesManagement': alert("Módulo de FICHA TÉCNICA (DEV)."); break;
        case 'openWooSync': alert("Ação de SINCRONIZAÇÃO (DEV)."); break;
        default: console.warn(`[Manager] Ação Gerencial não reconhecida: ${action}.`); alert(`Ação Gerencial não reconhecida: ${action}.`);
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    if (managerInitialized) return;
    console.log("[ManagerController] Inicializando...");

    productManagementModal = document.getElementById('productManagementModal');
    const managerScreen = document.getElementById('managerScreen');
    if (!managerScreen) {
        console.error("[ManagerController] Erro Fatal: Elemento #managerScreen não encontrado.");
        return;
    }
    const managerCards = managerScreen.querySelectorAll('.manager-card');

    managerCards.forEach((card, index) => {
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);

        const action = newCard.dataset.action;

        if (action) {
            newCard.addEventListener('click', () => {
                const payload = null;

                if (action === 'openReportsModal') {
                    handleGerencialAction(action, payload);
                } else if (action === 'openWaiterReg') {
                    // Chamada direta para o modal de usuários (que não precisa de senha, mas é uma ação gerencial)
                    openUserManagementModal();
                } else {
                    // Ações que exigem senha
                    window.openManagerAuthModal(action, payload);
                }
            });
        }
    });

    const backBtn = document.getElementById('backToPanelFromManagerBtn');
    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => window.goToScreen('panelScreen'));
    }

    managerInitialized = true;
    console.log("[ManagerController] Inicializado.");
};
