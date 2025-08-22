# Railway Configuration for Smart Product Grid Pro

## 🚀 Deployment Settings

### Build Command:
```bash
npm install
```

### Start Command:
```bash
node backend/wix-app-server.js
```

### Environment Variables:
```env
NODE_ENV=production
PORT=3000
WIX_APP_ID=smart-product-grid-pro
ANALYTICS_ENABLED=true
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

### Domain Configuration:
- **Custom Domain**: smart-grid-pro.up.railway.app
- **Health Check**: /api/health
- **Widget URL**: /widget
- **Dashboard URL**: /dashboard

### Resource Requirements:
- **Memory**: 512MB (sufficient for start)
- **CPU**: 0.5 vCPU
- **Disk**: 1GB

### Auto-Deploy:
✅ Enable automatic deploys from main branch

## 📊 Expected Performance:
- **Cold start**: < 5 seconds
- **Response time**: < 200ms
- **Uptime**: 99.9%

## 🔧 Post-Deploy Checklist:
1. ✅ Health check responding
2. ✅ Widget loading correctly  
3. ✅ Dashboard accessible
4. ✅ APIs returning data
5. ✅ CORS configured properly
