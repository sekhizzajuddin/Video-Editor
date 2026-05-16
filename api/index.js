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
let PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(__dirname, '..', 'projects');

// If running in Vercel or AWS Lambda, __dirname is read-only, use /tmp
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  PROJECTS_DIR = path.join('/tmp', 'projects');
}

// Ensure projects directory exists
try {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    console.log(`📁 Created projects directory at ${PROJECTS_DIR}`);
  }
} catch (err) {
  console.warn(`⚠️ Could not create projects directory at ${PROJECTS_DIR}: ${err.message}`);
  console.warn('⚠️ Falling back to /tmp/projects');
  PROJECTS_DIR = path.join('/tmp', 'projects');
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
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
  // Required for ffmpeg.wasm SharedArrayBuffer support
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
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

// ── Static File Serving ──
const root = path.join(__dirname, '..');
app.use(express.static(root));

// SPA Fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'API route not found' });
  res.sendFile(path.join(root, 'index.html'));
});

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start Server (Local Only) ──
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎬 VidForge Pro API listening on http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;