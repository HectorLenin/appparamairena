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

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        name: 'Reenvío Netflix Backend (Correo Original)',
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

        // 1. Leer el correo completo de Netflix
        const correoOriginal = await gmail.hayTokenNuevo();
        if (!correoOriginal) {
            procesoEnEjecucion = false;
            return { success: false, message: 'No hay correo nuevo de Netflix' };
        }

        console.log(`📧 Correo encontrado: ${correoOriginal.subject}`);

        // 2. Obtener destinatarios
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

        console.log(`📨 Reenviando correo original a ${emails.length} destinatarios...`);

        // 3. Reenviar el correo ORIGINAL
        const resultados = await emailService.reenviarTokenMultiple(
            emails,
            correoOriginal
        );

        // 4. Guardar registro
        const exitosos = resultados.filter(r => r.success);
        if (exitosos.length > 0) {
            await db.saveTokenEnviado(
                correoOriginal.token || 'SIN_TOKEN',
                exitosos.length,
                exitosos[0].messageId || ''
            );
            await db.setUltimoEnvio(new Date().toISOString());
        }

        procesoEnEjecucion = false;
        
        return {
            success: true,
            message: `Correo reenviado a ${exitosos.length} destinatarios`,
            token: correoOriginal.token || 'No se encontró token',
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
// CRON - CADA 20 DÍAS
// ============================================

cron.schedule('0 9 */20 * *', async () => {
    console.log('⏰ Ejecutando tarea programada...');
    await procesarYReenviar();
});

setTimeout(async () => {
    console.log('🚀 Ejecutando verificación inicial...');
    await procesarYReenviar();
}, 5000);

// ============================================
// NUEVOS ENDPOINTS PARA EL CORREO
// ============================================

// Obtener el último correo detectado
app.get('/api/correo/ultimo', async (req, res) => {
    try {
        // Obtener el último correo de la base de datos o memoria
        const correo = await db.getUltimoCorreo();
        res.json({
            success: true,
            correo: correo || null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Forzar revisión de correo
app.post('/api/correo/forzar', async (req, res) => {
    try {
        console.log('🔄 Forzando revisión de correos...');
        const resultado = await procesarYReenviar();
        res.json({
            success: true,
            message: 'Revisión forzada completada',
            detalles: resultado
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.listen(PORT, () => {
    console.log('========================================');
    console.log('✅ REENVÍO NETFLIX - CORREO ORIGINAL');
    console.log('========================================');
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`📧 Admin: ${process.env.ADMIN_EMAIL || 'No configurado'}`);
    console.log(`🔄 Ciclo: cada ${process.env.CYCLE_DAYS || 20} días`);
    console.log('========================================');
});

module.exports = app;
