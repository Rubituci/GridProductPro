/**
 * SMART PRODUCT GRID PRO - WIX APP BACKEND
 * Backend multi-tenant para marketplace Wix
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const compression = require('compression');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;
const WIX_APP_ID = process.env.WIX_APP_ID;
const WIX_APP_SECRET = process.env.WIX_APP_SECRET;
const OAUTH_SCOPES = process.env.OAUTH_SCOPES || 'stores:read';

// ----------------------------
// Middleware
// ----------------------------
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // incluir cabeçalhos comuns usados por Wix/axios
  allowedHeaders: [
    'Content-Type', 'Authorization',
    'X-Wix-Instance-Id', 'X-Wix-App-Instance-Id',
    'x-wix-instance-id', 'x-wix-app-instance-id',
    'x-wix-site-id', 'X-Wix-Site-Id'
  ]
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ----------------------------
// State em memória
// ----------------------------
/** Estrutura:
 * sitesData = {
 *   [siteId]: {
 *     settings: {...},
 *     categories: [],
 *     products: [],
 *     analytics: {...},
 *     auth: { accessToken, refreshToken, expiresAt } // <-- novo
 *   }
 * }
 */
const sitesData = new Map();
const analyticsData = new Map();

// helpers de auth --------------------------------
function setSiteAuth(siteId, { access_token, refresh_token, expires_in }) {
  if (!sitesData.has(siteId)) {
    sitesData.set(siteId, { settings: {}, products: [], categories: [], analytics: {} });
  }
  const siteData = sitesData.get(siteId);
  siteData.auth = {
    accessToken: access_token,
    refreshToken: refresh_token,
    // guarda um pouco antes para evitar expirar no meio da chamada
    expiresAt: Date.now() + (Math.max(60, expires_in || 3600) - 30) * 1000
  };
  sitesData.set(siteId, siteData);
}

function getSiteAuth(siteId) {
  return sitesData.get(siteId)?.auth || null;
}

async function refreshAccessToken(siteId) {
  const auth = getSiteAuth(siteId);
  if (!auth?.refreshToken) return null;

  const url = 'https://www.wix.com/oauth/access';
  const payload = {
    grant_type: 'refresh_token',
    client_id: WIX_APP_ID,
    client_secret: WIX_APP_SECRET,
    refresh_token: auth.refreshToken
  };

  const { data } = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
  setSiteAuth(siteId, data);
  return data.access_token;
}

async function ensureAccessToken(siteId) {
  const auth = getSiteAuth(siteId);
  if (!auth?.accessToken) return null;
  if (Date.now() < auth.expiresAt) return auth.accessToken;
  // expirado: tenta refresh
  try {
    return await refreshAccessToken(siteId);
  } catch (e) {
    console.error('Falha ao fazer refresh token', e?.response?.data || e.message);
    return null;
  }
}

// ----------------------------
// Rota principal (info)
// ----------------------------
app.get('/', (req, res) => {
  res.json({
    name: "Smart Product Grid Pro",
    version: "1.0.0",
    description: "Wix App para grid inteligente de produtos com IA",
    status: "active",
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      health_alias: '/health',
      api: '/api/*',
      widget: '/widget',
      analytics: '/api/analytics/*',
      oauth_start: '/oauth/start',
      oauth_callback: '/oauth/callback',
      auth_status: '/api/auth/status'
    },
    features: {
      multiTenant: true,
      aiPowered: true,
      analytics: true,
      plans: ['free', 'pro', 'enterprise']
    },
    timestamp: new Date().toISOString()
  });
});

// ----------------------------
// Middleware para site/instância
// ----------------------------
app.use('/api/*', (req, res, next) => {
  const instanceId = req.headers['x-wix-instance-id'] || req.query.instanceId;
  const siteId = req.headers['x-wix-site-id'] || req.query.siteId; // nas chamadas do seu widget, mande ?siteId=...
  req.wixInstance = {
    instanceId,
    siteId,
    appInstanceId: req.headers['x-wix-app-instance-id']
  };

  if (siteId && !sitesData.has(siteId)) {
    sitesData.set(siteId, {
      settings: {
        aiProvider: 'local',
        enableAnalytics: true,
        maxProducts: 100,
        plan: 'free'
      },
      products: [],
      categories: [],
      analytics: { views: 0, clicks: 0, conversions: 0 }
    });
  }
  next();
});

// ----------------------------
// HEALTH
// ----------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});
app.get('/health', (req, res) => res.redirect('/api/health'));

// ----------------------------
// OAUTH (start + callback) 
// ----------------------------
app.get('/oauth/start', (req, res) => {
  // Se você souber o siteId aqui (ex.: via ?siteId=...), envie no state.
  const state = encodeURIComponent(JSON.stringify({
    siteId: req.query.siteId || null,
    returnTo: req.query.returnTo || null
  }));
  const redirectUri = encodeURIComponent(`${BASE_URL}/oauth/callback`);
  const scopes = encodeURIComponent(OAUTH_SCOPES);

  const url =
    `https://www.wix.com/installer/install?client_id=${WIX_APP_ID}`
    + `&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}`;

  res.redirect(url);
});

app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  let stateSiteId = null;

  try {
    if (req.query.state) {
      const parsed = JSON.parse(decodeURIComponent(req.query.state));
      stateSiteId = parsed?.siteId || null;
    }
  } catch (_) { /* ignore state parse */ }

  try {
    const url = 'https://www.wix.com/oauth/access';
    const payload = {
      grant_type: 'authorization_code',
      client_id: WIX_APP_ID,
      client_secret: WIX_APP_SECRET,
      code,
      redirect_uri: `${BASE_URL}/oauth/callback`
    };

    const { data } = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });

    // Nem sempre o siteId vem direto; se você conseguir obtê-lo, salve aqui.
    // Por hora, atrelamos ao siteId do state (se houver). Caso não tenha, guarde sob uma chave 'global'.
    const siteId = stateSiteId || 'global';
    setSiteAuth(siteId, data);

    res.send(`
      <html><body style="font-family: Arial; padding: 24px">
        <h2>✅ App conectado com sucesso!</h2>
        <p>Tokens salvos para o site: <b>${siteId}</b></p>
        <p>Você já pode voltar ao editor.</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Erro no OAuth callback:', err?.response?.data || err.message);
    res.status(500).send('Erro na autenticação. Veja logs do servidor.');
  }
});

// status simples para o painel
app.get('/api/auth/status', (req, res) => {
  const siteId = req.query.siteId || req.headers['x-wix-site-id'] || 'global';
  const auth = getSiteAuth(siteId);
  res.json({
    siteId,
    connected: !!auth?.accessToken,
    expiresAt: auth?.expiresAt || null
  });
});

// ----------------------------
// SETTINGS
// ----------------------------
app.get('/api/settings', (req, res) => {
  const { siteId } = req.wixInstance;
  const siteData = sitesData.get(siteId) || {};
  res.json({
    settings: siteData.settings || {},
    limits: getPlanLimits(siteData.settings?.plan || 'free'),
    usage: {
      products: siteData.products?.length || 0,
      views: siteData.analytics?.views || 0
    }
  });
});

app.post('/api/settings', (req, res) => {
  const { siteId } = req.wixInstance;
  const newSettings = req.body;

  if (!sitesData.has(siteId)) {
    sitesData.set(siteId, { settings: {}, products: [], categories: [], analytics: {} });
  }

  const siteData = sitesData.get(siteId);
  siteData.settings = { ...siteData.settings, ...newSettings };
  sitesData.set(siteId, siteData);
  res.json({ success: true, settings: siteData.settings });
});

// ----------------------------
// CATEGORIAS (com token se houver)
// ----------------------------
app.get('/api/categories', async (req, res) => {
  try {
    const { siteId } = req.wixInstance;
    const siteData = sitesData.get(siteId) || {};

    let categories = [];
    const token = siteId ? await ensureAccessToken(siteId) : null;

    if (token) {
      try {
        const wixResponse = await axios.get(
          'https://www.wixapis.com/stores/v1/collections',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'wix-site-id': siteId
            }
          }
        );
        categories = wixResponse.data.collections || [];
      } catch (wixError) {
        console.log('Wix API indisponível ou sem permissão. Usando fallback.', wixError?.response?.data || wixError.message);
      }
    }

    if (categories.length === 0) {
      categories = [
        { id: 'bestSelling', name: 'Mais Vendidos', slug: 'best-selling' },
        { id: 'newest', name: 'Novidades', slug: 'newest' },
        { id: 'featured', name: 'Em Destaque', slug: 'featured' },
        { id: 'sale', name: 'Promoções', slug: 'sale' },
        { id: 'electronics', name: 'Eletrônicos', slug: 'electronics' },
        { id: 'clothing', name: 'Roupas', slug: 'clothing' },
        { id: 'home', name: 'Casa e Decoração', slug: 'home' },
        { id: 'sports', name: 'Esportes', slug: 'sports' }
      ];
    }

    if (siteData) {
      siteData.categories = categories;
      sitesData.set(siteId, siteData);
    }

    res.json(categories);
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ----------------------------
// PRODUTOS (com token se houver + limites do plano)
// ----------------------------
app.get('/api/products/:category?', async (req, res) => {
  try {
    const { siteId } = req.wixInstance;
    const siteData = sitesData.get(siteId) || {};
    const category = req.params.category || 'all';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;

    const planLimits = getPlanLimits(siteData.settings?.plan || 'free');
    const maxProducts = Math.min(limit, planLimits.maxProductsPerPage);

    let products = [];
    const token = siteId ? await ensureAccessToken(siteId) : null;

    if (token) {
      try {
        const wixResponse = await axios.get('https://www.wixapis.com/stores/v1/products', {
          headers: {
            Authorization: `Bearer ${token}`,
            'wix-site-id': siteId
          },
          params: {
            limit: maxProducts,
            offset: (page - 1) * maxProducts,
            ...(category !== 'all' && { collectionId: category })
          }
        });
        products = wixResponse.data.products || [];
      } catch (wixError) {
        console.log('Wix API indisponível ou sem permissão. Usando mock.', wixError?.response?.data || wixError.message);
      }
    }

    if (products.length === 0) {
      products = generateMockProducts(category, maxProducts, page);
    }

    if (siteData.analytics) {
      siteData.analytics.views = (siteData.analytics.views || 0) + 1;
      sitesData.set(siteId, siteData);
    }

    res.json({
      products,
      pagination: {
        page,
        limit: maxProducts,
        total: products.length,
        hasMore: products.length === maxProducts
      },
      planInfo: {
        plan: siteData.settings?.plan || 'free',
        limits: planLimits
      }
    });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ----------------------------
// IA (mantido igual)
// ----------------------------
app.post('/api/enhance-product', async (req, res) => {
  try {
    const { product } = req.body;
    const { siteId } = req.wixInstance;
    const siteData = sitesData.get(siteId) || {};
    const planLimits = getPlanLimits(siteData.settings?.plan || 'free');

    if (!planLimits.aiEnhancement) {
      return res.json({
        enhancement: "🔒 Upgrade para Pro para recomendações IA avançadas",
        isPremium: true
      });
    }

    const enhancement = await generateProductEnhancement(product, siteData.settings);
    res.json({
      enhancement,
      generatedAt: new Date().toISOString(),
      aiProvider: siteData.settings?.aiProvider || 'local'
    });
  } catch (error) {
    console.error('Erro ao gerar enhancement:', error);
    res.json({
      enhancement: "Produto em destaque com ótimo custo-benefício!",
      error: true
    });
  }
});

// ----------------------------
// Analytics (mantido)
// ----------------------------
app.post('/api/analytics', (req, res) => {
  try {
    const { event, data } = req.body;
    const { siteId, instanceId } = req.wixInstance;

    if (!analyticsData.has(siteId)) analyticsData.set(siteId, []);
    const siteAnalytics = analyticsData.get(siteId);
    siteAnalytics.push({
      event, data, instanceId, siteId,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent']
    });

    if (siteAnalytics.length > 1000) {
      siteAnalytics.splice(0, siteAnalytics.length - 1000);
    }
    analyticsData.set(siteId, siteAnalytics);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar analytics:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/analytics/dashboard', (req, res) => {
  try {
    const { siteId } = req.wixInstance;
    const siteAnalytics = analyticsData.get(siteId) || [];
    const summary = {
      totalEvents: siteAnalytics.length,
      uniqueInstances: [...new Set(siteAnalytics.map(a => a.instanceId))].length,
      topEvents: getTopEvents(siteAnalytics),
      recentActivity: siteAnalytics.slice(-50).reverse(),
      dateRange: {
        from: siteAnalytics[0]?.timestamp,
        to: siteAnalytics[siteAnalytics.length - 1]?.timestamp
      }
    };
    res.json(summary);
  } catch (error) {
    console.error('Erro ao gerar dashboard:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ----------------------------
// Webhooks (mantidos)
// ----------------------------
app.post('/webhooks/app-installed', (req, res) => {
  try {
    const { instanceId, siteId } = req.body;
    console.log(`🎉 App instalado em ${siteId}`);
    sitesData.set(siteId, {
      settings: { aiProvider: 'local', enableAnalytics: true, plan: 'free' },
      products: [], categories: [],
      analytics: { views: 0, clicks: 0, conversions: 0 },
      installedAt: new Date().toISOString(),
      instanceId
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no webhook de instalação:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/webhooks/app-uninstalled', (req, res) => {
  try {
    const { siteId } = req.body;
    console.log(`😢 App desinstalado de ${siteId}`);
    sitesData.delete(siteId);
    analyticsData.delete(siteId);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no webhook de desinstalação:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/webhooks/subscription-changed', (req, res) => {
  try {
    const { siteId, planId, status } = req.body;
    if (sitesData.has(siteId)) {
      const siteData = sitesData.get(siteId);
      siteData.settings.plan = planId;
      siteData.settings.subscriptionStatus = status;
      sitesData.set(siteId, siteData);
      console.log(`💳 Plano alterado para ${planId} no site ${siteId}`);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no webhook de assinatura:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// (demais webhooks de produto/coleções/inventário — mantidos os seus)

// ----------------------------
// FUNÇÕES AUXILIARES
// ----------------------------
function getPlanLimits(plan) {
  const limits = {
    free:  { maxProductsPerPage: 12,  maxTotalProducts: 100,  aiEnhancement: false, analytics: false, customization: false },
    pro:   { maxProductsPerPage: 50,  maxTotalProducts: 1000, aiEnhancement: true,  analytics: true,  customization: true },
    enterprise: {
      maxProductsPerPage: 100, maxTotalProducts: -1,
      aiEnhancement: true, analytics: true, customization: true,
      whiteLabel: true, apiAccess: true
    }
  };
  return limits[plan] || limits.free;
}

function generateMockProducts(category, limit, page) {
  const products = [];
  const categories = {
    'bestSelling': ['Smartphone Pro Max', 'Notebook Gamer', 'Headphone Bluetooth'],
    'newest': ['Smartwatch Ultra', 'Câmera 4K', 'Tablet Gaming'],
    'featured': ['Console Next-Gen', 'Monitor 4K', 'Teclado Mecânico'],
    'sale': ['Mouse Gamer', 'WebCam HD', 'Carregador Wireless'],
    'electronics': ['TV Smart 55"', 'SoundBar Premium', 'Roteador WiFi 6'],
    'clothing': ['Camiseta Tech', 'Jaqueta Sport', 'Tênis Confort'],
    'home': ['Cafeteira Automática', 'Aspirador Robot', 'Ar Condicionado'],
    'sports': ['Bicicleta Mountain', 'Esteira Elétrica', 'Kit Academia']
  };
  const baseProducts = categories[category] || categories['bestSelling'];

  for (let i = 0; i < limit; i++) {
    const productIndex = ((page - 1) * limit + i) % baseProducts.length;
    const baseProduct = baseProducts[productIndex];

    products.push({
      id: `${category}-${page}-${i}`,
      name: `${baseProduct} ${i + 1}`,
      price: Math.round((Math.random() * 500 + 50) * 100) / 100,
      image: `https://picsum.photos/300/300?random=${Date.now() + i}`,
      url: `#produto-${category}-${i}`,
      category,
      inStock: Math.random() > 0.1,
      rating: Math.round((Math.random() * 2 + 3) * 10) / 10,
      reviews: Math.floor(Math.random() * 500),
      description: `${baseProduct} com as melhores especificações do mercado.`
    });
  }
  return products;
}

async function generateProductEnhancement(product, settings = {}) {
  const aiProvider = settings.aiProvider || 'local';
  if (aiProvider === 'local') {
    const enhancements = [
      `Produto com ${product.rating || 4.5}⭐ de avaliação!`,
      `Mais de ${product.reviews || 100} clientes satisfeitos`,
      `Melhor custo-benefício da categoria ${product.category}`,
      `Entrega rápida e garantia estendida`,
      `Produto em alta demanda - últimas unidades!`,
      `Ideal para quem busca qualidade e economia`,
      `Tecnologia de ponta com preço acessível`,
      `Recomendado por especialistas da área`
    ];
    return enhancements[Math.floor(Math.random() * enhancements.length)];
  }
  return "Produto recomendado pela IA";
}

function getTopEvents(analytics) {
  const eventCounts = {};
  analytics.forEach(event => {
    eventCounts[event.event] = (eventCounts[event.event] || 0) + 1;
  });
  return Object.entries(eventCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([event, count]) => ({ event, count }));
}

// ----------------------------
// WIDGET & DASHBOARD (mantidos)
// ----------------------------
app.get('/widget', (req, res) => {
  res.sendFile(process.cwd() + '/smart-product-grid-wix.js');
});
app.get('/widget/mobile', (req, res) => {
  res.sendFile(process.cwd() + '/smart-product-grid-wix.js');
});

app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Smart Product Grid Pro</title></head>
  <body style="font-family:Arial;padding:24px">
    <h1>🎯 Smart Product Grid Pro</h1>
    <p>Status do app: <b>Ativo</b></p>
    <p>API URL: <code>${BASE_URL}</code></p>
    <p>OAuth Scopes: <code>${OAUTH_SCOPES}</code></p>
    <p><a href="/oauth/start" target="_blank">Conectar via OAuth</a></p>
  </body></html>`);
});

// ----------------------------
// START
// ----------------------------
app.listen(PORT, () => {
  console.log(`🚀 Smart Product Grid Pro API rodando na porta ${PORT}`);
  console.log(`🌐 Endpoint público: ${BASE_URL}`);
  console.log(`📱 Widget URL: ${BASE_URL}/widget`);
  console.log(`⚙️ Dashboard: ${BASE_URL}/dashboard`);
});

module.exports = app;
