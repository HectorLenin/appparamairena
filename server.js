const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const db = require('./database');
const gmail = require('./gmail');
const emailService = require('./emailService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        name: 'Reenvío Netflix Backend',
        version: '2.0.0',
        admin_email: process.env.ADMIN_EMAIL,
        cycle_days: process.env.CYCLE_DAYS || 20
    });
});

// ============================================
// PROCESO PRINCIPAL
// ============================================

let procesoEnEjecucion = false;

async function procesarYReenviar(emailsSeleccionados = null) {
    if (procesoEnEjecucion) {
        return { success: false, message: 'Proceso en ejecución' };
    }

    try {
        procesoEnEjecucion = true;
        console.log('🔄 Iniciando proceso de reenvío...');

        const tokenData = await gmail.hayTokenNuevo();
        if (!tokenData) {
            procesoEnEjecucion = false;
            return { success: false, message: 'No hay token nuevo' };
        }

        console.log(`📧 Token encontrado: ${tokenData.token}`);

        let destinatarios = await db.getDestinatarios();
        
        if (emailsSeleccionados && emailsSeleccionados.length > 0) {
            destinatarios = destinatarios.filter(d => 
                emailsSeleccionados.includes(d.email)
            );
        }

        const emails = destinatarios.map(d => d.email);

        if (emails.length === 0) {
            procesoEnEjecucion = false;
            return { success: false, message: 'Sin destinatarios' };
        }

        console.log(`📨 Enviando a ${emails.length} destinatarios...`);

        const resultados = await emailService.reenviarTokenMultiple(
            emails,
            tokenData.token,
            new Date()
        );

        const exitosos = resultados.filter(r => r.success);
        if (exitosos.length > 0) {
            await db.saveTokenEnviado(
                tokenData.token,
                exitosos.length,
                exitosos[0].messageId || ''
            );
            await db.setUltimoEnvio(new Date().toISOString());
        }

        procesoEnEjecucion = false;
        
        return {
            success: true,
            message: `Reenviado a ${exitosos.length} destinatarios`,
            token: tokenData.token,
            exitosos: exitosos.length,
            fallidos: resultados.length - exitosos.length
        };

    } catch (error) {
        console.error('❌ Error:', error);
        procesoEnEjecucion = false;
        return { success: false, error: error.message };
    }
}

// ============================================
// ENDPOINTS
// ============================================

// Obtener estado
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
        console.error('Error en /api/destinatarios:', error);
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
        console.error('Error en /api/destinatarios POST:', error);
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
        console.error('Error en /api/destinatarios DELETE:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reenviar token
app.post('/api/reenviar', async (req, res) => {
    try {
        const { emails } = req.body;
        
        if (!emails || emails.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Selecciona al menos un destinatario'
            });
        }

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

        // Verificar que haya un token
        let token = await db.getUltimoToken();
        if (!token) {
            // Intentar leer de Gmail
            const tokenData = await gmail.hayTokenNuevo();
            if (tokenData) {
                token = tokenData.token;
                await db.setUltimoToken(token);
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'No hay token disponible. Usa el ingreso manual.'
                });
            }
        }

        const resultado = await emailService.reenviarTokenMultiple(
            emailsValidos,
            token,
            new Date()
        );

        const exitosos = resultado.filter(r => r.success);
        await db.saveTokenEnviado(token, exitosos.length, exitosos[0]?.messageId || '');
        await db.setUltimoEnvio(new Date().toISOString());

        res.json({
            success: true,
            message: `Reenviado a ${exitosos.length} destinatarios`,
            token: token,
            exitosos: exitosos.length,
            fallidos: resultado.length - exitosos.length
        });

    } catch (error) {
        console.error('Error en /api/reenviar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Guardar token manual
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

// Obtener token actual
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
// CRON - CADA 20 DÍAS
// ============================================

cron.schedule('0 9 */20 * *', async () => {
    console.log('⏰ Ejecutando tarea programada (cada 20 días)...');
    await procesarYReenviar();
});

// Verificación inicial
setTimeout(async () => {
    console.log('🚀 Ejecutando verificación inicial...');
    await procesarYReenviar();
}, 5000);

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
    console.log('========================================');
});

module.exports = app;
