const express = require('express');
const cors = require('cors'); // <--- Importado para permitir la comunicación con el Frontend
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors()); // <--- Habilitado CORS para todas las peticiones
app.use(express.json());

// Ruta principal de bienvenida/verificación para saber que la API está viva en la nube
app.get('/', (req, res) => {
  res.json({ status: 'API de VetControl funcionando correctamente' });
});

// Ruta de prueba para verificar los roles de la veterinaria
app.get('/api/roles', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM roles');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor del backend corriendo en el puerto ${PORT}`);
});