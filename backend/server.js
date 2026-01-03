const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const songRoutes = require('./routes/songs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploaded songs and covers)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Songs App API',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      },
      songs: {
        getAll: 'GET /api/songs',
        getOne: 'GET /api/songs/:id',
        upload: 'POST /api/songs (Admin only)',
        uploadCover: 'POST /api/songs/:id/cover (Admin only)',
        update: 'PUT /api/songs/:id (Admin only)',
        delete: 'DELETE /api/songs/:id (Admin only)',
        stream: 'GET /api/songs/:id/stream'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
