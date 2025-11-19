// =======================================================
// IMPORTS GLOBAIS
// =======================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

initializeApp();

// =======================================================
// CONFIGURAÇÃO SSL & REDE
// =======================================================
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, 
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  minVersion: "TLSv1",
  ciphers: "DEFAULT@SECLEVEL=0",
  family: 4, 
  keepAlive: true
});

const wooClient = axios.create({
  httpsAgent: httpsAgent,
  timeout: 290000, 
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "FatorPDV/1.0 (FirebaseFunctions)",
    "Connection": "keep-alive"
  }
});

const WOOCOMMERCE_URL = "https://nossotempero.fatormd.com";

// =======================================================
// 1. PROXY WOOCOMMERCE (ATUALIZADO COM PUT/DELETE)
// =======================================================
exports.proxyWooCommerce = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const { method, endpoint, payload } = request.data;
  
  const consumerKey = process.env.WOO_APP_KEY;
  const consumerSecret = process.env.WOO_APP_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new HttpsError("internal", "Chaves de API não configuradas no servidor.");
  }

  const authParams = `consumer_key=${consumerKey}&consumer_secret=${consumerSecret}&_t=${Date.now()}`;
  // Verifica se o endpoint já tem query params
  const querySeparator = endpoint.includes("?") ? "&" : "?";
  const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}${querySeparator}${authParams}`;

  try {
    console.log(`[Proxy] ${method} ${endpoint}`);
    
    let response;
    if (method.toUpperCase() === "GET") {
      response = await wooClient.get(url);
    } else if (method.toUpperCase() === "POST") {
      response = await wooClient.post(url, payload);
    } else if (method.toUpperCase() === "PUT") { // Adicionado
      response = await wooClient.put(url, payload);
    } else if (method.toUpperCase() === "DELETE") { // Adicionado
      // O Axios trata query params no delete de forma diferente, mas como passamos na URL, funciona.
      response = await wooClient.delete(url);
    }
    
    return response.data;

  } catch (error) {
    console.error("Erro Proxy Woo:", error.message);
    if (error.code === 'ECONNABORTED') {
       throw new HttpsError("deadline-exceeded", "O servidor WooCommerce demorou muito para responder.");
    }
    if (error.response) {
        console.error("Resposta do Woo:", error.response.status, error.response.data);
    }
    throw new HttpsError("internal", `Erro WooCommerce: ${error.message}`);
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

  try {
    const authParams = `consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
    const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/products?per_page=100&status=publish&${authParams}`;

    console.log("Iniciando busca no Woo (Sync)...");
    const response = await wooClient.get(url);
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
// Mantendo as funções de usuário essenciais
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