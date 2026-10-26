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

// --- RUTA POST PARA GUARDAR EXPEDIENTES ---
app.post('/api/expedientes', async (req, res) => {
  const { mascota, especie, raza, propietario, telefono } = req.body;

  try {
    const partesNombre = propietario ? propietario.trim().split(' ') : ['Propietario', 'Web'];
    const nombres = partesNombre[0] || 'Desconocido';
    const apellidos = partesNombre.slice(1).join(' ') || 'Registrado Web';

    let propietarioQuery = 'SELECT id_propietario FROM propietarios WHERE nombres = $1 OR telefono = $2';
    let propietarioRes = await db.query(propietarioQuery, [nombres, telefono || 'N/D']);

    let idPropietario;

    if (propietarioRes.rows.length > 0) {
      idPropietario = propietarioRes.rows[0].id_propietario;
    } else {
      const insertPropietario = `
        INSERT INTO propietarios (nombres, apellidos, cedula, telefono, direccion) 
        VALUES ($1, $2, $3, $4, $5) RETURNING id_propietario;
      `;
      const cedulaTemporal = 'TEMP-' + Date.now().toString().slice(-8);
      const resProp = await db.query(insertPropietario, [nombres, apellidos, cedulaTemporal, telefono || '0000-0000', 'No especificada']);
      idPropietario = resProp.rows[0].id_propietario;
    }

    const codigoExpediente = 'EXP-' + Math.floor(1000 + Math.random() * 9000);

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

// --- RUTA GET PARA OBTENER CITAS ---
app.get('/api/citas', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id_cita,
        m.id_mascota,
        m.nombre_mascota AS mascota,
        m.especie,
        c.fecha_cita,
        c.motivo_servicio,
        c.estado
      FROM citas c
      JOIN mascotas m ON c.id_mascota = m.id_mascota
      ORDER BY c.fecha_cita ASC;
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener citas:', err.message);
    res.status(500).send('Error en el servidor al obtener citas');
  }
});

// --- RUTA POST PARA AGENDAR CITAS ---
app.post('/api/citas', async (req, res) => {
  const { id_mascota, fecha_cita, motivo_servicio } = req.body;

  try {
    const validarChoque = `
      SELECT id_cita FROM citas 
      WHERE fecha_cita = $1 AND estado != 'Cancelada';
    `;
    const citaExistente = await db.query(validarChoque, [fecha_cita]);

    if (citaExistente.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cita programada en este horario. Por favor elija otro.' });
    }

    const insertCita = `
      INSERT INTO citas (id_mascota, fecha_cita, motivo_servicio, estado) 
      VALUES ($1, $2, $3, 'Programada') 
      RETURNING *;
    `;
    const nuevaCitaRes = await db.query(insertCita, [id_mascota, fecha_cita, motivo_servicio || 'Consulta General']);

    res.status(201).json(nuevaCitaRes.rows[0]);

  } catch (err) {
    console.error('Error al agendar la cita:', err.message);
    res.status(500).send('Error en el servidor al agendar la cita');
  }
});

// --- RUTA POST PARA GUARDAR HISTORIAL MÉDICO ---
app.post('/api/historial', async (req, res) => {
  const { id_mascota, constantes_vitales, motivo_consulta, diagnostico, tratamiento_recetado } = req.body;

  try {
    const vetQuery = 'SELECT id_usuario FROM usuarios LIMIT 1';
    const vetRes = await db.query(vetQuery);
    const id_veterinario = vetRes.rows.length > 0 ? vetRes.rows[0].id_usuario : 1;

    const insertHistorial = `
      INSERT INTO historial_medico (id_mascota, id_veterinario, constantes_vitales, diagnostico, tratamiento_recetado, observaciones) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *;
    `;

    const valores = [
      id_mascota,
      id_veterinario,
      constantes_vitales || 'Sin constantes registradas',
      diagnostico || 'Pendiente de diagnóstico',
      tratamiento_recetado || 'Sin receta',
      motivo_consulta || 'Consulta general'
    ];

    const resultado = await db.query(insertHistorial, valores);
    res.status(201).json(resultado.rows[0]);

  } catch (err) {
    console.error('Error al guardar el historial médico:', err.message);
    res.status(500).send('Error en el servidor al guardar la orden de atención');
  }
});

// --- RUTA GET PARA OBTENER EL HISTORIAL MÉDICO DE UNA MASCOTA ---
app.get('/api/historial/:id_mascota', async (req, res) => {
  const { id_mascota } = req.params;
  try {
    const query = `
      SELECT 
        h.id_historial,
        h.fecha_consulta,
        h.constantes_vitales,
        h.diagnostico,
        h.tratamiento_recetado,
        h.observaciones,
        u.correo AS veterinario
      FROM historial_medico h
      JOIN usuarios u ON h.id_veterinario = u.id_usuario
      WHERE h.id_mascota = $1
      ORDER BY h.fecha_consulta DESC;
    `;
    const result = await db.query(query, [id_mascota]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener el historial médico:', err.message);
    res.status(500).send('Error en el servidor al obtener el historial');
  }
});

// --- RUTAS NUEVAS PARA CATÁLOGOS (CUN-04) ---

app.get('/api/servicios', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM servicios ORDER BY id_servicio ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener servicios:', err.message);
    res.status(500).send('Error en el servidor al obtener servicios');
  }
});

app.post('/api/servicios', async (req, res) => {
  const { nombre_servicio, precio } = req.body;
  try {
    const query = 'INSERT INTO servicios (nombre_servicio, precio, estado) VALUES ($1, $2, $3) RETURNING *;';
    const result = await db.query(query, [nombre_servicio, precio, 'Activo']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear servicio:', err.message);
    res.status(500).send('Error en el servidor al crear servicio');
  }
});

app.get('/api/vacunas-catalogo', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM vacunas_catalogo ORDER BY id_vacuna ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener vacunas:', err.message);
    res.status(500).send('Error en el servidor al obtener vacunas');
  }
});

app.post('/api/vacunas-catalogo', async (req, res) => {
  const { nombre_vacuna, stock_o_dosis } = req.body;
  try {
    const query = 'INSERT INTO vacunas_catalogo (nombre_vacuna, stock_o_dosis) VALUES ($1, $2) RETURNING *;';
    const result = await db.query(query, [nombre_vacuna, stock_o_dosis || 'Disponible']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear vacuna:', err.message);
    res.status(500).send('Error en el servidor al crear vacuna');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor del backend corriendo en el puerto ${PORT}`);
});