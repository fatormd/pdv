// --- CONTROLLERS/MANAGERCONTROLLER.JS (Painel 4) ---
import { goToScreen } from "/app.js"; // Para navegação
import { getProducts } from "/services/wooCommerceService.js"; // Para modal de produtos
import { formatCurrency } from "/utils.js";
import { activateItemSelection, handleMassDeleteConfirmed } from "./paymentController.js"; // Para ações em massa

// Credenciais (apenas para senha local)
const MANAGER_PASSWORD = '1234'; // Senha local mock
let managerInitialized = false;

// --- FUNÇÕES DE GESTÃO (Placeholders) ---
const renderProductManagement = () => { /* ... (lógica mantida) ... */ };
const handleGerencialAction = (action, payload) => { /* ... (lógica mantida) ... */ };

// Modal de Autenticação (Exportada para app.js e outros)
export const openManagerAuthModal = (action, payload = null) => { // payload pode ser string ou objeto agora
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3 text-dark-text">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');

    // Foca no input
    if(input) input.focus();

    if(authBtn && input) {
        authBtn.onclick = () => {
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none';
                handleGerencialAction(action, payload); // Executa a ação
            } else {
                alert("Senha incorreta.");
                input.value = '';
                input.focus();
            }
        };
        // Permite Enter para autenticar
        input.onkeydown = (e) => { if (e.key === 'Enter') authBtn.click(); };
    }
};
// Expor globalmente se ainda for necessário em algum HTML onclick
// window.openManagerAuthModal = openManagerAuthModal;


// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    if(managerInitialized) return;
    console.log("[ManagerController] Inicializando...");

    // Mapeia os cards gerenciais
    const managerCards = document.querySelectorAll('#managerScreen .manager-card');

    managerCards.forEach(card => {
        // Pega a ação do onclick original (ex: "window.openManagerAuthModal('openProductManagement')")
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr) {
            // Extrai a ação e o payload (se houver) de forma simples
            const match = onclickAttr.match(/openManagerAuthModal\('([^']+)'(?:,\s*'([^']*)')?\)/);
            if (match && match[1]) {
                const action = match[1];
                const payload = match[2] || null; // Pega o segundo argumento se existir

                // Remove o onclick inline
                card.removeAttribute('onclick');

                // Adiciona listener que chama a função correta
                card.addEventListener('click', () => {
                    // Algumas ações podem não precisar de senha (como abrir relatórios)
                    if (action === 'openReports') { // Exemplo: Ação que não pede senha
                         document.getElementById('reportsModal').style.display = 'flex';
                    } else {
                         openManagerAuthModal(action, payload); // Chama o modal para as outras
                    }
                });
            } else {
                console.warn("Não foi possível parsear onclick para card:", card);
                // Mantém o onclick original como fallback se o parse falhar
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
