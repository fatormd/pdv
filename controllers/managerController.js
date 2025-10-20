// --- CONTROLLERS/MANAGERCONTROLLER.JS (Painel 4) ---
import { goToScreen } from "../app.js";

// Credenciais Staff Centralizadas (copiadas do app.js para uso local)
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' }, 
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};

// Senha do gerente para validação de ações críticas (hardcoded para o gerente Fmd)
const MANAGER_PASSWORD = STAFF_CREDENTIALS['agencia@fatormd.com'].password;

export const openManagerAuthModal = (action, payload) => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) return; 

    // 1. Injeta o HTML do modal de autenticação
    managerModal.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-600">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha (Ex: 1234)" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
            
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    
    // 2. Adiciona o listener para o botão de autenticar
    document.getElementById('authManagerBtn').onclick = () => {
        const input = document.getElementById('managerPasswordInput');
        
        if (input && input.value === MANAGER_PASSWORD) {
            managerModal.style.display = 'none';
            
            // Lógica de Ação
            if (action === 'goToManagerPanel') {
                alert("Acesso de Gerente liberado!");
                goToScreen('managerScreen'); 
            } else {
                // Implementar outras ações gerenciais aqui no futuro (deleteMass, transfer, etc.)
                alert(`Ação '${action}' autorizada com sucesso! Executando...`);
            }
            
        } else {
            alert("Senha incorreta.");
            if (input) input.value = '';
        }
    };
};

export const handleTransferenciaSeletiva = () => { console.log('ManagerController: Lógica de Transferência (Placeholder).'); };
export const handleExclusaoMassa = () => { console.log('ManagerController: Lógica de Exclusão (Placeholder).'); };
