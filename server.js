// ===================================================
// server.js — VidForge Pro: Full-Stack Express Server
// REST API + Static Serving + Project Storage
// ===================================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Load env vars
try { require('dotenv').config(); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 8082;
const PROJECTS_DIR = path.join(__dirname, 'projects');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  console.log('📁 Created projects directory');
}

// ── Middleware ──
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type', 'Range', 'Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Accept-Ranges', 'bytes');
  next();
});

// ── API Routes ──

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    app: 'VidForge Pro',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// List all projects
app.get('/api/projects', (req, res) => {
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
    const projects = files.map(file => {
      try {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf-8');
        const data = JSON.parse(raw);
        return {
          id: data.id,
          name: data.name || 'Untitled Project',
          savedAt: data.savedAt,
          duration: data.settings?.duration || 0,
          version: data.version || '1.0'
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Sort by most recent
    projects.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    res.json({ success: true, projects, count: projects.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save / Create a new project
app.post('/api/projects', (req, res) => {
  try {
    const projectData = req.body;
    if (!projectData || typeof projectData !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid project data' });
    }

    const id = projectData.id || uuidv4();
    projectData.id = id;
    projectData.savedAt = Date.now();
    projectData.version = '2.0';
    projectData.name = projectData.name || 'Untitled Project';

    const filePath = path.join(PROJECTS_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf-8');

    console.log(`✅ Project saved: ${projectData.name} (${id})`);
    res.json({ success: true, id, savedAt: projectData.savedAt, message: 'Project saved successfully' });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get a specific project
app.get('/api/projects/:id', (req, res) => {
  try {
    const filePath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json({ success: true, project: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update an existing project
app.put('/api/projects/:id', (req, res) => {
  try {
    const filePath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const updated = { ...existing, ...req.body, id: req.params.id, savedAt: Date.now() };

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    console.log(`✏️  Project updated: ${updated.name} (${req.params.id})`);
    res.json({ success: true, id: req.params.id, savedAt: updated.savedAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const filePath = path.join(PROJECTS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    fs.unlinkSync(filePath);
    console.log(`🗑  Project deleted: ${req.params.id}`);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Static File Serving with Range Support ──
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

// Serve static files with range support for media
app.use((req, res, next) => {
  // Only handle GET requests for static files, skip API routes
  if (req.path.startsWith('/api/')) return next();
  
  let filePath = path.join(__dirname, req.path === '/' ? 'index.html' : req.path);
  
  // Security: prevent path traversal
  if (!filePath.startsWith(__dirname)) {
    return res.status(403).send('Forbidden');
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isMedia = ['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.aac', '.flac'].includes(ext);
  
  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(__dirname, 'index.html');
  }
  
  if (isMedia) {
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }
  
  const cacheControl = ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600';
  res.set('Content-Type', contentType);
  res.set('Cache-Control', cacheControl);
  res.sendFile(filePath);
});

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start Server ──
app.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🎬 VidForge Pro v2.0 — Full-Stack Video Editor         ║
║                                                          ║
║   🌐 App:     http://localhost:${PORT}/                    ║
║   📡 API:     http://localhost:${PORT}/api/                ║
║   💾 Storage: ${PROJECTS_DIR}  ║
║   ⚙️  Mode:    ${env.padEnd(10)}                           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('\nSIGINT received — shutting down');
  process.exit(0);
});