const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const db = require('./database');
const gmail = require('./gmail');
const emailService = require('./emailService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// HEALTH CHECK
// ============================================
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

        const correoOriginal = await gmail.hayTokenNuevo();
        if (!correoOriginal) {
            procesoEnEjecucion = false;
            return { success: false, message: 'No hay correo nuevo de Netflix' };
        }

        console.log(`📧 Correo encontrado: ${correoOriginal.subject}`);

        await db.setUltimoCorreo(correoOriginal);

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

        const resultados = await emailService.reenviarTokenMultiple(
            emails,
            correoOriginal
        );

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

// ============================================
// AGREGAR DESTINATARIOS POR DEFECTO
// ============================================
setTimeout(async () => {
    console.log('📋 Agregando destinatarios por defecto...');
    
    const destinatariosPorDefecto = [
        'pollochucohn1@gmail.com',
        '1305sofiathelma@gmail.com',
        'unacuentamas1305@gmail.com',
        'Unacuentamas1007.hn@gmail.com',
        '1305cuentasvideo@gmail.com',
        'Lafamiliaprimero.1305@gmail.com',
        'Cuentasmairena.123@gmail.com',
        'Osohonduras2026@gmail.com'
    ];
    
    for (const email of destinatariosPorDefecto) {
        const agregado = await db.addDestinatario(email);
        if (agregado) {
            console.log(`✅ Destinatario agregado: ${email}`);
        } else {
            console.log(`ℹ️ El destinatario ya existe: ${email}`);
        }
    }
    
    console.log('🚀 Forzando reenvío después de agregar destinatarios...');
    const resultado = await procesarYReenviar();
    console.log('📊 Resultado del reenvío:', resultado);
    
}, 8000);

// ============================================
// ENDPOINTS DE AUTENTICACIÓN (MEJORADOS)
// ============================================

// Obtener URL de autorización para un cliente
app.get('/api/auth/url', (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        const authUrl = gmail.getAuthUrl(email);
        res.json({ success: true, url: authUrl });
    } catch (error) {
        console.error('Error en /api/auth/url:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔥 CALLBACK MEJORADO: GUARDA EL EMAIL EN LA SESIÓN
app.get('/api/auth/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        // Decodificar el email del state
        let email = '';
        if (state) {
            try {
                const decoded = Buffer.from(state, 'base64').toString('utf-8');
                const data = JSON.parse(decoded);
                email = data.email;
            } catch (e) {
                console.log('⚠️ Error decodificando state, usando fallback');
            }
        }
        
        // Si no se pudo obtener del state, usar el parámetro email (fallback)
        if (!email) {
            email = req.query.email || '';
        }

        // 🔥 NUEVO: Si el email sigue vacío, intentar obtenerlo de la sesión (si usas sesiones)
        // Por ahora, devolvemos error
        if (!email) {
            return res.status(400).send(`
                <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h2>❌ Error: No se pudo identificar la cuenta</h2>
                        <p>Vuelve a intentarlo desde la aplicación.</p>
                        <button onclick="window.close()" style="padding: 10px 20px; background: #e50914; color: white; border: none; border-radius: 8px; cursor: pointer;">Cerrar</button>
                    </body>
                </html>
            `);
        }

        if (!code) {
            return res.status(400).send('Faltan parámetros');
        }

        console.log(`🔄 Procesando callback para ${email}...`);
        
        // Intercambiar código por token
        await gmail.exchangeCodeForToken(email, code);

        // Verificar que se guardó
        const refreshToken = await db.getRefreshToken(email);
        console.log(`🔑 Refresh token para ${email}: ${refreshToken ? '✅ Guardado' : '❌ No guardado'}`);

        // 🔥 NUEVO: Si el token no se guardó, mostrar mensaje de error
        if (!refreshToken) {
            return res.send(`
                <html>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h2>⚠️ Autorización parcial</h2>
                        <p>No se pudo obtener un token de actualización para <strong>${email}</strong>.</p>
                        <p>Esto puede ocurrir si la cuenta ya tenía un token previo.</p>
                        <p>Intenta seleccionar la cuenta nuevamente en la aplicación.</p>
                        <button onclick="window.close()" style="padding: 10px 20px; background: #e50914; color: white; border: none; border-radius: 8px; cursor: pointer;">Cerrar</button>
                    </body>
                </html>
            `);
        }

        res.send(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>✅ ¡Autorización exitosa!</h2>
                    <p>La cuenta <strong>${email}</strong> ha sido autorizada correctamente.</p>
                    <p>Ya puedes cerrar esta ventana y volver a la aplicación.</p>
                    <p>Selecciona la cuenta nuevamente para ver su correo.</p>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #e50914; color: white; border: none; border-radius: 8px; cursor: pointer;">Cerrar ventana</button>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error en /api/auth/callback:', error);
        res.status(500).send(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>❌ Error en la autorización</h2>
                    <p><strong>${error.message}</strong></p>
                    <p>Vuelve a intentarlo desde la aplicación.</p>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #e50914; color: white; border: none; border-radius: 8px; cursor: pointer;">Cerrar</button>
                </body>
            </html>
        `);
    }
});

// Obtener último correo de un cliente
app.get('/api/correo/cliente', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        const correo = await gmail.leerCorreoParaCliente(email);
        res.json({ success: true, correo: correo || null });
    } catch (error) {
        console.error('Error en /api/correo/cliente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ENDPOINTS GENERALES
// ============================================

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

app.post('/api/reenviar', async (req, res) => {
    try {
        const { emails } = req.body;
        
        if (!emails || emails.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Selecciona al menos un destinatario'
            });
        }

        const resultado = await procesarYReenviar(emails);
        
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

app.get('/api/correo/ultimo', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            const correo = await db.getUltimoCorreo();
            return res.json({ success: true, correo: correo || null });
        }

        const correo = await db.getUltimoCorreoParaCliente(email);
        res.json({ success: true, correo: correo || null });
    } catch (error) {
        console.error('Error en /api/correo/ultimo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/correo/forzar', async (req, res) => {
    try {
        const { email } = req.body;
        console.log(`🔄 Forzando revisión de correos para ${email || 'todos'}...`);
        
        if (email) {
            const correo = await gmail.leerCorreoParaCliente(email);
            if (correo) {
                await db.setUltimoCorreoParaCliente(email, correo);
                return res.json({ success: true, message: `Correo actualizado para ${email}` });
            }
        } else {
            const correo = await gmail.leerCorreoCompleto();
            if (correo) {
                const destinatarios = await db.getDestinatarios();
                for (const d of destinatarios) {
                    await db.setUltimoCorreoParaCliente(d.email, correo);
                }
                return res.json({ success: true, message: 'Correos actualizados para todos' });
            }
        }
        
        res.json({ success: false, message: 'No se encontraron correos nuevos' });
    } catch (error) {
        console.error('Error en /api/correo/forzar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
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
