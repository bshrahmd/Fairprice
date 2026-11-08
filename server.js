/**
 * AURA Multi-Store Marketplace — Full-Stack Node.js Server + JSON Database API
 *
 * Serves static assets AND provides a full REST API for:
 *  - GET    /api/store           -> Full store state (products, reviews, customers, orders, analytics, settings)
 *  - GET    /api/products        -> List all products
 *  - POST   /api/products        -> Add or update a product
 *  - DELETE /api/products/:id    -> Delete a product
 *  - GET    /api/reviews         -> List product reviews
 *  - POST   /api/reviews         -> Add a customer review & rating
 *  - GET    /api/customers       -> List customer records & orders
 *  - POST   /api/customers       -> Upsert customer / record order
 *  - DELETE /api/customers/:id   -> Delete customer record
 *  - POST   /api/analytics       -> Save store analytics
 *  - POST   /api/settings        -> Save store & social settings
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialDb = {
      products: [],
      reviews: [],
      customers: [],
      orders: [],
      analytics: {
        totalVisits: 0,
        mobileVisits: 0,
        desktopVisits: 0,
        categoryViews: {},
        brandViews: {},
        productCartAdds: {},
        updatedAt: new Date().toISOString()
      },
      settings: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { products: [], reviews: [], customers: [], orders: [], analytics: {}, settings: {} };
  }
}

function writeDb(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 15 * 1024 * 1024) req.destroy(); // 15MB limit for base64 product photos
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // ── REST API ROUTES ────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const db = readDb();

    if (pathname === '/api/store' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, ...db });
    }

    if (pathname === '/api/products' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, products: db.products || [] });
    }

    if (pathname === '/api/products' && req.method === 'POST') {
      const body = await parseBody(req);
      if (Array.isArray(body.products)) {
        db.products = body.products;
      } else if (body.product && body.product.id) {
        db.products = db.products || [];
        const idx = db.products.findIndex(p => String(p.id) === String(body.product.id));
        if (idx >= 0) db.products[idx] = body.product;
        else db.products.unshift(body.product);
      }
      writeDb(db);
      return sendJson(res, 200, { ok: true, products: db.products });
    }

    if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      db.products = (db.products || []).filter(p => String(p.id) !== String(id));
      writeDb(db);
      return sendJson(res, 200, { ok: true, products: db.products });
    }

    if (pathname === '/api/reviews' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, reviews: db.reviews || [] });
    }

    if (pathname === '/api/reviews' && req.method === 'POST') {
      const body = await parseBody(req);
      db.reviews = db.reviews || [];
      if (body.review) {
        db.reviews.unshift(body.review);
        writeDb(db);
      }
      return sendJson(res, 200, { ok: true, reviews: db.reviews });
    }

    if (pathname === '/api/customers' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, customers: db.customers || [], orders: db.orders || [] });
    }

    if (pathname === '/api/customers' && req.method === 'POST') {
      const body = await parseBody(req);
      db.customers = db.customers || [];
      db.orders = db.orders || [];
      if (Array.isArray(body.customers)) {
        db.customers = body.customers;
      } else if (body.customer) {
        const c = body.customer;
        const idx = db.customers.findIndex(x => x.id === c.id || (c.phone && x.phone === c.phone));
        if (idx >= 0) db.customers[idx] = c;
        else db.customers.unshift(c);
      }
      if (body.newOrder) {
        db.orders.unshift(body.newOrder);
      }
      writeDb(db);
      return sendJson(res, 200, { ok: true, customers: db.customers, orders: db.orders });
    }

    if (pathname.startsWith('/api/customers/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.split('/').pop());
      db.customers = (db.customers || []).filter(c => String(c.id) !== String(id));
      writeDb(db);
      return sendJson(res, 200, { ok: true, customers: db.customers });
    }

    if (pathname === '/api/analytics' && req.method === 'POST') {
      const body = await parseBody(req);
      if (body.analytics) {
        db.analytics = body.analytics;
        writeDb(db);
      }
      return sendJson(res, 200, { ok: true, analytics: db.analytics });
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await parseBody(req);
      if (body.settings) {
        db.settings = { ...(db.settings || {}), ...body.settings };
        writeDb(db);
      }
      return sendJson(res, 200, { ok: true, settings: db.settings });
    }

    return sendJson(res, 404, { ok: false, error: 'API route not found' });
  }

  // ── STATIC FILE SERVER ─────────────────────────────────────────
  const safePath = path.normalize(pathname === '/' ? 'index.html' : pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>', 'utf-8');
      return;
    }

    const range = req.headers.range;
    if (range && contentType.startsWith('video/')) {
      const fileSize = stat.size;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  ensureDb();
  console.log(`============================================================`);
  console.log(`🛍️  AURA Multi-Store Marketplace running at http://localhost:${PORT}/`);
  console.log(`🔐 Admin Portal available at http://localhost:${PORT}/#admin`);
  console.log(`💾 JSON Database active at ${DB_FILE}`);
  console.log(`============================================================`);
});
