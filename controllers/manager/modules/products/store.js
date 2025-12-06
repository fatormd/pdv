import { db, appId, getSectorsCollectionRef } from "/services/firebaseService.js";
import { collection, query, getDocs, orderBy, doc, getDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { fetchSalesHistory } from "/services/wooCommerceService.js?v=2";

// --- STATE & CACHE ---
export let ingredientsCache = [];
export let suppliersCache = [];
export let groupsCache = [];
export let productExtensionsCache = {};
export let sectorsCache = []; // NOVO
export let operationTypesCache = []; // NOVO

// --- HELPERS ---
export const getColRef = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
export const getSettingsRef = (docName) => doc(db, 'artifacts', appId, 'public', 'data', 'settings', docName);

export function getSubModalContainer() {
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

// --- FETCH FUNCTIONS ---

export async function fetchIngredients() {
    try {
        const q = query(getColRef('ingredients'), orderBy('name'));
        const snap = await getDocs(q);
        ingredientsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return ingredientsCache;
    } catch (e) { console.error(e); return []; }
}

export async function fetchSuppliers() {
    try {
        const q = query(getColRef('suppliers'), orderBy('name'));
        const snap = await getDocs(q);
        suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error(e); }
}

export async function fetchGroups() {
    try {
        const q = query(getColRef('ingredient_types'), orderBy('name'));
        const snap = await getDocs(q);
        groupsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error("Erro grupos:", e); groupsCache = []; }
}

export async function fetchProductExtensions() {
    try {
        const snap = await getDocs(getColRef('products'));
        productExtensionsCache = {};
        snap.forEach(doc => { productExtensionsCache[doc.id] = doc.data(); });
    } catch(e) { console.error("Erro cache ext:", e); }
}

// --- NOVOS FETCHES PARA ESTRUTURA ---
export async function fetchSectors() {
    try {
        const q = query(getSectorsCollectionRef(), orderBy('name'));
        const snap = await getDocs(q);
        sectorsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return sectorsCache;
    } catch (e) { console.error("Erro setores:", e); return []; }
}

export async function fetchOperationTypes() {
    try {
        const snap = await getDoc(getSettingsRef('operation_types'));
        if (snap.exists() && snap.data().types) {
            operationTypesCache = snap.data().types;
        } else {
            // Padrões
            operationTypesCache = [
                { id: 'production', name: 'Cozinha / Produção' },
                { id: 'bar', name: 'Bar / Bebidas' },
                { id: 'atendimento', name: 'Atendimento / Salão' }
            ];
        }
        return operationTypesCache;
    } catch(e) { console.error("Erro op types:", e); return []; }
}

export async function refreshAllCaches() {
    await Promise.all([
        fetchIngredients(), 
        fetchSuppliers(), 
        fetchGroups(), 
        fetchProductExtensions(),
        fetchSectors(),
        fetchOperationTypes()
    ]);
}

export async function calculateConsumptionFromHistory(days = 30) {
    try {
        const orders = await fetchSalesHistory(days);
        if (!orders || orders.length === 0) return {};

        const salesMap = {};
        orders.forEach(order => {
            order.line_items.forEach(item => {
                const pid = item.product_id.toString();
                salesMap[pid] = (salesMap[pid] || 0) + item.quantity;
            });
        });

        const consumptionMap = {};
        const productsSnap = await getDocs(getColRef('products'));
        const productCompositions = {};
        productsSnap.forEach(doc => {
            productCompositions[doc.id] = doc.data().composition || [];
        });

        Object.entries(salesMap).forEach(([pid, qtySold]) => {
            const composition = productCompositions[pid];
            if (composition) {
                composition.forEach(ing => {
                    consumptionMap[ing.id] = (consumptionMap[ing.id] || 0) + (ing.qty * qtySold);
                });
            }
        });

        return consumptionMap;
    } catch (e) {
        console.error("Erro ao calcular consumo:", e);
        return {};
    }
}