// --- CONTROLLERS/MANAGER/MODULES/TEAMMANAGER.JS (COM AJUSTE DE FONTE) ---

import { db, appId, getTablesCollectionRef } from "/services/firebaseService.js"; 
import { 
    collection, query, where, getDocs, orderBy, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading, showToast } from "/utils.js";
import { openUserManagementModal } from "/controllers/userManagementController.js"; 

const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
let managerModal = null;
let currentTab = 'team';
let currentPrintFontSize = 12; // Tamanho padrão da fonte

// --- Helper para Modal Seguro ---
function getSubModalContainer() {
    let container = document.getElementById('subModalContainer');
    if (!container || container.parentElement.id === 'managerModal') {
        if(container) container.remove();
        container = document.createElement('div');
        container.id = 'subModalContainer';
        container.style.zIndex = '9999';
        container.style.position = 'relative';
        document.body.appendChild(container);
    }
    return container;
}

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[TeamModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
    
    window.switchHRTab = switchHRTab;
    window.generatePayslip = generatePayslip;
    window.openUserManagementModal = openUserManagementModal;
    window.openPayrollModal = openPayrollModal;
    window.changePayrollFontSize = changePayrollFontSize; // Nova função exposta
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
                <button class="hr-tab-btn px-4 py-2 rounded-lg font-bold text-sm transition bg-orange-700 text-white hover:bg-orange-600" onclick="window.renderExternalRecruitmentModal('extra')"><i class="fas fa-bullhorn mr-2"></i> Chamar Extra</button>
            </div>
            
            <div id="hrContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar relative">
                <div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-pink-500 text-3xl"></i></div>
            </div>
        </div>`;
    
    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); managerModal.classList.add('p-0', 'md:p-4');
    
    await switchHRTab('team');
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

        let html = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
        usersSnap.forEach(u => {
            const data = u.data();
            html += `
                <div class="bg-gray-800 p-5 rounded-xl border border-gray-700 relative group hover:border-pink-500 transition shadow-lg flex flex-col justify-between">
                    <div>
                        <div class="flex items-center space-x-4 mb-4">
                            <div class="w-14 h-14 rounded-full bg-pink-900/30 flex items-center justify-center text-pink-400 font-bold text-2xl border border-pink-500/30 shadow-inner">
                                ${data.name ? data.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div class="min-w-0">
                                <h4 class="font-bold text-white text-lg truncate">${data.name}</h4>
                                <p class="text-xs text-gray-400 uppercase tracking-wider font-semibold bg-gray-900/50 inline-block px-2 py-0.5 rounded mt-1">${data.role || 'Sem Cargo'}</p>
                            </div>
                        </div>
                        <div class="space-y-1 text-sm text-gray-400 mb-4 bg-gray-900/30 p-3 rounded">
                            <p class="truncate"><i class="fas fa-envelope mr-2 w-4"></i> ${data.email}</p>
                            <p><i class="fas fa-circle mr-2 w-4 ${data.isActive ? 'text-green-500' : 'text-red-500'}"></i> ${data.isActive ? 'Ativo' : 'Inativo'}</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2 mt-auto">
                         <button onclick="window.openPayrollModal('${u.id}', '${data.name}')" class="bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white py-2 px-3 rounded-lg font-bold transition text-xs flex items-center justify-center border border-purple-600/30">
                            <i class="fas fa-file-invoice-dollar mr-2"></i> Folha
                         </button>
                         <button onclick="alert('Editar usuário via Gerenciar Cadastros')" class="bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-3 rounded-lg font-bold transition text-xs flex items-center justify-center">
                            <i class="fas fa-edit mr-2"></i> Editar
                         </button>
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
    } 
}

// ==================================================================
//           4. MODAL DE FOLHA DE PAGAMENTO (LAYOUT TÉRMICO + FONTE)
// ==================================================================

// Função para ajustar fonte
function changePayrollFontSize(delta) {
    currentPrintFontSize += delta;
    if (currentPrintFontSize < 8) currentPrintFontSize = 8;
    if (currentPrintFontSize > 20) currentPrintFontSize = 20;

    const preview = document.getElementById('payslipPreview');
    if (preview) {
        preview.style.fontSize = `${currentPrintFontSize}px`;
    }
}

async function openPayrollModal(userId, userName) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    
    currentPrintFontSize = 12; // Reset ao abrir

    const modalHtml = `
        <div id="payrollModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[90] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 w-full max-w-6xl max-h-[95vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
                
                <div class="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                    <h3 class="text-xl font-bold text-white flex items-center">
                        <i class="fas fa-file-invoice-dollar mr-2 text-purple-400"></i> Folha: <span class="text-pink-400 ml-2">${userName}</span>
                    </h3>
                    <button onclick="document.getElementById('payrollModal').remove()" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>

                <div class="flex-grow overflow-y-auto custom-scrollbar min-h-0">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                        
                        <div class="bg-gray-800 p-5 rounded-xl border border-gray-700 h-fit lg:sticky lg:top-0">
                            <h4 class="text-white font-bold mb-4 border-b border-gray-600 pb-2 flex items-center"><i class="fas fa-sliders-h mr-2 text-gray-400"></i> Parâmetros</h4>
                            
                            <div class="space-y-4">
                                <input type="hidden" id="payUserId" value="${userId}">
                                <input type="hidden" id="payUserName" value="${userName}">

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
                        
                        <div class="lg:col-span-2 bg-gray-200 p-0 rounded-xl shadow-2xl flex flex-col min-h-[500px]">
                            <div class="bg-gray-300 p-2 border-b border-gray-400 flex justify-between items-center rounded-t-xl">
                                <span class="text-xs font-bold text-gray-600 ml-2 uppercase">Pré-visualização (Estilo Cupom)</span>
                                <div class="flex items-center space-x-2">
                                    <button onclick="window.changePayrollFontSize(-1)" class="w-8 h-8 bg-gray-500 text-white rounded hover:bg-gray-600 font-bold text-xs" title="Diminuir Fonte">A-</button>
                                    <button onclick="window.changePayrollFontSize(1)" class="w-8 h-8 bg-gray-500 text-white rounded hover:bg-gray-600 font-bold text-xs" title="Aumentar Fonte">A+</button>
                                    <div class="w-px h-6 bg-gray-400 mx-2"></div>
                                    <button onclick="window.printPayrollArea()" class="text-xs font-bold text-white hover:text-gray-200 uppercase px-4 py-2 bg-blue-600 hover:bg-blue-700 border-0 rounded shadow flex items-center">
                                        <i class="fas fa-print mr-2"></i> Imprimir
                                    </button>
                                </div>
                            </div>
                            
                            <div class="flex-grow p-4 md:p-8 flex justify-center bg-gray-500/10 overflow-y-auto">
                                <div id="payslipPreview" class="bg-white shadow-lg w-full max-w-[320px] p-2 self-start" style="font-family: 'Courier New', monospace; color: black; font-size: 12px;">
                                    <div class="text-center text-gray-400 py-20 italic font-sans">
                                        <i class="fas fa-receipt text-6xl mb-4 opacity-30"></i><br>
                                        Configure os parâmetros e clique em calcular.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    getSubModalContainer().innerHTML = modalHtml;
    
    // Função de Impressão Otimizada para Térmicas
    window.printPayrollArea = () => {
        const content = document.getElementById('payslipPreview').innerHTML;
        
        // CSS Específico para Impressoras Térmicas injetado na hora
        const styles = `
            <style>
                @page { margin: 0; size: auto; }
                body { margin: 0; padding: 0; background-color: #fff; }
                .ticket-container {
                    width: 100%;
                    max-width: 80mm; /* Largura padrão térmica 80mm (adaptável a 58mm) */
                    margin: 0 auto;
                    padding: 5px 0;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: ${currentPrintFontSize}px; /* Usa o tamanho definido pelo usuário */
                    color: #000;
                    background: #fff;
                }
                .ticket-header { text-align: center; margin-bottom: 10px; }
                .ticket-title { font-size: 1.2em; font-weight: bold; text-transform: uppercase; }
                .dashed-line { border-bottom: 1px dashed #000; margin: 8px 0; display: block; width: 100%; }
                .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                .row-col { display: flex; flex-direction: column; }
                .item-name { font-weight: bold; }
                .item-sub { font-size: 0.9em; margin-left: 10px; }
                .section-title { font-weight: bold; text-transform: uppercase; margin-top: 5px; margin-bottom: 2px; }
                .total-box { margin-top: 10px; border-top: 2px solid #000; padding-top: 5px; }
                .big-total { font-size: 1.3em; font-weight: bold; }
                .signature-box { margin-top: 30px; text-align: center; font-size: 0.9em; }
                .signature-line { border-top: 1px solid #000; width: 80%; margin: 0 auto 5px auto; }
                /* Ocultar elementos desnecessários na impressão */
                button, .no-print { display: none !important; }
            </style>
        `;

        // Cria um iframe invisível para imprimir sem perder o contexto do app
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`<html><head>${styles}</head><body><div class="ticket-container">${content}</div></body></html>`);
        doc.close();
        
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            document.body.removeChild(iframe);
        }, 500);
    };
}

async function generatePayslip() {
    const userId = document.getElementById('payUserId').value;
    const userName = document.getElementById('payUserName').value;
    
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

    // Busca Vendas para Comissão
    const startDate = Timestamp.fromDate(new Date(start + 'T00:00:00'));
    const endDate = Timestamp.fromDate(new Date(end + 'T23:59:59'));
    
    let totalSales = 0;
    try {
        const q = query(getTablesCollectionRef(), where('status', '==', 'closed'), where('closedAt', '>=', startDate), where('closedAt', '<=', endDate));
        const snap = await getDocs(q);
        snap.forEach(doc => { 
            const t = doc.data(); 
            if ((t.waiterId && t.waiterId === userId) || (t.closedBy && userName.includes(t.closedBy.split(' ')[0]))) {
                totalSales += (t.total || 0); 
            }
        });
    } catch(e) { console.error(e); }

    const commissionVal = totalSales * (commPct / 100);
    const hourlyRate = salaryBase / 220; 
    const nightShiftVal = (hourlyRate * 0.20) * nightHours; 
    const thirteenthVal = pay13th ? (salaryBase / 12) : 0;
    
    const grossSalary = salaryBase + commissionVal + nightShiftVal + thirteenthVal;
    
    const vtVal = deductVT ? Math.min(grossSalary * 0.06, salaryBase * 0.06) : 0; 
    const inssVal = calculateINSS(grossSalary);
    const irrfVal = calculateIRRF(grossSalary - inssVal, dependents);
    
    const totalDiscounts = vtVal + inssVal + irrfVal + advances;
    const netSalary = grossSalary - totalDiscounts;
    const fgtsVal = grossSalary * 0.08;
    
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // --- MONTAGEM DO HTML ESTILO CUPOM (VERTICAL) ---
    const preview = document.getElementById('payslipPreview');
    preview.innerHTML = `
        <div class="ticket-header">
            <div class="ticket-title">FATOR MD</div>
            <div style="font-size:0.9em;">CNPJ: 00.000.000/0001-00</div>
            <div style="font-size:0.9em;">RECIBO DE PAGAMENTO</div>
        </div>
        
        <div class="dashed-line"></div>
        
        <div class="row">
            <span>COLABORADOR:</span>
            <span style="font-weight:bold;">${userName.split(' ')[0]}</span>
        </div>
        <div class="row">
            <span>REF:</span>
            <span>${new Date(start).toLocaleDateString('pt-BR', {month:'short', year:'2-digit'}).toUpperCase()}</span>
        </div>
        <div class="row">
            <span>DATA:</span>
            <span>${new Date().toLocaleDateString('pt-BR')}</span>
        </div>

        <div class="dashed-line"></div>

        <div class="section-title">PROVENTOS (+)</div>
        
        <div class="row">
            <span class="item-name">Salário Base</span>
            <span>${fmt(salaryBase)}</span>
        </div>
        
        ${commissionVal > 0 ? `
        <div class="row">
            <span class="item-name">Comissões</span>
            <span>${fmt(commissionVal)}</span>
        </div>
        <div class="row"><span class="item-sub text-xs text-gray-500">(Vendas: ${fmt(totalSales)} | ${commPct}%)</span></div>
        ` : ''}

        ${nightShiftVal > 0 ? `
        <div class="row">
            <span class="item-name">Adc. Noturno</span>
            <span>${fmt(nightShiftVal)}</span>
        </div>
        <div class="row"><span class="item-sub">(${nightHours}h)</span></div>
        ` : ''}

        ${thirteenthVal > 0 ? `
        <div class="row">
            <span class="item-name">13º (Adiant.)</span>
            <span>${fmt(thirteenthVal)}</span>
        </div>
        ` : ''}

        <div class="dashed-line"></div>
        
        <div class="section-title">DESCONTOS (-)</div>

        <div class="row">
            <span class="item-name">INSS</span>
            <span>${fmt(inssVal)}</span>
        </div>

        ${irrfVal > 0 ? `
        <div class="row">
            <span class="item-name">IRRF</span>
            <span>${fmt(irrfVal)}</span>
        </div>` : ''}

        ${vtVal > 0 ? `
        <div class="row">
            <span class="item-name">Vale Transp.</span>
            <span>${fmt(vtVal)}</span>
        </div>` : ''}

        ${advances > 0 ? `
        <div class="row">
            <span class="item-name">Adiantamentos</span>
            <span>${fmt(advances)}</span>
        </div>` : ''}

        <div class="dashed-line"></div>

        <div class="total-box">
            <div class="row">
                <span>Bruto:</span>
                <span>${fmt(grossSalary)}</span>
            </div>
            <div class="row">
                <span>Descontos:</span>
                <span>- ${fmt(totalDiscounts)}</span>
            </div>
            <div class="row" style="margin-top:5px;">
                <span class="big-total">LÍQUIDO:</span>
                <span class="big-total">${fmt(netSalary)}</span>
            </div>
        </div>

        <div class="row" style="margin-top:5px; font-size:0.9em;">
            <span>FGTS do Mês:</span>
            <span>${fmt(fgtsVal)}</span>
        </div>

        <div class="signature-box">
            <div class="signature-line"></div>
            ASSINATURA DO COLABORADOR
        </div>
        
        <div style="text-align:center; margin-top:20px;">.</div>
    `;
}