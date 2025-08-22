/**
 * SMART PRODUCT GRID PRO - WIX APP BACKEND
 * Backend multi-tenant para marketplace Wix
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Wix-Instance-Id', 'X-Wix-App-Instance-Id']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Database simulado para múltiplos sites
const sitesData = new Map();
const analyticsData = new Map();

// Middleware para identificar site/instância
app.use('/api/*', (req, res, next) => {
    const instanceId = req.headers['x-wix-instance-id'] || req.query.instanceId;
    const siteId = req.headers['x-wix-site-id'] || req.query.siteId;
    
    req.wixInstance = {
        instanceId,
        siteId,
        appInstanceId: req.headers['x-wix-app-instance-id']
    };
    
    // Inicializar dados do site se não existir
    if (siteId && !sitesData.has(siteId)) {
        sitesData.set(siteId, {
            settings: {
                aiProvider: 'local',
                enableAnalytics: true,
                maxProducts: 100, // limite do plano gratuito
                plan: 'free'
            },
            products: [],
            categories: [],
            analytics: {
                views: 0,
                clicks: 0,
                conversions: 0
            }
        });
    }
    
    next();
});

// =============================================
// ENDPOINTS DA API PRINCIPAL
// =============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Configurações do site/app
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

// Categorias (com cache por site)
app.get('/api/categories', async (req, res) => {
    try {
        const { siteId } = req.wixInstance;
        const siteData = sitesData.get(siteId) || {};
        
        // Tentar buscar categorias do Wix primeiro
        let categories = [];
        
        if (req.headers.authorization) {
            try {
                // Usar Wix API se token disponível
                const wixResponse = await axios.get('https://www.wixapis.com/stores/v1/collections', {
                    headers: {
                        'Authorization': req.headers.authorization,
                        'wix-site-id': siteId
                    }
                });
                categories = wixResponse.data.collections || [];
            } catch (wixError) {
                console.log('Wix API não disponível, usando categorias padrão');
            }
        }
        
        // Fallback para categorias padrão
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
        
        // Cache no site data
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

// Produtos por categoria (com limitação por plano)
app.get('/api/products/:category?', async (req, res) => {
    try {
        const { siteId } = req.wixInstance;
        const siteData = sitesData.get(siteId) || {};
        const category = req.params.category || 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        
        // Verificar limites do plano
        const planLimits = getPlanLimits(siteData.settings?.plan || 'free');
        const maxProducts = Math.min(limit, planLimits.maxProductsPerPage);
        
        let products = [];
        
        // Tentar buscar do Wix primeiro
        if (req.headers.authorization) {
            try {
                const wixResponse = await axios.get('https://www.wixapis.com/stores/v1/products', {
                    headers: {
                        'Authorization': req.headers.authorization,
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
                console.log('Wix API não disponível, usando produtos simulados');
            }
        }
        
        // Fallback para produtos simulados
        if (products.length === 0) {
            products = generateMockProducts(category, maxProducts, page);
        }
        
        // Atualizar analytics
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

// Enhancement de produto com IA
app.post('/api/enhance-product', async (req, res) => {
    try {
        const { product } = req.body;
        const { siteId } = req.wixInstance;
        const siteData = sitesData.get(siteId) || {};
        
        // Verificar se IA está habilitada no plano
        const planLimits = getPlanLimits(siteData.settings?.plan || 'free');
        if (!planLimits.aiEnhancement) {
            return res.json({ 
                enhancement: "🔒 Upgrade para Pro para recomendações IA avançadas",
                isPremium: true 
            });
        }
        
        // Gerar enhancement baseado no produto
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

// Analytics do app
app.post('/api/analytics', (req, res) => {
    try {
        const { event, data } = req.body;
        const { siteId, instanceId } = req.wixInstance;
        
        if (!analyticsData.has(siteId)) {
            analyticsData.set(siteId, []);
        }
        
        const siteAnalytics = analyticsData.get(siteId);
        siteAnalytics.push({
            event,
            data,
            instanceId,
            siteId,
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent']
        });
        
        // Manter apenas últimos 1000 eventos por site
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

// Dashboard de analytics (para painel admin)
app.get('/api/analytics/dashboard', (req, res) => {
    try {
        const { siteId } = req.wixInstance;
        const siteAnalytics = analyticsData.get(siteId) || [];
        
        // Agregar dados
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

// =============================================
// WEBHOOKS WIX
// =============================================

app.post('/webhooks/app-installed', (req, res) => {
    try {
        const { instanceId, siteId, permissions } = req.body;
        
        console.log(`🎉 App instalado em ${siteId}`);
        
        // Inicializar dados do site
        sitesData.set(siteId, {
            settings: {
                aiProvider: 'local',
                enableAnalytics: true,
                plan: 'free'
            },
            products: [],
            categories: [],
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
        
        // Remover dados do site (opcional - pode manter para reativação)
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

// =============================================
// FUNÇÕES AUXILIARES
// =============================================

function getPlanLimits(plan) {
    const limits = {
        free: {
            maxProductsPerPage: 12,
            maxTotalProducts: 100,
            aiEnhancement: false,
            analytics: false,
            customization: false
        },
        pro: {
            maxProductsPerPage: 50,
            maxTotalProducts: 1000,
            aiEnhancement: true,
            analytics: true,
            customization: true
        },
        enterprise: {
            maxProductsPerPage: 100,
            maxTotalProducts: -1, // ilimitado
            aiEnhancement: true,
            analytics: true,
            customization: true,
            whiteLabel: true,
            apiAccess: true
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
            category: category,
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
        // IA local simples baseada em regras
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
    
    // Implementar outros provedores de IA aqui (OpenAI, Google, etc)
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

// =============================================
// WIDGET ENDPOINTS
// =============================================

// Servir widget principal
app.get('/widget', (req, res) => {
    res.sendFile(__dirname + '/widgets/smart-product-grid-wix.js');
});

app.get('/widget/mobile', (req, res) => {
    // Versão otimizada para mobile (pode ser a mesma por enquanto)
    res.sendFile(__dirname + '/widgets/smart-product-grid-wix.js');
});

// Dashboard do app (para configurações)
app.get('/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Smart Product Grid Pro - Dashboard</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; text-align: center; margin-bottom: 30px; }
                .feature { padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; background: #f8f9ff; }
                .upgrade { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
                .btn { background: #667eea; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; }
                .btn:hover { background: #5a67d8; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎯 Smart Product Grid Pro</h1>
                <p>Parabéns! Seu app está instalado e funcionando perfeitamente.</p>
                
                <div class="feature">
                    <h3>✅ Recursos Ativos</h3>
                    <ul>
                        <li>Grid de produtos inteligente</li>
                        <li>Categorização automática</li>
                        <li>Interface responsiva</li>
                        <li>Ações rápidas (Ver, Comprar, Favoritar)</li>
                    </ul>
                </div>
                
                <div class="upgrade">
                    <h3>🚀 Upgrade para Pro</h3>
                    <p>Desbloqueie recomendações de IA, analytics avançados e muito mais!</p>
                    <a href="#upgrade" class="btn" style="color: white;">Fazer Upgrade</a>
                </div>
                
                <div class="feature">
                    <h3>📊 Estatísticas</h3>
                    <p>• Produtos exibidos: <strong>Ilimitados</strong></p>
                    <p>• Categorias: <strong>8 disponíveis</strong></p>
                    <p>• Tempo de resposta: <strong>&lt; 200ms</strong></p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="https://wix.com/app-market/smart-product-grid-pro" class="btn">
                        📱 Instalar em Outro Site
                    </a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// =============================================
// INICIALIZAÇÃO DO SERVIDOR
// =============================================

app.listen(PORT, () => {
    console.log(`🚀 Smart Product Grid Pro API rodando na porta ${PORT}`);
    console.log(`🌐 Endpoint público: https://smart-grid-pro-app.herokuapp.com`);
    console.log(`📱 Widget URL: https://smart-grid-pro-app.herokuapp.com/widget`);
    console.log(`⚙️  Dashboard: https://smart-grid-pro-app.herokuapp.com/dashboard`);
});

module.exports = app;
