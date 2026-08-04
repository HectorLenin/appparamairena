const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const cron = require('node-cron');
const db = require('./database');
const gmail = require('./gmail');
const emailService = require('./emailService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de seguridad
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*'
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite por IP
});
app.use('/api/', limiter);

// ============================================
// PROCESO PRINCIPAL DE REENVÍO
// ============================================

let procesoEnEjecucion = false;

async function procesarYReenviar() {
  if (procesoEnEjecucion) {
    console.log('⏳ Proceso ya en ejecución, omitiendo...');
    return;
  }

  try {
    procesoEnEjecucion = true;
    console.log('🔄 Iniciando proceso de reenvío...');

    // 1. Verificar si hay token nuevo
    const tokenData = await gmail.hayTokenNuevo();
    if (!tokenData) {
      console.log('ℹ️ No hay token nuevo para reenviar');
      procesoEnEjecucion = false;
      return;
    }

    console.log(`📧 Token encontrado: ${tokenData.token}`);

    // 2. Obtener destinatarios activos
    const destinatarios = await db.getDestinatarios();
    const emails = destinatarios.map(d => d.email);

    if (emails.length === 0) {
      console.log('⚠️ No hay destinatarios configurados');
      procesoEnEjecucion = false;
      return;
    }

    console.log(`📨 Enviando a ${emails.length} destinatarios...`);

    // 3. Reenviar token
    const resultados = await emailService.reenviarTokenMultiple(
      emails,
      tokenData.token,
      new Date()
    );

    // 4. Guardar registro
    const exitosos = resultados.filter(r => r.success);
    if (exitosos.length > 0) {
      await db.saveTokenEnviado(
        tokenData.token,
        exitosos.length,
        exitosos[0].messageId || ''
      );
      await db.setUltimoEnvio(new Date().toISOString());
    }

    console.log(`✅ Proceso completado: ${exitosos.length}/${emails.length} envíos exitosos`);
    
    // 5. Guardar estadísticas
    const stats = await db.getEstadisticas();
    console.log('📊 Estadísticas:', stats);

  } catch (error) {
    console.error('❌ Error en proceso de reenvío:', error);
  } finally {
    procesoEnEjecucion = false;
  }
}

// ============================================
// CRON - EJECUTAR CADA 20 DÍAS
// ============================================

// Programar tarea cada 20 días a las 9:00 AM
cron.schedule('0 9 */20 * *', async () => {
  console.log('⏰ Ejecutando tarea programada (cada 20 días)...');
  await procesarYReenviar();
});

// También ejecutar al iniciar
setTimeout(async () => {
  console.log('🚀 Ejecutando verificación inicial...');
  await procesarYReenviar();
}, 3000);

// ============================================
// ENDPOINTS API
// ============================================

// Obtener destinatarios
app.get('/api/destinatarios', async (req, res) => {
  try {
    const destinatarios = await db.getDestinatarios();
    res.json({ 
      success: true, 
      destinatarios: destinatarios.map(d => d.email),
      total: destinatarios.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Agregar destinatario
app.post('/api/destinatarios', async (req, res) => {
  try {
    const { email, nombre } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Correo inválido' });
    }
    
    const agregado = await db.addDestinatario(email, nombre || '');
    if (agregado) {
      res.json({ success: true, message: 'Correo agregado' });
    } else {
      res.status(400).json({ success: false, error: 'El correo ya existe' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar destinatario
app.delete('/api/destinatarios/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const eliminado = await db.removeDestinatario(email);
    if (eliminado) {
      res.json({ success: true, message: 'Correo eliminado' });
    } else {
      res.status(404).json({ success: false, error: 'Correo no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estado del sistema
app.get('/api/estado', async (req, res) => {
  try {
    const stats = await db.getEstadisticas();
    const ultimoToken = await db.getUltimoToken();
    const ultimoEnvio = await db.getUltimoEnvio();
    const destinatarios = await db.getDestinatarios();
    
    res.json({
      success: true,
      estado: {
        ultimo_token: ultimoToken,
        ultimo_envio: ultimoEnvio,
        total_destinatarios: stats.total_destinatarios || 0,
        total_envios: stats.total_envios || 0,
        ultimo_token_enviado: stats.ultimo_token_enviado,
        ultima_fecha_envio: stats.ultima_fecha_envio,
        ciclo_dias: parseInt(process.env.CYCLE_DAYS || 20),
        admin_email: process.env.ADMIN_EMAIL
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Forzar reenvío manual
app.post('/api/reenviar', async (req, res) => {
  try {
    // Ejecutar en background
    procesarYReenviar().then(() => {
      console.log('✅ Reenvío forzado completado');
    });
    
    res.json({ 
      success: true, 
      message: 'Reenvío iniciado en segundo plano' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener token actual (para debug)
app.get('/api/token/actual', async (req, res) => {
  try {
    const token = await db.getUltimoToken();
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
  console.log('========================================');
  console.log('✅ SERVIDOR REENVÍO NETFLIX');
  console.log('========================================');
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`📧 Admin: ${process.env.ADMIN_EMAIL}`);
  console.log(`🔄 Ciclo: cada ${process.env.CYCLE_DAYS} días`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('========================================');
});

// Manejo de errores
process.on('unhandledRejection', (error) => {
  console.error('❌ Error no manejado:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 Servidor terminado');
  process.exit(0);
});

module.exports = app;