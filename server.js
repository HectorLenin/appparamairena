// ============================================
// OBTENER ÚLTIMO CORREO POR CUENTA
// ============================================

app.get('/api/correo/ultimo', async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            // Si no hay email, devolver el correo global
            const correo = await db.getUltimoCorreo();
            return res.json({ success: true, correo: correo || null });
        }

        // Buscar en la base de datos por cuenta
        const correo = await db.getUltimoCorreoPorCuenta(email);
        
        // Si no hay, intentar leerlo de Gmail
        if (!correo) {
            console.log(`📨 No hay correo en BD para ${email}, leyendo de Gmail...`);
            const correoNuevo = await gmail.leerCorreoParaCuenta(email);
            if (correoNuevo) {
                await db.guardarCorreoParaCuenta(email, correoNuevo);
                return res.json({ success: true, correo: correoNuevo });
            }
        }

        res.json({ success: true, correo: correo || null });
    } catch (error) {
        console.error('Error en /api/correo/ultimo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// FORZAR REVISIÓN PARA UNA CUENTA
// ============================================

app.post('/api/correo/forzar', async (req, res) => {
    try {
        const { email } = req.body;
        console.log(`🔄 Forzando revisión de correos para ${email || 'todos'}...`);
        
        if (email) {
            const correo = await gmail.leerCorreoParaCuenta(email);
            if (correo) {
                await db.guardarCorreoParaCuenta(email, correo);
                return res.json({ success: true, message: `Correo actualizado para ${email}` });
            }
        } else {
            // Revisión general
            const correo = await gmail.leerCorreoCompleto();
            if (correo) {
                const destinatarios = await db.getDestinatarios();
                for (const d of destinatarios) {
                    await db.guardarCorreoParaCuenta(d.email, correo);
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
