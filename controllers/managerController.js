// --- CONTROLLERS/MANAGERCONTROLLER.JS (Painel 4) ---
import { goToScreen } from "/app.js";
import { getProducts } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";
// REMOVIDO: Importação do paymentController

// Estado
let managerInitialized = false;
let productManagementModal; // Mapeado no init

// --- FUNÇÕES DE GESTÃO (Placeholders) ---
const renderProductManagement = () => { /* ... (lógica mantida) ... */ };

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
            renderProductManagement();
            break;
        // ... (outros cases mantidos) ...
        case 'openInventoryManagement': alert("Módulo de ESTOQUE (DEV)."); break;
        case 'openCashManagement': alert("Módulo de CAIXA (DEV)."); break;
        case 'openReservations': alert("Módulo de RESERVAS (DEV)."); break;
        case 'openCustomerCRM': alert("Módulo de CRM (DEV)."); break;
        case 'openWaiterReg': alert("Módulo de Cadastro de Usuários (DEV)."); break;
        case 'openRecipesManagement': alert("Módulo de FICHA TÉCNICA (DEV)."); break;
        case 'openWooSync': alert("Ação de SINCRONIZAÇÃO (DEV)."); break;
        default:
             alert(`Módulo Gerencial não reconhecido: ${action}.`);
    }
};

// REMOVIDO: export const openManagerAuthModal = (...) => { ... }; (Movido para app.js)

// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    if(managerInitialized) return;
    console.log("[ManagerController] Inicializando...");

    productManagementModal = document.getElementById('productManagementModal');
    const managerCards = document.querySelectorAll('#managerScreen .manager-card');

    managerCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr) {
            card.removeAttribute('onclick'); // Remove onclick inline

            const matchAuth = onclickAttr.match(/openManagerAuthModal\('([^']+)'/);
            const matchReports = onclickAttr.includes("document.getElementById('reportsModal')");

            if (matchAuth && matchAuth[1]) {
                const action = matchAuth[1];
                const payload = null;
                card.addEventListener('click', () => {
                    // Chama a função GLOBAL do app.js
                    window.openManagerAuthModal(action, payload);
                });
            } else if (matchReports) {
                 card.addEventListener('click', () => {
                     const modal = document.getElementById('reportsModal');
                     if(modal) modal.style.display = 'flex';
                     else alert("Modal de relatórios não encontrado.");
                 });
            } else {
                 console.warn("Não foi possível parsear onclick para card:", card.outerHTML);
                 card.addEventListener('click', () => { // Fallback
                    try { eval(onclickAttr); } catch(e) { console.error("Erro ao executar onclick antigo:", e); }
                 });
            }
        }
    });

    const backBtn = document.getElementById('backToPanelFromManagerBtn');
    if (backBtn) {
        backBtn.removeAttribute('onclick');
        backBtn.addEventListener('click', () => window.goToScreen('panelScreen'));
    }

    managerInitialized = true;
    console.log("[ManagerController] Inicializado.");
};
