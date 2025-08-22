/**
 * SMART PRODUCT GRID PRO - WIX APP WIDGET
 * Versão otimizada para marketplace Wix
 * Compatível com Wix App Framework
 */

class SmartProductGridWixApp {
    constructor(elementId, options = {}) {
        this.elementId = elementId;
        this.siteId = options.siteId || $w.site.viewMode; 
        this.instanceId = options.instanceId || Math.random().toString(36);
        this.apiUrl = 'https://smart-grid-pro-app.herokuapp.com/api';
        
        // Configurações do usuário via Wix Settings Panel
        this.settings = {
            category: options.category || 'bestSelling',
            productsPerPage: options.productsPerPage || 12,
            enableAI: options.enableAI !== false,
            showCategorySelector: options.showCategorySelector !== false,
            theme: options.theme || 'modern',
            ...options
        };

        this.products = [];
        this.categories = [];
        this.currentPage = 1;
        this.loading = false;
        
        this.init();
    }

    async init() {
        await this.loadWixAPI();
        await this.setupContainer();
        await this.loadCategories();
        await this.loadProducts();
        this.setupEventListeners();
        
        // Reportar inicialização para Wix Analytics
        this.reportAnalytics('widget_initialized');
    }

    async loadWixAPI() {
        // Carrega APIs do Wix se disponíveis
        if (typeof $w !== 'undefined') {
            this.wixAPI = $w;
            this.siteId = $w.site.url;
        }
        
        // Integração com Wix Stores API
        if (typeof wixStores !== 'undefined') {
            this.storesAPI = wixStores;
        }
    }

    async setupContainer() {
        const container = document.getElementById(this.elementId);
        if (!container) return;

        container.innerHTML = `
            <div class="smart-grid-wix-app ${this.settings.theme}">
                <!-- Header com branding Wix App -->
                <div class="smart-grid-header">
                    <div class="app-branding">
                        <span class="app-logo">🎯</span>
                        <span class="app-name">Smart Product Grid Pro</span>
                        <span class="powered-by">Powered by AI</span>
                    </div>
                    
                    ${this.settings.showCategorySelector ? `
                    <div class="category-selector">
                        <select id="categorySelect-${this.instanceId}">
                            <option value="">Carregando categorias...</option>
                        </select>
                    </div>
                    ` : ''}
                </div>

                <!-- Grid de produtos -->
                <div class="products-grid" id="productsGrid-${this.instanceId}">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>Carregando produtos inteligentes...</p>
                    </div>
                </div>

                <!-- Paginação -->
                <div class="pagination" id="pagination-${this.instanceId}"></div>

                <!-- Rodapé do App -->
                <div class="app-footer">
                    <a href="https://wix.com/app-market/smart-product-grid-pro" target="_blank">
                        📱 Instalar em outro site
                    </a>
                    <span class="version">v1.0.0</span>
                </div>
            </div>
        `;

        this.setupStyles();
    }

    setupStyles() {
        if (document.getElementById('smart-grid-wix-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'smart-grid-wix-styles';
        styles.textContent = `
            .smart-grid-wix-app {
                font-family: 'Helvetica Neue', Arial, sans-serif;
                max-width: 100%;
                margin: 0 auto;
                background: #fff;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                overflow: hidden;
            }

            .smart-grid-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .app-branding {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .app-logo {
                font-size: 24px;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            }

            .app-name {
                font-size: 18px;
                font-weight: 600;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .powered-by {
                background: rgba(255,255,255,0.2);
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
            }

            .category-selector select {
                background: rgba(255,255,255,0.9);
                border: none;
                padding: 10px 15px;
                border-radius: 8px;
                font-size: 14px;
                color: #333;
                min-width: 180px;
            }

            .products-grid {
                padding: 20px;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                min-height: 400px;
            }

            .product-card {
                background: white;
                border-radius: 12px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.1);
                transition: all 0.3s ease;
                overflow: hidden;
                position: relative;
                cursor: pointer;
            }

            .product-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            }

            .product-image {
                width: 100%;
                height: 200px;
                background-size: cover;
                background-position: center;
                position: relative;
            }

            .ai-badge {
                position: absolute;
                top: 10px;
                right: 10px;
                background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
                color: white;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
            }

            .product-info {
                padding: 15px;
            }

            .product-title {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                margin-bottom: 8px;
                line-height: 1.3;
            }

            .product-price {
                font-size: 18px;
                font-weight: 700;
                color: #667eea;
                margin-bottom: 10px;
            }

            .product-enhancement {
                background: #f8f9ff;
                border-left: 3px solid #667eea;
                padding: 8px 12px;
                margin-top: 10px;
                border-radius: 0 8px 8px 0;
                font-size: 12px;
                color: #555;
                line-height: 1.4;
            }

            .quick-actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }

            .quick-action {
                flex: 1;
                background: #667eea;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .quick-action:hover {
                background: #5a67d8;
                transform: scale(1.05);
            }

            .loading-state {
                grid-column: 1 / -1;
                text-align: center;
                padding: 60px 20px;
                color: #666;
            }

            .loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .app-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                background: #f8f9fa;
                border-top: 1px solid #eee;
                font-size: 12px;
                color: #666;
            }

            .app-footer a {
                color: #667eea;
                text-decoration: none;
                font-weight: 500;
            }

            .app-footer a:hover {
                text-decoration: underline;
            }

            /* Tema clássico */
            .smart-grid-wix-app.classic .smart-grid-header {
                background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            }

            .smart-grid-wix-app.classic .quick-action {
                background: #2c3e50;
            }

            /* Tema minimalista */
            .smart-grid-wix-app.minimal {
                box-shadow: none;
                border: 1px solid #eee;
            }

            .smart-grid-wix-app.minimal .smart-grid-header {
                background: #fff;
                color: #333;
                border-bottom: 1px solid #eee;
            }

            .smart-grid-wix-app.minimal .quick-action {
                background: #333;
            }

            /* Responsivo */
            @media (max-width: 768px) {
                .smart-grid-header {
                    flex-direction: column;
                    gap: 15px;
                }

                .products-grid {
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 15px;
                    padding: 15px;
                }

                .app-footer {
                    flex-direction: column;
                    gap: 10px;
                    text-align: center;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }

    async loadCategories() {
        try {
            // Tentar usar Wix Stores API primeiro
            if (this.storesAPI) {
                this.categories = await this.storesAPI.getCategories();
            } else {
                // Fallback para nossa API
                const response = await fetch(`${this.apiUrl}/categories`);
                this.categories = await response.json();
            }

            this.updateCategorySelector();
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
            this.categories = [
                { id: 'bestSelling', name: 'Mais Vendidos' },
                { id: 'newest', name: 'Novidades' },
                { id: 'featured', name: 'Em Destaque' },
                { id: 'sale', name: 'Promoções' }
            ];
            this.updateCategorySelector();
        }
    }

    updateCategorySelector() {
        const selector = document.getElementById(`categorySelect-${this.instanceId}`);
        if (!selector) return;

        selector.innerHTML = `
            <option value="">Todas as categorias</option>
            ${this.categories.map(cat => 
                `<option value="${cat.id}" ${cat.id === this.settings.category ? 'selected' : ''}>
                    ${cat.name}
                </option>`
            ).join('')}
        `;
    }

    async loadProducts() {
        this.loading = true;
        const grid = document.getElementById(`productsGrid-${this.instanceId}`);
        
        try {
            let products = [];
            
            // Tentar usar Wix Stores API primeiro
            if (this.storesAPI) {
                products = await this.storesAPI.getProducts({
                    category: this.settings.category,
                    limit: this.settings.productsPerPage,
                    page: this.currentPage
                });
            } else {
                // Fallback para nossa API
                const response = await fetch(
                    `${this.apiUrl}/products/${this.settings.category}?page=${this.currentPage}&limit=${this.settings.productsPerPage}`
                );
                products = await response.json();
            }

            this.products = products;
            await this.renderProducts();
            
            // Reportar carregamento para analytics
            this.reportAnalytics('products_loaded', { 
                category: this.settings.category,
                count: products.length 
            });
            
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            grid.innerHTML = `
                <div class="error-state">
                    <h3>⚠️ Erro ao carregar produtos</h3>
                    <p>Verifique sua conexão e tente novamente.</p>
                    <button onclick="location.reload()">Tentar novamente</button>
                </div>
            `;
        } finally {
            this.loading = false;
        }
    }

    async renderProducts() {
        const grid = document.getElementById(`productsGrid-${this.instanceId}`);
        if (!grid || this.products.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>📦 Nenhum produto encontrado</h3>
                    <p>Tente selecionar uma categoria diferente.</p>
                </div>
            `;
            return;
        }

        const productsHTML = await Promise.all(
            this.products.map(async product => {
                const enhancement = this.settings.enableAI ? 
                    await this.getProductEnhancement(product) : null;
                
                return `
                    <div class="product-card" data-product-id="${product.id}">
                        <div class="product-image" style="background-image: url('${product.image || '/placeholder-product.jpg'}')">
                            ${enhancement ? '<div class="ai-badge">AI Enhanced</div>' : ''}
                        </div>
                        <div class="product-info">
                            <h3 class="product-title">${product.name}</h3>
                            <div class="product-price">
                                ${product.price ? `R$ ${product.price.toFixed(2)}` : 'Consulte'}
                            </div>
                            
                            ${enhancement ? `
                                <div class="product-enhancement">
                                    <strong>💡 IA Recomenda:</strong> ${enhancement}
                                </div>
                            ` : ''}
                            
                            <div class="quick-actions">
                                <button class="quick-action" onclick="smartGrid.quickView('${product.id}')">
                                    👀 Ver
                                </button>
                                <button class="quick-action" onclick="smartGrid.addToCart('${product.id}')">
                                    🛒 Comprar
                                </button>
                                <button class="quick-action" onclick="smartGrid.addToWishlist('${product.id}')">
                                    ❤️ Favoritar
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            })
        );

        grid.innerHTML = productsHTML.join('');
    }

    async getProductEnhancement(product) {
        if (!this.settings.enableAI) return null;
        
        try {
            const response = await fetch(`${this.apiUrl}/enhance-product`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product })
            });
            
            const data = await response.json();
            return data.enhancement;
        } catch (error) {
            console.error('Erro ao gerar enhancement:', error);
            return null;
        }
    }

    setupEventListeners() {
        // Seletor de categoria
        const categorySelect = document.getElementById(`categorySelect-${this.instanceId}`);
        if (categorySelect) {
            categorySelect.addEventListener('change', (e) => {
                this.settings.category = e.target.value;
                this.currentPage = 1;
                this.loadProducts();
                
                this.reportAnalytics('category_changed', { 
                    category: e.target.value 
                });
            });
        }

        // Cliques em produtos
        const grid = document.getElementById(`productsGrid-${this.instanceId}`);
        if (grid) {
            grid.addEventListener('click', (e) => {
                const productCard = e.target.closest('.product-card');
                if (productCard && !e.target.closest('.quick-actions')) {
                    const productId = productCard.dataset.productId;
                    this.openProduct(productId);
                }
            });
        }
    }

    // Ações rápidas
    async quickView(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        // Abrir modal de visualização rápida
        this.openQuickViewModal(product);
        this.reportAnalytics('quick_view', { productId });
    }

    async addToCart(productId) {
        try {
            if (this.storesAPI) {
                await this.storesAPI.addToCart(productId);
            } else {
                // Fallback para método customizado
                this.showNotification('✅ Produto adicionado ao carrinho!', 'success');
            }
            
            this.reportAnalytics('add_to_cart', { productId });
        } catch (error) {
            this.showNotification('❌ Erro ao adicionar ao carrinho', 'error');
        }
    }

    async addToWishlist(productId) {
        // Implementar adicionar à lista de desejos
        this.showNotification('❤️ Adicionado aos favoritos!', 'success');
        this.reportAnalytics('add_to_wishlist', { productId });
    }

    openProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product || !product.url) return;

        // Abrir página do produto
        window.open(product.url, '_blank');
        this.reportAnalytics('product_click', { productId });
    }

    showNotification(message, type = 'info') {
        // Criar notificação toast
        const notification = document.createElement('div');
        notification.className = `smart-grid-notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    reportAnalytics(event, data = {}) {
        // Integrar com Wix Analytics
        if (typeof wixAnalytics !== 'undefined') {
            wixAnalytics.track(event, {
                appId: 'smart-product-grid-pro',
                instanceId: this.instanceId,
                siteId: this.siteId,
                ...data
            });
        }
        
        // Enviar para nossa API de analytics
        fetch(`${this.apiUrl}/analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event,
                data,
                instanceId: this.instanceId,
                siteId: this.siteId,
                timestamp: new Date().toISOString()
            })
        }).catch(console.error);
    }

    // Métodos públicos para configuração
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.loadProducts();
    }

    changeCategory(categoryId) {
        this.settings.category = categoryId;
        this.currentPage = 1;
        this.loadProducts();
    }

    refresh() {
        this.loadProducts();
    }
}

// Tornar disponível globalmente para Wix
window.SmartProductGridWixApp = SmartProductGridWixApp;

// Auto-inicialização se elemento existir
document.addEventListener('DOMContentLoaded', () => {
    const element = document.getElementById('smart-product-grid-wix');
    if (element) {
        window.smartGrid = new SmartProductGridWixApp('smart-product-grid-wix');
    }
});

// Exportar para uso como módulo
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartProductGridWixApp;
}
