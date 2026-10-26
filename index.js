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

// --- RUTA POST PARA AGENDAR CITAS (Con validación anti-choques) ---
app.post('/api/citas', async (req, res) => {
  const { id_mascota, fecha_cita, motivo_servicio } = req.body;

  try {
    // 1. Validar si ya existe una cita en exactamente la misma fecha y hora para evitar cruces
    const validarChoque = `
      SELECT id_cita FROM citas 
      WHERE fecha_cita = $1 AND estado != 'Cancelada';
    `;
    const citaExistente = await db.query(validarChoque, [fecha_cita]);

    if (citaExistente.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cita programada en este horario. Por favor elija otro.' });
    }

    // 2. Insertar la nueva cita si el horario está libre
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

// --- RUTA POST PARA GUARDAR HISTORIAL MÉDICO / ORDEN DE ATENCIÓN (CU-03) ---
app.post('/api/historial', async (req, res) => {
  const { id_mascota, constantes_vitales, motivo_consulta, diagnostico, tratamiento_recetado } = req.body;

  try {
    // Buscamos un id_veterinario válido en la base de datos (por ejemplo, el primero disponible con rol de médico o usuario)
    const vetQuery = 'SELECT id_usuario FROM usuarios LIMIT 1';
    const vetRes = await db.query(vetQuery);
    
    // Si no hay usuarios en la BD, usamos un ID por defecto o manejamos el error
    const id_veterinario = vetRes.rows.length > 0 ? vetRes.rows.rows ? vetRes.rows[0].id_usuario : 1 : 1;

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

app.listen(PORT, () => {
  console.log(`Servidor del backend corriendo en el puerto ${PORT}`);
});