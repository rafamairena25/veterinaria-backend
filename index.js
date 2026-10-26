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

// --- RUTA GET PARA EXPEDIENTES (Mascotas + Propietarios) ---
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

// --- RUTA POST PARA GUARDAR EXPEDIENTES (Con división inteligente de Nombre y Apellido) ---
app.post('/api/expedientes', async (req, res) => {
  const { mascota, especie, raza, propietario, telefono } = req.body;

  try {
    // 1. Separar inteligentemente el nombre y el apellido ingresados en el formulario
    const partesNombre = propietario ? propietario.trim().split(' ') : ['Propietario', 'Web'];
    const nombres = partesNombre[0] || 'Desconocido';
    const apellidos = partesNombre.slice(1).join(' ') || 'Registrado Web';

    // 2. Verificar si el propietario ya existe por nombre o teléfono
    let propietarioQuery = 'SELECT id_propietario FROM propietarios WHERE nombres = $1 OR telefono = $2';
    let propietarioRes = await db.query(propietarioQuery, [nombres, telefono || 'N/D']);

    let idPropietario;

    if (propietarioRes.rows.length > 0) {
      idPropietario = propietarioRes.rows[0].id_propietario;
    } else {
      // Si no existe, lo creamos guardando el nombre y apellido separados correctamente
      const insertPropietario = `
        INSERT INTO propietarios (nombres, apellidos, cedula, telefono, direccion) 
        VALUES ($1, $2, $3, $4, $5) RETURNING id_propietario;
      `;
      const cedulaTemporal = 'TEMP-' + Date.now().toString().slice(-8);
      const resProp = await db.query(insertPropietario, [nombres, apellidos, cedulaTemporal, telefono || '0000-0000', 'No especificada']);
      idPropietario = resProp.rows[0].id_propietario;
    }

    // 3. Generar código de expediente único
    const codigoExpediente = 'EXP-' + Math.floor(1000 + Math.random() * 9000);

    // 4. Insertar la mascota vinculada al propietario
    const insertMascota = `
      INSERT INTO mascotas (id_propietario, codigo_expediente, nombre_mascota, especie, raza) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *;
    `;
    const valoresMascota = [idPropietario, codigoExpediente, mascota, especie, raza || 'Mestizo'];
    const nuevaMascotaRes = await db.query(insertMascota, valoresMascota);

    res.status(201).json(nuevaMascotaRes.rows[0]);

  } catch (err) {
    console.error('Error al guardar el expediente:', err.message);
    res.status(500).send('Error en el servidor al registrar el expediente');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor del backend corriendo en el puerto ${PORT}`);
});