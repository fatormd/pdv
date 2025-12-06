// =======================================================
// IMPORTS GLOBAIS
// =======================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

initializeApp();

// =======================================================
// CONFIGURAÇÃO SSL & REDE (LAZY LOADING)
// =======================================================
// Variável global para cachear o cliente após o primeiro uso
let cachedWooClient = null;

const WOOCOMMERCE_URL = "https://nossotempero.fatormd.com";

/**
 * Função auxiliar para obter o cliente Axios apenas quando necessário.
 * Isso evita que o 'deploy' trave tentando configurar rede na inicialização.
 */
function getWooClient() {
  if (cachedWooClient) return cachedWooClient;

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false, 
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    minVersion: "TLSv1",
    ciphers: "DEFAULT@SECLEVEL=0",
    family: 4, 
    keepAlive: true
  });

  cachedWooClient = axios.create({
    httpsAgent: httpsAgent,
    timeout: 290000, 
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "FatorPDV/1.0 (FirebaseFunctions)",
      "Connection": "keep-alive"
    }
  });

  return cachedWooClient;
}

// =======================================================
// 1. PROXY WOOCOMMERCE (COM DIAGNÓSTICO DETALHADO)
// =======================================================
exports.proxyWooCommerce = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const { method, endpoint, payload } = request.data;
  
  const consumerKey = process.env.WOO_APP_KEY;
  const consumerSecret = process.env.WOO_APP_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new HttpsError("internal", "Chaves de API não configuradas no servidor.");
  }

  const authParams = `consumer_key=${consumerKey}&consumer_secret=${consumerSecret}&_t=${Date.now()}`;
  const querySeparator = endpoint.includes("?") ? "&" : "?";
  const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}${querySeparator}${authParams}`;

  // Obtém o cliente aqui dentro, não no topo
  const client = getWooClient();

  try {
    console.log(`[Proxy] ${method} ${endpoint}`);
    
    let response;
    if (method.toUpperCase() === "GET") {
      response = await client.get(url);
    } else if (method.toUpperCase() === "POST") {
      response = await client.post(url, payload);
    } else if (method.toUpperCase() === "PUT") { 
      response = await client.put(url, payload);
    } else if (method.toUpperCase() === "DELETE") { 
      response = await client.delete(url);
    }
    
    return response.data;

  } catch (error) {
    console.error("Erro Proxy Woo:", error.message);
    
    if (error.response && error.response.data) {
        console.error("Detalhes do erro Woo:", JSON.stringify(error.response.data));
        const wooError = error.response.data;
        const msg = wooError.message || wooError.code || "Erro desconhecido no Woo";
        throw new HttpsError("invalid-argument", `WooCommerce Recusou: ${msg}`);
    }

    if (error.code === 'ECONNABORTED') {
       throw new HttpsError("deadline-exceeded", "O servidor WooCommerce demorou muito para responder.");
    }
    
    throw new HttpsError("internal", `Erro de Conexão: ${error.message}`);
  }
});

// =======================================================
// 2. SINCRONIZAÇÃO DE PRODUTOS
// =======================================================
exports.syncProductsFromWoo = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sem autenticação.");

  const consumerKey = process.env.WOO_APP_KEY;
  const consumerSecret = process.env.WOO_APP_SECRET;
  const firestore = getFirestore();
  const APP_ID = "1:1097659747429:web:8ec0a7c3978c311dbe0a8c"; 

  // Obtém o cliente aqui dentro
  const client = getWooClient();

  try {
    const authParams = `consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
    const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/products?per_page=100&status=publish&${authParams}`;

    console.log("Iniciando busca no Woo (Sync)...");
    const response = await client.get(url);
    const products = response.data;

    const batch = firestore.batch();
    const productsRef = firestore.collection(`artifacts/${APP_ID}/public/data/products_cache`);

    products.forEach(p => {
      const docRef = productsRef.doc(p.id.toString());
      batch.set(docRef, {
        id: p.id,
        name: p.name,
        price: p.price,
        categories: p.categories,
        description: p.description || '',
        image: (p.images && p.images.length > 0) ? p.images[0].src : '',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();
    return { success: true, count: products.length, message: "Sincronizado." };

  } catch (error) {
    throw new HttpsError("internal", `Falha na sincronização: ${error.message}`);
  }
});

// =======================================================
// 3. GERENCIAMENTO DE USUÁRIOS
// =======================================================
exports.createNewUser = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login necessário.");
  const { email, password, name, role, isActive } = request.data;
  const APP_ID = "1:1097659747429:web:8ec0a7c3978c311dbe0a8c";
  try {
    const userRecord = await getAuth().createUser({ email, password, displayName: name, disabled: !isActive });
    await getFirestore().collection("artifacts").doc(APP_ID).collection("public").doc("data").collection("users").doc(email)
      .set({ name, email, role, isActive, createdAt: FieldValue.serverTimestamp() });
    return { status: "success", uid: userRecord.uid };
  } catch (error) { throw new HttpsError("internal", error.message); }
});

exports.updateUser = onCall(async (request) => {
  const { originalEmail, name, role, isActive } = request.data;
  const APP_ID = "1:1097659747429:web:8ec0a7c3978c311dbe0a8c";
  try {
    const userRecord = await getAuth().getUserByEmail(originalEmail);
    await getAuth().updateUser(userRecord.uid, { displayName: name, disabled: !isActive });
    await getFirestore().collection("artifacts").doc(APP_ID).collection("public").doc("data").collection("users").doc(originalEmail)
      .update({ name, role, isActive, updatedAt: FieldValue.serverTimestamp() });
    return { status: "success" };
  } catch (error) { throw new HttpsError("internal", error.message); }
});

exports.deleteUser = onCall(async (request) => {
  const { email } = request.data;
  const APP_ID = "1:1097659747429:web:8ec0a7c3978c311dbe0a8c";
  try {
    const userRecord = await getAuth().getUserByEmail(email);
    await getAuth().deleteUser(userRecord.uid);
    await getFirestore().collection("artifacts").doc(APP_ID).collection("public").doc("data").collection("users").doc(email).delete();
    return { status: "success" };
  } catch (error) { throw new HttpsError("internal", error.message); }
});

// =======================================================
// 4. PROCESSADOR DE FILA DE PEDIDOS (NOVO - ASSÍNCRONO)
// =======================================================
exports.processOrderQueue = onDocumentCreated(
  { 
    document: "artifacts/{appId}/public/data/orders_queue/{orderId}",
    timeoutSeconds: 300, 
    memory: "256MiB"
  }, 
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log("Nenhum dado associado ao evento.");
        return;
    }

    const orderData = snapshot.data();
    const orderId = event.params.orderId;

    if (orderData.status === 'completed' || orderData.status === 'processing') {
        return;
    }

    await snapshot.ref.update({ 
        status: 'processing', 
        attempts: FieldValue.increment(1),
        lastAttempt: FieldValue.serverTimestamp()
    });

    // Obtém o cliente aqui dentro
    const client = getWooClient();

    try {
        const consumerKey = process.env.WOO_APP_KEY;
        const consumerSecret = process.env.WOO_APP_SECRET;
        
        const authParams = `consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
        const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders?${authParams}`;

        console.log(`[Queue] Processando pedido ${orderId} para o Woo...`);

        const response = await client.post(url, orderData.payload);

        console.log(`[Queue] Sucesso! ID Woo: ${response.data.id}`);
        
        await snapshot.ref.update({
            status: 'completed',
            wooId: response.data.id, 
            wooOrderKey: response.data.order_key,
            processedAt: FieldValue.serverTimestamp(),
            error: null
        });

    } catch (error) {
        console.error(`[Queue] Falha no pedido ${orderId}:`, error.message);
        
        let errorMessage = error.message;
        if (error.response) {
            console.error("Detalhes Woo:", error.response.data);
            errorMessage = JSON.stringify(error.response.data);
        }

        await snapshot.ref.update({
            status: 'error',
            error: errorMessage,
            retryEligible: true 
        });
    }
});