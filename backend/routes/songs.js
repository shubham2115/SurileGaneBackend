const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { uploadSong, uploadCover } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Get all songs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.username as uploader_name 
      FROM songs s 
      LEFT JOIN users u ON s.uploaded_by = u.id 
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({ error: 'Error fetching songs' });
  }
});

// Get single song
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT s.*, u.username as uploader_name FROM songs s LEFT JOIN users u ON s.uploaded_by = u.id WHERE s.id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching song:', error);
    res.status(500).json({ error: 'Error fetching song' });
  }
});

// Upload new song (Admin only)
router.post('/', authenticateToken, isAdmin, uploadSong.single('song'), async (req, res) => {
  try {
    const { title, artist, album, duration } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Song file is required' });
    }
    
    if (!title || !artist) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Title and artist are required' });
    }
    
    const filePath = `/uploads/songs/${req.file.filename}`;
    
    const result = await pool.query(
      'INSERT INTO songs (title, artist, album, duration, file_path, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, artist, album, duration || null, filePath, req.user.id]
    );
    
    res.status(201).json({
      message: 'Song uploaded successfully',
      song: result.rows[0]
    });
  } catch (error) {
    console.error('Error uploading song:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Error uploading song' });
  }
});

// Upload cover image for a song (Admin only)
router.post('/:id/cover', authenticateToken, isAdmin, uploadCover.single('cover'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Cover image is required' });
    }
    
    const coverPath = `/uploads/covers/${req.file.filename}`;
    
    // Check if song exists
    const songCheck = await pool.query('SELECT * FROM songs WHERE id = $1', [id]);
    if (songCheck.rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Song not found' });
    }
    
    // Delete old cover if exists
    const oldCover = songCheck.rows[0].cover_image;
    if (oldCover) {
      const oldCoverPath = path.join(__dirname, '..', oldCover);
      if (fs.existsSync(oldCoverPath)) {
        fs.unlinkSync(oldCoverPath);
      }
    }
    
    const result = await pool.query(
      'UPDATE songs SET cover_image = $1 WHERE id = $2 RETURNING *',
      [coverPath, id]
    );
    
    res.json({
      message: 'Cover image uploaded successfully',
      song: result.rows[0]
    });
  } catch (error) {
    console.error('Error uploading cover:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Error uploading cover' });
  }
});

// Update song details (Admin only)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, artist, album, duration } = req.body;
    
    const result = await pool.query(
      'UPDATE songs SET title = COALESCE($1, title), artist = COALESCE($2, artist), album = COALESCE($3, album), duration = COALESCE($4, duration) WHERE id = $5 RETURNING *',
      [title, artist, album, duration, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    res.json({
      message: 'Song updated successfully',
      song: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating song:', error);
    res.status(500).json({ error: 'Error updating song' });
  }
});

// Delete song (Admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get song details first
    const songResult = await pool.query('SELECT * FROM songs WHERE id = $1', [id]);
    
    if (songResult.rows.length === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    const song = songResult.rows[0];
    
    // Delete from database
    await pool.query('DELETE FROM songs WHERE id = $1', [id]);
    
    // Delete song file
    const songPath = path.join(__dirname, '..', song.file_path);
    if (fs.existsSync(songPath)) {
      fs.unlinkSync(songPath);
    }
    
    // Delete cover image if exists
    if (song.cover_image) {
      const coverPath = path.join(__dirname, '..', song.cover_image);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }
    
    res.json({ message: 'Song deleted successfully' });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ error: 'Error deleting song' });
  }
});

// Stream song file
router.get('/:id/stream', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT file_path FROM songs WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    const filePath = path.join(__dirname, '..', result.rows[0].file_path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Song file not found' });
    }
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming song:', error);
    res.status(500).json({ error: 'Error streaming song' });
  }
});

module.exports = router;
