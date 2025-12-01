// --- CONTROLLERS/MANAGER/MODULES/TEAMMANAGER.JS ---

import { db, appId, getTablesCollectionRef } from "/services/firebaseService.js"; 
import { 
    collection, query, where, getDocs, orderBy, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js"; 

// Helpers Locais
const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
let managerModal = null;
let currentTab = 'team';

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[TeamModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    // Expõe funções globais para o HTML
    window.switchHRTab = switchHRTab;
    window.generatePayslip = generatePayslip;
    window.openUserManagementModal = openUserManagementModal; // Re-exporta para garantir acesso
};

export const open = async () => {
    await renderHRPanel();
};

// ==================================================================
//           2. CÁLCULOS TRABALHISTAS (CLT 2024/2025)
// ==================================================================

function calculateINSS(grossSalary) {
    let inss = 0;
    if (grossSalary <= 1412.00) inss = grossSalary * 0.075;
    else if (grossSalary <= 2666.68) inss = (1412.00 * 0.075) + ((grossSalary - 1412.00) * 0.09);
    else if (grossSalary <= 4000.03) inss = (1412.00 * 0.075) + ((2666.68 - 1412.00) * 0.09) + ((grossSalary - 2666.68) * 0.12);
    else if (grossSalary <= 7786.02) inss = (1412.00 * 0.075) + ((2666.68 - 1412.00) * 0.09) + ((4000.03 - 2666.68) * 0.12) + ((grossSalary - 4000.03) * 0.14);
    else inss = (1412.00 * 0.075) + ((2666.68 - 1412.00) * 0.09) + ((4000.03 - 2666.68) * 0.12) + ((7786.02 - 4000.03) * 0.14);
    return inss;
}

function calculateIRRF(baseSalary, dependents) {
    const deductionPerDependent = 189.59;
    const base = baseSalary - (dependents * deductionPerDependent);
    let irrf = 0;
    
    if (base <= 2259.20) irrf = 0;
    else if (base <= 2826.65) irrf = (base * 0.075) - 169.44;
    else if (base <= 3751.05) irrf = (base * 0.15) - 381.44;
    else if (base <= 4664.68) irrf = (base * 0.225) - 662.77;
    else irrf = (base * 0.275) - 896.00;
    
    return Math.max(0, irrf);
}

// ==================================================================
//           3. INTERFACE PRINCIPAL (UI)
// ==================================================================

async function renderHRPanel(activeTab = 'team') {
    if (!managerModal) return;
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-6xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div><h3 class="text-2xl font-bold text-pink-400"><i class="fas fa-users mr-2"></i>Recursos Humanos</h3><p class="text-sm text-gray-400">Gestão Completa de Equipe</p></div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>
            
            <div class="flex p-4 bg-dark-bg border-b border-gray-700 space-x-2 items-center overflow-x-auto flex-shrink-0">
                <button id="tab-team" class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition" onclick="window.switchHRTab('team')"><i class="fas fa-user-cog mr-2"></i> Equipe</button>
                <button id="tab-payroll" class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition" onclick="window.switchHRTab('payroll')"><i class="fas fa-file-invoice-dollar mr-2"></i> Folha & Encargos</button>
                <button class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition bg-orange-700 text-white hover:bg-orange-600" onclick="window.renderExternalRecruitmentModal('extra')"><i class="fas fa-bullhorn mr-2"></i> Chamar Extra</button>
            </div>
            
            <div id="hrContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar relative">
                <div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); managerModal.classList.add('p-0', 'md:p-4');
    
    await switchHRTab(activeTab);
}

async function switchHRTab(tab) {
    currentTab = tab;
    const content = document.getElementById('hrContent');
    if (!content) return;

    document.querySelectorAll('.hr-tab-btn').forEach(btn => {
        if (!btn.textContent.includes('Chamar Extra')) {
            if (btn.id === `tab-${tab}`) {
                btn.classList.add('bg-pink-600', 'text-white'); btn.classList.remove('bg-dark-input', 'text-gray-300');
            } else {
                btn.classList.remove('bg-pink-600', 'text-white'); btn.classList.add('bg-dark-input', 'text-gray-300');
            }
        }
    });

    content.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div>';

    if (tab === 'team') {
        const usersSnap = await getDocs(getColRef('users'));
        if (usersSnap.empty) {
            content.innerHTML = '<p class="text-center text-gray-500 py-10">Nenhum usuário encontrado.</p>';
            return;
        }

        let html = `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
        usersSnap.forEach(u => {
            const data = u.data();
            html += `
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 relative group hover:border-pink-500 transition">
                    <div class="flex items-center space-x-3">
                        <div class="w-12 h-12 rounded-full bg-pink-900/50 flex items-center justify-center text-pink-400 font-bold text-xl border border-pink-500/30">
                            ${data.name ? data.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                            <h4 class="font-bold text-white text-lg">${data.name}</h4>
                            <p class="text-xs text-gray-400 uppercase tracking-wider">${data.role}</p>
                        </div>
                    </div>
                    <div class="mt-4 pt-3 border-t border-gray-700 flex justify-between text-xs text-gray-400">
                        <span>${data.email}</span>
                        <span class="${data.isActive ? 'text-green-400' : 'text-red-400'} font-bold px-2 py-0.5 rounded bg-gray-900">${data.isActive ? 'ATIVO' : 'INATIVO'}</span>
                    </div>
                </div>`;
        });
        html += `</div>
        <div class="mt-8 text-center border-t border-gray-700 pt-6">
            <button onclick="window.openUserManagementModal()" class="bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-green-700 transition flex items-center justify-center mx-auto">
                <i class="fas fa-user-plus mr-2"></i> Gerenciar Cadastros & Senhas
            </button>
        </div>`;
        content.innerHTML = html;
        
    } else if (tab === 'payroll') {
        await renderPayrollGenerator(content);
    }
}

// ==================================================================
//           4. FOLHA DE PAGAMENTO (PAYROLL)
// ==================================================================

async function renderPayrollGenerator(container) {
    const usersSnap = await getDocs(getColRef('users'));
    const usersOptions = usersSnap.docs.map(d => `<option value="${d.id}" data-name="${d.data().name}">${d.data().name || d.id}</option>`).join('');
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            <div class="bg-gray-800 p-5 rounded-xl border border-gray-700 h-fit overflow-y-auto max-h-full custom-scrollbar shadow-lg">
                <h4 class="text-white font-bold mb-4 border-b border-gray-600 pb-2 flex items-center"><i class="fas fa-cog mr-2 text-gray-400"></i> Parâmetros</h4>
                
                <div class="space-y-4">
                    <div>
                        <label class="text-xs text-gray-400 font-bold uppercase block mb-1">Colaborador</label>
                        <select id="payUser" class="input-pdv w-full p-2 bg-dark-input border-gray-600 rounded">${usersOptions}</select>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2">
                        <div><label class="text-xs text-gray-400 block mb-1">Início</label><input type="date" id="payStart" class="input-pdv w-full p-2" value="${firstDay}"></div>
                        <div><label class="text-xs text-gray-400 block mb-1">Fim</label><input type="date" id="payEnd" class="input-pdv w-full p-2" value="${lastDay}"></div>
                    </div>
                    
                    <div class="bg-gray-900/50 p-3 rounded border border-gray-600">
                        <p class="text-xs text-green-400 font-bold mb-2 uppercase border-b border-gray-700 pb-1">Proventos</p>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <div><label class="text-[10px] text-gray-400">Salário Base</label><input type="number" id="payBase" class="input-pdv w-full p-1 text-sm" value="1412.00"></div>
                            <div><label class="text-[10px] text-gray-400">Comissão (%)</label><input type="number" id="payCommPct" class="input-pdv w-full p-1 text-sm" value="10"></div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-900/50 p-3 rounded border border-gray-600">
                        <p class="text-xs text-yellow-400 font-bold mb-2 uppercase border-b border-gray-700 pb-1">Extras</p>
                        <div class="mb-2">
                            <label class="text-[10px] text-gray-400">Horas Noturnas</label>
                            <input type="number" id="payNightHours" class="input-pdv w-full p-1 text-sm" placeholder="Qtd Horas">
                        </div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="text-xs text-gray-300 flex items-center"><input type="checkbox" id="pay13th" class="mr-2 h-4 w-4 rounded bg-dark-bg border-gray-500"> 13º (Parcela)</label>
                        </div>
                    </div>
                    
                    <div class="bg-gray-900/50 p-3 rounded border border-gray-600">
                        <p class="text-xs text-red-400 font-bold mb-2 uppercase border-b border-gray-700 pb-1">Descontos</p>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <div><label class="text-[10px] text-gray-400">Adiantamentos</label><input type="number" id="payAdvance" class="input-pdv w-full p-1 text-sm" value="0.00"></div>
                            <div><label class="text-[10px] text-gray-400">Dependentes</label><input type="number" id="payDependents" class="input-pdv w-full p-1 text-sm" value="0"></div>
                        </div>
                        <label class="flex items-center text-xs text-gray-300"><input type="checkbox" id="payVT" class="mr-2 h-4 w-4 rounded bg-dark-bg border-gray-500" checked> Descontar VT (6%)</label>
                    </div>
                    
                    <button onclick="window.generatePayslip()" class="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 rounded-lg mt-2 shadow-lg transition transform hover:scale-[1.02]">
                        <i class="fas fa-calculator mr-2"></i> Calcular Folha
                    </button>
                </div>
            </div>
            
            <div class="lg:col-span-2 bg-white text-black p-0 rounded-xl shadow-2xl overflow-hidden flex flex-col">
                <div class="bg-gray-200 p-2 border-b border-gray-300 text-right">
                    <button onclick="window.print()" class="text-xs font-bold text-gray-600 hover:text-black uppercase"><i class="fas fa-print mr-1"></i> Imprimir</button>
                </div>
                <div id="payslipPreview" class="p-8 overflow-y-auto custom-scrollbar flex-grow">
                    <div class="text-center text-gray-400 py-20 italic">
                        <i class="fas fa-file-invoice-dollar text-6xl mb-4 opacity-20"></i><br>
                        Selecione o colaborador e clique em calcular.
                    </div>
                </div>
            </div>
        </div>`;
}

async function generatePayslip() {
    const userSelect = document.getElementById('payUser');
    const userName = userSelect.options[userSelect.selectedIndex].text;
    const userId = userSelect.value;
    
    // Inputs
    const start = document.getElementById('payStart').value;
    const end = document.getElementById('payEnd').value;
    const salaryBase = parseFloat(document.getElementById('payBase').value) || 0;
    const commPct = parseFloat(document.getElementById('payCommPct').value) || 0;
    const nightHours = parseFloat(document.getElementById('payNightHours').value) || 0;
    const advances = parseFloat(document.getElementById('payAdvance').value) || 0;
    const dependents = parseInt(document.getElementById('payDependents').value) || 0;
    const pay13th = document.getElementById('pay13th').checked;
    const deductVT = document.getElementById('payVT').checked;

    // Busca Vendas do Período para Comissão
    const startDate = Timestamp.fromDate(new Date(start + 'T00:00:00'));
    const endDate = Timestamp.fromDate(new Date(end + 'T23:59:59'));
    
    let totalSales = 0;
    try {
        const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', startDate), where('closedAt', '<=', endDate));
        const snap = await getDocs(q);
        
        // Filtra localmente por garçom (nome ou ID)
        snap.forEach(doc => { 
            const t = doc.data(); 
            // Lógica simples de matching: ID exato ou primeiro nome
            if ((t.waiterId && t.waiterId === userId) || (t.closedBy && userName.includes(t.closedBy.split(' ')[0]))) {
                totalSales += (t.total || 0); 
            }
        });
    } catch(e) {
        console.error("Erro ao buscar vendas para comissão:", e);
    }

    // Cálculos
    const commissionVal = totalSales * (commPct / 100);
    const hourlyRate = salaryBase / 220; // Divisor padrão mensal
    const nightShiftVal = (hourlyRate * 0.20) * nightHours; // 20% adicional
    const thirteenthVal = pay13th ? (salaryBase / 12) : 0;
    
    const grossSalary = salaryBase + commissionVal + nightShiftVal + thirteenthVal;
    
    // Descontos
    const vtVal = deductVT ? Math.min(grossSalary * 0.06, salaryBase * 0.06) : 0; 
    const inssVal = calculateINSS(grossSalary);
    const irrfVal = calculateIRRF(grossSalary - inssVal, dependents);
    
    const totalDiscounts = vtVal + inssVal + irrfVal + advances;
    const netSalary = grossSalary - totalDiscounts;
    const fgtsVal = grossSalary * 0.08;
    
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Renderiza Holerite
    const preview = document.getElementById('payslipPreview');
    preview.innerHTML = `
        <div class="font-mono text-sm leading-snug">
            <div class="text-center border-b-2 border-black pb-4 mb-6">
                <h2 class="text-xl font-bold uppercase tracking-widest">Recibo de Pagamento</h2>
                <p class="text-xs mt-1">Fator MD - CNPJ: 00.000.000/0001-00</p>
            </div>
            
            <div class="flex justify-between mb-6 bg-gray-100 p-4 rounded border border-gray-300">
                <div>
                    <p><strong>Funcionário:</strong> ${userName}</p>
                    <p><strong>Cargo:</strong> Operacional</p>
                </div>
                <div class="text-right">
                    <p><strong>Referência:</strong> ${new Date(start).toLocaleDateString('pt-BR', {month:'long', year:'numeric'}).toUpperCase()}</p>
                    <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                </div>
            </div>
            
            <table class="w-full mb-6 border-collapse">
                <thead>
                    <tr class="border-b-2 border-black text-xs uppercase">
                        <th class="text-left py-2 pl-2">Descrição</th>
                        <th class="text-center py-2">Ref.</th>
                        <th class="text-right py-2">Vencimentos</th>
                        <th class="text-right py-2 pr-2">Descontos</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td class="pl-2 py-1">Salário Base</td><td class="text-center">30d</td><td class="text-right">${fmt(salaryBase)}</td><td class="text-right pr-2">-</td></tr>
                    ${commissionVal > 0 ? `<tr><td class="pl-2 py-1">Comissões (Vendas: ${fmt(totalSales)})</td><td class="text-center">${commPct}%</td><td class="text-right">${fmt(commissionVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                    ${nightShiftVal > 0 ? `<tr><td class="pl-2 py-1">Adicional Noturno</td><td class="text-center">${nightHours}h</td><td class="text-right">${fmt(nightShiftVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                    ${thirteenthVal > 0 ? `<tr><td class="pl-2 py-1">13º Salário (Adiant.)</td><td class="text-center">1/12</td><td class="text-right">${fmt(thirteenthVal)}</td><td class="text-right pr-2">-</td></tr>` : ''}
                    
                    <tr><td class="pl-2 py-1 text-gray-600">INSS</td><td class="text-center text-gray-500">Tab.</td><td class="text-right">-</td><td class="text-right pr-2">${fmt(inssVal)}</td></tr>
                    ${irrfVal > 0 ? `<tr><td class="pl-2 py-1 text-gray-600">IRRF</td><td class="text-center text-gray-500">Tab.</td><td class="text-right">-</td><td class="text-right pr-2">${fmt(irrfVal)}</td></tr>` : ''}
                    ${vtVal > 0 ? `<tr><td class="pl-2 py-1 text-gray-600">Vale Transporte</td><td class="text-center text-gray-500">6%</td><td class="text-right">-</td><td class="text-right pr-2">${fmt(vtVal)}</td></tr>` : ''}
                    ${advances > 0 ? `<tr><td class="pl-2 py-1 text-gray-600">Adiantamentos</td><td class="text-center text-gray-500">-</td><td class="text-right">-</td><td class="text-right pr-2">${fmt(advances)}</td></tr>` : ''}
                </tbody>
                <tfoot class="border-t-2 border-black font-bold bg-gray-100">
                    <tr>
                        <td class="pl-2 py-3">TOTAIS</td>
                        <td></td>
                        <td class="text-right py-3 text-green-700">${fmt(grossSalary)}</td>
                        <td class="text-right py-3 pr-2 text-red-700">${fmt(totalDiscounts)}</td>
                    </tr>
                </tfoot>
            </table>
            
            <div class="flex justify-between items-center mb-8 gap-6">
                <div class="bg-blue-50 p-3 rounded border border-blue-200 w-1/2 text-xs text-blue-800">
                    <p><strong>FGTS do Mês (8%):</strong> ${fmt(fgtsVal)}</p>
                    <p><strong>Base de Cálculo:</strong> ${fmt(grossSalary)}</p>
                </div>
                <div class="bg-gray-900 text-white p-4 rounded-lg w-1/2 flex justify-between items-center shadow-md">
                    <span class="text-sm uppercase tracking-wider">Líquido a Receber</span>
                    <span class="text-2xl font-bold text-green-400">${fmt(netSalary)}</span>
                </div>
            </div>
            
            <div class="mt-12 pt-4 border-t-2 border-dashed border-gray-400 text-center">
                <p class="mb-8 text-xs">Declaro ter recebido a importância líquida discriminada neste recibo.</p>
                <div class="w-64 mx-auto border-t border-black pt-1 font-bold text-sm">
                    Assinatura do Funcionário
                </div>
            </div>
        </div>`;
}