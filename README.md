isso aqui é uma outra api:
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const app = express();
const PORT = 3333;

const FIXED_CAMERA_ID = '6LMM2100392A7';
const baseDir = '/home/ftpuser/share';

app.use(require('cors')());
app.use('/cam_images', express.static(baseDir));

// Cron: Limpar a pasta da câmera a cada 48h (a cada 2 dias à meia-noite)
cron.schedule('0 0 */2 * *', () => {
  const dir = path.join(baseDir, FIXED_CAMERA_ID);
  console.log(`[CRON] Limpando arquivos em: ${dir}`);
  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error('[CRON] Erro lendo diretório:', err);
      return;
    }
    files.forEach(file => {
      const filePath = path.join(dir, file);
      fs.rm(filePath, { recursive: true, force: true }, err => {
        if (err) {
          console.error(`[CRON] Erro ao remover ${filePath}:`, err);
        }
      });
    });
  });
});

app.get('/api/list-images', (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ success: false, error: 'date é obrigatório' });
  }

  const dateDir = path.join(baseDir, FIXED_CAMERA_ID, date);
  console.log('[API DEBUG] Procurando imagens em:', dateDir);

  if (!fs.existsSync(dateDir)) {
    return res.json({ success: true, images: [] });
  }

  let images = [];
  const subfolders = fs.readdirSync(dateDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  subfolders.forEach(subfolder => {
    const subfolderPath = path.join(dateDir, subfolder);
    const files = fs.readdirSync(subfolderPath)
      .filter(f => f.toLowerCase().endsWith('.jpg'))
      .map(f => `${subfolder}/${f}`);
    images = images.concat(files);
  });

  return res.json({ success: true, images });
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});


--------------------------------------------------------
 cam-api            │ fork     │ 38   │ online
 molhes-api         │ fork     │ 98   │ online 
