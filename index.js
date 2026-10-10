require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'API de VetControl funcionando correctamente' });
});

app.get('/api/roles', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM roles');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
});

// --- NUEVA RUTA PARA EXPEDIENTES (Mascotas + Propietarios) ---
app.get('/api/expedientes', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id_mascota,
        m.codigo_expediente AS codigo,
        m.nombre_mascota,
        m.especie,
        m.raza,
        m.sexo,
        m.peso_actual,
        CONCAT(p.nombres, ' ', p.apellidos) AS propietario,
        p.telefono
      FROM mascotas m
      JOIN propietarios p ON m.id_propietario = p.id_propietario;
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener expedientes:', err.message);
    res.status(500).send('Error en el servidor al obtener expedientes');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor del backend corriendo en el puerto ${PORT}`);
});