const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const db = require('./database');
const gmail = require('./gmail');
const emailService = require('./emailService');

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// CORS - Permitir solicitudes desde el frontend
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// ============================================
// HEALTH CHECK (para Railway)
// ============================================

app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        name: 'Reenvío Netflix Backend',
        version: '2.0.0',
        admin_email: process.env.ADMIN_EMAIL,
        cycle_days: process.env.CYCLE_DAYS || 20,
        uptime: process.uptime()
    });
});

// ============================================
// PROCESO PRINCIPAL DE REENVÍO
// ============================================

let procesoEnEjecucion = false;

async function procesarYReenviar(emailsSeleccionados = null) {
    if (procesoEnEjecucion) {
        console.log('⏳ Proceso ya en ejecución');
        return { success: false, message: 'Proceso en ejecución' };
    }

    try {
        procesoEnEjecucion = true;
        console.log('🔄 Iniciando proceso de reenvío...');

        // 1. Verificar token nuevo
        const tokenData = await gmail.hayTokenNuevo();
        if (!tokenData) {
            console.log('ℹ️ No hay token nuevo para reenviar');
            procesoEnEjecucion = false;
            return { success: false, message: 'No hay token nuevo' };
        }

        console.log(`📧 Token encontrado: ${tokenData.token}`);

        // 2. Obtener destinatarios
        let destinatarios = await db.getDestinatarios();
        
        // Filtrar si se pasaron emails específicos
        if (emailsSeleccionados && emailsSeleccionados.length > 0) {
            destinatarios = destinatarios.filter(d => 
                emailsSeleccionados.includes(d.email)
            );
        }

        const emails = destinatarios.map(d => d.email);

        if (emails.length === 0) {
            console.log('⚠️ No hay destinatarios configurados');
            procesoEnEjecucion = false;
            return { success: false, message: 'Sin destinatarios' };
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

        procesoEnEjecucion = false;
        
        return {
            success: true,
            message: `Reenviado a ${exitosos.length} destinatarios`,
            token: tokenData.token,
            exitosos: exitosos.length,
            fallidos: resultados.length - exitosos.length
        };

    } catch (error) {
        console.error('❌ Error en proceso de reenvío:', error);
        procesoEnEjecucion = false;
        return { success: false, error: error.message };
    }
}

// ============================================
// CRON - CADA 20 DÍAS (Para Railway)
// ============================================

// Railway necesita que el cron se ejecute en el servidor
// Se ejecuta a las 9:00 AM cada 20 días
cron.schedule('0 9 */20 * *', async () => {
    console.log('⏰ Ejecutando tarea programada (cada 20 días)...');
    const resultado = await procesarYReenviar();
    console.log('📊 Resultado:', resultado);
});

// También al iniciar (si hay token pendiente)
setTimeout(async () => {
    console.log('🚀 Ejecutando verificación inicial...');
    const resultado = await procesarYReenviar();
    if (resultado.success) {
        console.log('✅ Primer reenvío completado');
    }
}, 5000);

// ============================================
// ENDPOINTS API
// ============================================

// 1. Obtener estado del sistema
app.get('/api/estado', async (req, res) => {
    try {
        const stats = await db.getEstadisticas();
        const ultimoToken = await db.getUltimoToken();
        const ultimoEnvio = await db.getUltimoEnvio();
        const destinatarios = await db.getDestinatarios();
        
        res.json({
            success: true,
            estado: {
                ultimo_token: ultimoToken || '—',
                ultimo_envio: ultimoEnvio || '—',
                total_destinatarios: stats.total_destinatarios || 0,
                total_envios: stats.total_envios || 0,
                ultimo_token_enviado: stats.ultimo_token_enviado || '—',
                ultima_fecha_envio: stats.ultima_fecha_envio || '—',
                ciclo_dias: parseInt(process.env.CYCLE_DAYS || 20),
                admin_email: process.env.ADMIN_EMAIL || 'configurado'
            }
        });
    } catch (error) {
        console.error('Error en /api/estado:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Obtener destinatarios
app.get('/api/destinatarios', async (req, res) => {
    try {
        const destinatarios = await db.getDestinatarios();
        res.json({
            success: true,
            destinatarios: destinatarios.map(d => d.email),
            total: destinatarios.length
        });
    } catch (error) {
        console.error('Error en /api/destinatarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Agregar destinatario
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
        console.error('Error en /api/destinatarios POST:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Eliminar destinatario
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
        console.error('Error en /api/destinatarios DELETE:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Reenviar token (manual o a seleccionados)
app.post('/api/reenviar', async (req, res) => {
    try {
        const { emails } = req.body;
        
        // Validar
        if (!emails || emails.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Selecciona al menos un destinatario'
            });
        }

        // Verificar que los emails existan
        const destinatarios = await db.getDestinatarios();
        const emailsValidos = destinatarios
            .filter(d => emails.includes(d.email))
            .map(d => d.email);

        if (emailsValidos.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Los emails seleccionados no son válidos'
            });
        }

        // Ejecutar reenvío
        const resultado = await procesarYReenviar(emailsValidos);
        
        res.json({
            success: resultado.success,
            message: resultado.message || 'Reenvío completado',
            token: resultado.token || null,
            exitosos: resultado.exitosos || 0,
            fallidos: resultado.fallidos || 0
        });

    } catch (error) {
        console.error('Error en /api/reenviar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Guardar token manualmente (emergencia)
app.post('/api/token/manual', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || token.length < 5) {
            return res.status(400).json({
                success: false,
                error: 'Token inválido'
            });
        }

        await db.setUltimoToken(token);
        await db.setUltimoEnvio(new Date().toISOString());

        res.json({
            success: true,
            message: 'Token guardado manualmente',
            token: token
        });

    } catch (error) {
        console.error('Error en /api/token/manual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Obtener token actual (debug)
app.get('/api/token/actual', async (req, res) => {
    try {
        const token = await db.getUltimoToken();
        res.json({
            success: true,
            token: token || 'No hay token',
            fecha: await db.getUltimoEnvio()
        });
    } catch (error) {
        console.error('Error en /api/token/actual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MANEJO DE ERRORES
// ============================================

app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('✅ REENVÍO NETFLIX - BACKEND');
    console.log('========================================');
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`📧 Admin: ${process.env.ADMIN_EMAIL || 'No configurado'}`);
    console.log(`🔄 Ciclo: cada ${process.env.CYCLE_DAYS || 20} días`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('⏰ Cron programado: 9:00 AM cada 20 días');
});

// Manejar señales de terminación
process.on('SIGTERM', () => {
    console.log('🛑 Recibido SIGTERM, cerrando...');
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Promesa no manejada:', error);
});

module.exports = app;