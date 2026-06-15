/**
 * Teruvion Web Server
 * Express server connecting Core Engine to web frontend
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./api');
const { version } = require('../../package.json');

const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS for development
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Local source media cache. Files live under _local and are not committed.
app.use(
  '/assets/source-assets',
  express.static(path.join(__dirname, '../../_local/source-assets'), {
    immutable: true,
    maxAge: '30d'
  })
);

// ============================================================================
// API ROUTES
// ============================================================================

app.use('/api', apiRouter);

// ============================================================================
// API INFO ROUTE
// ============================================================================

// Root route returns API info
app.get('/', (req, res) => {
  res.json({
    name: 'Teruvion API',
    version,
    endpoints: {
      entities: '/api/entities',
      projects: '/api/projects',
      import: '/api/import',
      admission: '/api/admission/evaluate'
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('Teruvion Web Server');
  console.log('='.repeat(60));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log('='.repeat(60));
});
